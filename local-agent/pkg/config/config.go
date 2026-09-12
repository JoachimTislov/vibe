// Package config loads non-secret, operator-owned client configuration.
package config

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
)

type Model struct {
	Provider    string   `json:"provider"`
	Endpoint    string   `json:"endpoint,omitempty"`
	Name        string   `json:"model,omitempty"`
	KeychainKey string   `json:"keychain_key,omitempty"`
	Command     []string `json:"command,omitempty"`
}
type MCP struct {
	Name        string   `json:"name"`
	Command     []string `json:"command,omitempty"`
	URL         string   `json:"url,omitempty"`
	KeychainKey string   `json:"keychain_key,omitempty"`
}
type Slack struct {
	UserID      string   `json:"user_id"`
	Mode        string   `json:"mode,omitempty"`
	Command     string   `json:"command,omitempty"`
	TokenKey    string   `json:"token_key,omitempty"`
	Channels    []string `json:"channels,omitempty"`
	PollSeconds int      `json:"poll_seconds,omitempty"`
}
type Telegram struct {
	UserID     int64    `json:"user_id"`
	Mode       string   `json:"mode,omitempty"`
	Command    string   `json:"command,omitempty"`
	ConfigFile string   `json:"config_file,omitempty"`
	PublicKey  string   `json:"public_key,omitempty"`
	Peers      []string `json:"peers,omitempty"`
}
type Config struct {
	Socket       string   `json:"socket"`
	Principal    string   `json:"principal"`
	Model        Model    `json:"model"`
	MCP          []MCP    `json:"mcp,omitempty"`
	Slack        Slack    `json:"slack,omitempty"`
	Telegram     Telegram `json:"telegram,omitempty"`
	Clients      []string `json:"clients,omitempty"`
	AllowedTools []string `json:"allowed_tools,omitempty"`
}

func Default() Config {
	return Config{Socket: filepath.Join(os.TempDir(), "agentic-gateway", "core.sock"), Principal: "default", Model: Model{Provider: "ollama", Endpoint: "http://127.0.0.1:11434", Name: "qwen3:8b"}, Slack: Slack{Mode: "personal", Command: "slack", TokenKey: "slack-token", PollSeconds: 15}, Telegram: Telegram{Mode: "personal", Command: "telegram-cli"}}
}
func Load(path string) (Config, error) {
	c := Default()
	if path == "" {
		return c, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return c, err
	}
	defer f.Close()
	d := json.NewDecoder(io.LimitReader(f, 1<<20))
	d.DisallowUnknownFields()
	if err = d.Decode(&c); err != nil {
		return c, err
	}
	var extra any
	if err = d.Decode(&extra); err != io.EOF {
		return c, errors.New("config must contain one JSON object")
	}
	if c.Principal == "" || c.Socket == "" {
		return c, errors.New("socket and principal are required")
	}
	return c, nil
}
