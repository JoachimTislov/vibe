package app

import (
	"context"
	"sync"
	"time"

	"github.com/local/quota-watch/internal/provider"
)

type State struct {
	SchemaVersion string            `json:"schema_version"`
	GeneratedAt   time.Time         `json:"generated_at"`
	Mode          string            `json:"mode"`
	Refreshing    bool              `json:"refreshing"`
	Providers     []provider.Result `json:"providers"`
}

type RefreshState struct {
	Accepted  bool      `json:"accepted"`
	Coalesced bool      `json:"coalesced"`
	Requested time.Time `json:"requested_at"`
}

type Service interface {
	State(context.Context) (State, error)
	RequestRefresh(context.Context) (RefreshState, error)
}

type demoService struct {
	mu        sync.Mutex
	now       func() time.Time
	requested time.Time
}

func NewDemoService(now func() time.Time) Service { return &demoService{now: now} }
func num(v float64) *float64                      { return &v }
func instant(v time.Time) *time.Time              { return &v }

func (d *demoService) State(context.Context) (State, error) {
	now := d.now().UTC()
	fresh := now.Add(-3 * time.Minute)
	old := now.Add(-40 * time.Minute)
	reset := now.Add(137 * time.Minute)
	return State{SchemaVersion: "1", GeneratedAt: now, Mode: "demo", Providers: []provider.Result{
		{Discovery: provider.Discovery{ProviderID: "codex", ProviderName: "Codex", Status: provider.StatusReady, Message: "Connected through Codex app-server"}, Metrics: []provider.Metric{
			{ProviderID: "codex", ProviderName: "Codex", AccountID: "demo", AccountLabel: "Personal", MetricID: "five-hour", Label: "5-hour window", Kind: "quota", Scope: "account", UsedPercent: num(42), Remaining: num(58), Unit: "percent", LimitKind: "finite", ResetsAt: &reset, Source: provider.SourceDemo, SourceDetail: "Synthetic app-server response", ObservedAt: fresh, FetchedAt: fresh, StaleAt: instant(now.Add(2 * time.Minute))},
			{ProviderID: "codex", ProviderName: "Codex", AccountID: "demo", MetricID: "weekly", Label: "Weekly window", Kind: "quota", Scope: "account", UsedPercent: num(91), LimitKind: "finite", Source: provider.SourceDemo, ObservedAt: fresh, FetchedAt: fresh}}},
		{Discovery: provider.Discovery{ProviderID: "claude", ProviderName: "Claude", Status: provider.StatusError, Message: "Latest refresh failed; showing last observation"}, Metrics: []provider.Metric{
			{ProviderID: "claude", ProviderName: "Claude", AccountID: "device", MetricID: "tokens", Label: "Tokens observed", Kind: "activity", Scope: "device", Used: num(184230), Unit: "tokens", LimitKind: "unknown", Source: provider.SourceLocalObservation, SourceDetail: "ccusage", Coverage: "This device only", ObservedAt: old, FetchedAt: old, StaleAt: instant(old.Add(10 * time.Minute)), Partial: true}}, ErrorCode: "backend_unavailable", Error: "ccusage is temporarily unavailable", Attempted: now},
		{Discovery: provider.Discovery{ProviderID: "github", ProviderName: "GitHub Copilot", Status: provider.StatusNeedsAuth, Message: "Sign in with GitHub CLI to read eligible billing usage", DashboardURL: "https://github.com/settings/billing"}, Attempted: now},
		{Discovery: provider.Discovery{ProviderID: "gemini", ProviderName: "Gemini", Status: provider.StatusUnsupported, Message: "Consumer subscription quota is not available through a supported source"}, Attempted: now},
	}}, nil
}
func (d *demoService) RequestRefresh(context.Context) (RefreshState, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	now := d.now().UTC()
	c := !d.requested.IsZero() && now.Sub(d.requested) < time.Second
	d.requested = now
	return RefreshState{Accepted: !c, Coalesced: c, Requested: now}, nil
}
