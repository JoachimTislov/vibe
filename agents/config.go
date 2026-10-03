package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// AgentConfig is the optional configuration file (agent.json). It makes
// the agent configurable in one place: model provider, owner access key
// and MCP client connections. Environment variables override the file
// (secrets belong in env or a secrets manager).
type AgentConfig struct {
	Model struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
	} `json:"model"`
	// AccessKey is the owner's bearer token for the MCP endpoint.
	AccessKey string `json:"access_key"`
	// MCPAllowPrivileged auto-approves gated tools (run_command,
	// write_file, ...) over MCP. Only safe because MCP access is
	// owner-key-only; still, off by default.
	MCPAllowPrivileged bool `json:"mcp_allow_privileged"`
	// MCPServers are MCP servers the agent connects to as a client, to
	// act on the owner's behalf.
	MCPServers []MCPServerRef `json:"mcp_servers"`
}

// MCPServerRef is one MCP client connection: either a stdio command or
// an HTTP endpoint, optionally with a bearer token.
type MCPServerRef struct {
	Name    string   `json:"name"`
	Command []string `json:"command"` // stdio, e.g. ["npx","-y","@modelcontextprotocol/server-fetch"]
	URL     string   `json:"url"`     // streamable HTTP endpoint
	Bearer  string   `json:"bearer"`  // optional bearer for URL endpoints
}

// loadAgentConfig reads $AGENT_CONFIG or <workspace>/agent.json; missing
// files are fine. Environment always wins.
func loadAgentConfig(workspaceRoot string) AgentConfig {
	var cfg AgentConfig
	for _, path := range []string{os.Getenv("AGENT_CONFIG"), filepath.Join(workspaceRoot, "agent.json")} {
		if path == "" {
			continue
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if json.Unmarshal(raw, &cfg) == nil {
			break
		}
	}
	// Secrets and provider selection: env overrides the file.
	if v := os.Getenv("AGENT_MODEL_PROVIDER"); v != "" {
		cfg.Model.Provider = v
	}
	if v := os.Getenv("AGENT_ACCESS_KEY"); v != "" {
		cfg.AccessKey = v
	}
	return cfg
}
