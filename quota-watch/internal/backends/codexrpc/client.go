// Package codexrpc implements the narrow, read-only Codex app-server JSON-RPC surface.
package codexrpc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"time"
)

type Caller interface {
	Call(context.Context, string, json.RawMessage) (json.RawMessage, error)
}

type ExecClient struct {
	Path    string
	Env     []string
	Timeout time.Duration
	MaxLine int
}
type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}
type rpcResponse struct {
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code int `json:"code"`
	} `json:"error,omitempty"`
}

func (c ExecClient) Call(ctx context.Context, method string, params json.RawMessage) (json.RawMessage, error) {
	if method != "account/rateLimits/read" && method != "account/usage/read" && method != "account/read" {
		return nil, errors.New("codex RPC method not allowed")
	}
	if !filepath.IsAbs(c.Path) {
		return nil, errors.New("unsafe codex executable")
	}
	d := c.Timeout
	if d <= 0 {
		d = 20 * time.Second
	}
	runCtx, cancel := context.WithTimeout(ctx, d)
	defer cancel()
	cmd := exec.CommandContext(runCtx, c.Path, "app-server")
	cmd.Env = append([]string(nil), c.Env...)
	cmd.Stderr = io.Discard
	in, e := cmd.StdinPipe()
	if e != nil {
		return nil, errors.New("codex RPC unavailable")
	}
	out, e := cmd.StdoutPipe()
	if e != nil {
		return nil, errors.New("codex RPC unavailable")
	}
	if e = cmd.Start(); e != nil {
		return nil, errors.New("codex app-server failed to start")
	}
	defer func() {
		_ = in.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	enc := json.NewEncoder(in)
	dec := bufio.NewScanner(out)
	max := c.MaxLine
	if max <= 0 {
		max = 4 << 20
	}
	dec.Buffer(make([]byte, 4096), max)
	if e = enc.Encode(rpcRequest{JSONRPC: "2.0", ID: 1, Method: "initialize", Params: map[string]any{"clientInfo": map[string]string{"name": "quota-watch", "version": "0.1"}}}); e != nil {
		return nil, errors.New("codex RPC write failed")
	}
	if _, e = readID(dec, 1); e != nil {
		return nil, e
	}
	// Complete the JSON-RPC lifecycle without starting a conversation or turn.
	if e = enc.Encode(map[string]any{"jsonrpc": "2.0", "method": "initialized", "params": map[string]any{}}); e != nil {
		return nil, errors.New("codex RPC write failed")
	}
	var p any = map[string]any{}
	if len(params) > 0 {
		if json.Unmarshal(params, &p) != nil {
			return nil, errors.New("invalid RPC parameters")
		}
	}
	if e = enc.Encode(rpcRequest{JSONRPC: "2.0", ID: 2, Method: method, Params: p}); e != nil {
		return nil, errors.New("codex RPC write failed")
	}
	return readID(dec, 2)
}
func readID(s *bufio.Scanner, id int) (json.RawMessage, error) {
	for s.Scan() {
		var r rpcResponse
		if json.Unmarshal(s.Bytes(), &r) != nil {
			continue
		}
		if r.ID != id {
			continue
		}
		if r.Error != nil {
			return nil, fmt.Errorf("codex RPC rejected method (code %d)", r.Error.Code)
		}
		return r.Result, nil
	}
	if e := s.Err(); e != nil {
		return nil, errors.New("codex RPC response too large")
	}
	return nil, io.EOF
}

type Window struct {
	ID, Label   string
	UsedPercent float64
	ResetsAt    *time.Time
}

func ReadRateLimits(ctx context.Context, c Caller) ([]Window, error) {
	b, e := c.Call(ctx, "account/rateLimits/read", nil)
	if e != nil {
		return nil, e
	}
	return ParseRateLimits(b)
}
func ParseRateLimits(b []byte) ([]Window, error) {
	var root map[string]any
	if json.Unmarshal(b, &root) != nil {
		return nil, errors.New("unsupported codex RPC JSON")
	}
	container := root
	if x, ok := root["rateLimitsByLimitId"].(map[string]any); ok {
		container = x
	} else if x, ok := root["rateLimits"].(map[string]any); ok {
		container = x
	} else {
		return nil, errors.New("unsupported codex rate-limit schema")
	}
	res := []Window{}
	for id, v := range container {
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		pct, ok := num(m, "usedPercent", "used_percent")
		if !ok {
			continue
		}
		label := str(m, "name", "label")
		if label == "" {
			label = id
		}
		var reset *time.Time
		if sec, ok := num(m, "resetsAt", "resets_at"); ok {
			t := time.Unix(int64(sec), 0).UTC()
			reset = &t
		}
		res = append(res, Window{ID: id, Label: label, UsedPercent: pct, ResetsAt: reset})
	}
	if len(res) == 0 {
		return nil, errors.New("codex returned no rate limits")
	}
	return res, nil
}
func num(m map[string]any, ks ...string) (float64, bool) {
	for _, k := range ks {
		if v, ok := m[k].(float64); ok {
			return v, true
		}
	}
	return 0, false
}
func str(m map[string]any, ks ...string) string {
	for _, k := range ks {
		if v, ok := m[k].(string); ok {
			return v
		}
	}
	return ""
}
