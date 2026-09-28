package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type stubService struct{ refreshes int }

func (s *stubService) State(context.Context) (State, error) {
	return State{SchemaVersion: "1", GeneratedAt: time.Unix(1, 0).UTC(), Mode: "test"}, nil
}
func (s *stubService) RequestRefresh(context.Context) (RefreshState, error) {
	s.refreshes++
	return RefreshState{Accepted: true, Requested: time.Unix(2, 0).UTC()}, nil
}

func request(t *testing.T, h http.Handler, method, path, host, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Host = host
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestDashboardAndHealth(t *testing.T) {
	h := NewHandler(&stubService{})
	w := request(t, h, "GET", "http://127.0.0.1/", "127.0.0.1:7331", "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Quota Watch") {
		t.Fatalf("dashboard = %d %q", w.Code, w.Body.String())
	}
	if w.Header().Get("Content-Security-Policy") == "" {
		t.Fatal("missing CSP")
	}
	w = request(t, h, "GET", "http://localhost/healthz", "localhost:7331", "", nil)
	if w.Body.String() != "ok\n" {
		t.Fatalf("health = %q", w.Body.String())
	}
}

func TestHostAndOriginProtection(t *testing.T) {
	h := NewHandler(&stubService{})
	w := request(t, h, "GET", "http://evil.example/", "evil.example", "", nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("host status = %d", w.Code)
	}
	w = request(t, h, "POST", "http://127.0.0.1/rpc/v1", "127.0.0.1:7331", `{"jsonrpc":"2.0","method":"state.get","id":1}`, map[string]string{"Content-Type": "application/json", "Origin": "https://evil.example"})
	if w.Code != http.StatusForbidden {
		t.Fatalf("origin status = %d", w.Code)
	}
}

func TestRPCStateAndRefresh(t *testing.T) {
	s := &stubService{}
	h := NewHandler(s)
	w := request(t, h, "POST", "http://localhost/rpc/v1", "localhost:7331", `{"jsonrpc":"2.0","method":"state.get","id":"a"}`, map[string]string{"Content-Type": "application/json"})
	var got struct {
		JSONRPC string `json:"jsonrpc"`
		ID      string `json:"id"`
		Result  State  `json:"result"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.JSONRPC != "2.0" || got.ID != "a" || got.Result.SchemaVersion != "1" {
		t.Fatalf("response = %+v", got)
	}
	w = request(t, h, "POST", "http://localhost/rpc/v1", "localhost:7331", `{"jsonrpc":"2.0","method":"refresh.request","id":2}`, map[string]string{"Content-Type": "application/json"})
	if !strings.Contains(w.Body.String(), "missing request protection header") || s.refreshes != 0 {
		t.Fatalf("unprotected refresh = %s", w.Body.String())
	}
	w = request(t, h, "POST", "http://localhost/rpc/v1", "localhost:7331", `{"jsonrpc":"2.0","method":"refresh.request","id":2}`, map[string]string{"Content-Type": "application/json", "X-Quota-Watch-RPC": "1"})
	if s.refreshes != 1 || !strings.Contains(w.Body.String(), `"accepted":true`) {
		t.Fatalf("refresh = %s, calls %d", w.Body.String(), s.refreshes)
	}
}

func TestRPCBatchNotificationAndErrors(t *testing.T) {
	s := &stubService{}
	h := NewHandler(s)
	body := `[{"jsonrpc":"2.0","method":"state.get"},{"jsonrpc":"2.0","method":"missing","id":4}]`
	w := request(t, h, "POST", "http://localhost/rpc/v1", "localhost", body, map[string]string{"Content-Type": "application/json"})
	if strings.Contains(w.Body.String(), "schema_version") || !strings.Contains(w.Body.String(), `"code":-32601`) {
		t.Fatalf("batch = %s", w.Body.String())
	}
	w = request(t, h, "POST", "http://localhost/rpc/v1", "localhost", `{"jsonrpc":"2.0",`, map[string]string{"Content-Type": "application/json"})
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), `"code":-32700`) {
		t.Fatalf("parse error = %d %s", w.Code, w.Body.String())
	}
}

func TestRPCBodyLimit(t *testing.T) {
	h := NewHandler(&stubService{})
	w := request(t, h, "POST", "http://localhost/rpc/v1", "localhost", strings.Repeat(" ", maxRPCBody+1), map[string]string{"Content-Type": "application/json"})
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d", w.Code)
	}
}
