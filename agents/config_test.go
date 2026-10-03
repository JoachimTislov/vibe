package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAgentConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent.json")
	cfgJSON := `{
  "model": {"provider": "openai", "model": "gpt-5"},
  "access_key": "file-key",
  "mcp_allow_privileged": true,
  "mcp_servers": [
    {"name": "fetch", "command": ["npx", "-y", "server-fetch"]},
    {"name": "remote", "url": "https://mcp.example.com", "bearer": "tok"}
  ]
}`
	if err := os.WriteFile(path, []byte(cfgJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AGENT_CONFIG", path)

	cfg := loadAgentConfig(dir)
	if cfg.Model.Provider != "openai" || cfg.Model.Model != "gpt-5" {
		t.Errorf("model config: %+v", cfg.Model)
	}
	if cfg.AccessKey != "file-key" || !cfg.MCPAllowPrivileged {
		t.Errorf("access/privileged: %+v", cfg)
	}
	if len(cfg.MCPServers) != 2 || cfg.MCPServers[0].Name != "fetch" || len(cfg.MCPServers[0].Command) != 3 {
		t.Errorf("mcp servers: %+v", cfg.MCPServers)
	}
	if cfg.MCPServers[1].URL == "" || cfg.MCPServers[1].Bearer != "tok" {
		t.Errorf("http mcp server: %+v", cfg.MCPServers[1])
	}

	// Env overrides the file.
	t.Setenv("AGENT_MODEL_PROVIDER", "mistral")
	t.Setenv("AGENT_ACCESS_KEY", "env-key")
	cfg = loadAgentConfig(dir)
	if cfg.Model.Provider != "mistral" || cfg.AccessKey != "env-key" {
		t.Errorf("env override failed: %+v", cfg)
	}
}

func TestLoadAgentConfigMissingFile(t *testing.T) {
	t.Setenv("AGENT_CONFIG", "")
	cfg := loadAgentConfig(t.TempDir())
	if cfg.Model.Provider != "" || cfg.AccessKey != "" || len(cfg.MCPServers) != 0 {
		t.Errorf("expected empty config, got %+v", cfg)
	}
}
