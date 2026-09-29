// Package agents implements small, bounded agents for shopping tasks.
package agents

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/example/shopping-list/internal/domain"
)

// HistoryProfiler makes explainable suggestions without requiring an external model.
type HistoryProfiler struct{}

func (HistoryProfiler) Suggestions(_ context.Context, history []domain.Purchase, limit int) ([]domain.Suggestion, error) {
	if limit <= 0 || limit > 50 {
		limit = 8
	}
	type stats struct {
		count  int
		last   time.Time
		stores map[string]int
	}
	byName := make(map[string]*stats)
	for _, p := range history {
		key := strings.ToLower(strings.TrimSpace(p.Name))
		if key == "" {
			continue
		}
		s := byName[key]
		if s == nil {
			s = &stats{stores: make(map[string]int)}
			byName[key] = s
		}
		s.count++
		if p.BoughtAt.After(s.last) {
			s.last = p.BoughtAt
		}
		s.stores[p.Store]++
	}
	out := make([]domain.Suggestion, 0, len(byName))
	for name, s := range byName {
		store, max := "", 0
		for candidate, n := range s.stores {
			if n > max {
				store, max = candidate, n
			}
		}
		confidence := float64(s.count) / 5
		if confidence > 1 {
			confidence = 1
		}
		out = append(out, domain.Suggestion{Name: name, PreferredStore: store, Confidence: confidence, Reason: fmt.Sprintf("bought %d times; last on %s", s.count, s.last.Format("2 Jan"))})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Confidence > out[j].Confidence })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
