package discovery

import (
	"github.com/local/quota-watch/internal/backend"
	"github.com/local/quota-watch/internal/backends/ccusage"
	"github.com/local/quota-watch/internal/backends/codexbar"
	"github.com/local/quota-watch/internal/backends/codexrpc"
	"github.com/local/quota-watch/internal/provider"
	claudeprovider "github.com/local/quota-watch/internal/providers/claude"
	codexprovider "github.com/local/quota-watch/internal/providers/codex"
	"github.com/local/quota-watch/internal/providers/presence"
	"os"
	"path/filepath"
)

type BackendStatus struct {
	ID, Path  string
	Installed bool
}

// BackendStatuses detects only known executable names. Detection never executes them.
func BackendStatuses() []BackendStatus {
	names := []string{"codexbar", "ccusage", "openusage", "onwatch"}
	found := FindExecutables(names...)
	by := map[string]string{}
	for _, f := range found {
		by[f.Name] = f.Path
	}
	out := make([]BackendStatus, 0, len(names))
	for _, n := range names {
		p, ok := by[n]
		out = append(out, BackendStatus{ID: n, Path: p, Installed: ok})
	}
	return out
}

type IntegrationOptions struct {
	Home      string
	LookupEnv func(string) (string, bool)
	Runner    backend.Runner
}

// Providers constructs the automatic, read-only MVP integrations. Executable
// discovery is allowlisted; no detected program is run until its provider fetches.
func Providers(o IntegrationOptions) []provider.Provider {
	if o.Home == "" {
		o.Home, _ = os.UserHomeDir()
	}
	if o.LookupEnv == nil {
		o.LookupEnv = os.LookupEnv
	}
	if o.Runner == nil {
		o.Runner = backend.ExecRunner{}
	}
	paths := map[string]string{}
	for _, f := range FindExecutables("codexbar", "ccusage", "codex") {
		paths[f.Name] = f.Path
	}
	env := func(names ...string) []string {
		r := []string{}
		for _, n := range names {
			if v, ok := o.LookupEnv(n); ok && v != "" {
				r = append(r, n+"="+v)
			}
		}
		return r
	}
	ca := &codexprovider.Adapter{}
	if p := paths["codexbar"]; p != "" {
		ca.CodexBar = &codexbar.Client{Path: p, Runner: o.Runner, Env: env("HOME", "CODEX_HOME", "PATH")}
	}
	if p := paths["codex"]; p != "" {
		ca.RPC = codexrpc.ExecClient{Path: p, Env: env("HOME", "CODEX_HOME", "PATH")}
	}
	cl := &claudeprovider.Adapter{}
	if p := paths["ccusage"]; p != "" {
		cl.CCUsage = &ccusage.Client{Path: p, Runner: o.Runner, Env: env("HOME", "CLAUDE_CONFIG_DIR", "PATH")}
	}
	g := presence.Gemini(filepath.Join(o.Home, ".gemini"))
	g.LookupEnv = o.LookupEnv
	cu := presence.Cursor(filepath.Join(o.Home, ".config", "Cursor"), filepath.Join(o.Home, ".cursor"))
	cu.LookupEnv = o.LookupEnv
	gh := presence.GitHub(filepath.Join(o.Home, ".config", "gh"))
	gh.LookupEnv = o.LookupEnv
	return []provider.Provider{ca, cl, g, cu, gh}
}
