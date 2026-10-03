package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// shellTimeout bounds each run_command invocation.
const shellTimeout = 30 * time.Second

// RunCommandArgs is the input of the run_command tool.
type RunCommandArgs struct {
	// The shell command line to run, e.g. "go test ./...".
	Command string `json:"command" jsonschema:"shell command to run, executed in the workspace root"`
}

// RunCommandResult is the output of the run_command tool.
type RunCommandResult struct {
	Command  string `json:"command"`
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
}

// NewShellTool returns run_command: an arbitrary shell command run in the
// workspace root. Every invocation requires explicit user confirmation,
// enforced by the ADK human-in-the-loop flow.
func NewShellTool(w Workspace) ([]tool.Tool, error) {
	runCommand, err := functiontool.New(
		functiontool.Config{
			Name:                "run_command",
			Description:         "Runs a shell command in the workspace root and returns its combined output and exit code. Requires user confirmation before execution.",
			RequireConfirmation: true,
		},
		func(ctx agent.Context, args RunCommandArgs) (RunCommandResult, error) {
			return RunShellIn(w, args.Command)
		},
	)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{runCommand}, nil
}

// RunShellIn is the core of run_command, callable outside the LLM loop.
func RunShellIn(w Workspace, command string) (RunCommandResult, error) {
	if strings.TrimSpace(command) == "" {
		return RunCommandResult{}, fmt.Errorf("command is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), shellTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", "-lc", command)
	cmd.Dir = w.Root
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	runErr := cmd.Run()
	res := RunCommandResult{Command: command, Output: strings.TrimSpace(out.String())}
	if cmd.ProcessState != nil {
		res.ExitCode = cmd.ProcessState.ExitCode()
	}
	if ctx.Err() == context.DeadlineExceeded {
		res.Output = strings.TrimSpace(res.Output + fmt.Sprintf("\n[timed out after %v]", shellTimeout))
	}
	if runErr != nil && res.ExitCode == 0 && res.Output == "" {
		res.Output = runErr.Error()
	}
	return res, nil
}
