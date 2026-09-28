package ccusage

import (
	"context"
	"github.com/local/quota-watch/internal/backend"
	"reflect"
	"testing"
)

type fakeRunner struct{ req backend.Request }

func (f *fakeRunner) Run(_ context.Context, r backend.Request) (backend.Output, error) {
	f.req = r
	return backend.Output{Stdout: []byte(`{"daily":[{"inputTokens":10,"outputTokens":5,"cacheReadTokens":2,"totalCost":0.25},{"inputTokens":3,"outputTokens":1,"cacheCreationTokens":4,"totalCost":0.1}]}`)}, nil
}
func TestOfflineDaily(t *testing.T) {
	f := &fakeRunner{}
	got, e := (&Client{Path: "/opt/ccusage", Runner: f}).ClaudeTotals(context.Background())
	if e != nil || got.InputTokens != 13 || got.CacheTokens != 6 {
		t.Fatalf("%v %#v", e, got)
	}
	if !reflect.DeepEqual(f.req.Args, []string{"daily", "--json", "--offline"}) {
		t.Fatalf("argv=%q", f.req.Args)
	}
}
