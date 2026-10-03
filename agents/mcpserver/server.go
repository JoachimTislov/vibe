// Package mcpserver exposes the personal agent over the Model Context
// Protocol, so AI CLIs such as Claude Code, Codex, Gemini CLI and Mistral
// CLIs can use it as a remote tool server.
//
// Two kinds of tools are served:
//
//   - The read-only workspace tools directly (get_time, read_file,
//     list_dir, git_summary), with schemas inferred from Go types.
//   - ask_agent: the full LLM agent as a single tool. The confirmation-
//     gated run_command tool is excluded from the served agent; over MCP
//     there is no human to approve it.
package mcpserver

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/genai"

	"agents/tools"
)

const (
	appName = "personal_agent"
	mcpUser = "mcp-client"
	version = "0.1.0"
)

// Options configure the MCP server.
type Options struct {
	// PersonalAgent is the LLM agent served by ask_agent. It must not
	// contain confirmation-gated tools.
	PersonalAgent agent.Agent
	Workspace     tools.Workspace
}

// New builds the streamable-HTTP MCP handler.
func New(opts Options) (http.Handler, error) {
	if opts.PersonalAgent == nil {
		return nil, fmt.Errorf("mcpserver: personal agent is required")
	}
	run, err := runner.NewInMemory(appName, opts.PersonalAgent)
	if err != nil {
		return nil, fmt.Errorf("mcpserver: runner: %w", err)
	}
	ws := opts.Workspace

	srv := mcp.NewServer(&mcp.Implementation{Name: "personal-agent", Version: version}, nil)

	// --- direct read-only workspace tools -----------------------------

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "get_time",
		Description: "Returns the current local time, date and weekday for a city or IANA timezone.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in struct {
		City string `json:"city"`
	}) (*mcp.CallToolResult, any, error) {
		res, err := tools.TimeIn(in.City)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{}, res, nil
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "read_file",
		Description: "Reads a text file inside the agent workspace. Files larger than 64KB are truncated.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in struct {
		Path string `json:"path"`
	}) (*mcp.CallToolResult, any, error) {
		res, err := tools.ReadFileIn(ws, in.Path)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{}, res, nil
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "list_dir",
		Description: "Lists the entries of a directory inside the agent workspace.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in struct {
		Path string `json:"path"`
	}) (*mcp.CallToolResult, any, error) {
		res, err := tools.ListDirIn(ws, in.Path)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{}, res, nil
	})

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "git_summary",
		Description: "Reports branch, uncommitted changes and recent commits of a repository inside the agent workspace.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in struct {
		Repo string `json:"repo"`
	}) (*mcp.CallToolResult, any, error) {
		res, err := tools.GitSummaryIn(ws, in.Repo)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{}, res, nil
	})

	// --- the agent itself as a tool -----------------------------------

	mcp.AddTool(srv, &mcp.Tool{
		Name:        "ask_agent",
		Description: "Ask Joachim's personal agent (LLM with get_time/read_file/list_dir/git_summary tools) a question. Pass session_id to continue a conversation.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in struct {
		Prompt    string `json:"prompt"`
		SessionID string `json:"session_id,omitempty"`
	}) (*mcp.CallToolResult, any, error) {
		if strings.TrimSpace(in.Prompt) == "" {
			return nil, nil, fmt.Errorf("prompt is required")
		}
		sessionID := in.SessionID
		if sessionID == "" {
			sessionID = uuid.NewString()
		}
		reply, err := runAgent(ctx, run, sessionID, in.Prompt)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{}, struct {
			Reply     string `json:"reply"`
			SessionID string `json:"session_id"`
		}{Reply: reply, SessionID: sessionID}, nil
	})

	return mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server { return srv }, nil), nil
}

// runAgent runs one turn and returns the final assistant text.
func runAgent(ctx context.Context, run *runner.Runner, sessionID, prompt string) (string, error) {
	msg := &genai.Content{
		Role:  string(genai.RoleUser),
		Parts: []*genai.Part{{Text: prompt}},
	}
	var reply string
	for ev, err := range run.Run(ctx, mcpUser, sessionID, msg, agent.RunConfig{}) {
		if err != nil {
			return reply, fmt.Errorf("agent run: %w", err)
		}
		if ev == nil || ev.Content == nil || ev.Author != appName {
			continue
		}
		var texts []string
		for _, part := range ev.Content.Parts {
			if part != nil && part.Text != "" {
				texts = append(texts, part.Text)
			}
		}
		if len(texts) > 0 {
			reply = strings.Join(texts, "\n")
		}
	}
	if reply == "" {
		return "", fmt.Errorf("agent produced no reply")
	}
	return reply, nil
}

// Serve starts the MCP streamable HTTP server on the given address.
// It blocks until the listener fails or the context is done.
func Serve(ctx context.Context, handler http.Handler, addr string) error {
	mux := http.NewServeMux()
	// Clients configure either the root or /mcp; both work.
	mux.Handle("/mcp", handler)
	mux.Handle("/", handler)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	log.Printf("MCP server listening on %s (endpoint: http://%s/mcp)", addr, addr)
	srv := &http.Server{Handler: mux, BaseContext: func(net.Listener) context.Context { return ctx }}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		<-ctx.Done()
		_ = srv.Close()
		wg.Done()
	}()
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		return err
	}
	wg.Wait()
	return nil
}
