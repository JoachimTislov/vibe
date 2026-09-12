package e2e

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	pb "github.com/YOURNAME/agentic-gateway/gen/core/v1"
	"github.com/YOURNAME/agentic-gateway/pkg/client"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"github.com/YOURNAME/agentic-gateway/pkg/localcli"
	"github.com/YOURNAME/agentic-gateway/pkg/runtime"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var binaries string

func TestMain(m *testing.M) {
	if runFixtureProcess() {
		return
	}
	dir, err := os.MkdirTemp("", "agent-e2e-bin-")
	if err != nil {
		panic(err)
	}
	binaries = dir
	cmd := exec.Command("go", "build", "-race", "-o", dir+"/", "./cmd/coreserver", "./cmd/agent", "./cmd/adapters/mcp")
	cmd.Dir = "../.."
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		os.RemoveAll(dir)
		os.Exit(1)
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

type lockedBuffer struct {
	mu sync.Mutex
	bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.Write(p)
}
func (b *lockedBuffer) String() string { b.mu.Lock(); defer b.mu.Unlock(); return b.Buffer.String() }

func startCore(t *testing.T, extra ...string) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "agent-core-")
	if err != nil {
		t.Fatal(err)
	}
	socket := filepath.Join(dir, "core.sock")
	ctx, cancel := context.WithCancel(context.Background())
	args := append([]string{"-socket", socket}, extra...)
	cmd := exec.CommandContext(ctx, filepath.Join(binaries, "coreserver"), args...)
	var stderr lockedBuffer
	cmd.Stderr = &stderr
	if err = cmd.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	t.Cleanup(func() { cancel(); <-done; os.RemoveAll(dir) })
	deadline := time.After(10 * time.Second)
	for {
		select {
		case err := <-done:
			done <- err
			t.Fatalf("core exited: %v %s", err, stderr.String())
		case <-deadline:
			t.Fatalf("core startup timed out: %s", stderr.String())
		default:
			conn, err := net.DialTimeout("unix", socket, 50*time.Millisecond)
			if err == nil {
				conn.Close()
				info, _ := os.Stat(socket)
				if info.Mode().Perm() != 0600 {
					t.Fatal("socket must be private")
				}
				return socket
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func writeConfig(t *testing.T, cfg config.Config) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

type modelMessage struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	ToolCalls []any  `json:"tool_calls,omitempty"`
}
type modelRequest struct {
	Model    string         `json:"model"`
	Stream   bool           `json:"stream"`
	Messages []modelMessage `json:"messages"`
	Tools    []any          `json:"tools"`
}

func modelServer(t *testing.T, respond func(modelRequest) any) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/chat" {
			t.Errorf("wrong model request: %s %s", r.Method, r.URL)
			w.WriteHeader(400)
			return
		}
		var request modelRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		if request.Stream || request.Model != "test-model" {
			t.Errorf("unexpected model settings: %+v", request)
		}
		json.NewEncoder(w).Encode(respond(request))
	}))
	t.Cleanup(s.Close)
	return s
}
func answer(text string) any {
	return map[string]any{"message": map[string]any{"role": "assistant", "content": text}}
}
func cfgFor(socket, endpoint string) config.Config {
	c := config.Default()
	c.Socket = socket
	c.Model.Name = "test-model"
	c.Model.Endpoint = endpoint
	return c
}

func TestLocalCLIUsesServerModelAndHistory(t *testing.T) {
	socket := startCore(t)
	var calls atomic.Int32
	model := modelServer(t, func(r modelRequest) any {
		calls.Add(1)
		last := r.Messages[len(r.Messages)-1].Content
		if last == "second" && (len(r.Messages) != 3 || r.Messages[1].Content != "server model says first") {
			t.Errorf("core lost history: %+v", r.Messages)
		}
		return answer("server model says " + last)
	})
	path := writeConfig(t, cfgFor(socket, model.URL))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, filepath.Join(binaries, "agent"), "-config", path, "-json")
	cmd.Stdin = strings.NewReader("{\"id\":\"one\",\"text\":\"first\"}\n{\"id\":\"two\",\"text\":\"second\"}\n")
	data, err := cmd.Output()
	if err != nil {
		t.Fatalf("client failed: %v", err)
	}
	var got []localcli.Event
	scan := bufio.NewScanner(bytes.NewReader(data))
	for scan.Scan() {
		var e localcli.Event
		if err = json.Unmarshal(scan.Bytes(), &e); err != nil {
			t.Fatal(err)
		}
		got = append(got, e)
	}
	if len(got) != 2 || got[0].ID != "one" || got[0].Text != "server model says first" || got[1].ID != "two" || got[1].Text != "server model says second" || calls.Load() != 2 {
		t.Fatalf("unexpected core replies: %s", data)
	}
}

func TestLocalMCPApprovalFlows(t *testing.T) {
	for _, decision := range []string{"approve", "deny", "expire"} {
		t.Run(decision, func(t *testing.T) {
			socket := startCore(t, "-approval-timeout", "300ms")
			var toolCalls atomic.Int32
			toolServer := mcp.NewServer(&mcp.Implementation{Name: "test-tools", Version: "1"}, nil)
			mcp.AddTool(toolServer, &mcp.Tool{Name: "change", Description: "Make a controlled change"}, func(ctx context.Context, req *mcp.CallToolRequest, in struct {
				Value string `json:"value"`
			}) (*mcp.CallToolResult, any, error) {
				toolCalls.Add(1)
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "changed to " + in.Value}}}, nil, nil
			})
			endpoint := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return toolServer }, nil))
			defer endpoint.Close()
			model := modelServer(t, func(r modelRequest) any {
				if r.Messages[len(r.Messages)-1].Role == "tool" {
					if !strings.Contains(r.Messages[len(r.Messages)-1].Content, "changed to blue") {
						t.Error("missing tool output")
					}
					return answer("confirmed by server: blue")
				}
				if len(r.Tools) != 1 {
					t.Errorf("tool catalog missing: %+v", r.Tools)
				}
				return map[string]any{"message": map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"function": map[string]any{"name": "fixture__change", "arguments": map[string]any{"value": "blue"}}}}}}
			})
			cfg := cfgFor(socket, model.URL)
			cfg.MCP = []config.MCP{{Name: "fixture", URL: endpoint.URL}}
			cfg.AllowedTools = []string{"fixture__change"}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, filepath.Join(binaries, "agent"), "-config", writeConfig(t, cfg), "-json")
			stdin, _ := cmd.StdinPipe()
			stdout, _ := cmd.StdoutPipe()
			var stderr lockedBuffer
			cmd.Stderr = &stderr
			if err := cmd.Start(); err != nil {
				t.Fatal(err)
			}
			fmt.Fprintln(stdin, `{"id":"change","text":"change the value"}`)
			decoder := json.NewDecoder(stdout)
			var event localcli.Event
			if err := decoder.Decode(&event); err != nil {
				t.Fatalf("approval missing: %v %s", err, stderr.String())
			}
			if event.Type != "approval" || !strings.Contains(event.Text, "fixture__change") || toolCalls.Load() != 0 {
				t.Fatalf("tool ran before approval: %+v calls=%d", event, toolCalls.Load())
			}
			if decision != "expire" {
				json.NewEncoder(stdin).Encode(localcli.Input{ApprovalID: event.ApprovalID, Approved: decision == "approve"})
			}
			if err := decoder.Decode(&event); err != nil {
				t.Fatal(err)
			}
			stdin.Close()
			err := cmd.Wait()
			if decision == "approve" {
				if err != nil || event.Text != "confirmed by server: blue" || event.Error != "" || toolCalls.Load() != 1 {
					t.Fatalf("approved flow: %+v calls=%d err=%v %s", event, toolCalls.Load(), err, stderr.String())
				}
			} else {
				if err == nil || event.Error == "" || toolCalls.Load() != 0 {
					t.Fatalf("denied/expired action ran: %+v calls=%d", event, toolCalls.Load())
				}
			}
		})
	}
}

func TestClientCannotApproveAnotherSession(t *testing.T) {
	socket := startCore(t, "-approval-timeout", "150ms")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r := &toolRuntime{}
	one, err := client.Dial(ctx, socket, "default", "local", r)
	if err != nil {
		t.Fatal(err)
	}
	defer one.Close()
	two, err := client.Dial(ctx, socket, "default", "local", r)
	if err != nil {
		t.Fatal(err)
	}
	defer two.Close()
	if err = one.Send("private", "one", "go"); err != nil {
		t.Fatal(err)
	}
	a := (<-one.Events).GetApprovalRequest()
	if a == nil {
		t.Fatal("expected approval")
	}
	if err = two.Approve("private", a.ApprovalId, true); err != nil {
		t.Fatal(err)
	}
	out := (<-one.Events).GetOutboundMessage()
	if out == nil || out.ErrorCode == "" || r.calls.Load() != 0 {
		t.Fatalf("cross-session approval accepted: %+v", out)
	}
}

type toolRuntime struct{ calls atomic.Int32 }

func (r *toolRuntime) Tools() []*pb.Tool {
	return []*pb.Tool{{Name: "change", InputSchemaJson: `{"type":"object"}`}}
}
func (r *toolRuntime) Execute(ctx context.Context, in *pb.CapabilityRequest) *pb.CapabilityResult {
	if in.GetToolCall() != nil {
		r.calls.Add(1)
		return &pb.CapabilityResult{ToolOutput: "changed"}
	}
	return &pb.CapabilityResult{Message: &pb.ChatMessage{Role: "assistant", ToolCalls: []*pb.ToolCall{{Name: "change", ArgumentsJson: "{}"}}}}
}

func TestMCPFrontDoorUsesCore(t *testing.T) {
	socket := startCore(t)
	model := modelServer(t, func(r modelRequest) any { return answer("MCP via core: " + r.Messages[len(r.Messages)-1].Content) })
	cfg := cfgFor(socket, model.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	session, err := mcp.NewClient(&mcp.Implementation{Name: "e2e", Version: "1"}, nil).Connect(ctx, &mcp.CommandTransport{Command: exec.Command(filepath.Join(binaries, "mcp"), "-config", writeConfig(t, cfg))}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 1 || tools.Tools[0].Name != "ask" {
		t.Fatalf("missing ask tool: %v", err)
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "ask", Arguments: map[string]any{"text": "hello"}})
	if err != nil || result.IsError || len(result.Content) != 1 || result.Content[0].(*mcp.TextContent).Text != "MCP via core: hello" {
		t.Fatalf("bad MCP reply: %+v %v", result, err)
	}
}

func TestRejectUnknownPrincipal(t *testing.T) {
	socket := startCore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := client.Dial(ctx, socket, "stranger", "local", nil)
	if err == nil {
		t.Fatal("unknown principal was accepted")
	}
}

func TestMCPFrontDoorElicitsApprovalForStdioTool(t *testing.T) {
	socket := startCore(t)
	model := modelServer(t, func(r modelRequest) any {
		last := r.Messages[len(r.Messages)-1]
		if last.Role == "tool" {
			if !strings.Contains(last.Content, "stdio tool value") {
				t.Error("missing stdio tool output")
			}
			return answer("MCP approved: stdio tool value")
		}
		return map[string]any{"message": map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"function": map[string]any{"name": "stdio__read", "arguments": map[string]any{}}}}}}
	})
	cfg := cfgFor(socket, model.URL)
	cfg.MCP = []config.MCP{{Name: "stdio", Command: []string{fixtureBinary(t, "mcp-fixture", "")}}}
	cfg.AllowedTools = []string{"stdio__read"}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var approvals atomic.Int32
	mcpClient := mcp.NewClient(&mcp.Implementation{Name: "approval-ui", Version: "1"}, &mcp.ClientOptions{ElicitationHandler: func(ctx context.Context, r *mcp.ElicitRequest) (*mcp.ElicitResult, error) {
		if !strings.Contains(r.Params.Message, "stdio__read") {
			t.Error("approval omitted the action")
		}
		approvals.Add(1)
		return &mcp.ElicitResult{Action: "accept", Content: map[string]any{"approved": true}}, nil
	}})
	s, err := mcpClient.Connect(ctx, &mcp.CommandTransport{Command: exec.Command(filepath.Join(binaries, "mcp"), "-config", writeConfig(t, cfg))}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	result, err := s.CallTool(ctx, &mcp.CallToolParams{Name: "ask", Arguments: map[string]any{"text": "use stdio tool"}})
	if err != nil || result.IsError || approvals.Load() != 1 || result.Content[0].(*mcp.TextContent).Text != "MCP approved: stdio tool value" {
		t.Fatalf("MCP approval/stdio failed: %+v %v", result, err)
	}
}

// Ensure API providers expose errors without passing response bodies/tokens
// through the core to a platform user.
func TestModelFailureIsRedacted(t *testing.T) {
	socket := startCore(t)
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		io.WriteString(w, "secret-token-should-not-leak")
	}))
	defer model.Close()
	cfg := cfgFor(socket, model.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r, err := runtime.New(ctx, cfg, credentials.Keychain{})
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	c, err := client.Dial(ctx, socket, "default", "local", r)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	c.Send("failure", "id", "hello")
	out := (<-c.Events).GetOutboundMessage()
	if out == nil || out.ErrorCode == "" || strings.Contains(out.Text, "secret-token") {
		t.Fatalf("unredacted failure: %+v", out)
	}
}
