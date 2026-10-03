// Package anthropicmodel implements the ADK model.LLM interface against
// the Anthropic Messages API (https://api.anthropic.com/v1/messages),
// so a Claude API key can power the agent under BYOK.
package anthropicmodel

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

const (
	defaultBaseURL = "https://api.anthropic.com"
	apiVersion     = "2023-06-01"
	defaultMaxTok  = 8192
)

// Config configures an Anthropic chat model.
type Config struct {
	Model string
	// APIKey is sent as x-api-key.
	APIKey string
	// BaseURL defaults to https://api.anthropic.com.
	BaseURL string
	// MaxTokens is the per-request output cap; defaults to 8192.
	MaxTokens int32
	// HTTPClient is optional.
	HTTPClient *http.Client
}

// Model is an Anthropic chat model behind the ADK model.LLM interface.
type Model struct {
	cfg    Config
	client *http.Client
}

// New returns a Model for the given configuration.
func New(cfg Config) *Model {
	m := &Model{cfg: cfg}
	if m.client = cfg.HTTPClient; m.client == nil {
		m.client = &http.Client{Timeout: 120 * time.Second}
	}
	if m.cfg.BaseURL == "" {
		m.cfg.BaseURL = defaultBaseURL
	}
	if m.cfg.MaxTokens <= 0 {
		m.cfg.MaxTokens = defaultMaxTok
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
			yield(nil, errors.New("anthropic: nil request"))
			return
		}
		payload, err := buildRequest(m.cfg, req)
		if err != nil {
			yield(nil, err)
			return
		}
		chat, err := m.call(ctx, payload)
		if err != nil {
			yield(nil, fmt.Errorf("anthropic %s: call failed: %w", m.cfg.Model, err))
			return
		}
		llmResp, err := convertResponse(chat)
		if err != nil {
			yield(nil, err)
			return
		}
		yield(llmResp, nil)
	}
}

// request is the Messages API request body.
type request struct {
	Model     string     `json:"model"`
	MaxTokens int32      `json:"max_tokens"`
	System    string     `json:"system,omitempty"`
	Messages  []message  `json:"messages"`
	Tools     []toolDecl `json:"tools,omitempty"`
}

type message struct {
	Role    string  `json:"role"` // "user" or "assistant"
	Content []block `json:"content"`
}

type block struct {
	Type      string `json:"type"` // "text", "tool_use" or "tool_result"
	Text      string `json:"text,omitempty"`
	ID        string `json:"id,omitempty"`          // tool_use
	Name      string `json:"name,omitempty"`        // tool_use
	Input     any    `json:"input,omitempty"`       // tool_use
	ToolUseID string `json:"tool_use_id,omitempty"` // tool_result
}

type toolDecl struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	InputSchema any    `json:"input_schema,omitempty"`
}

// response is the Messages API response body.
type response struct {
	Model      string  `json:"model"`
	Content    []block `json:"content"`
	StopReason string  `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

func (m *Model) call(ctx context.Context, payload []byte) (*response, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(m.cfg.BaseURL, "/")+"/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("x-api-key", m.cfg.APIKey)
	httpReq.Header.Set("anthropic-version", apiVersion)
	httpReq.Header.Set("Content-Type", "application/json")
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
	var resp response
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &resp, nil
}

// buildRequest converts a generic LLMRequest into a Messages API request.
func buildRequest(cfg Config, req *model.LLMRequest) ([]byte, error) {
	ar := request{
		Model:     cfg.Model,
		MaxTokens: cfg.MaxTokens,
	}
	if req.Model != "" {
		ar.Model = req.Model
	}
	if c := req.Config; c != nil {
		if c.SystemInstruction != nil {
			ar.System = contentText(c.SystemInstruction)
		}
		if c.MaxOutputTokens > 0 {
			ar.MaxTokens = c.MaxOutputTokens
		}
		for _, t := range c.Tools {
			if t == nil {
				continue
			}
			for _, decl := range t.FunctionDeclarations {
				if decl == nil || decl.Name == "" {
					continue
				}
				ar.Tools = append(ar.Tools, toolDecl{
					Name:        decl.Name,
					Description: decl.Description,
					InputSchema: decl.ParametersJsonSchema,
				})
			}
		}
	}

	var pending []string
	for _, content := range req.Contents {
		if content == nil || len(content.Parts) == 0 {
			continue
		}
		role := "user"
		if genai.Role(content.Role) == genai.RoleModel {
			role = "assistant"
		}
		msg := message{Role: role}
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			switch {
			case part.Text != "":
				msg.Content = append(msg.Content, block{Type: "text", Text: part.Text})
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
				msg.Content = append(msg.Content, block{
					Type: "tool_use", ID: id,
					Name:  part.FunctionCall.Name,
					Input: args,
				})
			case part.FunctionResponse != nil:
				id := part.FunctionResponse.ID
				if id == "" {
					if len(pending) == 0 {
						return nil, fmt.Errorf("anthropic: function response for %q without call id", part.FunctionResponse.Name)
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
					return nil, fmt.Errorf("anthropic: marshal response for %s: %w", part.FunctionResponse.Name, err)
				}
				// Tool results are user-role messages in the Messages API.
				ar.Messages = append(ar.Messages, message{
					Role:    "user",
					Content: []block{{Type: "tool_result", ToolUseID: id, Text: string(raw)}},
				})
			}
		}
		if len(msg.Content) > 0 {
			ar.Messages = append(ar.Messages, msg)
		}
	}
	if len(ar.Messages) == 0 {
		return nil, errors.New("anthropic: no content in request")
	}
	return json.Marshal(ar)
}

// convertResponse maps a Messages API response to a model.LLMResponse.
func convertResponse(resp *response) (*model.LLMResponse, error) {
	content := &genai.Content{Role: string(genai.RoleModel)}
	for _, b := range resp.Content {
		switch b.Type {
		case "text":
			if strings.TrimSpace(b.Text) != "" {
				content.Parts = append(content.Parts, &genai.Part{Text: b.Text})
			}
		case "tool_use":
			args, ok := b.Input.(map[string]any)
			if !ok {
				raw, err := json.Marshal(b.Input)
				if err != nil {
					return nil, fmt.Errorf("anthropic: decode tool input for %s: %w", b.Name, err)
				}
				args = map[string]any{}
				if err := json.Unmarshal(raw, &args); err != nil {
					return nil, fmt.Errorf("anthropic: decode tool input for %s: %w", b.Name, err)
				}
			}
			content.Parts = append(content.Parts, &genai.Part{FunctionCall: &genai.FunctionCall{
				ID:   b.ID,
				Name: b.Name,
				Args: args,
			}})
		}
	}
	finish := genai.FinishReasonStop
	if resp.StopReason == "max_tokens" {
		finish = genai.FinishReasonMaxTokens
	}
	return &model.LLMResponse{
		Content:      content,
		FinishReason: finish,
		UsageMetadata: &genai.GenerateContentResponseUsageMetadata{
			PromptTokenCount:     int32(resp.Usage.InputTokens),
			CandidatesTokenCount: int32(resp.Usage.OutputTokens),
			TotalTokenCount:      int32(resp.Usage.InputTokens + resp.Usage.OutputTokens),
		},
		ModelVersion: resp.Model,
	}, nil
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

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
