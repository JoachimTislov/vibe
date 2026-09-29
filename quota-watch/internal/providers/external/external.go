// Package external adapts explicitly trusted source manifests to the provider model.
package external

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/local/quota-watch/internal/provider"
	"github.com/local/quota-watch/internal/sourceprotocol"
)

type Provider struct {
	manifest sourceprotocol.Manifest
	options  sourceprotocol.Options
	now      func() time.Time
}

func New(m sourceprotocol.Manifest, o sourceprotocol.Options) *Provider {
	return &Provider{manifest: m, options: o, now: time.Now}
}
func (p *Provider) ID() string { return "external:" + p.manifest.ID }
func (p *Provider) session(ctx context.Context) (*sourceprotocol.Client, sourceprotocol.InitializeResult, error) {
	c, e := sourceprotocol.Start(ctx, p.manifest.Executable, p.manifest.Args, p.options)
	if e != nil {
		return nil, sourceprotocol.InitializeResult{}, e
	}
	var init sourceprotocol.InitializeResult
	e = c.Call(ctx, "initialize", sourceprotocol.InitializeParams{ProtocolVersion: sourceprotocol.Version, Client: sourceprotocol.ClientInfo{Name: "quota-watch", Version: "0.1.0"}, MetricSchema: "v1"}, &init)
	if e == nil {
		e = sourceprotocol.ValidateInitialize(init)
	}
	if e != nil {
		c.Close()
		return nil, init, e
	}
	return c, init, nil
}
func (p *Provider) Discover(ctx context.Context) (provider.Discovery, error) {
	c, init, e := p.session(ctx)
	if e != nil {
		return provider.Discovery{ProviderID: p.ID(), ProviderName: p.manifest.ID, Status: provider.StatusError, Message: "External source unavailable"}, e
	}
	defer c.Close()
	var ar sourceprotocol.AccountsResult
	e = c.Call(ctx, "accounts.discover", struct{}{}, &ar)
	if e == nil {
		e = sourceprotocol.ValidateAccounts(ar)
	}
	status := provider.StatusReady
	msg := fmt.Sprintf("%d account(s) from %s %s", len(ar.Accounts), init.Source.ID, init.Source.Version)
	if e != nil {
		status = provider.StatusError
		msg = "External source returned invalid account data"
	}
	return provider.Discovery{ProviderID: p.ID(), ProviderName: init.Source.Name, Status: status, Message: msg}, e
}
func (p *Provider) Fetch(ctx context.Context) (provider.Result, error) {
	now := p.now().UTC()
	result := provider.Result{Attempted: now, Discovery: provider.Discovery{ProviderID: p.ID(), ProviderName: p.manifest.ID, Status: provider.StatusError}}
	c, init, e := p.session(ctx)
	if e != nil {
		return result, e
	}
	defer c.Close()
	var ar sourceprotocol.AccountsResult
	if e = c.Call(ctx, "accounts.discover", struct{}{}, &ar); e == nil {
		e = sourceprotocol.ValidateAccounts(ar)
	}
	if e != nil {
		return result, e
	}
	accounts := map[string]sourceprotocol.Account{}
	var ids []string
	for _, a := range ar.Accounts {
		accounts[a.ID] = a
		if a.Ready {
			ids = append(ids, a.ID)
		}
	}
	sort.Strings(ids)
	var ur sourceprotocol.UsageResult
	if e = c.Call(ctx, "usage.read", sourceprotocol.UsageParams{AccountIDs: ids}, &ur); e == nil {
		e = sourceprotocol.ValidateUsage(ur, accounts)
	}
	if e != nil {
		return result, e
	}
	for _, m := range ur.Metrics {
		fetched := now
		result.Metrics = append(result.Metrics, provider.Metric{ProviderID: m.ProviderID, ProviderName: m.ProviderName, AccountID: m.AccountID, AccountLabel: m.AccountLabel, MetricID: m.ID, Label: m.Label, Kind: m.Kind, Scope: m.Scope, Unit: m.Unit, Used: m.Used, Limit: m.Limit, Remaining: m.Remaining, UsedPercent: m.UsedPercent, LimitKind: m.LimitKind, WindowID: m.WindowID, WindowStart: m.WindowStart, ResetsAt: m.ResetsAt, Source: provider.Source(m.Authority), SourceDetail: m.SourceDetail, Coverage: m.Coverage, BackendID: init.Source.ID, BackendVersion: init.Source.Version, ObservedAt: m.ObservedAt, FetchedAt: fetched, StaleAt: m.StaleAt, Partial: m.Partial})
	}
	success := now
	result.Succeeded = &success
	result.Discovery = provider.Discovery{ProviderID: p.ID(), ProviderName: init.Source.Name, Status: provider.StatusReady, Message: fmt.Sprintf("%d account(s)", len(ar.Accounts))}
	return result, nil
}

// Merge applies manifest priority deterministically. Equal-priority overlap is rejected
// because silently choosing by discovery order would make provenance unstable.
type Input struct {
	Manifest sourceprotocol.Manifest
	Metrics  []provider.Metric
}

func Merge(inputs []Input) ([]provider.Metric, error) {
	type choice struct {
		m      provider.Metric
		p      int
		source string
	}
	chosen := map[string]choice{}
	for _, input := range inputs {
		manifest, metrics := input.Manifest, input.Metrics
		for _, m := range metrics {
			k := m.ProviderID + "\x00" + m.AccountID + "\x00" + m.MetricID + "\x00" + m.WindowID
			c, ok := chosen[k]
			if ok && c.p == manifest.Priority && c.source != manifest.ID {
				return nil, fmt.Errorf("duplicate external metric %q at equal priority", m.MetricID)
			}
			if !ok || manifest.Priority > c.p {
				chosen[k] = choice{m, manifest.Priority, manifest.ID}
			}
		}
	}
	keys := make([]string, 0, len(chosen))
	for k := range chosen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]provider.Metric, 0, len(keys))
	for _, k := range keys {
		out = append(out, chosen[k].m)
	}
	return out, nil
}
