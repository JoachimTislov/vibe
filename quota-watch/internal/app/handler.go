package app

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"strings"
)

//go:embed web/*
var webFiles embed.FS

const maxRPCBody = 64 << 10

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	ID      json.RawMessage `json:"id,omitempty"`
}
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
	ID      json.RawMessage `json:"id"`
}
type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func NewHandler(service Service) http.Handler {
	if service == nil {
		panic("app: nil Service")
	}
	setup, ok := service.(SetupService)
	if !ok {
		setup = newLocalSetup()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("POST /rpc/v1", rpcHandler(service, setup))
	assets, err := fs.Sub(webFiles, "web")
	if err != nil {
		panic(err)
	}
	mux.Handle("GET /", http.FileServer(http.FS(assets)))
	return security(mux)
}

func security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		if !validHost(r.Host) {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		if r.URL.Path == "/rpc/v1" && !sameOrigin(r) {
			writeRPC(w, http.StatusForbidden, rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32001, Message: "cross-origin request denied"}, ID: json.RawMessage("null")})
			return
		}
		next.ServeHTTP(w, r)
	})
}
func validHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	ip := net.ParseIP(host)
	return host == "localhost" || (ip != nil && ip.IsLoopback())
}
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && strings.EqualFold(u.Host, r.Host)
}

func rpcHandler(service Service, setup SetupService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			writeRPCError(w, http.StatusUnsupportedMediaType, -32600, "content type must be application/json", nil)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRPCBody))
		if err != nil {
			writeRPCError(w, http.StatusRequestEntityTooLarge, -32700, "request body is too large", nil)
			return
		}
		body = bytes.TrimSpace(body)
		if len(body) == 0 {
			writeRPCError(w, http.StatusBadRequest, -32700, "parse error", nil)
			return
		}
		if body[0] == '[' {
			handleBatch(w, r, service, setup, body)
			return
		}
		var req rpcRequest
		if decodeOne(body, &req) != nil {
			writeRPCError(w, http.StatusBadRequest, -32700, "parse error", nil)
			return
		}
		resp, notify := dispatch(r, service, setup, req)
		if notify {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeRPC(w, http.StatusOK, resp)
	}
}
func handleBatch(w http.ResponseWriter, r *http.Request, service Service, setup SetupService, body []byte) {
	var raws []json.RawMessage
	if json.Unmarshal(body, &raws) != nil {
		writeRPCError(w, http.StatusBadRequest, -32700, "parse error", nil)
		return
	}
	if len(raws) == 0 {
		writeRPCError(w, http.StatusOK, -32600, "invalid request", nil)
		return
	}
	responses := make([]rpcResponse, 0, len(raws))
	for _, raw := range raws {
		var req rpcRequest
		if decodeOne(raw, &req) != nil {
			responses = append(responses, rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: -32600, Message: "invalid request"}, ID: json.RawMessage("null")})
			continue
		}
		resp, notify := dispatch(r, service, setup, req)
		if !notify {
			responses = append(responses, resp)
		}
	}
	if len(responses) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeRPC(w, http.StatusOK, responses)
}
func decodeOne(body []byte, dst *rpcRequest) error {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func dispatch(r *http.Request, service Service, setup SetupService, req rpcRequest) (rpcResponse, bool) {
	notify := len(req.ID) == 0
	resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	if notify {
		resp.ID = json.RawMessage("null")
	}
	if req.JSONRPC != "2.0" || req.Method == "" {
		resp.Error = &rpcError{Code: -32600, Message: "invalid request"}
		return resp, notify
	}
	if req.Method != "integration.plan" && len(req.Params) > 0 && string(req.Params) != "null" && string(req.Params) != "{}" && string(req.Params) != "[]" {
		resp.Error = &rpcError{Code: -32602, Message: "this method takes no parameters"}
		return resp, notify
	}
	switch req.Method {
	case "state.get":
		state, err := service.State(r.Context())
		if err != nil {
			resp.Error = &rpcError{Code: -32000, Message: "state unavailable"}
		} else {
			resp.Result = state
		}
	case "refresh.request":
		if r.Header.Get("X-Quota-Watch-RPC") != "1" {
			resp.Error = &rpcError{Code: -32001, Message: "missing request protection header"}
			break
		}
		state, err := service.RequestRefresh(r.Context())
		if err != nil {
			resp.Error = &rpcError{Code: -32000, Message: "refresh unavailable"}
		} else {
			resp.Result = state
		}
	case "catalog.list":
		v, err := setup.Catalog(r.Context())
		if err != nil {
			resp.Error = &rpcError{Code: -32000, Message: "catalogue unavailable"}
		} else {
			resp.Result = v
		}
	case "integrations.list":
		v, err := setup.Integrations(r.Context())
		if err != nil {
			resp.Error = &rpcError{Code: -32000, Message: "integrations unavailable"}
		} else {
			resp.Result = v
		}
	case "integrations.scan":
		if r.Header.Get("X-Quota-Watch-RPC") != "1" {
			resp.Error = &rpcError{Code: -32001, Message: "missing request protection header"}
			break
		}
		v, err := setup.ScanIntegrations(r.Context())
		if err != nil {
			resp.Error = &rpcError{Code: -32000, Message: "scan unavailable"}
		} else {
			resp.Result = v
		}
	case "integration.plan":
		var p struct {
			ID string `json:"id"`
		}
		if len(req.Params) == 0 || json.Unmarshal(req.Params, &p) != nil || p.ID == "" {
			resp.Error = &rpcError{Code: -32602, Message: "id is required"}
			break
		}
		v, err := setup.IntegrationPlan(r.Context(), p.ID)
		if err != nil {
			resp.Error = &rpcError{Code: -32602, Message: "unknown integration"}
		} else {
			resp.Result = v
		}
	default:
		resp.Error = &rpcError{Code: -32601, Message: "method not found"}
	}
	return resp, notify
}
func writeRPCError(w http.ResponseWriter, status, code int, message string, id json.RawMessage) {
	if id == nil {
		id = json.RawMessage("null")
	}
	writeRPC(w, status, rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: code, Message: message}, ID: id})
}
func writeRPC(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
