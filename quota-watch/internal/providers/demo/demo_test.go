package demo

import (
	"context"
	"testing"
	"time"
)

func TestProviderIsDeterministicAndComplete(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.FixedZone("x", 3600))
	r, err := NewWithClock(func() time.Time { return now }).Fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Metrics) != 5 {
		t.Fatalf("got %d metrics", len(r.Metrics))
	}
	if !r.Attempted.Equal(now.UTC()) || r.Metrics[3].Limit != nil {
		t.Fatal("timestamps or unknown allowance incorrect")
	}
}
