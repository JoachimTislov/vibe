package store

import (
	"context"
	"errors"
	"github.com/local/quota-watch/internal/provider"
	"os"
	"path/filepath"
	"testing"
)

func TestJSONFileRoundTripAndPermissions(t *testing.T) {
	p := filepath.Join(t.TempDir(), "nested", "cache.json")
	s := NewJSONFile(p)
	want := []provider.Result{{Discovery: provider.Discovery{ProviderID: "x"}}}
	if err := s.Save(context.Background(), want); err != nil {
		t.Fatal(err)
	}
	got, err := s.Latest(context.Background())
	if err != nil || len(got) != 1 || got[0].Discovery.ProviderID != "x" {
		t.Fatalf("got %#v, %v", got, err)
	}
	fi, _ := os.Stat(p)
	if fi.Mode().Perm() != 0600 {
		t.Fatalf("file mode %o", fi.Mode().Perm())
	}
	di, _ := os.Stat(filepath.Dir(p))
	if di.Mode().Perm() != 0700 {
		t.Fatalf("directory mode %o", di.Mode().Perm())
	}
}
func TestJSONFilePreservesCorruption(t *testing.T) {
	p := filepath.Join(t.TempDir(), "cache.json")
	if err := os.WriteFile(p, []byte("not json"), 0600); err != nil {
		t.Fatal(err)
	}
	s := NewJSONFile(p)
	if _, err := s.Latest(context.Background()); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("expected corrupt, got %v", err)
	}
	if err := s.Save(context.Background(), nil); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("expected save refusal, got %v", err)
	}
	b, _ := os.ReadFile(p)
	if string(b) != "not json" {
		t.Fatal("corrupt cache was overwritten")
	}
}
func TestMemoryReturnsCopy(t *testing.T) {
	s := NewMemory([]provider.Result{{Metrics: []provider.Metric{{MetricID: "a"}}}})
	v, _ := s.Latest(context.Background())
	v[0].Metrics[0].MetricID = "changed"
	again, _ := s.Latest(context.Background())
	if again[0].Metrics[0].MetricID != "a" {
		t.Fatal("store leaked mutable state")
	}
}
