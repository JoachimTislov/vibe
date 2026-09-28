package claude

import (
	"context"
	"github.com/local/quota-watch/internal/backends/ccusage"
	"github.com/local/quota-watch/internal/provider"
	"time"
)

type Adapter struct {
	CCUsage *ccusage.Client
	Now     func() time.Time
}

func (a *Adapter) ID() string { return "claude" }
func (a *Adapter) Discover(context.Context) (provider.Discovery, error) {
	s := provider.StatusNotDetected
	m := "ccusage was not detected"
	if a.CCUsage != nil {
		s = provider.StatusReady
		m = "Local Claude observations available"
	}
	return provider.Discovery{ProviderID: "claude", ProviderName: "Claude", Status: s, Message: m, DashboardURL: "https://claude.ai/settings/usage"}, nil
}
func (a *Adapter) Fetch(ctx context.Context) (provider.Result, error) {
	now := time.Now().UTC()
	if a.Now != nil {
		now = a.Now().UTC()
	}
	d, _ := a.Discover(ctx)
	r := provider.Result{Discovery: d, Attempted: now}
	if a.CCUsage == nil {
		r.ErrorCode = "source_unavailable"
		r.Error = "ccusage is unavailable"
		return r, nil
	}
	t, e := a.CCUsage.ClaudeTotals(ctx)
	if e != nil {
		r.ErrorCode = "backend_failed"
		r.Error = "Unable to read local Claude observations"
		return r, e
	}
	total := float64(t.InputTokens + t.OutputTokens + t.CacheTokens)
	r.Metrics = []provider.Metric{{ProviderID: "claude", ProviderName: "Claude", AccountID: "local", MetricID: "local_tokens", Label: "Observed tokens", Kind: "activity", Scope: "device", Unit: "tokens", Used: &total, LimitKind: "unknown", Source: provider.SourceLocalObservation, SourceDetail: "ccusage offline report", Coverage: "this device only", BackendID: "ccusage", BackendVersion: a.CCUsage.Version, ObservedAt: now, FetchedAt: now}}
	r.Succeeded = &now
	return r, nil
}
