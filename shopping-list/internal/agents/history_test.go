package agents

import (
	"context"
	"testing"
	"time"

	"github.com/example/shopping-list/internal/domain"
)

func TestHistoryProfilerRanksFrequentItems(t *testing.T) {
	h := []domain.Purchase{{Name: "Milk", Store: "Market", BoughtAt: time.Now()}, {Name: "milk", Store: "Market", BoughtAt: time.Now()}, {Name: "Bread", Store: "Bakery", BoughtAt: time.Now()}}
	got, err := (HistoryProfiler{}).Suggestions(context.Background(), h, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "milk" || got[0].PreferredStore != "Market" {
		t.Fatalf("unexpected suggestions: %#v", got)
	}
}
