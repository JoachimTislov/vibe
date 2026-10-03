// Package climodel implements the ADK model.LLM interface by delegating
// each generation to an installed AI CLI (codex exec, claude -p, mistral
// or any other) instead of an HTTP API. This is the BYOK mode for people
// who bring a CLI instead of an API key.
//
// Protocol: the command receives the conversation transcript on stdin
// and writes its answer as plain text on stdout. Function calling is not
// available in this mode - the CLI is the brain and runs its own tools.
package climodel

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"os/exec"
	"strings"
	"time"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

// Config configures a CLI-backed model.
type Config struct {
	// Command is the fixed argv of the AI CLI, e.g.
	// ["claude", "-p"] or ["codex", "exec", "-"].
	Command []string
	// Timeout bounds each CLI invocation; defaults to 5 minutes.
	Timeout time.Duration
}

// Model is a CLI-backed model behind the ADK model.LLM interface.
type Model struct {
	cfg Config
}

// New returns a Model delegating to the given CLI command.
func New(cfg Config) (*Model, error) {
	if len(cfg.Command) == 0 {
		return nil, errors.New("climodel: empty command")
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 5 * time.Minute
	}
	return &Model{cfg: cfg}, nil
}

// Name implements model.LLM.
func (m *Model) Name() string {
	return "cli:" + strings.Join(m.cfg.Command, " ")
}

// GenerateContent implements model.LLM. The whole conversation is
// rendered as a text transcript; the CLI's stdout becomes the response.
func (m *Model) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if req == nil {
			yield(nil, errors.New("climodel: nil request"))
			return
		}
		transcript, err := buildTranscript(req)
		if err != nil {
			yield(nil, err)
			return
		}
		runCtx, cancel := context.WithTimeout(ctx, m.cfg.Timeout)
		defer cancel()
		cmd := exec.CommandContext(runCtx, m.cfg.Command[0], m.cfg.Command[1:]...)
		cmd.Stdin = strings.NewReader(transcript)
		var out, errOut bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &errOut
		if err := cmd.Run(); err != nil {
			msg := strings.TrimSpace(errOut.String())
			if msg == "" {
				msg = err.Error()
			}
			yield(nil, fmt.Errorf("climodel: %v: %s", m.cfg.Command, truncate(msg, 512)))
			return
		}
		answer := strings.TrimSpace(out.String())
		if answer == "" {
			yield(nil, errors.New("climodel: empty response"))
			return
		}
		yield(&model.LLMResponse{
			Content: &genai.Content{
				Role:  string(genai.RoleModel),
				Parts: []*genai.Part{{Text: answer}},
			},
			FinishReason: genai.FinishReasonStop,
		}, nil)
	}
}

// buildTranscript renders the conversation as plain text for the CLI.
func buildTranscript(req *model.LLMRequest) (string, error) {
	var b strings.Builder
	if req.Config != nil && req.Config.SystemInstruction != nil {
		for _, part := range req.Config.SystemInstruction.Parts {
			if part != nil && part.Text != "" {
				b.WriteString(part.Text)
				b.WriteString("\n\n")
			}
		}
	}
	sawTurn := false
	for _, content := range req.Contents {
		if content == nil || len(content.Parts) == 0 {
			continue
		}
		role := "user"
		if genai.Role(content.Role) == genai.RoleModel {
			role = "assistant"
		}
		var texts []string
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			if part.Text != "" {
				texts = append(texts, part.Text)
			} else if part.FunctionResponse != nil {
				raw, err := marshalResponse(part.FunctionResponse)
				if err != nil {
					return "", err
				}
				texts = append(texts, fmt.Sprintf("[tool %s returned] %s", part.FunctionResponse.Name, raw))
			}
		}
		if len(texts) == 0 {
			continue
		}
		fmt.Fprintf(&b, "%s: %s\n\n", role, strings.Join(texts, "\n"))
		sawTurn = true
	}
	if !sawTurn {
		return "", errors.New("climodel: no content in request")
	}
	return b.String(), nil
}

func marshalResponse(fr *genai.FunctionResponse) (string, error) {
	res := fr.Response
	if res == nil {
		res = map[string]any{}
	}
	raw, err := json.Marshal(res)
	if err != nil {
		return "", fmt.Errorf("climodel: marshal response for %s: %w", fr.Name, err)
	}
	return string(raw), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
