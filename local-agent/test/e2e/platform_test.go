package e2e

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"github.com/YOURNAME/agentic-gateway/pkg/adapterapp"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/platform"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

type fixtureStore struct{}

type fixtureConfig struct {
	URL  string
	Mode string
	// Binary and Cert are used only by the opt-in upstream CLI test. The
	// wrapper supplies the CLI's test endpoint without adding a production
	// endpoint override or weakening TLS verification in the adapter.
	Binary string
	Cert   string
}

func (fixtureStore) Get(key string) (string, error) {
	if key == "slack-token" {
		return "xoxp-fixture", nil
	}
	if key == "slack-bot-token" {
		return "xoxb-fixture", nil
	}
	return "", errors.New("not found")
}
func (fixtureStore) Set(string, string) error { return nil }
func (fixtureStore) Delete(string) error      { return nil }

// These subprocesses replace only external platform CLIs and credentials.
// The actual client runtime, gateway protocol, core process, model HTTP,
// MCP transport, approval gate, and platform adapter entrypoint remain real.
func runFixtureProcess() bool {
	name := filepath.Base(os.Args[0])
	if name == "model-fixture" {
		var in modelRequest
		if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
			panic(err)
		}
		json.NewEncoder(os.Stdout).Encode(answer("CLI model replied: " + in.Messages[len(in.Messages)-1].Content))
		return true
	}
	if name == "mcp-fixture" {
		s := mcp.NewServer(&mcp.Implementation{Name: "stdio-fixture", Version: "1"}, nil)
		mcp.AddTool(s, &mcp.Tool{Name: "read", Description: "Read fixture value"}, func(context.Context, *mcp.CallToolRequest, struct{}) (*mcp.CallToolResult, any, error) {
			return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "stdio tool value"}}}, nil, nil
		})
		if err := s.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
			panic(err)
		}
		return true
	}
	if name != "adapter-fixture" && name != "slack-fixture" && name != "telegram-fixture" {
		return false
	}
	if name == "adapter-fixture" {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		cfg, err := config.Load(os.Args[2])
		if err == nil {
			err = adapterapp.Run(ctx, os.Args[1], cfg, fixtureStore{})
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return true
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(os.Args[0]), "fixture.json"))
	if err != nil {
		panic(err)
	}
	var settings fixtureConfig
	if err = json.Unmarshal(data, &settings); err != nil {
		panic(err)
	}
	if name == "slack-fixture" {
		if len(os.Args) != 7 || os.Args[1] != "api" || os.Args[3] != "--json" || os.Args[5] != "--no-color" || os.Args[6] != "--skip-update" {
			panic("incorrect Slack CLI arguments")
		}
		tokenKey, otherKey, token := "SLACK_USER_TOKEN", "SLACK_BOT_TOKEN", "xoxp-fixture"
		if settings.Mode == "bot" {
			tokenKey, otherKey, token = "SLACK_BOT_TOKEN", "SLACK_USER_TOKEN", "xoxb-fixture"
		}
		if os.Getenv(tokenKey) != token || os.Getenv(otherKey) != "" {
			panic("token was not passed in private child environment")
		}
		if os.Getenv("SLACK_DISABLE_TELEMETRY") != "true" {
			panic("Slack telemetry was not disabled")
		}
		if settings.Binary != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			configDir := filepath.Join(filepath.Dir(os.Args[0]), "slack-config")
			if err := os.MkdirAll(configDir, 0700); err != nil {
				panic(err)
			}
			args := append(os.Args[1:], "--apihost", settings.URL, "--config-dir", configDir)
			cmd := exec.CommandContext(ctx, settings.Binary, args...)
			cmd.Dir = filepath.Dir(os.Args[0])
			cmd.Env = append(os.Environ(), "SSL_CERT_FILE="+settings.Cert)
			var diagnostics bytes.Buffer
			cmd.Stdout = os.Stdout
			cmd.Stderr = &diagnostics
			if err := cmd.Run(); err != nil {
				// These test subprocesses only ever have synthetic credentials.
				os.WriteFile(filepath.Join(filepath.Dir(os.Args[0]), "upstream-error.txt"), diagnostics.Bytes(), 0600)
				panic(err)
			}
			return true
		}
		resp, err := http.Post(settings.URL+"/"+os.Args[2], "application/json", strings.NewReader(os.Args[4]))
		if err != nil {
			panic(err)
		}
		defer resp.Body.Close()
		io.Copy(os.Stdout, resp.Body)
		return true
	}
	var socket string
	bot := false
	for i, arg := range os.Args {
		if arg == "-b" {
			bot = true
		}
		if arg == "-S" {
			socket = os.Args[i+1]
		}
	}
	if socket == "" {
		panic("missing Telegram command socket")
	}
	if bot != (settings.Mode == "bot") {
		panic("incorrect Telegram account mode argument")
	}
	for _, flag := range []string{"--json", "-R", "-C", "-I", "-W", "-E", "--disable-link-preview", "--permanent-msg-ids", "--permanent-peer-ids", "-c"} {
		found := false
		for _, arg := range os.Args {
			found = found || arg == flag
		}
		if !found {
			panic("missing Telegram adapter flag: " + flag)
		}
	}
	lis, err := net.Listen("unix", socket)
	if err != nil {
		panic(err)
	}
	defer lis.Close()
	go func() {
		for {
			conn, err := lis.Accept()
			if err != nil {
				return
			}
			func() {
				defer conn.Close()
				line, err := bufio.NewReader(conn).ReadString('\n')
				if err != nil {
					return
				}
				body, _ := json.Marshal(map[string]string{"command": line})
				resp, err := http.Post(settings.URL+"/send", "application/json", bytes.NewReader(body))
				if err != nil {
					return
				}
				resp.Body.Close()
				answer := `{"event":"message","id":"aabbcc"}` + "\n"
				fmt.Fprintf(conn, "ANSWER %d\n%s\n", len(answer), answer)
			}()
		}
	}()
	for {
		resp, err := http.Get(settings.URL + "/updates")
		if err != nil {
			return true
		}
		io.Copy(os.Stdout, resp.Body)
		resp.Body.Close()
	}
}

func fixtureBinary(t *testing.T, name, url string) string {
	t.Helper()
	dir := t.TempDir()
	binary := filepath.Join(dir, name)
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Symlink(self, binary); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(map[string]string{"URL": url})
	if err = os.WriteFile(filepath.Join(dir, "fixture.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	return binary
}

func launchAdapter(t *testing.T, name string, cfg config.Config) {
	t.Helper()
	binary := fixtureBinary(t, "adapter-fixture", "")
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, binary, name, writeConfig(t, cfg))
	cmd.Cancel = func() error { return cmd.Process.Signal(syscall.SIGTERM) }
	cmd.WaitDelay = 3 * time.Second
	var stderr lockedBuffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	t.Cleanup(func() {
		cancel()
		<-done
		if t.Failed() {
			t.Log(stderr.String())
		}
	})
}

func TestSlackCLIEntrypoint(t *testing.T)    { testPlatformApproval(t, "slack") }
func TestTelegramCLIEntrypoint(t *testing.T) { testPlatformApproval(t, "telegram") }

func testPlatformApproval(t *testing.T, platformName string, upstreamCLI ...string) {
	for _, mode := range []string{"personal", "bot"} {
		t.Run(mode, func(t *testing.T) { testPlatformModeApproval(t, platformName, mode, upstreamCLI...) })
	}
}

func testPlatformModeApproval(t *testing.T, platformName, mode string, upstreamCLI ...string) {
	upstream := ""
	if len(upstreamCLI) > 0 {
		upstream = upstreamCLI[0]
	}
	for _, approved := range []bool{true, false} {
		t.Run(fmt.Sprintf("approve=%t", approved), func(t *testing.T) {
			approvalWindow := "5s"
			postTimeout := 12 * time.Second
			if upstream != "" {
				// The unmodified CLI performs initialization for every API call.
				// Keep the short fixture deadline, but allow real process startup
				// costs without changing the production approval deadline.
				approvalWindow = "30s"
				postTimeout = 40 * time.Second
			}
			socket := startCore(t, "-approval-timeout", approvalWindow)
			var toolCalls atomic.Int32
			toolServer := mcp.NewServer(&mcp.Implementation{Name: "platform-tools", Version: "1"}, nil)
			mcp.AddTool(toolServer, &mcp.Tool{Name: "write", Description: "Write a fixture value"}, func(ctx context.Context, req *mcp.CallToolRequest, in struct{}) (*mcp.CallToolResult, any, error) {
				toolCalls.Add(1)
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "platform tool output"}}}, nil, nil
			})
			tools := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return toolServer }, nil))
			t.Cleanup(tools.Close)
			var modelCalls atomic.Int32
			model := modelServer(t, func(r modelRequest) any {
				modelCalls.Add(1)
				last := r.Messages[len(r.Messages)-1]
				if last.Role == "tool" {
					if !strings.Contains(last.Content, "platform tool output") {
						t.Error("core did not include MCP result")
					}
					return answer("server completed " + platformName + " request")
				}
				if last.Content != "perform operation" {
					t.Errorf("unauthorized or wrong prompt reached core: %q", last.Content)
				}
				return map[string]any{"message": map[string]any{"role": "assistant", "tool_calls": []any{map[string]any{"function": map[string]any{"name": "tools__write", "arguments": map[string]any{}}}}}}
			})
			cfg := cfgFor(socket, model.URL)
			cfg.MCP = []config.MCP{{Name: "tools", URL: tools.URL}}
			cfg.AllowedTools = []string{"tools__write"}
			posts := make(chan string, 8)
			updates := make(chan any, 8)
			prefix := "/agent "
			if platformName == "slack" {
				prefix = "agent: "
			}
			// Fixture events represent messages sent after the adapter starts.
			// Authentication in the real CLI may take more than one second;
			// a one-second offset races the adapter's history lower bound.
			root := fmt.Sprintf("%d.000001", time.Now().Unix()+60)
			var mu sync.Mutex
			var slackApprovals []map[string]any
			slackToken := "xoxp-fixture"
			telegramRecipient := 42
			if mode == "bot" {
				slackToken = "xoxb-fixture"
				telegramRecipient = 777 // Bot DM must route to the human, not the bot.
			}
			platformServer := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if platformName == "telegram" {
					if r.URL.Path == "/updates" {
						select {
						case m := <-updates:
							json.NewEncoder(w).Encode(m)
						case <-r.Context().Done():
						}
						return
					}
					var body map[string]string
					json.NewDecoder(r.Body).Decode(&body)
					posts <- body["command"]
					io.WriteString(w, `{}`)
					return
				}
				var body map[string]any
				json.NewDecoder(r.Body).Decode(&body)
				path := r.URL.Path
				if upstream != "" {
					if r.Header.Get("Authorization") != "Bearer "+slackToken || r.Method != http.MethodPost || !strings.HasPrefix(path, "/api/") {
						t.Errorf("upstream Slack request had incorrect auth/method/path")
					}
					path = strings.TrimPrefix(path, "/api")
				}
				switch path {
				case "/auth.test":
					user := "OWNER"
					if mode == "bot" {
						user = "BOT"
					}
					json.NewEncoder(w).Encode(map[string]any{"ok": true, "user_id": user})
				case "/conversations.history":
					if body["channel"] != "C123" {
						t.Errorf("unexpected history channel: %v", body)
					}
					messages := []map[string]any{{"ts": root, "text": prefix + "perform operation", "user": "OWNER"}, {"ts": root + "1", "text": prefix + "stolen request", "user": "INTRUDER"}}
					json.NewEncoder(w).Encode(map[string]any{"ok": true, "messages": messages})
				case "/conversations.replies":
					mu.Lock()
					messages := append([]map[string]any{}, slackApprovals...)
					mu.Unlock()
					json.NewEncoder(w).Encode(map[string]any{"ok": true, "messages": messages})
				case "/chat.postMessage":
					if body["channel"] != "C123" || body["thread_ts"] != root || body["mrkdwn"] != false || body["unfurl_links"] != false {
						t.Errorf("reply routing/format is wrong: %v", body)
					}
					posts <- body["text"].(string)
					json.NewEncoder(w).Encode(map[string]any{"ok": true, "ts": root + "9"})
				default:
					t.Errorf("unexpected Slack method %s", r.URL.Path)
					w.WriteHeader(400)
				}
			}))
			if upstream != "" {
				platformServer.StartTLS()
			} else {
				platformServer.Start()
			}
			t.Cleanup(platformServer.Close)
			if platformName == "slack" {
				cfg.Slack = config.Slack{Command: fixtureBinary(t, "slack-fixture", platformServer.URL), Mode: mode, UserID: "OWNER", TokenKey: "slack-token", Channels: []string{"C123"}, PollSeconds: 1}
				if mode == "bot" {
					cfg.Slack.TokenKey = "slack-bot-token"
				}
				settings := fixtureConfig{URL: platformServer.URL, Mode: mode, Binary: upstream}
				if upstream != "" {
					dir := filepath.Dir(cfg.Slack.Command)
					t.Cleanup(func() {
						if t.Failed() {
							data, _ := os.ReadFile(filepath.Join(dir, "upstream-error.txt"))
							t.Logf("official Slack CLI diagnostics: %s", data)
						}
					})
					cert := filepath.Join(dir, "fixture-ca.pem")
					if err := os.WriteFile(cert, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: platformServer.Certificate().Raw}), 0600); err != nil {
						t.Fatal(err)
					}
					settings.Cert = cert
				}
				writeFixtureSettings(t, cfg.Slack.Command, settings)
			} else {
				cfg.Telegram = config.Telegram{Command: fixtureBinary(t, "telegram-fixture", platformServer.URL), Mode: mode, UserID: 42, ConfigFile: filepath.Join(t.TempDir(), "telegram-profile", "config"), Peers: []string{"user:42"}}
				writeFixtureSettings(t, cfg.Telegram.Command, fixtureConfig{URL: platformServer.URL, Mode: mode})
				updates <- telegramEvent("aa", "/agent stolen request", 99, telegramRecipient)
				updates <- telegramEvent("bb", "/agent perform operation", 42, telegramRecipient)
			}
			launchAdapter(t, platformName, cfg)
			first := awaitPost(t, posts, postTimeout)
			if !strings.Contains(first, "Approval needed: tools__write") || toolCalls.Load() != 0 {
				t.Fatalf("tool ran without user approval: %q calls=%d", first, toolCalls.Load())
			}
			_, tail, ok := strings.Cut(first, prefix+"approve ")
			if !ok {
				t.Fatal("missing approval command")
			}
			id := strings.Fields(strings.ReplaceAll(tail, `\n`, " "))[0]
			choice := "deny"
			if approved {
				choice = "approve"
			}
			text := prefix + choice + " " + id
			if platformName == "slack" {
				mu.Lock()
				slackApprovals = []map[string]any{{"ts": root + "2", "thread_ts": root, "text": text, "user": "INTRUDER"}, {"ts": root + "3", "thread_ts": root, "text": text, "user": "OWNER"}}
				mu.Unlock()
			} else {
				updates <- telegramEvent("cc", text, 99, telegramRecipient)
				updates <- telegramEvent("dd", text, 42, telegramRecipient)
			}
			last := awaitPost(t, posts, postTimeout)
			if approved {
				if !strings.Contains(last, "server completed "+platformName+" request") || toolCalls.Load() != 1 || modelCalls.Load() != 2 {
					t.Fatalf("wrong platform/core result: %q tools=%d model=%d", last, toolCalls.Load(), modelCalls.Load())
				}
			} else if !strings.Contains(last, "denied by approval gate") || toolCalls.Load() != 0 || modelCalls.Load() != 1 {
				t.Fatalf("denied action executed: %q tools=%d model=%d", last, toolCalls.Load(), modelCalls.Load())
			}
		})
	}
}
func telegramEvent(id, text string, owner, recipient int) any {
	return map[string]any{"event": "message", "id": id, "text": text, "from": map[string]any{"peer_type": "user", "peer_id": owner}, "to": map[string]any{"peer_type": "user", "peer_id": recipient}, "date": time.Now().Unix() + 1}
}

func writeFixtureSettings(t *testing.T, binary string, settings fixtureConfig) {
	t.Helper()
	data, err := json.Marshal(settings)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(filepath.Dir(binary), "fixture.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
}
func awaitPost(t *testing.T, ch <-chan string, timeout time.Duration) string {
	t.Helper()
	select {
	case text := <-ch:
		return text
	case <-time.After(timeout):
		t.Fatal("platform did not receive core output")
		return ""
	}
}

func TestSlackCLIPaginationPreservesPromptOrder(t *testing.T) {
	root := fmt.Sprintf("%d.000001", time.Now().Unix()+1)
	var pages atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/auth.test" {
			json.NewEncoder(w).Encode(map[string]any{"ok": true, "user_id": "OWNER"})
			return
		}
		if r.URL.Path != "/conversations.history" {
			t.Errorf("unexpected CLI method: %s", r.URL.Path)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		pages.Add(1)
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if body["cursor"] == "older-page" {
			json.NewEncoder(w).Encode(map[string]any{"ok": true, "messages": []any{map[string]any{"ts": root, "user": "OWNER", "text": "agent: older"}}})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"ok": true, "has_more": true, "response_metadata": map[string]string{"next_cursor": "older-page"},
			"messages": []any{map[string]any{"ts": root + "1", "user": "OWNER", "text": "agent: newer", "thread_ts": root}},
		})
	}))
	defer server.Close()
	s, err := platform.NewSlack(config.Slack{Command: fixtureBinary(t, "slack-fixture", server.URL), UserID: "OWNER", Channels: []string{"C123"}}, fixtureStore{})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var received []string
	finished := errors.New("received both prompts")
	err = s.Receive(ctx, func(m platform.Message) error {
		received = append(received, m.Text)
		if len(received) == 2 {
			return finished
		}
		return nil
	})
	if !errors.Is(err, finished) || pages.Load() != 2 || strings.Join(received, "|") != "agent: older|agent: newer" {
		t.Fatalf("pagination reordered or lost prompts: %v, pages=%d, error=%v", received, pages.Load(), err)
	}
}
