package codexbar

import (
	"context"
	"github.com/local/quota-watch/internal/backend"
	"reflect"
	"testing"
)

type fakeRunner struct {
	req backend.Request
	out []byte
}

func (f *fakeRunner) Run(_ context.Context, r backend.Request) (backend.Output, error) {
	f.req = r
	return backend.Output{Stdout: f.out}, nil
}
func TestClientUsesSafeCodexCLICommand(t *testing.T) {
	f := &fakeRunner{out: []byte(`{"provider":"codex","usage":{"rateLimits":[{"id":"five-hour","usedPercent":42,"resetsAt":"2026-09-28T12:00:00Z"}]}}`)}
	c := Client{Path: "/usr/bin/codexbar", Runner: f}
	w, e := c.CodexUsage(context.Background())
	if e != nil || len(w) != 1 || w[0].UsedPercent != 42 {
		t.Fatalf("%v %#v", e, w)
	}
	want := []string{"usage", "--provider", "codex", "--source", "cli", "--format", "json"}
	if !reflect.DeepEqual(f.req.Args, want) {
		t.Fatalf("argv=%q", f.req.Args)
	}
}
func TestRejectsWrongProvider(t *testing.T) {
	if _, e := ParseUsage([]byte(`{"provider":"claude","windows":[]}`)); e == nil {
		t.Fatal("accepted wrong provider")
	}
}
