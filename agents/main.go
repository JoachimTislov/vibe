// Command agents runs Joachim's personal agent: a Gemini-backed ADK agent
// with a custom toolset rooted in the projects workspace.
//
// Environment:
//
//	GOOGLE_API_KEY     required; Gemini API key
//	GEMINI_MODEL       optional; defaults to gemini-flash-latest
//	AGENT_WORKSPACE    optional; workspace root, defaults to $HOME/projects
package main

import (
	"context"
	"log"
	"os"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/cmd/launcher"
	"google.golang.org/adk/v2/cmd/launcher/full"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/geminitool"
	"google.golang.org/genai"

	"agents/tools"
)

func main() {
	ctx := context.Background()

	if os.Getenv("GOOGLE_API_KEY") == "" {
		log.Fatal("GOOGLE_API_KEY is not set")
	}

	model, err := newModel(ctx)
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	personal, err := newPersonalAgent(model)
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	l := full.NewLauncher()
	config := &launcher.Config{
		AgentLoader: agent.NewSingleLoader(personal),
	}
	if err = l.Execute(ctx, config, os.Args[1:]); err != nil {
		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
	}
}

// newModel builds the Gemini model from the environment.
func newModel(ctx context.Context) (model.LLM, error) {
	name := os.Getenv("GEMINI_MODEL")
	if name == "" {
		name = "gemini-flash-latest"
	}
	return gemini.NewModel(ctx, name, &genai.ClientConfig{
		APIKey: os.Getenv("GOOGLE_API_KEY"),
	})
}

// newPersonalAgent assembles the personal agent: generalized harness
// (model + toolset + launcher) with a personal persona layered on top.
func newPersonalAgent(llm model.LLM) (agent.Agent, error) {
	workspace, err := tools.DefaultWorkspace()
	if err != nil {
		return nil, err
	}
	custom, err := tools.New(workspace)
	if err != nil {
		return nil, err
	}
	// Google Search grounding on top of the custom toolset.
	all := append(custom, tool.Tool(geminitool.GoogleSearch{}))
	return llmagent.New(llmagent.Config{
		Name:        "personal_agent",
		Model:       llm,
		Description: "Joachim's personal agent with custom tools for his projects workspace.",
		Instruction: persona(workspace.Root),
		Tools:       all,
	})
}
