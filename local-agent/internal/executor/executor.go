// Package executor runs agent-initiated work behind an isolation boundary
// chosen per task, per SOURCE_OF_TRUTH.md's execution isolation invariant.
// Nothing outside this package should ever call os/exec, a container
// runtime, or a VM API directly — that boundary is what makes the isolation
// policy enforceable rather than aspirational.
package executor

import "context"

// Tier identifies which isolation backend a task runs under. See policy.go
// for how a task is classified into one of these.
type Tier int

const (
	// TierHost runs the task as a bare OS process, same trust boundary as
	// the user account the core runs under. Reserved for quick, stateless
	// work — e.g. forwarding a prompt to a model API and returning the
	// answer.
	TierHost Tier = iota
	// TierContainer runs the task inside a container. For long-running,
	// multi-step work (research, multi-file edits) where filesystem/network
	// containment matters but a full VM per task is overkill.
	TierContainer
	// TierVM runs the task inside a dedicated VM. Reserved for agent
	// processes that are genuinely persistent — the "never stops running"
	// case — where the isolation boundary needs to outlive any single task.
	TierVM
)

func (t Tier) String() string {
	switch t {
	case TierHost:
		return "host"
	case TierContainer:
		return "container"
	case TierVM:
		return "vm"
	default:
		return "unknown"
	}
}

// Task describes one unit of agent-initiated work. Command/Args is the
// simplest possible shape (invoke a binary) — extend this struct, don't
// replace it, when a backend needs richer input (e.g. container image,
// mounted volumes).
type Task struct {
	ID      string
	Command string
	Args    []string
	Env     map[string]string

	// Classification hints consumed by policy.go. A caller can set these
	// directly to force a tier, or leave them unset and let the policy
	// infer from Command/EstimatedDuration.
	Persistent bool // true if this task should never terminate (-> TierVM)
	MultiStep  bool // true if this is a multi-step/long-running task (-> TierContainer)
}

// Result is intentionally minimal in this scaffold — extend with
// structured output as concrete backends are implemented.
type Result struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

// Executor is the single interface all three tiers implement. Callers
// (core dispatch) select an Executor via policy.Classify, never by
// constructing a backend directly.
type Executor interface {
	Tier() Tier
	Run(ctx context.Context, task Task) (Result, error)
}
