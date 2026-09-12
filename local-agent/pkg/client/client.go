// Package client is the reusable adapter side of the public wire contract.
// It deliberately imports no core internals.
package client

import (
	"context"
	"errors"
	pb "github.com/YOURNAME/agentic-gateway/gen/core/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"net"
	"sync"
	"time"
)

type Runtime interface {
	Tools() []*pb.Tool
	Execute(context.Context, *pb.CapabilityRequest) *pb.CapabilityResult
}

type Client struct {
	conn      *grpc.ClientConn
	stream    pb.AdapterGateway_ConnectClient
	principal string
	sendMu    sync.Mutex
	Events    chan *pb.CoreEnvelope
	done      chan struct{}
	cancel    context.CancelFunc
	mu        sync.Mutex
	err       error
}

func Dial(ctx context.Context, socket, principal, name string, runtime Runtime) (*Client, error) {
	conn, err := grpc.NewClient("passthrough:///core", grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}), grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(2<<20), grpc.MaxCallSendMsgSize(2<<20)))
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(ctx)
	stream, err := pb.NewAdapterGatewayClient(conn).Connect(ctx)
	if err != nil {
		cancel()
		conn.Close()
		return nil, err
	}
	c := &Client{conn: conn, stream: stream, principal: principal, Events: make(chan *pb.CoreEnvelope, 64), done: make(chan struct{}), cancel: cancel}
	h := &pb.Hello{AdapterName: name, AdapterVersion: "0.1.0", ContractVersion: "1.1.0", PrincipalId: principal, ProvidesModel: runtime != nil}
	if runtime != nil {
		h.Tools = runtime.Tools()
	}
	// A missing server must not leave startup stuck forever.
	timer := time.AfterFunc(10*time.Second, cancel)
	err = stream.Send(&pb.AdapterEnvelope{Payload: &pb.AdapterEnvelope_Hello{Hello: h}})
	var ack *pb.CoreEnvelope
	if err == nil {
		ack, err = stream.Recv()
	}
	timer.Stop()
	if err == nil && (ack.GetHelloAck() == nil || !ack.GetHelloAck().Accepted) {
		err = errors.New("core rejected client: " + ack.GetHelloAck().GetReason())
	}
	if err != nil {
		c.Close()
		return nil, err
	}
	go c.receive(ctx, runtime)
	return c, nil
}

func (c *Client) send(e *pb.AdapterEnvelope) error {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	return c.stream.Send(e)
}
func (c *Client) Send(conversation, id, text string) error {
	return c.send(&pb.AdapterEnvelope{Payload: &pb.AdapterEnvelope_InboundMessage{InboundMessage: &pb.InboundMessage{PrincipalId: c.principal, ConversationId: conversation, PlatformMessageId: id, Text: text, ReceivedAtUnixMs: time.Now().UnixMilli()}}})
}
func (c *Client) Approve(conversation, id string, approved bool) error {
	return c.send(&pb.AdapterEnvelope{Payload: &pb.AdapterEnvelope_ApprovalResponse{ApprovalResponse: &pb.ApprovalResponse{PrincipalId: c.principal, ConversationId: conversation, ApprovalId: id, Approved: approved}}})
}
func (c *Client) Close()                { c.cancel(); c.conn.Close() }
func (c *Client) Done() <-chan struct{} { return c.done }
func (c *Client) Err() error            { c.mu.Lock(); defer c.mu.Unlock(); return c.err }

func (c *Client) receive(ctx context.Context, runtime Runtime) {
	defer close(c.done)
	defer close(c.Events)
	defer c.cancel()
	workers := make(chan struct{}, 8)
	for {
		e, err := c.stream.Recv()
		if err != nil {
			c.mu.Lock()
			c.err = err
			c.mu.Unlock()
			return
		}
		if req := e.GetCapabilityRequest(); req != nil {
			select {
			case workers <- struct{}{}:
			case <-ctx.Done():
				return
			}
			go func() {
				defer func() { <-workers }()
				workCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
				defer cancel()
				r := &pb.CapabilityResult{Error: "no runtime configured"}
				if runtime != nil && req.PrincipalId == c.principal {
					r = runtime.Execute(workCtx, req)
				}
				r.RequestId = req.RequestId
				r.PrincipalId = c.principal
				r.ConversationId = req.ConversationId
				if c.send(&pb.AdapterEnvelope{Payload: &pb.AdapterEnvelope_CapabilityResult{CapabilityResult: r}}) != nil {
					c.cancel()
				}
			}()
		} else {
			select {
			case c.Events <- e:
			case <-ctx.Done():
				return
			}
		}
	}
}
