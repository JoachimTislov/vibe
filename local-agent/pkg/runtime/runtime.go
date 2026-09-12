// Package runtime performs client-owned model and MCP I/O. The core sends
// structured requests, never URLs, executable names, or shell commands.
package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	pb "github.com/YOURNAME/agentic-gateway/gen/core/v1"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type Runtime struct {
	model    config.Model
	key      string
	http     *http.Client
	tools    []*pb.Tool
	targets  map[string]target
	sessions []*mcp.ClientSession
}
type target struct {
	session *mcp.ClientSession
	name    string
}

// ValidateEndpoint permits plaintext only on loopback; credentials never
// follow redirects to another host.
func ValidateEndpoint(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("invalid endpoint")
	}
	if u.Scheme == "https" {
		return nil
	}
	ip := net.ParseIP(u.Hostname())
	if u.Scheme == "http" && (u.Hostname() == "localhost" || (ip != nil && ip.IsLoopback())) {
		return nil
	}
	return errors.New("endpoint requires HTTPS, except on loopback")
}

func New(ctx context.Context, cfg config.Config, store credentials.Store) (r *Runtime, err error) {
	r = &Runtime{model: cfg.Model, http: &http.Client{Timeout: 2 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, targets: make(map[string]target)}
	defer func() {
		if err != nil {
			r.Close()
		}
	}()
	switch cfg.Model.Provider {
	case "ollama":
		if err = ValidateEndpoint(cfg.Model.Endpoint); err != nil {
			return r, err
		}
		if cfg.Model.Name == "" {
			return r, errors.New("model name is required")
		}
	case "cli":
		if len(cfg.Model.Command) == 0 {
			return r, errors.New("model command is required")
		}
	default:
		return r, errors.New("model provider must be ollama or cli")
	}
	if cfg.Model.KeychainKey != "" {
		r.key, err = store.Get(cfg.Model.KeychainKey)
		if err != nil {
			return r, fmt.Errorf("read model keychain entry: %w", err)
		}
	}
	names := map[string]bool{}
	for _, server := range cfg.MCP {
		if !regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`).MatchString(server.Name) || names[server.Name] {
			return r, errors.New("MCP names must be unique identifiers")
		}
		names[server.Name] = true
		if (len(server.Command) == 0) == (server.URL == "") {
			return r, errors.New("MCP needs exactly one command or URL")
		}
		var transport mcp.Transport
		if len(server.Command) > 0 {
			cmd := exec.CommandContext(ctx, server.Command[0], server.Command[1:]...)
			cmd.Env = processEnv()
			cmd.WaitDelay = time.Second
			transport = &mcp.CommandTransport{Command: cmd}
		} else {
			if err = ValidateEndpoint(server.URL); err != nil {
				return r, err
			}
			hc := *r.http
			if server.KeychainKey != "" {
				key, e := store.Get(server.KeychainKey)
				if e != nil {
					return r, errors.New("read MCP keychain entry failed")
				}
				hc.Transport = authTransport{key: key}
			}
			transport = &mcp.StreamableClientTransport{Endpoint: server.URL, HTTPClient: &hc}
		}
		s, connectErr := mcp.NewClient(&mcp.Implementation{Name: "agentic-gateway", Version: "0.1.0"}, nil).Connect(ctx, transport, nil)
		if connectErr != nil {
			return r, fmt.Errorf("connect MCP %s failed", server.Name)
		}
		r.sessions = append(r.sessions, s)
		for tool, listErr := range s.Tools(ctx, nil) {
			if listErr != nil {
				return r, fmt.Errorf("list MCP %s tools failed", server.Name)
			}
			name := server.Name + "__" + tool.Name
			allowed := false
			for _, entry := range cfg.AllowedTools {
				if entry == name || entry == "*" {
					allowed = true
					break
				}
			}
			if !allowed {
				continue
			}
			if len(r.tools) >= 128 || r.targets[name].session != nil {
				return r, errors.New("too many or duplicate MCP tools")
			}
			schema, e := json.Marshal(tool.InputSchema)
			if e != nil {
				return r, e
			}
			r.tools = append(r.tools, &pb.Tool{Name: name, Description: tool.Description, InputSchemaJson: string(schema)})
			r.targets[name] = target{session: s, name: tool.Name}
		}
	}
	return r, nil
}
func (r *Runtime) Close() {
	for _, s := range r.sessions {
		s.Close()
	}
}
func (r *Runtime) Tools() []*pb.Tool { return r.tools }
func (r *Runtime) Execute(ctx context.Context, req *pb.CapabilityRequest) *pb.CapabilityResult {
	out := &pb.CapabilityResult{}
	if model := req.GetModel(); model != nil {
		m, err := r.chat(ctx, model)
		if err != nil {
			out.Error = "model provider failed"
		} else {
			out.Message = m
		}
	} else if call := req.GetToolCall(); call != nil {
		t, ok := r.targets[call.Name]
		if !ok {
			out.Error = "unknown MCP tool"
			return out
		}
		result, err := t.session.CallTool(ctx, &mcp.CallToolParams{Name: t.name, Arguments: json.RawMessage(call.ArgumentsJson)})
		if err != nil {
			out.Error = "MCP call failed"
			return out
		}
		data, err := json.Marshal(result)
		if err != nil || len(data) > 65536 {
			out.Error = "MCP result exceeds limit"
		} else {
			out.ToolOutput = string(data)
		}
	} else {
		out.Error = "unknown capability"
	}
	return out
}

type authTransport struct{ key string }

func (t authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	req.Header.Set("Authorization", "Bearer "+t.key)
	return http.DefaultTransport.RoundTrip(req)
}

type function struct {
	Name        string          `json:"name"`
	Arguments   json.RawMessage `json:"arguments,omitempty"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}
type toolCall struct {
	Function function `json:"function"`
}
type chatMessage struct {
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	ToolCalls []toolCall `json:"tool_calls,omitempty"`
	ToolName  string     `json:"tool_name,omitempty"`
}
type chatTool struct {
	Type     string   `json:"type"`
	Function function `json:"function"`
}
type chatRequest struct {
	Model    string        `json:"model"`
	Stream   bool          `json:"stream"`
	Messages []chatMessage `json:"messages"`
	Tools    []chatTool    `json:"tools,omitempty"`
}

func (r *Runtime) chat(ctx context.Context, in *pb.ModelRequest) (*pb.ChatMessage, error) {
	request := chatRequest{Model: r.model.Name}
	for _, m := range in.Messages {
		v := chatMessage{Role: m.Role, Content: m.Content, ToolName: m.ToolName}
		for _, call := range m.ToolCalls {
			v.ToolCalls = append(v.ToolCalls, toolCall{Function: function{Name: call.Name, Arguments: json.RawMessage(call.ArgumentsJson)}})
		}
		request.Messages = append(request.Messages, v)
	}
	for _, tool := range in.Tools {
		request.Tools = append(request.Tools, chatTool{Type: "function", Function: function{Name: tool.Name, Description: tool.Description, Parameters: json.RawMessage(tool.InputSchemaJson)}})
	}
	data, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	var output []byte
	if r.model.Provider == "cli" {
		cmd := exec.CommandContext(ctx, r.model.Command[0], r.model.Command[1:]...)
		cmd.Env = processEnv()
		cmd.Stdin = bytes.NewReader(data)
		cmd.WaitDelay = time.Second
		var buf limitedBuffer
		cmd.Stdout = &buf
		if err = cmd.Run(); err != nil {
			return nil, errors.New("model command failed")
		}
		output = buf.Bytes()
	} else {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(r.model.Endpoint, "/")+"/api/chat", bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		if r.key != "" {
			req.Header.Set("Authorization", "Bearer "+r.key)
		}
		resp, err := r.http.Do(req)
		if err != nil {
			return nil, errors.New("model request failed")
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("model HTTP status %d", resp.StatusCode)
		}
		output, err = io.ReadAll(io.LimitReader(resp.Body, 1<<20+1))
		if err != nil {
			return nil, err
		}
	}
	if len(output) > 1<<20 {
		return nil, errors.New("model response exceeds limit")
	}
	var response struct {
		Message chatMessage `json:"message"`
		Error   string      `json:"error"`
	}
	if err = json.Unmarshal(output, &response); err != nil {
		return nil, err
	}
	if response.Error != "" || response.Message.Role != "assistant" {
		return nil, errors.New("invalid model response")
	}
	m := &pb.ChatMessage{Role: response.Message.Role, Content: response.Message.Content}
	for _, call := range response.Message.ToolCalls {
		m.ToolCalls = append(m.ToolCalls, &pb.ToolCall{Name: call.Function.Name, ArgumentsJson: string(call.Function.Arguments)})
	}
	return m, nil
}

type limitedBuffer struct{ bytes.Buffer }

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 1<<20 {
		return 0, errors.New("output limit exceeded")
	}
	return b.Buffer.Write(p)
}

// Do not pass arbitrary API tokens from the ambient environment to helpers.
func processEnv() []string {
	var env []string
	for _, key := range []string{"PATH", "HOME", "LANG", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"} {
		if value, ok := os.LookupEnv(key); ok {
			env = append(env, key+"="+value)
		}
	}
	return env
}
