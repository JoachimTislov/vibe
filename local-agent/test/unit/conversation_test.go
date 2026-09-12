package unit

import (
	"context"
	"sync"
	"testing"

	"github.com/YOURNAME/agentic-gateway/internal/core"
)

// TestConversation_PreservesCallerOrder is the load-bearing guarantee
// documented in conversation.go: since Send blocks until its message has
// been processed, a caller issuing messages one after another (as an
// adapter naturally does for one conversation) sees them handled in
// exactly that order.
func TestConversation_PreservesCallerOrder(t *testing.T) {
	var observedOrder []string

	handler := func(ctx context.Context, msg core.InboundMessage) ([]core.OutboundMessage, error) {
		observedOrder = append(observedOrder, msg.Text)
		return nil, nil
	}

	conv := core.NewConversation("conv-1", handler)
	defer conv.Close()

	want := []string{"first", "second", "third"}
	for _, text := range want {
		if _, err := conv.Send(context.Background(), core.InboundMessage{
			ConversationID: "conv-1",
			Text:           text,
		}); err != nil {
			t.Fatalf("unexpected error from Send(%q): %v", text, err)
		}
	}

	if len(observedOrder) != len(want) {
		t.Fatalf("expected %d processed messages, got %d", len(want), len(observedOrder))
	}
	for i, text := range want {
		if observedOrder[i] != text {
			t.Fatalf("position %d: expected %q, got %q", i, text, observedOrder[i])
		}
	}
}

// TestConversation_ConcurrentSendersAllComplete proves the actor is safe
// under concurrent callers (many adapters/goroutines hitting the same
// conversation at once) — every Send fully completes exactly once, with no
// dropped or duplicated deliveries. It deliberately does not assert a
// specific interleaving, since concurrent callers have no defined arrival
// order relative to each other.
func TestConversation_ConcurrentSendersAllComplete(t *testing.T) {
	var mu sync.Mutex
	processed := map[string]int{}

	handler := func(ctx context.Context, msg core.InboundMessage) ([]core.OutboundMessage, error) {
		mu.Lock()
		processed[msg.Text]++
		mu.Unlock()
		return nil, nil
	}

	conv := core.NewConversation("conv-2", handler)
	defer conv.Close()

	const n = 50
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := conv.Send(context.Background(), core.InboundMessage{
				ConversationID: "conv-2",
				Text:           itoa(i),
			})
			if err != nil {
				t.Errorf("unexpected error from Send: %v", err)
			}
		}(i)
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(processed) != n {
		t.Fatalf("expected %d distinct messages processed, got %d", n, len(processed))
	}
	for text, count := range processed {
		if count != 1 {
			t.Fatalf("message %q processed %d times, expected exactly 1", text, count)
		}
	}
}

func itoa(i int) string {
	digits := "0123456789"
	if i == 0 {
		return "0"
	}
	var b []byte
	for i > 0 {
		b = append([]byte{digits[i%10]}, b...)
		i /= 10
	}
	return string(b)
}
