package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"github.com/YOURNAME/agentic-gateway/pkg/adapterapp"
	"github.com/YOURNAME/agentic-gateway/pkg/client"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"github.com/YOURNAME/agentic-gateway/pkg/localcli"
	"github.com/YOURNAME/agentic-gateway/pkg/mcpfront"
	"github.com/YOURNAME/agentic-gateway/pkg/onboarding"
	"github.com/YOURNAME/agentic-gateway/pkg/runtime"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"golang.org/x/term"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	args := os.Args[1:]
	command := "local"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command = args[0]
		args = args[1:]
	}
	loginTarget := ""
	if command == "login" && len(args) > 0 {
		loginTarget = args[0]
		args = args[1:]
	}
	flags := flag.NewFlagSet("agent "+command, flag.ContinueOnError)
	defaultPath := ""
	if _, err := os.Stat("config.local.json"); err == nil || command == "setup" {
		defaultPath = "config.local.json"
	}
	path := flags.String("config", defaultPath, "client JSON configuration")
	socket := flags.String("socket", "", "override Unix socket")
	jsonMode := flags.Bool("json", false, "JSON-lines input and output")
	prompt := flags.String("prompt", "", "one-shot prompt; interactive mode is needed for approvals")
	conversation := flags.String("conversation", "local", "conversation ID")
	flags.Usage = func() {
		fmt.Fprintln(flags.Output(), "Usage: agent [setup|doctor|local|slack|telegram|mcp|login telegram] [flags]")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	store := credentials.Keychain{}
	if command == "setup" {
		return onboarding.Setup(*path, onboarding.Terminal{Reader: bufio.NewReader(os.Stdin), Out: os.Stdout, ReadSecret: func() (string, error) {
			if !term.IsTerminal(int(os.Stdin.Fd())) {
				return "", errors.New("enter credentials in an interactive terminal")
			}
			value, err := term.ReadPassword(int(os.Stdin.Fd()))
			return string(value), err
		}}, store)
	}
	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	if *socket != "" {
		cfg.Socket = *socket
	}
	if command == "doctor" {
		return doctor(ctx, cfg, store)
	}
	if command == "login" {
		if loginTarget != "telegram" {
			return errors.New("use 'agent login telegram'; Slack tokens are entered through 'agent setup'")
		}
		if cfg.Telegram.ConfigFile == "" {
			return errors.New("configure Telegram first with 'agent setup'")
		}
		if err := config.EnsureTelegramProfile(cfg.Telegram.ConfigFile); err != nil {
			return err
		}
		binary := cfg.Telegram.Command
		if binary == "" {
			binary = "telegram-cli"
		}
		argv := []string{"-c", cfg.Telegram.ConfigFile, "-E", "--disable-link-preview"}
		if cfg.Telegram.PublicKey != "" {
			argv = append(argv, "-k", cfg.Telegram.PublicKey)
		}
		if cfg.Telegram.Mode == "bot" {
			argv = append(argv, "-b")
		}
		cmd := exec.CommandContext(ctx, binary, argv...)
		cmd.Stdin = os.Stdin
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	if len(cfg.Clients) > 0 {
		enabled := false
		for _, name := range cfg.Clients {
			if name == command {
				enabled = true
				break
			}
		}
		if !enabled {
			return fmt.Errorf("client %s is disabled; run agent setup", command)
		}
	}
	if command == "slack" || command == "telegram" {
		return adapterapp.Run(ctx, command, cfg, store)
	}
	if command != "local" && command != "mcp" {
		return errors.New("unknown command; run agent --help")
	}
	r, err := runtime.New(ctx, cfg, store)
	if err != nil {
		return err
	}
	defer r.Close()
	if command == "mcp" {
		return mcpfront.New(cfg, r).Run(ctx, &mcp.StdioTransport{})
	}
	c, err := client.Dial(ctx, cfg.Socket, cfg.Principal, "local", r)
	if err != nil {
		return err
	}
	defer c.Close()
	return localcli.Run(ctx, c, os.Stdin, os.Stdout, localcli.Options{JSON: *jsonMode, Prompt: *prompt, Conversation: *conversation})
}

func doctor(ctx context.Context, cfg config.Config, store credentials.Store) error {
	failed := false
	check := func(binary string, args []string, required ...string) {
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, binary, args...)
		data, _ := cmd.CombinedOutput()
		output := string(data)
		missing := ""
		for _, flag := range required {
			if !strings.Contains(output, flag) {
				missing = flag
				break
			}
		}
		if missing != "" {
			fmt.Printf("MISSING/INCOMPATIBLE: %s (required: %s)\n", binary, missing)
			failed = true
		} else {
			fmt.Printf("OK: %s\n", binary)
		}
	}
	for _, name := range cfg.Clients {
		switch name {
		case "slack":
			binary := cfg.Slack.Command
			if binary == "" {
				binary = "slack"
			}
			check(binary, []string{"api", "--help", "--skip-update"}, "--json")
			key := cfg.Slack.TokenKey
			if key == "" {
				key = "slack-token"
			}
			token, err := store.Get(key)
			if err != nil {
				failed = true
				fmt.Println("MISSING: Slack token in OS keychain")
			} else if (cfg.Slack.Mode == "bot" && !strings.HasPrefix(token, "xoxb-")) || (cfg.Slack.Mode != "bot" && !strings.HasPrefix(token, "xoxp-")) {
				failed = true
				fmt.Println("MISSING/INCOMPATIBLE: Slack token type for configured account mode")
			}
		case "telegram":
			binary := cfg.Telegram.Command
			if binary == "" {
				binary = "telegram-cli"
			}
			check(binary, []string{"--help"}, "--json", "--permanent-msg-ids", "--udp-socket")
			if cfg.Telegram.ConfigFile == "" {
				failed = true
				fmt.Println("MISSING: Telegram profile; run agent login telegram")
			} else if !filepath.IsAbs(cfg.Telegram.ConfigFile) {
				failed = true
				fmt.Println("MISSING/INCOMPATIBLE: Telegram profile path must be absolute")
			} else if info, err := os.Lstat(cfg.Telegram.ConfigFile); err != nil {
				failed = true
				fmt.Println("MISSING: Telegram profile; run agent login telegram")
			} else if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
				failed = true
				fmt.Println("MISSING/INCOMPATIBLE: Telegram profile must be a private regular file")
			}
		}
	}
	if cfg.Model.Provider == "cli" && len(cfg.Model.Command) > 0 {
		if _, err := exec.LookPath(cfg.Model.Command[0]); err != nil {
			failed = true
			fmt.Println("MISSING: model executable")
		}
	}
	if failed {
		return errors.New("install the selected CLIs; see README.md for exact repositories")
	}
	fmt.Println("Configuration dependencies checked. No account login or message was sent.")
	return nil
}
