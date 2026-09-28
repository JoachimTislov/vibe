package codex

import (
	"context"
	"github.com/local/quota-watch/internal/backends/codexbar"
	"github.com/local/quota-watch/internal/backends/codexrpc"
	"github.com/local/quota-watch/internal/provider"
	"time"
)

type Adapter struct {
	CodexBar *codexbar.Client
	RPC      codexrpc.Caller
	Now      func() time.Time
}

func (a *Adapter) ID() string { return "codex" }
func (a *Adapter) Discover(context.Context) (provider.Discovery, error) {
	s := provider.StatusNotDetected
	m := "Install/login to Codex or install CodexBar"
	if a.CodexBar != nil || a.RPC != nil {
		s = provider.StatusReady
		m = "Read-only quota source available"
	}
	return provider.Discovery{ProviderID: "codex", ProviderName: "Codex", Status: s, Message: m, DashboardURL: "https://chatgpt.com/codex/settings/usage"}, nil
}
func (a *Adapter) Fetch(ctx context.Context) (provider.Result, error) {
	now := time.Now().UTC()
	if a.Now != nil {
		now = a.Now().UTC()
	}
	d, _ := a.Discover(ctx)
	result := provider.Result{Discovery: d, Attempted: now}
	var windows []codexbar.Window
	backendID, version, detail := "", "", ""
	var err error
	if a.CodexBar != nil {
		windows, err = a.CodexBar.CodexUsage(ctx)
		backendID = "codexbar"
		version = a.CodexBar.Version
		detail = "CodexBar CLI source"
	}
	if (a.CodexBar == nil || err != nil) && a.RPC != nil {
		var rw []codexrpc.Window
		rw, err = codexrpc.ReadRateLimits(ctx, a.RPC)
		windows = nil
		for _, w := range rw {
			windows = append(windows, codexbar.Window{ID: w.ID, Label: w.Label, UsedPercent: w.UsedPercent, ResetsAt: w.ResetsAt})
		}
		backendID = "codex-app-server"
		detail = "Codex app-server"
	}
	if a.CodexBar == nil && a.RPC == nil {
		err = context.Canceled
	}
	if err != nil {
		result.ErrorCode = "source_unavailable"
		result.Error = "Unable to read Codex usage"
		return result, err
	}
	for _, w := range windows {
		pct := w.UsedPercent
		result.Metrics = append(result.Metrics, provider.Metric{ProviderID: "codex", ProviderName: "Codex", AccountID: "default", MetricID: "quota:" + w.ID, Label: w.Label, Kind: "quota", Scope: "account", UsedPercent: &pct, LimitKind: "unknown", WindowID: w.ID, ResetsAt: w.ResetsAt, Source: provider.SourceOfficialCLI, SourceDetail: detail, BackendID: backendID, BackendVersion: version, ObservedAt: now, FetchedAt: now})
	}
	result.Succeeded = &now
	return result, nil
}
