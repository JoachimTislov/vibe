package unit

import (
	"context"
	"testing"
	"time"

	"github.com/YOURNAME/agentic-gateway/internal/core"
)

func TestApprovalGate_Approved(t *testing.T) {
	gate := core.NewApprovalGate()
	req := core.ApprovalRequest{
		ApprovalID:     "a1",
		ConversationID: "c1",
		ActionKind:     "send_email",
		ExpiresAt:      time.Now().Add(time.Second),
	}

	// A real caller only resolves an approval after it has actually gone
	// out (e.g. after the adapter has sent the ApprovalRequest over the
	// wire) — the publish callback is that signal. Resolving before it
	// fires is a race against RequireApproval's internal registration,
	// not a realistic sequence, so the test waits for it explicitly.
	sent := make(chan struct{})
	errC := make(chan error, 1)
	go func() {
		errC <- gate.RequireApproval(context.Background(), req, func(core.ApprovalRequest) {
			close(sent)
		})
	}()

	<-sent
	gate.Resolve("a1", true, "looks good")

	if err := <-errC; err != nil {
		t.Fatalf("expected approval to succeed, got error: %v", err)
	}
}

func TestApprovalGate_Denied(t *testing.T) {
	gate := core.NewApprovalGate()
	req := core.ApprovalRequest{
		ApprovalID: "a2",
		ExpiresAt:  time.Now().Add(time.Second),
	}

	sent := make(chan struct{})
	errC := make(chan error, 1)
	go func() {
		errC <- gate.RequireApproval(context.Background(), req, func(core.ApprovalRequest) {
			close(sent)
		})
	}()

	<-sent
	gate.Resolve("a2", false, "not now")

	if err := <-errC; err != core.ErrApprovalDenied {
		t.Fatalf("expected ErrApprovalDenied, got: %v", err)
	}
}

func TestApprovalGate_Expires(t *testing.T) {
	gate := core.NewApprovalGate()
	req := core.ApprovalRequest{
		ApprovalID: "a3",
		ExpiresAt:  time.Now().Add(10 * time.Millisecond),
	}

	// No Resolve call — the request must time out on its own, proving the
	// gate doesn't hang forever waiting for a human who never answers.
	err := gate.RequireApproval(context.Background(), req, func(core.ApprovalRequest) {})
	if err != core.ErrApprovalExpired {
		t.Fatalf("expected ErrApprovalExpired, got: %v", err)
	}
}
