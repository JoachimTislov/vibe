package tools

import (
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// RuntimeInfo describes the running agent for self-reporting.
type RuntimeInfo struct {
	Provider   string    `json:"provider"`
	Model      string    `json:"model"`
	Workspace  string    `json:"workspace"`
	Version    string    `json:"version"`
	StartedAt  time.Time `json:"started_at"`
	ToolNames  []string  `json:"tools"`
	MCPClients []string  `json:"mcp_clients,omitempty"`
}

// SelfReportResult is the output of the self_report tool.
type SelfReportResult struct {
	Runtime   RuntimeInfo  `json:"runtime"`
	Journal   JournalStats `json:"journal"`
	Processes []ProcStatus `json:"processes"`
}

// NewSelfTool returns self_report and journal_query: the agent's
// self-monitoring tools. They read the agent's own action journal and
// process registry so it can verify it is functioning properly.
func NewSelfTool(info RuntimeInfo, j *Journal, w Workspace) ([]tool.Tool, error) {
	report, err := functiontool.New(
		functiontool.Config{
			Name:        "self_report",
			Description: "Reports the agent's own health: provider, model, workspace, uptime, journal statistics (actions and errors), tool list and running background processes. Use to verify the agent is functioning properly.",
		},
		func(ctx agent.Context, _ struct{}) (SelfReportResult, error) {
			procs, err := ListProcessesIn(w, "")
			if err != nil {
				return SelfReportResult{}, err
			}
			return SelfReportResult{
				Runtime:   info,
				Journal:   j.Stats(),
				Processes: procs.Agent,
			}, nil
		},
	)
	if err != nil {
		return nil, err
	}

	// journal_query wraps the Journal with its own args type.
	type journalArgs struct {
		Last       int    `json:"last,omitempty" jsonschema:"max entries to return, default 20"`
		Tool       string `json:"tool,omitempty" jsonschema:"filter by tool name"`
		ErrorsOnly bool   `json:"errors_only,omitempty" jsonschema:"only failed actions"`
	}
	query, err := functiontool.New(
		functiontool.Config{
			Name:        "journal_query",
			Description: "Reads the agent's own action journal (recorded tool calls with results and errors). Use to audit what the agent has done and diagnose failures.",
		},
		func(ctx agent.Context, args journalArgs) ([]Entry, error) {
			return j.Query(JournalQuery{Last: args.Last, Tool: args.Tool, ErrorsOnly: args.ErrorsOnly})
		},
	)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{report, query}, nil
}
