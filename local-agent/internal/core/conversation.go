package core

import (
	"context"
	"errors"
	"sync"
)

// Handler processes a single inbound message for a conversation and
// returns the outbound reply(s). Registered by whatever wires up skills;
// kept as a plain function type here so core doesn't know about skills,
// digests, or any specific capability — those are all just Handlers.
type Handler func(ctx context.Context, msg InboundMessage) ([]OutboundMessage, error)

// InboundMessage and OutboundMessage mirror the proto messages of the same
// name (proto/core/v1/core.proto). Kept as plain Go structs here so core's
// internal logic doesn't depend on generated protobuf types directly —
// the gRPC server layer (server.go) is responsible for translating between
// these and the wire types. This indirection is what lets core logic be
// unit-tested without spinning up gRPC at all.
type InboundMessage struct {
	PrincipalID       string
	ConversationID    string
	PlatformMessageID string
	Text              string
}

type OutboundMessage struct {
	ConversationID string
	Text           string
	InReplyTo      string
}

// Conversation is a single-goroutine actor: every InboundMessage for one
// conversation_id is processed strictly in arrival order, because a
// conversation is a poor place to allow reordering (e.g. an approval
// response must be seen after the request it answers, never before).
// Concurrency exists *across* conversations, not within one.
type Conversation struct {
	id      string
	handler Handler

	inbox     chan inboxItem
	done      chan struct{}
	closeOnce sync.Once
	ctx       context.Context
	cancel    context.CancelFunc
}

type inboxItem struct {
	msg      InboundMessage
	replyC   chan<- conversationReply
	ctx      context.Context
	callback func([]OutboundMessage, error)
}

type conversationReply struct {
	out []OutboundMessage
	err error
}

func NewConversation(id string, handler Handler) *Conversation {
	ctx, cancel := context.WithCancel(context.Background())
	c := &Conversation{
		id:      id,
		handler: handler,
		inbox:   make(chan inboxItem, 16),
		done:    make(chan struct{}),
		ctx:     ctx, cancel: cancel,
	}
	go c.run()
	return c
}

func (c *Conversation) run() {
	for {
		select {
		case item := <-c.inbox:
			ctx, cancel := context.WithCancel(item.ctx)
			stop := context.AfterFunc(c.ctx, cancel)
			var out []OutboundMessage
			err := ctx.Err()
			if err == nil {
				out, err = c.handler(ctx, item.msg)
			}
			stop()
			cancel()
			if item.callback != nil {
				item.callback(out, err)
			} else {
				item.replyC <- conversationReply{out: out, err: err}
			}
		case <-c.done:
			return
		}
	}
}

// Send enqueues msg and blocks until it has been processed, returning the
// handler's replies in order. Blocking here (rather than fire-and-forget)
// is what gives the caller (dispatch.go) a natural backpressure signal —
// see ARCHITECTURE.md's note on backpressure being an open question this
// resolves by construction: a slow conversation naturally slows only its
// own callers, never other conversations.
func (c *Conversation) Send(ctx context.Context, msg InboundMessage) ([]OutboundMessage, error) {
	replyC := make(chan conversationReply, 1)
	select {
	case c.inbox <- inboxItem{msg: msg, replyC: replyC, ctx: ctx}:
	case <-c.done:
		return nil, ErrConversationDown
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	select {
	case reply := <-replyC:
		return reply.out, reply.err
	case <-c.done:
		return nil, ErrConversationDown
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (c *Conversation) Close() {
	c.closeOnce.Do(func() { c.cancel(); close(c.done) })
}

func (c *Conversation) Enqueue(ctx context.Context, msg InboundMessage, callback func([]OutboundMessage, error)) error {
	if c.ctx.Err() != nil {
		return ErrConversationDown
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case c.inbox <- inboxItem{msg: msg, ctx: ctx, callback: callback}:
		return nil
	default:
		return errors.New("conversation queue is full")
	}
}

// Registry owns one Conversation actor per conversation_id, creating them
// lazily on first message. This is the object that would grow a
// principal_id-scoped key (rather than conversation_id alone) if/when
// #cross-platform-identity or multi-tenancy in EXTENSIONS.md gets built.
type Registry struct {
	mu            sync.Mutex
	conversations map[string]*Conversation
	handler       Handler
}

func NewRegistry(handler Handler) *Registry {
	return &Registry{
		conversations: make(map[string]*Conversation),
		handler:       handler,
	}
}

func (r *Registry) Get(conversationID string) *Conversation {
	c, _ := r.GetBounded(conversationID, 0)
	return c
}

func (r *Registry) GetBounded(conversationID string, limit int) (*Conversation, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if conv, ok := r.conversations[conversationID]; ok {
		return conv, nil
	}
	if limit > 0 && len(r.conversations) >= limit {
		return nil, errors.New("conversation limit reached; restart core to clear ephemeral state")
	}
	conv := NewConversation(conversationID, r.handler)
	r.conversations[conversationID] = conv
	return conv, nil
}

func (r *Registry) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, conv := range r.conversations {
		conv.Close()
	}
}
