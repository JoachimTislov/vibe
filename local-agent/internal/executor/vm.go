package executor

import (
	"context"
	"errors"
)

// VMExecutor runs a task inside a dedicated, persistent VM boundary.
// Reserved for the "agent never stops running" case — see TierVM's doc
// comment in executor.go.
//
// Scaffolded as a stub. Per ARCHITECTURE.md, build the v1 of this on plain
// SSH to a long-lived VM (golang.org/x/crypto/ssh) before reaching for
// Firecracker microVMs (github.com/firecracker-microvm/firecracker-go-sdk)
// — only move to Firecracker once this tier is actually load-bearing.
type VMExecutor struct {
	Host string // SSH-reachable host for the v1 implementation
}

func NewVMExecutor(host string) *VMExecutor {
	return &VMExecutor{Host: host}
}

func (v *VMExecutor) Tier() Tier { return TierVM }

func (v *VMExecutor) Run(ctx context.Context, task Task) (Result, error) {
	// TODO v1: golang.org/x/crypto/ssh — dial v.Host, run task.Command/Args
	// over an SSH session, capture output.
	// TODO v2: swap to firecracker-go-sdk for per-agent microVM isolation
	// once the SSH-based approach is a proven bottleneck, not before.
	return Result{}, errors.New("executor: vm tier not implemented yet")
}
