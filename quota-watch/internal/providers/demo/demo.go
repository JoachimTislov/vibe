package demo

import (
	"context"
	"github.com/local/quota-watch/internal/provider"
	"time"
)

type Provider struct{ now func() time.Time }

func New() *Provider                              { return NewWithClock(time.Now) }
func NewWithClock(now func() time.Time) *Provider { return &Provider{now: now} }
func (p *Provider) ID() string                    { return "demo" }
func (p *Provider) Discover(context.Context) (provider.Discovery, error) {
	return provider.Discovery{ProviderID: "demo", ProviderName: "Example subscriptions", Status: provider.StatusReady, Message: "Synthetic data"}, nil
}
func (p *Provider) Fetch(ctx context.Context) (provider.Result, error) {
	if err := ctx.Err(); err != nil {
		return provider.Result{}, err
	}
	now := p.now().UTC()
	success := now
	v := func(n float64) *float64 { return &n }
	metric := func(id, label string, used, limit, percent *float64, stale time.Duration) provider.Metric {
		var remaining *float64
		if used != nil && limit != nil {
			x := *limit - *used
			remaining = &x
		}
		staleAt := now.Add(stale)
		kind := "unknown"
		if limit != nil {
			kind = "finite"
		}
		return provider.Metric{ProviderID: "demo", ProviderName: "Example subscriptions", AccountID: "example", MetricID: id, Label: label, Kind: "quota", Scope: "account", Unit: "requests", Used: used, Limit: limit, Remaining: remaining, UsedPercent: percent, LimitKind: kind, Source: provider.SourceDemo, SourceDetail: "Synthetic example", ObservedAt: now, FetchedAt: now, StaleAt: &staleAt}
	}
	return provider.Result{Discovery: provider.Discovery{ProviderID: "demo", ProviderName: "Example subscriptions", Status: provider.StatusReady, Message: "Synthetic data"}, Metrics: []provider.Metric{metric("healthy", "Healthy window", v(24), v(100), v(24), time.Hour), metric("near_limit", "Near limit", v(92), v(100), v(92), 20*time.Minute), metric("exhausted", "Exhausted", v(100), v(100), v(100), 10*time.Minute), metric("unknown", "Unknown allowance", v(1234), nil, nil, time.Hour), metric("stale", "Stale observation", v(55), v(100), v(55), -time.Minute)}, Attempted: now, Succeeded: &success}, nil
}
