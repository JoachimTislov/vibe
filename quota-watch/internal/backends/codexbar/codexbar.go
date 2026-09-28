package codexbar

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/local/quota-watch/internal/backend"
	"time"
)

type Client struct {
	Path, Version string
	Runner        backend.Runner
	Env           []string
}

func (c Client) CodexUsage(ctx context.Context) ([]Window, error) {
	if c.Runner == nil {
		return nil, errors.New("codexbar runner unavailable")
	}
	o, err := c.Runner.Run(ctx, backend.Request{Path: c.Path, Args: []string{"usage", "--provider", "codex", "--source", "cli", "--format", "json"}, Env: c.Env})
	if err != nil {
		return nil, err
	}
	return ParseUsage(o.Stdout)
}

type Window struct {
	ID, Label   string
	UsedPercent float64
	ResetsAt    *time.Time
}

func ParseUsage(b []byte) ([]Window, error) {
	var root any
	if err := json.Unmarshal(b, &root); err != nil {
		return nil, fmt.Errorf("unsupported codexbar JSON")
	}
	var obj map[string]any
	switch x := root.(type) {
	case map[string]any:
		obj = x
	case []any:
		if len(x) != 1 {
			return nil, errors.New("unsupported codexbar provider count")
		}
		obj, _ = x[0].(map[string]any)
	}
	if obj == nil {
		return nil, errors.New("unsupported codexbar schema")
	}
	if p, ok := obj["provider"].(string); ok && p != "codex" {
		return nil, errors.New("unexpected codexbar provider")
	}
	container := obj
	if u, ok := obj["usage"].(map[string]any); ok {
		container = u
	}
	var vals []any
	for _, k := range []string{"rateLimits", "rate_limits", "windows"} {
		if a, ok := container[k].([]any); ok {
			vals = a
			break
		}
	}
	if vals == nil {
		return nil, errors.New("unsupported codexbar usage schema")
	}
	res := make([]Window, 0, len(vals))
	for i, v := range vals {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		pct, ok := number(m, "usedPercent", "used_percent")
		if !ok {
			continue
		}
		id := stringv(m, "id", "windowId", "window_id")
		if id == "" {
			id = fmt.Sprintf("window-%d", i+1)
		}
		label := stringv(m, "label", "name")
		if label == "" {
			label = id
		}
		res = append(res, Window{ID: id, Label: label, UsedPercent: pct, ResetsAt: timev(m, "resetsAt", "resets_at")})
	}
	if len(res) == 0 {
		return nil, errors.New("codexbar response contained no quota windows")
	}
	return res, nil
}
func number(m map[string]any, ks ...string) (float64, bool) {
	for _, k := range ks {
		if v, ok := m[k].(float64); ok {
			return v, true
		}
	}
	return 0, false
}
func stringv(m map[string]any, ks ...string) string {
	for _, k := range ks {
		if v, ok := m[k].(string); ok {
			return v
		}
	}
	return ""
}
func timev(m map[string]any, ks ...string) *time.Time {
	v := stringv(m, ks...)
	if v == "" {
		return nil
	}
	t, e := time.Parse(time.RFC3339, v)
	if e != nil {
		return nil
	}
	return &t
}
