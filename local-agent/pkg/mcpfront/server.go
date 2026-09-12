package mcpfront

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"github.com/YOURNAME/agentic-gateway/pkg/client"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"time"
)

type Ask struct {
	Text         string `json:"text" jsonschema:"Prompt for the local agent"`
	Conversation string `json:"conversation,omitempty"`
}

func New(cfg config.Config, runtime client.Runtime) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "local-agent", Version: "0.1.0"}, nil)
	mcp.AddTool(s, &mcp.Tool{Name: "ask", Description: "Ask the local agent. Any tool action requires human approval through MCP form elicitation."}, func(ctx context.Context, req *mcp.CallToolRequest, in Ask) (*mcp.CallToolResult, any, error) {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		c, err := client.Dial(ctx, cfg.Socket, cfg.Principal, "mcp", runtime)
		if err != nil {
			return nil, nil, err
		}
		defer c.Close()
		if in.Conversation == "" {
			in.Conversation = "mcp"
		}
		if err = c.Send(in.Conversation, rand.Text(), in.Text); err != nil {
			return nil, nil, err
		}
		for {
			select {
			case <-ctx.Done():
				return nil, nil, ctx.Err()
			case e, ok := <-c.Events:
				if !ok {
					return nil, nil, c.Err()
				}
				if a := e.GetApprovalRequest(); a != nil {
					result, err := req.Session.Elicit(ctx, &mcp.ElicitParams{Mode: "form", Message: a.ActionSummary, RequestedSchema: json.RawMessage(`{"type":"object","properties":{"approved":{"type":"boolean","title":"Approve this action?","default":false}},"required":["approved"]}`)})
					approved := err == nil && result != nil && result.Action == "accept" && result.Content["approved"] == true
					if err = c.Approve(a.ConversationId, a.ApprovalId, approved); err != nil {
						return nil, nil, err
					}
				}
				if m := e.GetOutboundMessage(); m != nil {
					return &mcp.CallToolResult{IsError: m.ErrorCode != "", Content: []mcp.Content{&mcp.TextContent{Text: m.Text}}}, nil, nil
				}
			}
		}
	})
	return s
}
