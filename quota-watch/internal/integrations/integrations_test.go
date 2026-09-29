package integrations

import (
	"errors"
	"os"
	"testing"
	"time"
)

func TestScanReportsNamesNeverValues(t *testing.T) {
	s := &Scanner{Lookup: func(n string) (string, error) {
		if n == "codex" {
			return "/bin/codex", nil
		}
		return "", errors.New("no")
	}, Getenv: func(n string) string {
		if n == "OPENAI_API_KEY" {
			return "super-secret"
		}
		return ""
	}, Home: "/none", Stat: func(string) (os.FileInfo, error) { return nil, os.ErrNotExist }, Now: func() time.Time { return time.Unix(7, 0) }}
	r := s.Scan()
	var found *Status
	for i := range r.Integrations {
		if r.Integrations[i].ID == "codex" {
			found = &r.Integrations[i]
		}
	}
	if found == nil || found.State != "can_connect" || len(found.Evidence) != 2 {
		t.Fatalf("codex = %+v", found)
	}
	for _, e := range found.Evidence {
		if e.Name == "super-secret" {
			t.Fatal("secret value leaked")
		}
	}
}

func TestPlanIsReadOnlyAndUnknownRejected(t *testing.T) {
	s := NewScanner()
	p, ok := s.Plan("aws")
	if !ok || !p.ReadOnly || len(p.Actions) == 0 {
		t.Fatalf("plan=%+v %v", p, ok)
	}
	if _, ok = s.Plan("unknown"); ok {
		t.Fatal("unknown plan accepted")
	}
}
