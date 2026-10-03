// Package openaicomp implements the ADK model.LLM interface against any
// OpenAI-compatible chat completions API: Mistral, OpenAI, OpenRouter,
// Groq, Ollama, LM Studio, llama.cpp and anything else speaking the
// /chat/completions wire format.
//
// ADK's own openaimodel targets the OpenAI Responses API, which most
// compatible endpoints do not serve, so this adapter translates the
// generic model.LLMRequest (genai contents, config and function
// declarations) into chat completions and the reply back into a
// model.LLMResponse.
package openaicomp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"iter"
	"net/http"
	"strings"
	"time"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

// Config configures an OpenAI-compatible chat model.
type Config struct {
	// Model is the provider-specific model name, e.g. mistral-large-latest.
	Model string
	// APIKey is sent as a bearer token. Leave empty for keyless local
	// endpoints such as Ollama.
	APIKey string
	// BaseURL is the API root without a trailing slash, e.g.
	// https://api.mistral.ai/v1.
	BaseURL string
	// HTTPClient is optional; defaults to a client with a 2-minute timeout.
	HTTPClient *http.Client
}

// Model is an OpenAI-compatible chat model behind the ADK model.LLM
// interface.
type Model struct {
	cfg    Config
	client *http.Client
}

// New returns a Model for the given configuration.
func New(cfg Config) *Model {
	m := &Model{cfg: cfg}
	m.client = cfg.HTTPClient
	if m.client == nil {
		m.client = &http.Client{Timeout: 120 * time.Second}
	}
	return m
}

// Name implements model.LLM.
func (m *Model) Name() string { return m.cfg.Model }

// GenerateContent implements model.LLM. Streaming is not segmented: the
// full response is yielded as a single final event.
func (m *Model) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if req == nil {
			yield(nil, errors.New("openaicomp: nil request"))
			return
		}
		payload, err := buildChatRequest(m.cfg.Model, req)
		if err != nil {
			yield(nil, err)
			return
		}
		resp, err := m.call(ctx, payload)
		if err != nil {
			yield(nil, fmt.Errorf("openaicomp %s: call failed: %w", m.cfg.Model, err))
			return
		}
		llmResp, err := convertResponse(resp)
		if err != nil {
			yield(nil, err)
			return
		}
		yield(llmResp, nil)
	}
}

// call posts the chat request and decodes the chat response.
func (m *Model) call(ctx context.Context, payload []byte) (*chatResponse, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(m.cfg.BaseURL, "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	if m.cfg.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+m.cfg.APIKey)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	httpResp, err := m.client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(httpResp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if httpResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d: %s", httpResp.StatusCode, truncate(string(body), 512))
	}
	var chat chatResponse
	if err := json.Unmarshal(body, &chat); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &chat, nil
}

// chatRequest is the chat completions request body.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Tools       []chatTool    `json:"tools,omitempty"`
	Temperature *float64      `json:"temperature,omitempty"`
	TopP        *float64      `json:"top_p,omitempty"`
	MaxTokens   *int32        `json:"max_tokens,omitempty"`
}

// chatMessage is one chat completions message. Tool results use
// role "tool" with ToolCallID; assistant tool calls use ToolCalls.
type chatMessage struct {
	Role       string         `json:"role"`
	Content    string         `json:"content,omitempty"`
	ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
}

type chatToolCall struct {
	ID       string       `json:"id,omitempty"`
	Type     string       `json:"type"`
	Function chatFunction `json:"function"`
}

type chatFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments,omitempty"`
}

type chatTool struct {
	Type     string   `json:"type"`
	Function chatDecl `json:"function"`
}

type chatDecl struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Parameters  any    `json:"parameters,omitempty"`
}

// chatResponse is the (non-streaming) chat completions response body.
type chatResponse struct {
	Model   string       `json:"model"`
	Choices []chatChoice `json:"choices"`
	Usage   chatUsage    `json:"usage"`
}

type chatChoice struct {
	Message      chatChoiceMessage `json:"message"`
	FinishReason string            `json:"finish_reason"`
}

type chatChoiceMessage struct {
	Role      string         `json:"role"`
	Content   string         `json:"content"`
	ToolCalls []chatToolCall `json:"tool_calls"`
}

type chatUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// buildChatRequest converts a generic LLMRequest into a chat completions
// request. Function responses are matched to their calls by ID, falling
// back to the oldest pending call when the ID is absent.
func buildChatRequest(modelName string, req *model.LLMRequest) ([]byte, error) {
	cr := chatRequest{Model: modelName}
	if req.Model != "" {
		cr.Model = req.Model
	}

	var pending []string
	addMessage := func(msg chatMessage) { cr.Messages = append(cr.Messages, msg) }

	if cfg := req.Config; cfg != nil && cfg.SystemInstruction != nil {
		if sys := contentText(cfg.SystemInstruction); sys != "" {
			addMessage(chatMessage{Role: "system", Content: sys})
		}
		if cfg.Temperature != nil {
			t := float64(*cfg.Temperature)
			cr.Temperature = &t
		}
		if cfg.TopP != nil {
			p := float64(*cfg.TopP)
			cr.TopP = &p
		}
		if cfg.MaxOutputTokens > 0 {
			mt := cfg.MaxOutputTokens
			cr.MaxTokens = &mt
		}
		for _, t := range cfg.Tools {
			if t == nil {
				continue
			}
			for _, decl := range t.FunctionDeclarations {
				if decl == nil || decl.Name == "" {
					continue
				}
				cr.Tools = append(cr.Tools, chatTool{
					Type: "function",
					Function: chatDecl{
						Name:        decl.Name,
						Description: decl.Description,
						Parameters:  decl.ParametersJsonSchema,
					},
				})
			}
		}
	}

	for _, content := range req.Contents {
		if content == nil || len(content.Parts) == 0 {
			continue
		}
		role := "user"
		if genai.Role(content.Role) == genai.RoleModel {
			role = "assistant"
		}
		var texts []string
		var toolCalls []chatToolCall
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			switch {
			case part.Text != "":
				texts = append(texts, part.Text)
			case part.FunctionCall != nil:
				id := part.FunctionCall.ID
				if id == "" {
					id = fmt.Sprintf("call-%d", len(pending))
				}
				pending = append(pending, id)
				args := part.FunctionCall.Args
				if args == nil {
					args = map[string]any{}
				}
				raw, err := json.Marshal(args)
				if err != nil {
					return nil, fmt.Errorf("marshal args for %s: %w", part.FunctionCall.Name, err)
				}
				toolCalls = append(toolCalls, chatToolCall{
					ID:       id,
					Type:     "function",
					Function: chatFunction{Name: part.FunctionCall.Name, Arguments: string(raw)},
				})
			case part.FunctionResponse != nil:
				id := part.FunctionResponse.ID
				if id == "" {
					if len(pending) == 0 {
						return nil, fmt.Errorf("function response for %q without call id", part.FunctionResponse.Name)
					}
					id, pending = pending[0], pending[1:]
				} else {
					for i, p := range pending {
						if p == id {
							pending = append(pending[:i], pending[i+1:]...)
							break
						}
					}
				}
				res := part.FunctionResponse.Response
				if res == nil {
					res = map[string]any{}
				}
				raw, err := json.Marshal(res)
				if err != nil {
					return nil, fmt.Errorf("marshal response for %s: %w", part.FunctionResponse.Name, err)
				}
				addMessage(chatMessage{Role: "tool", ToolCallID: id, Content: string(raw)})
			}
		}
		if len(texts) > 0 || len(toolCalls) > 0 {
			addMessage(chatMessage{
				Role:      role,
				Content:   strings.Join(texts, "\n"),
				ToolCalls: toolCalls,
			})
		}
	}

	if len(cr.Messages) == 0 {
		return nil, errors.New("openaicomp: no content in request")
	}
	return json.Marshal(cr)
}

// contentText joins the text parts of a genai content block.
func contentText(c *genai.Content) string {
	var b strings.Builder
	for _, part := range c.Parts {
		if part != nil && part.Text != "" {
			b.WriteString(part.Text)
			b.WriteString("\n")
		}
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// convertResponse maps a chat completions response to a model.LLMResponse.
func convertResponse(resp *chatResponse) (*model.LLMResponse, error) {
	if len(resp.Choices) == 0 {
		return nil, errors.New("openaicomp: response has no choices")
	}
	choice := resp.Choices[0]
	content := &genai.Content{Role: string(genai.RoleModel)}
	if strings.TrimSpace(choice.Message.Content) != "" {
		content.Parts = append(content.Parts, &genai.Part{Text: choice.Message.Content})
	}
	for _, tc := range choice.Message.ToolCalls {
		args := map[string]any{}
		if strings.TrimSpace(tc.Function.Arguments) != "" {
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				return nil, fmt.Errorf("decode tool call args for %s: %w", tc.Function.Name, err)
			}
		}
		content.Parts = append(content.Parts, &genai.Part{FunctionCall: &genai.FunctionCall{
			ID:   tc.ID,
			Name: tc.Function.Name,
			Args: args,
		}})
	}
	finish := genai.FinishReasonStop
	if choice.FinishReason == "length" {
		finish = genai.FinishReasonMaxTokens
	}
	return &model.LLMResponse{
		Content:      content,
		FinishReason: finish,
		UsageMetadata: &genai.GenerateContentResponseUsageMetadata{
			PromptTokenCount:     int32(resp.Usage.PromptTokens),
			CandidatesTokenCount: int32(resp.Usage.CompletionTokens),
			TotalTokenCount:      int32(resp.Usage.TotalTokens),
		},
		ModelVersion: resp.Model,
	}, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
