// Package onboarding implements reusable, interactive client setup.
package onboarding

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Prompter interface {
	Ask(string, string) (string, error)
	Secret(string) (string, error)
	Print(string)
}
type Terminal struct {
	Reader     *bufio.Reader
	Out        io.Writer
	ReadSecret func() (string, error)
}

func (t Terminal) Ask(label, def string) (string, error) {
	fmt.Fprintf(t.Out, "%s [%s]: ", label, def)
	line, err := t.Reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimSpace(line)
	if line == "" {
		line = def
	}
	return line, nil
}
func (t Terminal) Secret(label string) (string, error) {
	fmt.Fprint(t.Out, label+": ")
	value, err := t.ReadSecret()
	fmt.Fprintln(t.Out)
	return value, err
}
func (t Terminal) Print(text string) { fmt.Fprintln(t.Out, text) }

func Setup(path string, p Prompter, store credentials.Store) error {
	cfg := config.Default()
	exists := false
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return errors.New("config target must be a regular file")
		}
		exists = true
		cfg, err = config.Load(path)
		if err != nil {
			return err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	ask := func(label, def string, target *string) error {
		v, err := p.Ask(label, def)
		if err == nil {
			*target = v
		}
		return err
	}
	p.Print("Local agent setup. Select clients, account mode, and permitted operations.\nSecrets you enter are stored in the OS keychain.")
	selected := "local"
	if len(cfg.Clients) > 0 {
		selected = strings.Join(cfg.Clients, ",")
	}
	if err := ask("Clients (local, slack, telegram, mcp; comma separated)", selected, &selected); err != nil {
		return err
	}
	cfg.Clients = split(selected)
	for _, name := range cfg.Clients {
		if name != "local" && name != "slack" && name != "telegram" && name != "mcp" {
			return fmt.Errorf("unknown client %q", name)
		}
	}
	if len(cfg.Clients) == 0 {
		return errors.New("select at least one client")
	}
	if err := ask("Principal ID", cfg.Principal, &cfg.Principal); err != nil {
		return err
	}
	if err := ask("Core Unix socket", cfg.Socket, &cfg.Socket); err != nil {
		return err
	}
	if err := ask("Model provider (ollama or cli)", cfg.Model.Provider, &cfg.Model.Provider); err != nil {
		return err
	}
	switch cfg.Model.Provider {
	case "ollama":
		if err := ask("Ollama endpoint", cfg.Model.Endpoint, &cfg.Model.Endpoint); err != nil {
			return err
		}
		if err := ask("Model name", cfg.Model.Name, &cfg.Model.Name); err != nil {
			return err
		}
	case "cli":
		var command string
		commandDefault := ""
		if len(cfg.Model.Command) > 0 {
			encoded, err := json.Marshal(cfg.Model.Command)
			if err != nil {
				return err
			}
			commandDefault = string(encoded)
		}
		if err := ask("Model command as JSON argv (reads chat JSON on stdin)", commandDefault, &command); err != nil {
			return err
		}
		if err := json.Unmarshal([]byte(command), &cfg.Model.Command); err != nil || len(cfg.Model.Command) == 0 {
			return errors.New("model command must be a nonempty JSON array")
		}
	default:
		return errors.New("unknown model provider")
	}
	secrets := map[string]string{}
	keyPrompt := func(label, key string) error {
		value, err := p.Secret(label + " (blank keeps existing keychain entry)")
		if err != nil {
			return err
		}
		if value != "" {
			secrets[key] = value
			return nil
		}
		if _, err = store.Get(key); err != nil {
			return fmt.Errorf("keychain entry %s does not exist", key)
		}
		return nil
	}
	optionalBearer := func(label, current string, set func(string)) error {
		key := current
		if err := ask(label+" keychain name (enter none to disable; blank keeps current)", current, &key); err != nil {
			return err
		}
		if strings.EqualFold(strings.TrimSpace(key), "none") {
			key = ""
		}
		set(key)
		if key == "" {
			return nil
		}
		value, err := p.Secret(label + " (blank keeps existing keychain entry)")
		if err != nil {
			return err
		}
		if value != "" {
			secrets[key] = value
			return nil
		}
		if _, err = store.Get(key); err != nil {
			return fmt.Errorf("keychain entry %s does not exist", key)
		}
		return nil
	}
	if cfg.Model.Provider == "ollama" && strings.HasPrefix(strings.ToLower(cfg.Model.Endpoint), "https://") {
		if err := optionalBearer("Model bearer", cfg.Model.KeychainKey, func(key string) { cfg.Model.KeychainKey = key }); err != nil {
			return err
		}
	}
	for _, name := range cfg.Clients {
		switch name {
		case "slack":
			p.Print("Slack uses https://github.com/slackapi/slack-cli and its 'slack api' command.\nPersonal mode needs a scoped OAuth user token (xoxp-); bot mode needs xoxb-.\nOnly your 'agent: ...' messages in selected channels/threads will trigger replies.")
			if err := ask("Slack mode (personal or bot)", fallback(cfg.Slack.Mode, "personal"), &cfg.Slack.Mode); err != nil {
				return err
			}
			if cfg.Slack.Mode != "personal" && cfg.Slack.Mode != "bot" {
				return errors.New("invalid Slack mode")
			}
			if err := ask("Slack CLI executable", fallback(cfg.Slack.Command, "slack"), &cfg.Slack.Command); err != nil {
				return err
			}
			if err := ask("Your Slack user ID", cfg.Slack.UserID, &cfg.Slack.UserID); err != nil {
				return err
			}
			var channels string
			if err := ask("Allowed channel/DM IDs (comma separated)", strings.Join(cfg.Slack.Channels, ","), &channels); err != nil {
				return err
			}
			cfg.Slack.Channels = split(channels)
			if cfg.Slack.UserID == "" || len(cfg.Slack.Channels) == 0 {
				return errors.New("Slack owner and channels are required")
			}
			cfg.Slack.TokenKey = fallback(cfg.Slack.TokenKey, "slack-token")
			if err := keyPrompt("Slack OAuth token", cfg.Slack.TokenKey); err != nil {
				return err
			}
			if cfg.Slack.PollSeconds == 0 {
				cfg.Slack.PollSeconds = 15
			}
		case "telegram":
			p.Print("Telegram uses https://github.com/vysheng/tg (telegram-cli with JSON support).\nIts interactive login owns the session files in your Telegram profile.\nChoose a dedicated profile; keep its directory private. No login codes go into this config.")
			if err := ask("Telegram mode (personal or bot)", fallback(cfg.Telegram.Mode, "personal"), &cfg.Telegram.Mode); err != nil {
				return err
			}
			if cfg.Telegram.Mode != "personal" && cfg.Telegram.Mode != "bot" {
				return errors.New("invalid Telegram mode")
			}
			if err := ask("Telegram CLI executable", fallback(cfg.Telegram.Command, "telegram-cli"), &cfg.Telegram.Command); err != nil {
				return err
			}
			if cfg.Telegram.ConfigFile == "" {
				dir, err := os.UserConfigDir()
				if err != nil {
					return err
				}
				cfg.Telegram.ConfigFile = filepath.Join(dir, "agentic-gateway", "telegram-"+cfg.Telegram.Mode, "config")
			}
			if err := ask("Telegram CLI profile config (absolute path)", cfg.Telegram.ConfigFile, &cfg.Telegram.ConfigFile); err != nil {
				return err
			}
			if !filepath.IsAbs(cfg.Telegram.ConfigFile) {
				return errors.New("Telegram config_file must be an absolute path")
			}
			if err := ask("Telegram server public key path (blank uses CLI default)", cfg.Telegram.PublicKey, &cfg.Telegram.PublicKey); err != nil {
				return err
			}
			var owner string
			if cfg.Telegram.UserID > 0 {
				owner = strconv.FormatInt(cfg.Telegram.UserID, 10)
			}
			if err := ask("Your numeric Telegram user ID", owner, &owner); err != nil {
				return err
			}
			id, err := strconv.ParseInt(owner, 10, 64)
			if err != nil || id <= 0 {
				return errors.New("invalid Telegram user ID")
			}
			cfg.Telegram.UserID = id
			var peers string
			def := strings.Join(cfg.Telegram.Peers, ",")
			if def == "" {
				def = "user:" + owner
			}
			if err := ask("Allowed peers (user:123, chat:123, channel:123)", def, &peers); err != nil {
				return err
			}
			cfg.Telegram.Peers = split(peers)
		}
	}
	toolsDefault := "no"
	if len(cfg.AllowedTools) > 0 {
		toolsDefault = "yes"
	}
	var tools string
	if err := ask("Enable MCP tool operations? Every call requires approval (yes/no)", toolsDefault, &tools); err != nil {
		return err
	}
	reconfigure := "yes"
	if tools == "yes" && len(cfg.MCP) > 0 {
		if err := ask("Replace configured MCP servers and tool selection? (yes/no)", "no", &reconfigure); err != nil {
			return err
		}
		if reconfigure != "yes" && reconfigure != "no" {
			return errors.New("answer yes or no")
		}
	}
	if tools == "yes" && reconfigure == "yes" {
		var name, endpoint, allowed string
		if err := ask("MCP server name", "tools", &name); err != nil {
			return err
		}
		if err := ask("MCP URL, or JSON argv for a trusted local MCP server", "", &endpoint); err != nil {
			return err
		}
		server := config.MCP{Name: name}
		if strings.HasPrefix(endpoint, "[") {
			if err := json.Unmarshal([]byte(endpoint), &server.Command); err != nil {
				return err
			}
		} else {
			server.URL = endpoint
		}
		if len(server.Command) == 0 && server.URL == "" {
			return errors.New("MCP endpoint is required")
		}
		if server.URL != "" && strings.HasPrefix(strings.ToLower(server.URL), "https://") {
			if err := optionalBearer("MCP bearer", server.KeychainKey, func(key string) { server.KeychainKey = key }); err != nil {
				return err
			}
		}
		if err := ask("Allowed tools (server__tool names, or * for all with approval)", "*", &allowed); err != nil {
			return err
		}
		cfg.MCP = []config.MCP{server}
		cfg.AllowedTools = split(allowed)
	} else if tools == "no" {
		cfg.AllowedTools = nil
		cfg.MCP = nil
	} else if tools != "yes" {
		return errors.New("answer yes or no")
	}
	p.Print("Enabled clients: " + strings.Join(cfg.Clients, ", ") + ". Operations: prompt/reply" + map[bool]string{true: " and approval-gated MCP tools", false: " only"}[len(cfg.AllowedTools) > 0] + ".")
	label := "Save configuration"
	if exists {
		label = "Replace existing configuration"
	}
	answer, err := p.Ask(label+" at "+path+"? (yes/no)", "yes")
	if err != nil {
		return err
	}
	if answer != "yes" {
		return errors.New("setup cancelled; configuration was not written")
	}
	for key, value := range secrets {
		if err = store.Set(key, value); err != nil {
			return fmt.Errorf("could not store %s in OS keychain: %w", key, err)
		}
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".agent-config-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err = tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	if err = os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	p.Print("Saved " + path + ". Run 'agent doctor --config <path>' to check required CLIs.\nStart 'coreserver' with --socket set to " + cfg.Socket + ", then 'agent <client> --config <path>'.\nFor Telegram, first run 'agent login telegram --config <path>' to sign in locally.")
	return nil
}
func fallback(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
func split(s string) []string {
	var out []string
	seen := map[string]bool{}
	for _, v := range strings.Split(s, ",") {
		v = strings.TrimSpace(v)
		if v != "" && !seen[v] {
			out = append(out, v)
			seen[v] = true
		}
	}
	return out
}
