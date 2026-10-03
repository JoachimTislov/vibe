// Package tools implements the custom toolset for Joachim's personal agent.
//
// Every tool is workspace-rooted: paths are resolved against a configured
// root directory and refused if they escape it. That keeps the agent's
// file, git and shell access inside the projects workspace.
package tools

import (
	"fmt"

	"google.golang.org/adk/v2/tool"
)

// New returns the full personal-agent toolset. Each tool is a typed Go
// function wrapped with functiontool, so the LLM sees an accurate JSON
// schema derived from the argument and result structs.
func New(workspace Workspace) ([]tool.Tool, error) {
	clock, err := NewClockTool()
	if err != nil {
		return nil, fmt.Errorf("clock tool: %w", err)
	}
	files, err := NewFilesTool(workspace)
	if err != nil {
		return nil, fmt.Errorf("files tools: %w", err)
	}
	git, err := NewGitTool(workspace)
	if err != nil {
		return nil, fmt.Errorf("git tool: %w", err)
	}
	shell, err := NewShellTool(workspace)
	if err != nil {
		return nil, fmt.Errorf("shell tool: %w", err)
	}
	all := make([]tool.Tool, 0, 1+len(files)+len(git)+len(shell))
	all = append(all, clock)
	all = append(all, files...)
	all = append(all, git...)
	all = append(all, shell...)
	return all, nil
}
