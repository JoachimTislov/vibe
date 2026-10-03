package openaicomp

import (
	"encoding/json"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestBuildChatRequest(t *testing.T) {
	req := &model.LLMRequest{
		Model: "mistral-large-latest",
		Config: &genai.GenerateContentConfig{
			SystemInstruction: &genai.Content{Parts: []*genai.Part{{Text: "be brief"}}},
			Tools: []*genai.Tool{{
				FunctionDeclarations: []*genai.FunctionDeclaration{{
					Name:        "get_time",
					Description: "time",
					ParametersJsonSchema: map[string]any{
						"type":       "object",
						"properties": map[string]any{"city": map[string]any{"type": "string"}},
					},
				}},
			}},
		},
		Contents: []*genai.Content{
			{Role: "user", Parts: []*genai.Part{{Text: "time in oslo?"}}},
			{Role: "model", Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "get_time", Args: map[string]any{"city": "Oslo"}},
			}}},
			{Role: "user", Parts: []*genai.Part{{
				FunctionResponse: &genai.FunctionResponse{ID: "call-1", Name: "get_time", Response: map[string]any{"local_time": "16:45"}},
			}}},
		},
	}
	raw, err := buildChatRequest("mistral-large-latest", req)
	if err != nil {
		t.Fatalf("buildChatRequest: %v", err)
	}
	var cr chatRequest
	if err := json.Unmarshal(raw, &cr); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if cr.Model != "mistral-large-latest" {
		t.Errorf("model = %q", cr.Model)
	}
	if len(cr.Messages) != 4 {
		t.Fatalf("messages = %+v", cr.Messages)
	}
	if cr.Messages[0].Role != "system" || cr.Messages[0].Content != "be brief" {
		t.Errorf("system message = %+v", cr.Messages[0])
	}
	if cr.Messages[1].Role != "user" || cr.Messages[1].Content != "time in oslo?" {
		t.Errorf("user message = %+v", cr.Messages[1])
	}
	call := cr.Messages[2]
	if call.Role != "assistant" || len(call.ToolCalls) != 1 || call.ToolCalls[0].Function.Name != "get_time" {
		t.Errorf("assistant call message = %+v", call)
	}
	if !strings.Contains(call.ToolCalls[0].Function.Arguments, "Oslo") {
		t.Errorf("arguments = %q", call.ToolCalls[0].Function.Arguments)
	}
	toolMsg := cr.Messages[3]
	if toolMsg.Role != "tool" || toolMsg.ToolCallID != "call-1" || !strings.Contains(toolMsg.Content, "16:45") {
		t.Errorf("tool message = %+v", toolMsg)
	}
	if len(cr.Tools) != 1 || cr.Tools[0].Function.Name != "get_time" {
		t.Errorf("tools = %+v", cr.Tools)
	}
}

func TestBuildChatRequestPairsUnindexedResponses(t *testing.T) {
	req := &model.LLMRequest{
		Contents: []*genai.Content{
			{Role: "user", Parts: []*genai.Part{{Text: "hi"}}},
			{Role: "model", Parts: []*genai.Part{{
				FunctionCall: &genai.FunctionCall{Name: "get_time", Args: map[string]any{"city": "Oslo"}},
			}}},
			{Role: "user", Parts: []*genai.Part{{
				FunctionResponse: &genai.FunctionResponse{Name: "get_time", Response: map[string]any{"local_time": "16:45"}},
			}}},
		},
	}
	raw, err := buildChatRequest("m", req)
	if err != nil {
		t.Fatalf("buildChatRequest: %v", err)
	}
	var cr chatRequest
	if err := json.Unmarshal(raw, &cr); err != nil {
		t.Fatal(err)
	}
	if cr.Messages[2].ToolCallID != "call-0" {
		t.Errorf("tool_call_id = %q, want call-0", cr.Messages[2].ToolCallID)
	}
}

func TestConvertResponse(t *testing.T) {
	raw := `{
		"model": "mistral-large-latest",
		"choices": [{
			"message": {
				"role": "assistant",
				"content": "",
				"tool_calls": [{
					"id": "abc123",
					"type": "function",
					"function": {"name": "get_time", "arguments": "{\"city\":\"Oslo\"}"}
				}]
			},
			"finish_reason": "tool_calls"
		}],
		"usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
	}`
	var resp chatResponse
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatal(err)
	}
	out, err := convertResponse(&resp)
	if err != nil {
		t.Fatalf("convertResponse: %v", err)
	}
	if len(out.Content.Parts) != 1 {
		t.Fatalf("parts = %+v", out.Content.Parts)
	}
	fc := out.Content.Parts[0].FunctionCall
	if fc == nil || fc.Name != "get_time" || fc.ID != "abc123" || fc.Args["city"] != "Oslo" {
		t.Errorf("function call = %+v", fc)
	}
	if out.FinishReason != genai.FinishReasonStop {
		t.Errorf("finish reason = %q", out.FinishReason)
	}
	if out.UsageMetadata.TotalTokenCount != 15 {
		t.Errorf("usage = %+v", out.UsageMetadata)
	}
}

func TestConvertResponseMaxTokens(t *testing.T) {
	resp := &chatResponse{Choices: []chatChoice{{
		Message:      chatChoiceMessage{Role: "assistant", Content: "hello"},
		FinishReason: "length",
	}}}
	out, err := convertResponse(resp)
	if err != nil {
		t.Fatal(err)
	}
	if out.FinishReason != genai.FinishReasonMaxTokens {
		t.Errorf("finish reason = %q", out.FinishReason)
	}
	if out.Content.Parts[0].Text != "hello" {
		t.Errorf("text = %q", out.Content.Parts[0].Text)
	}
}
