// reference-source is a deterministic, credential-free source.v1 fixture.
package main

import (
	"bufio"
	"encoding/json"
	"os"
	"time"
)

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
}

func main() {
	s := bufio.NewScanner(os.Stdin)
	enc := json.NewEncoder(os.Stdout)
	for s.Scan() {
		var r request
		if json.Unmarshal(s.Bytes(), &r) != nil {
			return
		}
		var result any
		switch r.Method {
		case "initialize":
			result = map[string]any{
				"protocol_version": "1.0",
				"source":           map[string]any{"id": "reference-source", "name": "Reference source", "version": "1.0.0"},
				"capabilities":     map[string]bool{"accounts_discover": true, "usage_read": true, "health_read": true},
				"privacy":          map[string]any{"network": "none", "reads_browser_data": false},
				"authorities":      []string{"local_observation", "local_estimate"},
			}
		case "accounts.discover":
			result = map[string]any{"accounts": []any{
				map[string]any{"id": "primary", "label": "Primary fixture", "provider_id": "fixture", "provider_name": "Fixture Cloud", "ready": true},
				map[string]any{"id": "setup", "label": "Needs setup", "provider_id": "fixture-other", "ready": false, "setup": []any{
					map[string]any{"code": "needs_login", "label": "Sign in", "url": "https://example.invalid/setup"},
				}},
			}}
		case "usage.read":
			now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
			stale := now.Add(time.Minute)
			result = map[string]any{"metrics": []any{
				map[string]any{"provider_id": "fixture", "provider_name": "Fixture Cloud", "account_id": "primary", "account_label": "Primary fixture", "metric_id": "requests", "label": "Requests", "kind": "quota", "scope": "account", "unit": "requests", "used": 25, "limit": 100, "remaining": 75, "used_percent": 25, "limit_kind": "finite", "authority": "local_observation", "source_detail": "reference fixture", "coverage": "device-local", "observed_at": now},
				map[string]any{"provider_id": "fixture", "provider_name": "Fixture Cloud", "account_id": "primary", "metric_id": "spend", "label": "Estimated spend", "kind": "spend", "scope": "account", "unit": "USD", "used": 12.5, "limit_kind": "unknown", "authority": "local_estimate", "source_detail": "reference fixture", "coverage": "partial", "observed_at": now, "stale_at": stale, "partial": true},
			}}
		case "health.read":
			result = map[string]string{"status": "ok", "version": "1.0.0"}
		case "shutdown":
			result = map[string]bool{"ok": true}
		default:
			_ = enc.Encode(map[string]any{"jsonrpc": "2.0", "id": r.ID, "error": map[string]any{"code": -32601, "message": "method not found"}})
			continue
		}
		_ = enc.Encode(map[string]any{"jsonrpc": "2.0", "id": r.ID, "result": result})
		if r.Method == "shutdown" {
			return
		}
	}
}
