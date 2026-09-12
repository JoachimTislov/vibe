package e2e

import (
	"context"
	"errors"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/onboarding"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type setupPrompts struct {
	answers    map[string]string
	transcript []string
	secret     string
}

func (p *setupPrompts) Ask(label, def string) (string, error) {
	p.transcript = append(p.transcript, label)
	for prefix, answer := range p.answers {
		if strings.HasPrefix(label, prefix) {
			return answer, nil
		}
	}
	return def, nil
}
func (p *setupPrompts) Secret(string) (string, error) { return p.secret, nil }
func (p *setupPrompts) Print(s string)                { p.transcript = append(p.transcript, s) }

type memoryStore map[string]string

func (s memoryStore) Get(k string) (string, error) {
	v, ok := s[k]
	if !ok {
		return "", errors.New("missing")
	}
	return v, nil
}
func (s memoryStore) Set(k, v string) error { s[k] = v; return nil }
func (s memoryStore) Delete(k string) error { delete(s, k); return nil }

func TestOnboardingProducesUsableClientConfiguration(t *testing.T) {
	socket := startCore(t)
	model := modelServer(t, func(r modelRequest) any { return answer("onboarded agent: " + r.Messages[len(r.Messages)-1].Content) })
	path := filepath.Join(t.TempDir(), "config.json")
	p := &setupPrompts{answers: map[string]string{"Core Unix socket": socket, "Ollama endpoint": model.URL, "Model name": "test-model"}}
	if err := onboarding.Setup(path, p, memoryStore{}); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("onboarding config must be private")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, filepath.Join(binaries, "agent"), "local", "--config", path, "--prompt", "hello")
	data, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(data), "onboarded agent: hello") {
		t.Fatalf("onboarded client failed: %v %s", err, data)
	}
}

func TestOnboardingPersonalAndBotChoicesKeepSecretsOutOfConfig(t *testing.T) {
	for _, mode := range []string{"personal", "bot"} {
		t.Run(mode, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "config.json")
			p := &setupPrompts{secret: "xoxp-do-not-print", answers: map[string]string{"Clients": "local,slack,telegram", "Slack mode": mode, "Telegram mode": mode, "Your Slack user ID": "OWNER", "Allowed channel/DM IDs": "C123", "Telegram CLI profile config": filepath.Join(dir, "telegram", "config"), "Your numeric Telegram user ID": "42"}}
			if mode == "bot" {
				p.secret = "xoxb-do-not-print"
			}
			store := memoryStore{}
			if err := onboarding.Setup(path, p, store); err != nil {
				t.Fatal(err)
			}
			cfg, err := config.Load(path)
			if err != nil {
				t.Fatal(err)
			}
			data, _ := os.ReadFile(path)
			if strings.Contains(string(data), p.secret) || strings.Contains(strings.Join(p.transcript, "\n"), p.secret) || store["slack-token"] != p.secret {
				t.Fatal("secret storage violated")
			}
			if cfg.Slack.Mode != mode || cfg.Telegram.Mode != mode || cfg.Slack.Command != "slack" || cfg.Telegram.Command != "telegram-cli" || len(cfg.AllowedTools) != 0 {
				t.Fatalf("incorrect setup choices: %+v", cfg)
			}
			p.answers["Replace existing configuration"] = "no"
			before := string(data)
			if err = onboarding.Setup(path, p, store); err == nil {
				t.Fatal("expected cancellation")
			}
			after, _ := os.ReadFile(path)
			if string(after) != before {
				t.Fatal("cancelled setup changed existing config")
			}
		})
	}
}

func TestCLIModelEntrypoint(t *testing.T) {
	socket := startCore(t)
	cfg := cfgFor(socket, "")
	cfg.Model = config.Model{Provider: "cli", Command: []string{fixtureBinary(t, "model-fixture", "")}}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, filepath.Join(binaries, "agent"), "--config", writeConfig(t, cfg), "--prompt", "hello via CLI")
	data, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(data), "CLI model replied: hello via CLI") {
		t.Fatalf("CLI provider did not reach core: %v %s", err, data)
	}
}

func TestOnboardingRerunPreservesModelAndMultipleMCPServers(t *testing.T) {
	cfg := config.Default()
	cfg.Clients = []string{"local"}
	cfg.Model = config.Model{Provider: "cli", Command: []string{"trusted-model", "--json"}}
	cfg.MCP = []config.MCP{{Name: "one", Command: []string{"first-server"}}, {Name: "two", URL: "https://example.invalid/mcp"}}
	cfg.AllowedTools = []string{"one__read", "two__search"}
	path := writeConfig(t, cfg)
	if err := onboarding.Setup(path, &setupPrompts{}, memoryStore{}); err != nil {
		t.Fatal(err)
	}
	got, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got.Model.Command, "|") != "trusted-model|--json" || len(got.MCP) != 2 || got.MCP[1].Name != "two" || strings.Join(got.AllowedTools, "|") != "one__read|two__search" {
		t.Fatalf("rerunning setup lost existing configuration: %+v", got)
	}
}

func TestOnboardingCollectsOptionalHTTPSBearerKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store := memoryStore{}
	p := &setupPrompts{secret: "masked-secret", answers: map[string]string{
		"Clients":                    "local",
		"Ollama endpoint":            "https://model.example.test",
		"Model bearer keychain name": "model-key",
		"Enable MCP tool operations": "yes",
		"MCP URL":                    "https://tools.example.test/mcp",
		"MCP bearer keychain name":   "mcp-key",
		"Allowed tools":              "tools__read",
		"MCP server name":            "tools",
	}}
	if err := onboarding.Setup(path, p, store); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Model.KeychainKey != "model-key" || len(cfg.MCP) != 1 || cfg.MCP[0].KeychainKey != "mcp-key" || store["model-key"] != "masked-secret" || store["mcp-key"] != "masked-secret" {
		t.Fatalf("HTTPS bearer setup was not persisted securely: %+v, %v", cfg, store)
	}
}
