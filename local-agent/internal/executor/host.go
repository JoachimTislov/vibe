package executor

import (
	"bytes"
	"context"
	"os/exec"
)

// HostExecutor runs a task as a direct child process of core. Same trust
// boundary as whatever account core runs under — see the TierHost doc
// comment in executor.go for what this tier is and isn't meant for.
type HostExecutor struct{}

func NewHostExecutor() *HostExecutor { return &HostExecutor{} }

func (h *HostExecutor) Tier() Tier { return TierHost }

func (h *HostExecutor) Run(ctx context.Context, task Task) (Result, error) {
	cmd := exec.CommandContext(ctx, task.Command, task.Args...)
	for k, v := range task.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if exitErr, ok := err.(*exec.ExitError); ok {
		exitCode = exitErr.ExitCode()
	} else if err != nil {
		return Result{}, err
	}

	return Result{
		ExitCode: exitCode,
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
	}, nil
}
