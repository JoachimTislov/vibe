// Package localcli implements the terminal and JSON-lines client entrypoint.
package localcli

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	pb "github.com/YOURNAME/agentic-gateway/gen/core/v1"
	"github.com/YOURNAME/agentic-gateway/pkg/client"
)

type Options struct {
	JSON         bool
	Prompt       string
	Conversation string
}
type Input struct {
	ID           string `json:"id,omitempty"`
	Conversation string `json:"conversation,omitempty"`
	Text         string `json:"text,omitempty"`
	ApprovalID   string `json:"approval_id,omitempty"`
	Approved     bool   `json:"approved,omitempty"`
}
type Event struct {
	Type         string `json:"type"`
	ID           string `json:"id,omitempty"`
	Conversation string `json:"conversation,omitempty"`
	Text         string `json:"text,omitempty"`
	ApprovalID   string `json:"approval_id,omitempty"`
	Error        string `json:"error,omitempty"`
}

func Run(ctx context.Context, c *client.Client, in io.Reader, out io.Writer, opts Options) error {
	if opts.Conversation == "" {
		opts.Conversation = "local"
	}
	lines := make(chan string)
	readErr := make(chan error, 1)
	readCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	if opts.Prompt == "" {
		go func() {
			scanner := bufio.NewScanner(in)
			scanner.Buffer(make([]byte, 4096), 128<<10)
			for scanner.Scan() {
				select {
				case lines <- scanner.Text():
				case <-readCtx.Done():
					return
				}
			}
			readErr <- scanner.Err()
			close(lines)
		}()
	}
	pending := map[string]bool{}
	approvals := map[string]*pb.ApprovalRequest{}
	emit := func(e Event) error {
		if opts.JSON {
			return json.NewEncoder(out).Encode(e)
		}
		if e.Type == "approval" {
			_, err := fmt.Fprintf(out, "Approval %s: %s\n/approve %s or /deny %s\n", e.ApprovalID, e.Text, e.ApprovalID, e.ApprovalID)
			return err
		}
		_, err := fmt.Fprintln(out, e.Text)
		return err
	}
	send := func(input Input) error {
		if input.Conversation == "" {
			input.Conversation = opts.Conversation
		}
		if input.ApprovalID != "" {
			a, ok := approvals[input.ApprovalID]
			if !ok {
				return errors.New("unknown pending approval")
			}
			delete(approvals, input.ApprovalID)
			return c.Approve(a.ConversationId, a.ApprovalId, input.Approved)
		}
		if strings.TrimSpace(input.Text) == "" {
			return nil
		}
		if input.ID == "" {
			input.ID = rand.Text()
		}
		if pending[input.ID] {
			return errors.New("request ID is already pending")
		}
		pending[input.ID] = true
		return c.Send(input.Conversation, input.ID, input.Text)
	}
	eof := opts.Prompt != ""
	if eof {
		if err := send(Input{Text: opts.Prompt}); err != nil {
			return err
		}
		lines = nil
	}
	failed := false
	for {
		if eof && len(pending) == 0 {
			if failed {
				return errors.New("core request failed")
			}
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case line, ok := <-lines:
			if !ok {
				lines = nil
				eof = true
				if err := <-readErr; err != nil {
					return err
				}
				for id, a := range approvals {
					if err := c.Approve(a.ConversationId, id, false); err != nil {
						return err
					}
					delete(approvals, id)
				}
				continue
			}
			var input Input
			if opts.JSON {
				if err := json.Unmarshal([]byte(line), &input); err != nil {
					return fmt.Errorf("invalid input JSON: %w", err)
				}
			} else {
				parts := strings.Fields(line)
				if len(parts) == 2 && (parts[0] == "/approve" || parts[0] == "/deny") {
					input.ApprovalID = parts[1]
					input.Approved = parts[0] == "/approve"
				} else {
					input.Text = line
				}
			}
			if err := send(input); err != nil {
				return err
			}
		case envelope, ok := <-c.Events:
			if !ok {
				return c.Err()
			}
			if a := envelope.GetApprovalRequest(); a != nil {
				approvals[a.ApprovalId] = a
				if err := emit(Event{Type: "approval", ID: a.InReplyToPlatformMessageId, Conversation: a.ConversationId, Text: a.ActionSummary, ApprovalID: a.ApprovalId}); err != nil {
					return err
				}
				if eof {
					if err := c.Approve(a.ConversationId, a.ApprovalId, false); err != nil {
						return err
					}
					delete(approvals, a.ApprovalId)
				}
			}
			if m := envelope.GetOutboundMessage(); m != nil {
				delete(pending, m.InReplyToPlatformMessageId)
				for id, a := range approvals {
					if a.InReplyToPlatformMessageId == m.InReplyToPlatformMessageId {
						delete(approvals, id)
					}
				}
				if m.ErrorCode != "" {
					failed = true
				}
				if err := emit(Event{Type: "reply", ID: m.InReplyToPlatformMessageId, Conversation: m.ConversationId, Text: m.Text, Error: m.ErrorCode}); err != nil {
					return err
				}
			}
		}
	}
}
