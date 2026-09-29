package external

import (
	"github.com/local/quota-watch/internal/provider"
	"github.com/local/quota-watch/internal/sourceprotocol"
	"testing"
)

func TestMergePrecedenceAndDuplicate(t *testing.T) {
	m := provider.Metric{ProviderID: "p", AccountID: "a", MetricID: "m"}
	low := m
	low.Label = "low"
	high := m
	high.Label = "high"
	got, err := Merge([]Input{{sourceprotocol.Manifest{ID: "low", Priority: 1}, []provider.Metric{low}}, {sourceprotocol.Manifest{ID: "high", Priority: 2}, []provider.Metric{high}}})
	if err != nil || len(got) != 1 || got[0].Label != "high" {
		t.Fatalf("%#v %v", got, err)
	}
	_, err = Merge([]Input{{sourceprotocol.Manifest{ID: "a"}, []provider.Metric{m}}, {sourceprotocol.Manifest{ID: "b"}, []provider.Metric{m}}})
	if err == nil {
		t.Fatal("expected equal-priority duplicate error")
	}
}
