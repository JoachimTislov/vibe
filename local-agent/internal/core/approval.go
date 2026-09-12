package core

import (
	"context"
	"sync"
	"time"
)

// ApprovalGate is the structural enforcement point referenced in
// SOURCE_OF_TRUTH.md: "state-changing actions require an explicit approval
// step, enforced by the core's dispatch layer, not by individual skills
// choosing to ask nicely." A Handler that wants to perform a state-changing
// action calls RequireApproval and blocks on the result — there is no
// separate code path that skips this by construction, because the action
// itself (e.g. the executor call) should not be reachable without going
// through it.
type ApprovalGate struct {
	mu      sync.Mutex
	pending map[string]chan approvalDecision
}

type approvalDecision struct {
	approved bool
	note     string
}

func NewApprovalGate() *ApprovalGate {
	return &ApprovalGate{pending: make(map[string]chan approvalDecision)}
}

// ApprovalRequest mirrors the proto message of the same name — see the
// note on InboundMessage/OutboundMessage in conversation.go for why core
// logic uses plain structs rather than generated protobuf types directly.
type ApprovalRequest struct {
	ApprovalID     string
	ConversationID string
	ActionSummary  string
	ActionKind     string
	ExpiresAt      time.Time
}

// Publish is how dispatch.go's gRPC layer notifies the gate that a request
// has been sent out to the adapter (and therefore, eventually, to the
// human). Awaiting this method's returned channel is what RequireApproval
// blocks on.
func (g *ApprovalGate) Publish(req ApprovalRequest) <-chan approvalDecision {
	g.mu.Lock()
	defer g.mu.Unlock()
	ch := make(chan approvalDecision, 1)
	g.pending[req.ApprovalID] = ch
	return ch
}

// Resolve is called when an ApprovalResponse arrives from an adapter.
// Unknown or already-resolved approval_ids are silently ignored — a late
// or duplicate response is not an error condition worth surfacing.
func (g *ApprovalGate) Resolve(approvalID string, approved bool, note string) {
	g.mu.Lock()
	ch, ok := g.pending[approvalID]
	if ok {
		delete(g.pending, approvalID)
	}
	g.mu.Unlock()

	if ok {
		ch <- approvalDecision{approved: approved, note: note}
	}
}

// RequireApproval blocks until a decision arrives, the request expires, or
// ctx is cancelled. A Handler performing a state-changing action must call
// this before invoking the executor for that action — see
// SOURCE_OF_TRUTH.md's approval invariant.
//
// Ordering note for callers of this function (server.go's Connect loop is
// the real one): the pending entry is registered before publish is
// invoked, so it is always safe for an ApprovalResponse to arrive as soon
// as publish returns — but not before. If publish itself only *schedules*
// delivery (e.g. hands off to a channel consumed by another goroutine)
// rather than blocking until the adapter has actually received it, a
// response that arrives faster than that hand-off completes is not a bug
// in this gate; the caller's publish implementation must not report
// completion until delivery is actually underway.
func (g *ApprovalGate) RequireApproval(ctx context.Context, req ApprovalRequest, publish func(ApprovalRequest)) error {
	decisionC := g.Publish(req)
	defer func() { g.mu.Lock(); delete(g.pending, req.ApprovalID); g.mu.Unlock() }()
	publish(req) // hands the request to whatever sends it out to the adapter

	timer := time.NewTimer(time.Until(req.ExpiresAt))
	defer timer.Stop()

	select {
	case decision := <-decisionC:
		if !decision.approved {
			return ErrApprovalDenied
		}
		return nil
	case <-timer.C:
		return ErrApprovalExpired
	case <-ctx.Done():
		return ctx.Err()
	}
}
