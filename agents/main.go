// Command agents runs Joachim's personal agent: an ADK agent with a
// custom toolset rooted in the projects workspace.
//
// The model backend is BYOK: AGENT_MODEL_PROVIDER selects a provider
// (mistral, openai, openrouter, groq, ollama, anthropic, gemini, cli,
// custom) and the matching API key or CLI command powers the agent.
//
// Modes:
//
//	(no args)   interactive console, locally
//	api|a2a     production server modes for deployment
//	mcp         MCP server so other AI CLIs can use the agent
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/cmd/launcher"
	"google.golang.org/adk/v2/cmd/launcher/full"
	"google.golang.org/adk/v2/cmd/launcher/prod"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/geminitool"
	"google.golang.org/genai"

	"agents/anthropicmodel"
	"agents/climodel"
	"agents/mcpserver"
	"agents/openaicomp"
	"agents/tools"
)

func main() {
	ctx := context.Background()
	args := os.Args[1:]

	if len(args) > 0 && args[0] == "mcp" {
		if err := runMCPServer(ctx, args[1:]); err != nil {
			log.Fatalf("MCP server failed: %v", err)
		}
		return
	}

	llm, provider, err := newModel(ctx)
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	personal, err := assembleAgent(llm, provider == providerGemini, nil)
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
		AgentLoader: agent.NewSingleLoader(personal),
	}
	if err = l.Execute(ctx, config, args); err != nil {
		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
	}
}

// runMCPServer starts the MCP server (tools + ask_agent).
func runMCPServer(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("mcp", flag.ExitOnError)
	host := fs.String("host", "", "listen host; default all interfaces")
	port := fs.Int("port", 8080, "listen port")
	if err := fs.Parse(args); err != nil {
		return err
	}

	llm, provider, err := newModel(ctx)
	if err != nil {
		return err
	}
	// Over MCP there is no human to approve confirmations, so the served
	// agent excludes the confirmation-gated run_command tool.
	personal, err := assembleAgent(llm, provider == providerGemini, map[string]bool{"run_command": true})
	if err != nil {
		return err
	}
	workspace, err := tools.DefaultWorkspace()
	if err != nil {
		return err
	}
	handler, err := mcpserver.New(mcpserver.Options{
		PersonalAgent: personal,
		Workspace:     workspace,
	})
	if err != nil {
		return err
	}
	addr := fmt.Sprintf("%s:%d", *host, *port)
	return mcpserver.Serve(ctx, handler, addr)
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
	"ollama":     {kind: "openai", keyEnv: "", modelEnv: "OLLAMA_MODEL", fallback: "qwen3:8b", baseURL: "http://localhost:11434/v1", keyOptional: true},
	"anthropic":  {kind: "anthropic", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", fallback: "claude-sonnet-4-5"},
	"gemini":     {kind: "gemini", keyEnv: "GOOGLE_API_KEY", modelEnv: "GEMINI_MODEL", fallback: "gemini-flash-latest"},
	"cli":        {kind: "cli", modelEnv: "AGENT_CLI_COMMAND", keyOptional: true},
	// custom: any OpenAI-compatible endpoint. AGENT_BASE_URL and
	// AGENT_MODEL are required; AGENT_API_KEY is optional (keyless local
	// endpoints such as llama.cpp or LM Studio).
	"custom": {kind: "openai", keyEnv: "AGENT_API_KEY", modelEnv: "AGENT_MODEL", baseURL: os.Getenv("AGENT_BASE_URL"), keyOptional: true},
}

// newModel builds the LLM from the environment (BYOK).
func newModel(ctx context.Context) (model.LLM, string, error) {
	provider := strings.ToLower(os.Getenv("AGENT_MODEL_PROVIDER"))
	if provider == "" {
		provider = providerMistral
	}
	spec, ok := providers[provider]
	if !ok {
		return nil, "", fmt.Errorf("unknown AGENT_MODEL_PROVIDER %q: use one of %s", provider, providerNames())
	}
	name := os.Getenv(spec.modelEnv)
	if name == "" {
		name = spec.fallback
	}
	if name == "" && provider == "custom" {
		return nil, "", fmt.Errorf("custom provider requires AGENT_MODEL and AGENT_BASE_URL")
	}
	key := os.Getenv(spec.keyEnv)
	if spec.keyEnv != "" && key == "" && !spec.keyOptional {
		return nil, "", fmt.Errorf("%s is not set", spec.keyEnv)
	}

	switch spec.kind {
	case "openai":
		baseURL := spec.baseURL
		if provider == "custom" && baseURL == "" {
			return nil, "", fmt.Errorf("custom provider requires AGENT_BASE_URL")
		}
		return openaicomp.New(openaicomp.Config{Model: name, APIKey: key, BaseURL: baseURL}), provider, nil
	case "anthropic":
		return anthropicmodel.New(anthropicmodel.Config{Model: name, APIKey: key}), provider, nil
	case "gemini":
		llm, err := gemini.NewModel(ctx, name, &genai.ClientConfig{APIKey: key})
		return llm, provider, err
	case "cli":
		var command []string
		if raw := os.Getenv(spec.modelEnv); raw != "" {
			if err := json.Unmarshal([]byte(raw), &command); err != nil {
				return nil, "", fmt.Errorf("%s must be a JSON argv array: %w", spec.modelEnv, err)
			}
		}
		llm, err := climodel.New(climodel.Config{Command: command})
		return llm, provider, err
	default:
		return nil, "", fmt.Errorf("internal: unsupported provider kind %q", spec.kind)
	}
}

func providerNames() string {
	names := make([]string, 0, len(providers))
	for n := range providers {
		names = append(names, n)
	}
	sorted := names
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j] < sorted[i] {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	return strings.Join(sorted, ", ")
}

// assembleAgent builds the personal agent: persona + custom toolset on
// top of the chosen model. excluded names are dropped from the toolset;
// Google Search grounding is only available on Gemini.
func assembleAgent(llm model.LLM, withSearch bool, excluded map[string]bool) (agent.Agent, error) {
	workspace, err := tools.DefaultWorkspace()
	if err != nil {
		return nil, err
	}
	custom, err := tools.New(workspace)
	if err != nil {
		return nil, err
	}
	all := make([]tool.Tool, 0, len(custom)+1)
	for _, t := range custom {
		if excluded[t.Name()] {
			continue
		}
		all = append(all, t)
	}
	if withSearch {
		all = append(all, tool.Tool(geminitool.GoogleSearch{}))
	}
	return llmagent.New(llmagent.Config{
		Name:        "personal_agent",
		Model:       llm,
		Description: "Joachim's personal agent with custom tools for his projects workspace.",
		Instruction: persona(workspace.Root, withSearch),
		Tools:       all,
	})
}
