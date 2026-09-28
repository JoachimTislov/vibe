package codexrpc

import (
	"context"
	"encoding/json"
	"testing"
)

type fakeCaller struct{ method string }

func (f *fakeCaller) Call(_ context.Context, m string, _ json.RawMessage) (json.RawMessage, error) {
	f.method = m
	return []byte(`{"rateLimitsByLimitId":{"primary":{"name":"5 hour","usedPercent":37.5,"resetsAt":1790596800},"secondary":{"name":"Weekly","usedPercent":12}}}`), nil
}
func TestReadRateLimitsUsesRPC(t *testing.T) {
	f := &fakeCaller{}
	w, e := ReadRateLimits(context.Background(), f)
	if e != nil || len(w) != 2 {
		t.Fatalf("%v %#v", e, w)
	}
	if f.method != "account/rateLimits/read" {
		t.Fatalf("method=%s", f.method)
	}
}
func TestRejectsUnknownShape(t *testing.T) {
	if _, e := ParseRateLimits([]byte(`{"usage":{}}`)); e == nil {
		t.Fatal("accepted unknown shape")
	}
}
