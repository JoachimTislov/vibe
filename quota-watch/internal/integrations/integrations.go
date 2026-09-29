// Package integrations performs bounded, allowlisted, read-only presence discovery.
package integrations

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"time"

	"github.com/local/quota-watch/internal/catalog"
)

type Evidence struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}
type Status struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	State          string     `json:"state"`
	SelectedSource string     `json:"selected_source,omitempty"`
	Evidence       []Evidence `json:"evidence,omitempty"`
	SetupMode      string     `json:"setup_mode"`
	Diagnostic     string     `json:"diagnostic"`
}
type Report struct {
	CatalogueVersion string    `json:"catalogue_version"`
	ScannedAt        time.Time `json:"scanned_at"`
	Integrations     []Status  `json:"integrations"`
}
type Plan struct {
	ID          string   `json:"id"`
	ReadOnly    bool     `json:"read_only"`
	Actions     []string `json:"actions"`
	Permissions []string `json:"permissions"`
	DataScope   []string `json:"data_scope"`
}

type Scanner struct {
	Lookup func(string) (string, error)
	Getenv func(string) string
	Home   string
	Stat   func(string) (os.FileInfo, error)
	Now    func() time.Time
}

func NewScanner() *Scanner {
	h, _ := os.UserHomeDir()
	return &Scanner{Lookup: exec.LookPath, Getenv: os.Getenv, Home: h, Stat: os.Stat, Now: time.Now}
}

func (s *Scanner) Scan() Report {
	c := catalog.TierA()
	out := Report{CatalogueVersion: c.Version, ScannedAt: s.Now().UTC()}
	for _, entry := range c.Entries {
		out.Integrations = append(out.Integrations, s.scan(entry))
	}
	return out
}
func (s *Scanner) scan(e catalog.Entry) Status {
	st := Status{ID: e.ID, Name: e.Name, State: "not_found", SetupMode: e.SetupMode, Diagnostic: "No allowlisted local signal found"}
	for _, name := range e.Executables {
		if _, err := s.Lookup(name); err == nil {
			st.Evidence = append(st.Evidence, Evidence{"executable", name})
		}
	}
	for _, name := range e.Env {
		if s.Getenv(name) != "" {
			st.Evidence = append(st.Evidence, Evidence{"environment_name", name})
		}
	}
	for _, name := range e.ConfigDirs {
		if s.Home != "" {
			if _, err := s.Stat(filepath.Join(s.Home, name)); err == nil {
				st.Evidence = append(st.Evidence, Evidence{"known_path", name})
			}
		}
	}
	if len(st.Evidence) > 0 {
		st.State = "can_connect"
		st.SelectedSource = st.Evidence[0].Name
		st.Diagnostic = "Detected locally; connection has not been verified"
	}
	return st
}
func (s *Scanner) Plan(id string) (Plan, bool) {
	c := catalog.TierA()
	for _, e := range c.Entries {
		if e.ID == id {
			actions := []string{"Re-scan allowlisted local metadata", "Verify a supported read-only source"}
			if e.SetupMode == "existing_cli" {
				actions = append(actions, "Use the existing CLI login")
			}
			return Plan{ID: id, ReadOnly: true, Actions: actions, Permissions: []string{"Local metadata", "Provider usage or billing read access"}, DataScope: append([]string(nil), e.Capabilities...)}, true
		}
	}
	return Plan{}, false
}

// SortedEvidence is useful to callers presenting deterministic diagnostics.
func SortedEvidence(v []Evidence) []Evidence {
	out := append([]Evidence(nil), v...)
	sort.Slice(out, func(i, j int) bool { return out[i].Kind+out[i].Name < out[j].Kind+out[j].Name })
	return out
}
