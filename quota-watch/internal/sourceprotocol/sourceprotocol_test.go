package sourceprotocol

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidateUsageRejectsHostileAndDuplicate(t *testing.T) {
	now := time.Now()
	v := UsageResult{Metrics: []Metric{{ProviderID: "p", AccountID: "a", ID: "m", Label: "ok\nnot", Kind: "quota", Scope: "account", LimitKind: "unknown", Authority: "official_api", SourceDetail: "fixture", Coverage: "all", ObservedAt: now}}}
	if ValidateUsage(v, map[string]Account{"a": {ID: "a", ProviderID: "p"}}) == nil {
		t.Fatal("accepted newline in label")
	}
	v.Metrics[0].Label = "ok"
	v.Metrics = append(v.Metrics, v.Metrics[0])
	if ValidateUsage(v, map[string]Account{"a": {ID: "a", ProviderID: "p"}}) == nil {
		t.Fatal("accepted duplicate")
	}
}
func TestSafeURLs(t *testing.T) {
	for _, u := range []string{"javascript:alert(1)", "http://example.com", "https://user:pass@example.com"} {
		if safeURL(u) {
			t.Fatalf("accepted %s", u)
		}
	}
	for _, u := range []string{"https://example.com/setup", "http://127.0.0.1:123/setup"} {
		if !safeURL(u) {
			t.Fatalf("rejected %s", u)
		}
	}
}
func TestLoadManifests(t *testing.T) {
	d := t.TempDir()
	if err := os.Chmod(d, 0700); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(d, "source.json")
	body := fmt.Sprintf(`{"id":"fixture","protocol_version":"1.0","executable":%q}`, os.Args[0])
	if err := os.WriteFile(p, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := LoadManifests(d)
	if err != nil || len(got) != 1 {
		t.Fatalf("got %#v, %v", got, err)
	}
	if err := os.Chmod(p, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err = LoadManifests(d); err == nil {
		t.Fatal("accepted public manifest")
	}
}

func TestClientRoundTripAndProtocolFailures(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		c, err := Start(context.Background(), os.Args[0], []string{"-test.run=TestHelperProcess"}, Options{Env: []string{"GO_WANT_SOURCE_HELPER=valid"}})
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		var out map[string]bool
		if err = c.Call(context.Background(), "health.read", struct{}{}, &out); err != nil || !out["ok"] {
			t.Fatalf("%v %#v", err, out)
		}
	})
	t.Run("oversize", func(t *testing.T) {
		c, err := Start(context.Background(), os.Args[0], []string{"-test.run=TestHelperProcess"}, Options{Env: []string{"GO_WANT_SOURCE_HELPER=oversize"}, MaxFrame: 64})
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		var out any
		err = c.Call(context.Background(), "x", nil, &out)
		if err != ErrFrameTooLarge {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("timeout", func(t *testing.T) {
		c, err := Start(context.Background(), os.Args[0], []string{"-test.run=TestHelperProcess"}, Options{Env: []string{"GO_WANT_SOURCE_HELPER=hang"}, Timeout: 50 * time.Millisecond})
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		var out any
		err = c.Call(context.Background(), "x", nil, &out)
		if err == nil {
			t.Fatal("expected timeout/exit")
		}
	})
	t.Run("out of order", func(t *testing.T) {
		c, err := Start(context.Background(), os.Args[0], []string{"-test.run=TestHelperProcess"}, Options{Env: []string{"GO_WANT_SOURCE_HELPER=reorder"}})
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		errs := make(chan error, 2)
		for range 2 {
			go func() { var out map[string]bool; errs <- c.Call(context.Background(), "health.read", nil, &out) }()
		}
		for range 2 {
			if err := <-errs; err != nil {
				t.Fatal(err)
			}
		}
	})
}
func TestHelperProcess(t *testing.T) {
	mode := os.Getenv("GO_WANT_SOURCE_HELPER")
	if mode == "" {
		return
	}
	s := bufio.NewScanner(os.Stdin)
	var held json.RawMessage
	for s.Scan() {
		var req struct {
			ID json.RawMessage `json:"id"`
		}
		_ = json.Unmarshal(s.Bytes(), &req)
		switch mode {
		case "valid":
			fmt.Printf(`{"jsonrpc":"2.0","id":%s,"result":{"ok":true}}`+"\n", req.ID)
		case "oversize":
			fmt.Printf(`{"jsonrpc":"2.0","id":%s,"result":{"value":%q}}`+"\n", req.ID, strings.Repeat("x", 1000))
		case "hang":
			time.Sleep(time.Second)
		case "reorder":
			if held == nil {
				held = append(json.RawMessage(nil), req.ID...)
				continue
			}
			fmt.Printf(`{"jsonrpc":"2.0","id":%s,"result":{"ok":true}}`+"\n", req.ID)
			fmt.Printf(`{"jsonrpc":"2.0","id":%s,"result":{"ok":true}}`+"\n", held)
		}
	}
	os.Exit(0)
}
