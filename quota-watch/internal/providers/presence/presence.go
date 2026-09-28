package presence

import (
	"context"
	"github.com/local/quota-watch/internal/provider"
	"os"
	"time"
)

type Adapter struct {
	ProviderID, Name, Dashboard string
	Paths                       []string
	EnvNames                    []string
	LookupEnv                   func(string) (string, bool)
}

func Gemini(paths ...string) *Adapter {
	return &Adapter{ProviderID: "gemini", Name: "Gemini", Dashboard: "https://gemini.google.com/", Paths: paths, EnvNames: []string{"GEMINI_API_KEY", "GOOGLE_API_KEY"}}
}
func Cursor(paths ...string) *Adapter {
	return &Adapter{ProviderID: "cursor", Name: "Cursor", Dashboard: "https://cursor.com/dashboard", Paths: paths, EnvNames: []string{"CURSOR_ADMIN_KEY"}}
}
func GitHub(paths ...string) *Adapter {
	return &Adapter{ProviderID: "github", Name: "GitHub Copilot", Dashboard: "https://github.com/settings/billing", Paths: paths, EnvNames: []string{"GITHUB_TOKEN", "GH_TOKEN"}}
}
func (a *Adapter) ID() string { return a.ProviderID }
func (a *Adapter) Discover(context.Context) (provider.Discovery, error) {
	s := provider.StatusNotDetected
	msg := "No supported installation or credential reference detected"
	for _, p := range a.Paths {
		if i, e := os.Stat(p); e == nil && (i.IsDir() || i.Mode().IsRegular()) {
			s = provider.StatusUnsupported
			msg = "Detected; live usage source is not supported in this version"
			break
		}
	}
	lookup := a.LookupEnv
	if lookup == nil {
		lookup = os.LookupEnv
	}
	for _, n := range a.EnvNames {
		if v, ok := lookup(n); ok && v != "" {
			s = provider.StatusUnsupported
			msg = "Credential reference detected; adapter is not enabled in this version"
			break
		}
	}
	return provider.Discovery{ProviderID: a.ProviderID, ProviderName: a.Name, Status: s, Message: msg, DashboardURL: a.Dashboard}, nil
}
func (a *Adapter) Fetch(ctx context.Context) (provider.Result, error) {
	d, e := a.Discover(ctx)
	return provider.Result{Discovery: d, Attempted: timeNow()}, e
}

var timeNow = func() time.Time { return time.Now().UTC() }
