// Command agents runs Joachim's personal agent: an ADK agent with a
// custom toolset rooted in the projects workspace.
//
// The model backend is BYOK: AGENT_MODEL_PROVIDER (or the model.provider
// field in agent.json) selects a provider - mistral, openai, openrouter,
// groq, ollama, anthropic, gemini, cli, custom - and the matching API
// key or CLI command powers the agent.
//
// Modes:
//
//	(no args)   interactive console, locally
//	api|a2a     production server modes for deployment
//	mcp         MCP server for AI CLIs; requires AGENT_ACCESS_KEY
//
// The agent records every tool call in <workspace>/logs/journal/.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/cmd/launcher"
	"google.golang.org/adk/v2/cmd/launcher/full"
	"google.golang.org/adk/v2/cmd/launcher/prod"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/geminitool"
	"google.golang.org/adk/v2/tool/mcptoolset"
	"google.golang.org/genai"

	"agents/anthropicmodel"
	"agents/climodel"
	"agents/mcpserver"
	"agents/openaicomp"
	"agents/tools"
)

const agentVersion = "0.2.0"

func main() {
	ctx := context.Background()
	args := os.Args[1:]

	if len(args) > 0 && args[0] == "mcp" {
		if err := runMCPServer(ctx, args[1:]); err != nil {
			log.Fatalf("MCP server failed: %v", err)
		}
		return
	}

	ag, err := buildAgent(ctx, agentOptions{Mode: "console"})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	// The "api" and "a2a" subcommands are server modes for deployment:
	// use the production launcher (REST API + A2A, no dev console/WebUI).
	// Everything else (console, web) runs the full launcher locally.
	var l launcher.Launcher = full.NewLauncher()
	if len(args) > 0 && (args[0] == "api" || args[0] == "a2a") {
		l = prod.NewLauncher()
	}
	config := &launcher.Config{
		AgentLoader: agent.NewSingleLoader(ag.agent),
	}
	if err = l.Execute(ctx, config, args); err != nil {
		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
	}
}

// runMCPServer starts the owner-authenticated MCP server.
func runMCPServer(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("mcp", flag.ExitOnError)
	host := fs.String("host", "", "listen host; default all interfaces")
	port := fs.Int("port", 8080, "listen port")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ag, err := buildAgent(ctx, agentOptions{Mode: "mcp"})
	if err != nil {
		return err
	}
	if ag.cfg.AccessKey == "" {
		return fmt.Errorf("refusing to start the MCP server unauthenticated: set AGENT_ACCESS_KEY (or access_key in agent.json); only the owner may reach this endpoint")
	}
	handler, err := mcpserver.New(mcpserver.Options{
		PersonalAgent: ag.agent,
		Workspace:     ag.workspace,
		Journal:       ag.bundle.Journal,
		AccessKey:     ag.cfg.AccessKey,
	})
	if err != nil {
		return err
	}
	addr := fmt.Sprintf("%s:%d", *host, *port)
	return mcpserver.Serve(ctx, handler, addr)
}

// agentOptions selects the serving mode.
type agentOptions struct {
	Mode string // "console" or "mcp"
}

// assembled holds everything the modes need.
type assembled struct {
	agent     agent.Agent
	bundle    *tools.Bundle
	workspace tools.Workspace
	cfg       AgentConfig
}

// buildAgent assembles the personal agent for a mode.
func buildAgent(ctx context.Context, opts agentOptions) (*assembled, error) {
	workspace, err := tools.DefaultWorkspace()
	if err != nil {
		return nil, err
	}
	cfg := loadAgentConfig(workspace.Root)

	llm, provider, modelName, err := newModel(ctx, cfg)
	if err != nil {
		return nil, err
	}

	// Over MCP the owner is authenticated by access key; privileged
	// tools are auto-approved only if the config explicitly allows it.
	autoApprove := opts.Mode == "mcp" && cfg.MCPAllowPrivileged
	bundle, err := tools.NewBundle(workspace, tools.Options{
		AutoApprove: autoApprove,
		Info: tools.RuntimeInfo{
			Provider:  provider,
			Model:     modelName,
			Workspace: workspace.Root,
			Version:   agentVersion,
			StartedAt: time.Now().UTC(),
		},
	})
	if err != nil {
		return nil, err
	}
	toolsets, mcpNames, err := buildMCPToolsets(cfg.MCPServers)
	if err != nil {
		return nil, err
	}

	withSearch := provider == providerGemini
	allTools := bundle.Tools
	if withSearch {
		allTools = append(allTools, tool.Tool(geminitool.GoogleSearch{}))
	}

	journalCb := func(ctx agent.Context, t tool.Tool, args, result map[string]any, err error) (map[string]any, error) {
		bundle.Journal.Record("agent", t.Name(), args, result, err)
		return result, nil
	}

	ag, err := llmagent.New(llmagent.Config{
		Name:               "personal_agent",
		Model:              llm,
		Description:        "Joachim's personal agent with custom tools for his projects workspace.",
		Instruction:        persona(workspace.Root, withSearch),
		Tools:              allTools,
		Toolsets:           toolsets,
		AfterToolCallbacks: []llmagent.AfterToolCallback{journalCb},
	})
	if err != nil {
		return nil, err
	}
	// Startup self-check goes into the journal.
	bundle.Journal.Record("startup", "self_check", map[string]any{
		"mode": opts.Mode, "provider": provider, "model": modelName,
		"workspace": workspace.Root, "mcp_clients": mcpNames,
	}, nil, nil)

	return &assembled{agent: ag, bundle: bundle, workspace: workspace, cfg: cfg}, nil
}

// buildMCPToolsets turns configured MCP server references into ADK
// toolsets, so the agent can use them on the owner's behalf.
func buildMCPToolsets(refs []MCPServerRef) ([]tool.Toolset, []string, error) {
	if len(refs) == 0 {
		return nil, nil, nil
	}
	sets := make([]tool.Toolset, 0, len(refs))
	names := make([]string, 0, len(refs))
	for _, ref := range refs {
		if ref.Name == "" || (len(ref.Command) == 0 && ref.URL == "") {
			return nil, nil, fmt.Errorf("mcp server %q needs a name and either command or url", ref.Name)
		}
		var cfg mcptoolset.Config
		if len(ref.Command) > 0 {
			cfg.Transport = &mcp.CommandTransport{
				Command: exec.Command(ref.Command[0], ref.Command[1:]...),
			}
		} else {
			client := &http.Client{}
			if ref.Bearer != "" {
				client.Transport = &bearerRoundTripper{token: ref.Bearer, next: http.DefaultTransport}
			}
			cfg.Transport = &mcp.StreamableClientTransport{
				Endpoint:   ref.URL,
				HTTPClient: client,
			}
		}
		set, err := mcptoolset.New(cfg)
		if err != nil {
			return nil, nil, fmt.Errorf("mcp server %q: %w", ref.Name, err)
		}
		sets = append(sets, set)
		names = append(names, ref.Name)
	}
	return sets, names, nil
}

type bearerRoundTripper struct {
	token string
	next  http.RoundTripper
}

func (b *bearerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	req = req.Clone(req.Context())
	req.Header.Set("Authorization", "Bearer "+b.token)
	return b.next.RoundTrip(req)
}

// providerSpec describes one BYOK backend.
type providerSpec struct {
	kind        string // "openai", "anthropic", "gemini" or "cli"
	keyEnv      string // required API key env (empty when keyless)
	modelEnv    string // optional model (or CLI command) env
	fallback    string // default model name
	baseURL     string // used by the openai kind
	keyOptional bool   // keyless local endpoints (ollama, custom)
}

const (
	providerMistral = "mistral"
	providerGemini  = "gemini"
)

var providers = map[string]providerSpec{
	"mistral":    {kind: "openai", keyEnv: "MISTRAL_API_KEY", modelEnv: "MISTRAL_MODEL", fallback: "mistral-large-latest", baseURL: "https://api.mistral.ai/v1"},
	"openai":     {kind: "openai", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", fallback: "gpt-5", baseURL: "https://api.openai.com/v1"},
	"openrouter": {kind: "openai", keyEnv: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_MODEL", fallback: "openrouter/auto", baseURL: "https://openrouter.ai/api/v1"},
	"groq":       {kind: "openai", keyEnv: "GROQ_API_KEY", modelEnv: "GROQ_MODEL", fallback: "llama-3.3-70b-versatile", baseURL: "https://api.groq.com/openai/v1"},
	"ollama":     {kind: "openai", modelEnv: "OLLAMA_MODEL", fallback: "qwen3:8b", baseURL: "http://localhost:11434/v1", keyOptional: true},
	"anthropic":  {kind: "anthropic", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", fallback: "claude-sonnet-4-5"},
	"gemini":     {kind: "gemini", keyEnv: "GOOGLE_API_KEY", modelEnv: "GEMINI_MODEL", fallback: "gemini-flash-latest"},
	"cli":        {kind: "cli", modelEnv: "AGENT_CLI_COMMAND", keyOptional: true},
	// custom: any OpenAI-compatible endpoint. AGENT_BASE_URL and
	// AGENT_MODEL are required; AGENT_API_KEY is optional (keyless local
	// endpoints such as llama.cpp or LM Studio).
	"custom": {kind: "openai", keyEnv: "AGENT_API_KEY", modelEnv: "AGENT_MODEL", baseURL: os.Getenv("AGENT_BASE_URL"), keyOptional: true},
}

// newModel builds the LLM from config file and environment (BYOK).
func newModel(ctx context.Context, cfg AgentConfig) (model.LLM, string, string, error) {
	provider := cfg.Model.Provider
	if provider == "" {
		provider = providerMistral
	}
	provider = strings.ToLower(provider)
	spec, ok := providers[provider]
	if !ok {
		return nil, "", "", fmt.Errorf("unknown model provider %q: use one of %s", provider, providerNames())
	}
	name := cfg.Model.Model
	if name == "" {
		name = os.Getenv(spec.modelEnv)
	}
	if name == "" {
		name = spec.fallback
	}
	if name == "" && provider == "custom" {
		return nil, "", "", fmt.Errorf("custom provider requires a model (AGENT_MODEL or agent.json)")
	}
	key := os.Getenv(spec.keyEnv)
	if spec.keyEnv != "" && key == "" && !spec.keyOptional {
		return nil, "", "", fmt.Errorf("%s is not set", spec.keyEnv)
	}

	switch spec.kind {
	case "openai":
		baseURL := spec.baseURL
		if provider == "custom" && baseURL == "" {
			return nil, "", "", fmt.Errorf("custom provider requires AGENT_BASE_URL")
		}
		return openaicomp.New(openaicomp.Config{Model: name, APIKey: key, BaseURL: baseURL}), provider, name, nil
	case "anthropic":
		return anthropicmodel.New(anthropicmodel.Config{Model: name, APIKey: key}), provider, name, nil
	case "gemini":
		llm, err := gemini.NewModel(ctx, name, &genai.ClientConfig{APIKey: key})
		return llm, provider, name, err
	case "cli":
		var command []string
		if raw := os.Getenv(spec.modelEnv); raw != "" {
			if err := json.Unmarshal([]byte(raw), &command); err != nil {
				return nil, "", "", fmt.Errorf("%s must be a JSON argv array: %w", spec.modelEnv, err)
			}
		}
		llm, err := climodel.New(climodel.Config{Command: command})
		return llm, provider, name, err
	default:
		return nil, "", "", fmt.Errorf("internal: unsupported provider kind %q", spec.kind)
	}
}

func providerNames() string {
	names := make([]string, 0, len(providers))
	for n := range providers {
		names = append(names, n)
	}
	for i := 0; i < len(names); i++ {
		for j := i + 1; j < len(names); j++ {
			if names[j] < names[i] {
				names[i], names[j] = names[j], names[i]
			}
		}
	}
	return strings.Join(names, ", ")
}
