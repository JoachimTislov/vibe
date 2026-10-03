package tools

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Journal is the agent's self-recording: an append-only JSONL log of its
// own actions, one file per day under <workspace>/logs/journal/. Every
// tool call is recorded, whether it came from the agent loop or a direct
// MCP call, so the agent can audit and monitor itself.
type Journal struct {
	dir string
	mu  sync.Mutex
}

// Entry is one recorded action.
type Entry struct {
	Time   time.Time `json:"time"`
	Origin string    `json:"origin"` // "agent", "mcp" or "startup"
	Tool   string    `json:"tool"`
	Args   string    `json:"args,omitempty"`   // truncated JSON
	Result string    `json:"result,omitempty"` // truncated JSON
	OK     bool      `json:"ok"`
	Error  string    `json:"error,omitempty"`
}

// OpenJournal opens (creating if needed) the journal under the workspace.
func OpenJournal(w Workspace) (*Journal, error) {
	dir := filepath.Join(w.Root, "logs", "journal")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Journal{dir: dir}, nil
}

// Record appends one entry. Failures are silently ignored: the journal
// must never break the agent.
func (j *Journal) Record(origin, tool string, args, result any, err error) {
	if j == nil {
		return
	}
	e := Entry{
		Time:   time.Now().UTC(),
		Origin: origin,
		Tool:   tool,
		Args:   marshalTruncated(args, 2048),
		Result: marshalTruncated(result, 2048),
	}
	if err != nil {
		e.Error = truncate(err.Error(), 1024)
	} else {
		e.OK = true
	}
	raw, merr := json.Marshal(e)
	if merr != nil {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	path := filepath.Join(j.dir, time.Now().UTC().Format("2006-01-02")+".jsonl")
	f, ferr := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if ferr != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(raw, '\n'))
}

// JournalQuery filters journal entries, newest first.
type JournalQuery struct {
	Last       int    // max entries to return, default 20
	Tool       string // filter by tool name
	ErrorsOnly bool   // only failed actions
	Days       int    // how many days back to scan, default 7
}

// Query returns matching entries, newest first.
func (j *Journal) Query(q JournalQuery) ([]Entry, error) {
	if j == nil {
		return nil, nil
	}
	if q.Last <= 0 {
		q.Last = 20
	}
	if q.Days <= 0 {
		q.Days = 7
	}
	var files []string
	now := time.Now().UTC()
	for d := 0; d < q.Days; d++ {
		files = append(files, filepath.Join(j.dir, now.AddDate(0, 0, -d).Format("2006-01-02")+".jsonl"))
	}
	var entries []Entry
	for _, path := range files {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
			if line == "" {
				continue
			}
			var e Entry
			if err := json.Unmarshal([]byte(line), &e); err != nil {
				continue
			}
			if q.Tool != "" && e.Tool != q.Tool {
				continue
			}
			if q.ErrorsOnly && e.OK {
				continue
			}
			entries = append(entries, e)
		}
	}
	sort.Slice(entries, func(a, b int) bool { return entries[a].Time.After(entries[b].Time) })
	if len(entries) > q.Last {
		entries = entries[:q.Last]
	}
	return entries, nil
}

// Stats summarizes journal activity for self-reporting.
type JournalStats struct {
	Total   int `json:"total"`
	Errors  int `json:"errors"`
	Last24h int `json:"last_24h"`
}

// Stats summarizes the last 7 days of the journal.
func (j *Journal) Stats() JournalStats {
	if j == nil {
		return JournalStats{}
	}
	entries, _ := j.Query(JournalQuery{Last: 1000, Days: 7})
	cutoff := time.Now().UTC().Add(-24 * time.Hour)
	var s JournalStats
	for _, e := range entries {
		s.Total++
		if !e.OK {
			s.Errors++
		}
		if e.Time.After(cutoff) {
			s.Last24h++
		}
	}
	return s
}

// truncate cuts a string to at most limit bytes, marking the cut.
func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	return s[:limit] + "..."
}

func marshalTruncated(v any, limit int) string {
	if v == nil {
		return ""
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	s := string(raw)
	if len(s) > limit {
		return s[:limit] + "..."
	}
	return s
}
