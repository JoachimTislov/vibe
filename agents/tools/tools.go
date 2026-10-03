// Package tools implements the custom toolset for Joachim's personal agent.
//
// Every tool is workspace-rooted: paths are resolved against a configured
// root directory and refused if they escape it. That keeps the agent's
// file, git, shell, process and web operations contained.
package tools

import (
	"fmt"

	"google.golang.org/adk/v2/tool"
)

// Options shapes the toolset.
type Options struct {
	// AutoApprove disables human-in-the-loop confirmation on mutating
	// tools (run_command, write_file, delete_path, start_process,
	// stop_process). Use only when the caller is authenticated as the
	// owner.
	AutoApprove bool
	// Info describes the runtime; it feeds the self_report tool. Its
	// ToolNames field is filled in automatically during assembly.
	Info RuntimeInfo
}

// Bundle is an assembled toolset plus the action journal.
type Bundle struct {
	Tools   []tool.Tool
	Journal *Journal
}

// NewBundle assembles the full personal-agent toolset: clock, files,
// git, shell, file ops, processes, web, self-reporting - and opens the
// action journal that records every tool call.
func NewBundle(workspace Workspace, opts Options) (*Bundle, error) {
	journal, err := OpenJournal(workspace)
	if err != nil {
		return nil, fmt.Errorf("journal: %w", err)
	}

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
	shell, err := NewShellTool(workspace, opts)
	if err != nil {
		return nil, fmt.Errorf("shell tool: %w", err)
	}
	fileOps, err := NewFileOpsTool(workspace, opts)
	if err != nil {
		return nil, fmt.Errorf("file ops tools: %w", err)
	}
	procs, err := NewProcessTool(workspace, opts)
	if err != nil {
		return nil, fmt.Errorf("process tools: %w", err)
	}
	web, err := NewWebTool()
	if err != nil {
		return nil, fmt.Errorf("web tool: %w", err)
	}

	all := make([]tool.Tool, 0, 16)
	all = append(all, clock)
	all = append(all, files...)
	all = append(all, git...)
	all = append(all, shell...)
	all = append(all, fileOps...)
	all = append(all, procs...)
	all = append(all, web)

	// The self tools see the complete tool list.
	opts.Info.ToolNames = make([]string, 0, len(all))
	for _, t := range all {
		opts.Info.ToolNames = append(opts.Info.ToolNames, t.Name())
	}
	self, err := NewSelfTool(opts.Info, journal, workspace)
	if err != nil {
		return nil, fmt.Errorf("self tools: %w", err)
	}
	all = append(all, self...)

	return &Bundle{Tools: all, Journal: journal}, nil
}
