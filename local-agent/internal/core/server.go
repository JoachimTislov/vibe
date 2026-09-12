package core

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	pb "github.com/YOURNAME/agentic-gateway/gen/core/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Options struct {
	RequestTimeout  time.Duration
	ApprovalTimeout time.Duration
}

var errPrivateSocketDirectory = errors.New("core socket directory must be private")

// Server owns orchestration; it never constructs an internet client.
type Server struct {
	pb.UnimplementedAdapterGatewayServer
	principals Resolver
	approvals  *ApprovalGate
	registry   *Registry
	opts       Options
	mu         sync.Mutex
	history    map[string][]*pb.ChatMessage
}

func NewAgentServer(principals Resolver, opts Options) *Server {
	if opts.RequestTimeout <= 0 {
		opts.RequestTimeout = 5 * time.Minute
	}
	if opts.ApprovalTimeout <= 0 {
		opts.ApprovalTimeout = 2 * time.Minute
	}
	s := &Server{principals: principals, approvals: NewApprovalGate(), opts: opts, history: make(map[string][]*pb.ChatMessage)}
	s.registry = NewRegistry(s.handle)
	return s
}

type sessionKey struct{}
type pendingCapability struct {
	conversation string
	result       chan *pb.CapabilityResult
}
type session struct {
	server    *Server
	hello     *pb.Hello
	stream    pb.AdapterGateway_ConnectServer
	sendMu    sync.Mutex
	mu        sync.Mutex
	pending   map[string]pendingCapability
	approvals map[string]string
}

func (c *session) send(e *pb.CoreEnvelope) error {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	return c.stream.Send(e)
}

func validID(id string) bool { return id != "" && len(id) <= 256 && !strings.ContainsRune(id, '\x00') }

func (s *Server) Connect(stream pb.AdapterGateway_ConnectServer) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	h := first.GetHello()
	reason := ""
	if h == nil || !validID(h.GetAdapterName()) || (h.GetContractVersion() != "1.0.0" && h.GetContractVersion() != "1.1.0") {
		reason = "expected Hello with contract_version 1.0.0 or 1.1.0"
	} else if h.ContractVersion == "1.0.0" && h.PrincipalId == "" {
		// Original adapters supplied the principal on each inbound message.
		// Bind legacy streams when their first validated request arrives.
	} else if !validID(h.PrincipalId) {
		reason = "Hello requires principal_id"
	} else if _, err := s.principals.Resolve(stream.Context(), h.PrincipalId); err != nil {
		reason = "unknown principal_id"
	}
	seen := map[string]bool{}
	for _, tool := range h.GetTools() {
		if !validID(tool.Name) || seen[tool.Name] || !json.Valid([]byte(tool.InputSchemaJson)) || len(h.Tools) > 128 {
			reason = "invalid tool catalog"
			break
		}
		seen[tool.Name] = true
	}
	if err := stream.Send(&pb.CoreEnvelope{Payload: &pb.CoreEnvelope_HelloAck{HelloAck: &pb.HelloAck{Accepted: reason == "", Reason: reason}}}); err != nil {
		return err
	}
	if reason != "" {
		return status.Error(codes.PermissionDenied, reason)
	}
	c := &session{server: s, hello: h, stream: stream, pending: make(map[string]pendingCapability), approvals: make(map[string]string)}
	ctx, cancel := context.WithCancel(context.WithValue(stream.Context(), sessionKey{}, c))
	defer cancel()
	for {
		e, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		switch p := e.Payload.(type) {
		case *pb.AdapterEnvelope_InboundMessage:
			m := p.InboundMessage
			if h.PrincipalId == "" && h.ContractVersion == "1.0.0" {
				if _, err := s.principals.Resolve(ctx, m.PrincipalId); err != nil {
					return status.Error(codes.PermissionDenied, "unknown principal_id")
				}
				h.PrincipalId = m.PrincipalId
			}
			if m.PrincipalId != h.PrincipalId || !validID(m.ConversationId) || !validID(m.PlatformMessageId) || strings.TrimSpace(m.Text) == "" || len(m.Text) > 65536 || len(m.Attachments) != 0 {
				return status.Error(codes.InvalidArgument, "invalid message identity, text, or unsupported attachments")
			}
			key := h.PrincipalId + "\x00" + h.AdapterName + "\x00" + m.ConversationId
			conv, err := s.registry.GetBounded(key, 256)
			if err != nil {
				return status.Error(codes.ResourceExhausted, err.Error())
			}
			// Enqueue synchronously to preserve stream arrival order while the
			// reader remains free to receive approvals and capability results.
			err = conv.Enqueue(ctx, InboundMessage{PrincipalID: m.PrincipalId, ConversationID: m.ConversationId, PlatformMessageID: m.PlatformMessageId, Text: m.Text}, func(out []OutboundMessage, err error) {
				reply := &pb.OutboundMessage{PrincipalId: m.PrincipalId, ConversationId: m.ConversationId, InReplyToPlatformMessageId: m.PlatformMessageId}
				if err != nil {
					reply.Text = err.Error()
					reply.ErrorCode = "request_failed"
				} else if len(out) > 0 {
					reply.Text = out[0].Text
				}
				if c.send(&pb.CoreEnvelope{Payload: &pb.CoreEnvelope_OutboundMessage{OutboundMessage: reply}}) != nil {
					cancel()
				}
			})
			if err != nil {
				return status.Error(codes.ResourceExhausted, err.Error())
			}
		case *pb.AdapterEnvelope_CapabilityResult:
			r := p.CapabilityResult
			c.mu.Lock()
			pending, ok := c.pending[r.RequestId]
			if ok && r.PrincipalId == h.PrincipalId && r.ConversationId == pending.conversation {
				delete(c.pending, r.RequestId)
			} else {
				ok = false
			}
			c.mu.Unlock()
			if ok {
				pending.result <- r
			}
		case *pb.AdapterEnvelope_ApprovalResponse:
			a := p.ApprovalResponse
			c.mu.Lock()
			conversation, ok := c.approvals[a.ApprovalId]
			c.mu.Unlock()
			if ok && a.PrincipalId == h.PrincipalId && a.ConversationId == conversation {
				s.approvals.Resolve(a.ApprovalId, a.Approved, a.Note)
			}
		case *pb.AdapterEnvelope_Ack:
			// Reserved for future durable delivery; no delivery claim today.
		default:
			return status.Error(codes.InvalidArgument, "unexpected envelope")
		}
	}
}

func (c *session) capability(ctx context.Context, req *pb.CapabilityRequest) (*pb.CapabilityResult, error) {
	req.RequestId = rand.Text()
	req.PrincipalId = c.hello.PrincipalId
	p := pendingCapability{conversation: req.ConversationId, result: make(chan *pb.CapabilityResult, 1)}
	c.mu.Lock()
	c.pending[req.RequestId] = p
	c.mu.Unlock()
	defer func() { c.mu.Lock(); delete(c.pending, req.RequestId); c.mu.Unlock() }()
	if err := c.send(&pb.CoreEnvelope{Payload: &pb.CoreEnvelope_CapabilityRequest{CapabilityRequest: req}}); err != nil {
		return nil, err
	}
	select {
	case r := <-p.result:
		if r.Error != "" {
			return nil, errors.New("client capability failed")
		}
		return r, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *Server) handle(ctx context.Context, msg InboundMessage) ([]OutboundMessage, error) {
	c := ctx.Value(sessionKey{}).(*session)
	if !c.hello.ProvidesModel {
		return nil, errors.New("client has no model provider configured")
	}
	ctx, cancel := context.WithTimeout(ctx, s.opts.RequestTimeout)
	defer cancel()
	key := msg.PrincipalID + "\x00" + c.hello.AdapterName + "\x00" + msg.ConversationID
	s.mu.Lock()
	history := append([]*pb.ChatMessage(nil), s.history[key]...)
	s.mu.Unlock()
	// Bound retained context. Never retain partial/denied tool exchanges.
	if len(history) > 32 {
		history = nil
	}
	history = append(history, &pb.ChatMessage{Role: "user", Content: msg.Text})
	for step := 0; step < 8; step++ {
		r, err := c.capability(ctx, &pb.CapabilityRequest{ConversationId: msg.ConversationID, Operation: &pb.CapabilityRequest_Model{Model: &pb.ModelRequest{Messages: history, Tools: c.hello.Tools}}})
		if err != nil {
			return nil, err
		}
		if r.Message == nil || r.Message.Role != "assistant" || len(r.Message.Content) > 65536 || len(r.Message.ToolCalls) > 8 {
			return nil, errors.New("invalid model response")
		}
		history = append(history, r.Message)
		if len(r.Message.ToolCalls) == 0 {
			if strings.TrimSpace(r.Message.Content) == "" {
				return nil, errors.New("model returned an empty response")
			}
			s.mu.Lock()
			s.history[key] = history
			s.mu.Unlock()
			return []OutboundMessage{{ConversationID: msg.ConversationID, InReplyTo: msg.PlatformMessageID, Text: r.Message.Content}}, nil
		}
		for _, call := range r.Message.ToolCalls {
			known := false
			for _, tool := range c.hello.Tools {
				if tool.Name == call.Name {
					known = true
					break
				}
			}
			if !known || !json.Valid([]byte(call.ArgumentsJson)) || len(call.ArgumentsJson) > 16384 {
				return nil, errors.New("model requested an unknown tool or invalid arguments")
			}
			id := rand.Text()
			c.mu.Lock()
			c.approvals[id] = msg.ConversationID
			c.mu.Unlock()
			req := ApprovalRequest{ApprovalID: id, ConversationID: msg.ConversationID, ActionKind: "mcp_tool", ActionSummary: call.Name + " " + call.ArgumentsJson, ExpiresAt: time.Now().Add(s.opts.ApprovalTimeout)}
			err = s.approvals.RequireApproval(ctx, req, func(a ApprovalRequest) {
				if c.send(&pb.CoreEnvelope{Payload: &pb.CoreEnvelope_ApprovalRequest{ApprovalRequest: &pb.ApprovalRequest{ApprovalId: id, ConversationId: msg.ConversationID, PrincipalId: msg.PrincipalID, InReplyToPlatformMessageId: msg.PlatformMessageID, ActionSummary: a.ActionSummary, ActionKind: a.ActionKind, ExpiresAtUnixMs: a.ExpiresAt.UnixMilli()}}}) != nil {
					cancel()
				}
			})
			c.mu.Lock()
			delete(c.approvals, id)
			c.mu.Unlock()
			if err != nil {
				return nil, err
			}
			result, err := c.capability(ctx, &pb.CapabilityRequest{ConversationId: msg.ConversationID, Operation: &pb.CapabilityRequest_ToolCall{ToolCall: call}})
			if err != nil {
				return nil, err
			}
			if len(result.ToolOutput) > 65536 {
				return nil, errors.New("tool output exceeds limit")
			}
			history = append(history, &pb.ChatMessage{Role: "tool", Content: result.ToolOutput, ToolName: call.Name})
		}
	}
	return nil, errors.New("model exceeded tool round limit")
}

// Listen refuses existing paths, including live or stale sockets. It never
// deletes a caller's file to make room for a listener.
func Listen(ctx context.Context, socketPath string, srv *Server) error {
	if srv == nil {
		return errors.New("server is required")
	}
	dir := filepath.Dir(socketPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	info, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode().Perm()&0077 != 0 {
		return errPrivateSocketDirectory
	}
	lis, err := net.Listen("unix", socketPath)
	if err != nil {
		return err
	}
	defer lis.Close()
	if err = os.Chmod(socketPath, 0600); err != nil {
		return err
	}
	g := grpc.NewServer(grpc.MaxRecvMsgSize(2<<20), grpc.MaxSendMsgSize(2<<20))
	pb.RegisterAdapterGatewayServer(g, srv)
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			g.Stop()
		case <-done:
		}
	}()
	err = g.Serve(lis)
	close(done)
	srv.registry.Close()
	if ctx.Err() != nil {
		return nil
	}
	return err
}
