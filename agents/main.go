// Command agents runs Joachim's personal agent: an ADK agent with a
// custom toolset rooted in the projects workspace.
//
// Environment:
//
//	AGENT_MODEL_PROVIDER  optional; "mistral" (default) or "gemini"
//	MISTRAL_API_KEY       required for the mistral provider
//	MISTRAL_MODEL         optional; defaults to mistral-large-latest
//	GOOGLE_API_KEY        required for the gemini provider
//	GEMINI_MODEL          optional; defaults to gemini-flash-latest
//	AGENT_WORKSPACE       optional; workspace root, defaults to $HOME/projects
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"agents/mistralmodel"
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

	"agents/tools"
)

const (
	providerMistral = "mistral"
	providerGemini  = "gemini"
)

func main() {
	ctx := context.Background()

	llm, provider, err := newModel(ctx)
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	personal, err := newPersonalAgent(llm, provider == providerGemini)
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	args := os.Args[1:]
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

// newModel builds the LLM from the environment. Mistral is the default
// provider, served by the custom mistralmodel adapter (Mistral speaks
// chat completions, not OpenAI's Responses API); gemini uses the native
// genai model.
func newModel(ctx context.Context) (model.LLM, string, error) {
	provider := strings.ToLower(os.Getenv("AGENT_MODEL_PROVIDER"))
	if provider == "" {
		provider = providerMistral
	}
	switch provider {
	case providerMistral:
		key := os.Getenv("MISTRAL_API_KEY")
		if key == "" {
			return nil, "", fmt.Errorf("MISTRAL_API_KEY is not set")
		}
		name := os.Getenv("MISTRAL_MODEL")
		if name == "" {
			name = "mistral-large-latest"
		}
		return mistralmodel.New(name, key), provider, nil
	case providerGemini:
		key := os.Getenv("GOOGLE_API_KEY")
		if key == "" {
			return nil, "", fmt.Errorf("GOOGLE_API_KEY is not set")
		}
		name := os.Getenv("GEMINI_MODEL")
		if name == "" {
			name = "gemini-flash-latest"
		}
		llm, err := gemini.NewModel(ctx, name, &genai.ClientConfig{
			APIKey: key,
		})
		return llm, provider, err
	default:
		return nil, "", fmt.Errorf("unknown AGENT_MODEL_PROVIDER %q: use mistral or gemini", provider)
	}
}

// newPersonalAgent assembles the personal agent: generalized harness
// (model + toolset + launcher) with a personal persona layered on top.
// Web search grounding (Google Search) is only available on Gemini.
func newPersonalAgent(llm model.LLM, withSearch bool) (agent.Agent, error) {
	workspace, err := tools.DefaultWorkspace()
	if err != nil {
		return nil, err
	}
	custom, err := tools.New(workspace)
	if err != nil {
		return nil, err
	}
	all := custom
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
