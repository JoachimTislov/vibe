// Package platform connects platform CLI operations to the gateway client.
package platform

import (
	"context"
	"errors"
	"github.com/YOURNAME/agentic-gateway/pkg/client"
	"strings"
)

type Message struct{ ID, Conversation, Text, ReplyTarget string }
type Transport interface {
	Receive(context.Context, func(Message) error) error
	Reply(context.Context, Message, string) error
}

// commandText accepts plain-text commands, including inside Slack threads.
// Telegram also accepts its familiar /agent command spelling.
func commandText(text string) (string, string, bool) {
	for _, prefix := range []string{"agent: ", "/agent "} {
		if strings.HasPrefix(text, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(text, prefix)), prefix, true
		}
	}
	return "", "", false
}

// Run accepts explicit agent commands from the owner-filtered transport.
// Replies stay in the triggering conversation; tool approvals are scoped
// to that conversation and the same authenticated core connection.
func Run(ctx context.Context, c *client.Client, p Transport) error {
	ctx, cancel := context.WithCancel(ctx)
	incoming := make(chan Message, 32)
	failed := make(chan error, 1)
	receiverDone := make(chan struct{})
	go func() {
		defer close(receiverDone)
		failed <- p.Receive(ctx, func(m Message) error {
			select {
			case incoming <- m:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
	}()
	defer func() { cancel(); <-receiverDone }()
	pending := map[string]Message{}
	approvals := map[string]Message{}
	seen := map[string]bool{}
	var order []string
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-failed:
			if err == nil {
				return errors.New("platform CLI stopped")
			}
			return err
		case m := <-incoming:
			text, _, command := commandText(m.Text)
			if !command {
				continue
			}
			key := m.Conversation + "\x00" + m.ID
			if seen[key] {
				continue
			}
			seen[key] = true
			order = append(order, key)
			if len(order) > 1024 {
				delete(seen, order[0])
				order = order[1:]
			}
			parts := strings.Fields(text)
			if len(parts) == 2 && (parts[0] == "approve" || parts[0] == "deny") {
				original, ok := approvals[parts[1]]
				if !ok || original.Conversation != m.Conversation {
					continue
				}
				delete(approvals, parts[1])
				if err := c.Approve(m.Conversation, parts[1], parts[0] == "approve"); err != nil {
					return err
				}
				continue
			}
			if text == "" {
				continue
			}
			if len(pending) >= 64 {
				return errors.New("too many pending platform requests")
			}
			pending[key] = m
			if err := c.Send(m.Conversation, m.ID, text); err != nil {
				return err
			}
		case e, ok := <-c.Events:
			if !ok {
				return c.Err()
			}
			if a := e.GetApprovalRequest(); a != nil {
				m, ok := pending[a.ConversationId+"\x00"+a.InReplyToPlatformMessageId]
				if !ok {
					continue
				}
				approvals[a.ApprovalId] = m
				_, prefix, _ := commandText(m.Text)
				if err := p.Reply(ctx, m, "Approval needed: "+a.ActionSummary+"\n"+prefix+"approve "+a.ApprovalId+"\nor "+prefix+"deny "+a.ApprovalId); err != nil {
					return err
				}
			}
			if out := e.GetOutboundMessage(); out != nil {
				key := out.ConversationId + "\x00" + out.InReplyToPlatformMessageId
				m, ok := pending[key]
				if !ok {
					continue
				}
				delete(pending, key)
				for id, original := range approvals {
					if original.ID == m.ID && original.Conversation == m.Conversation {
						delete(approvals, id)
					}
				}
				if err := p.Reply(ctx, m, out.Text); err != nil {
					return err
				}
			}
		}
	}
}
