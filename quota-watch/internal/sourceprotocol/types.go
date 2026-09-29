// Package sourceprotocol implements quota-watch.source.v1, a deliberately small
// read-only JSON-RPC protocol for locally installed usage sources.
package sourceprotocol

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"
)

const Version = "1.0"

var ErrInvalid = errors.New("invalid external source data")

type ClientInfo struct{ Name, Version string }
type InitializeParams struct {
	ProtocolVersion string     `json:"protocol_version"`
	Client          ClientInfo `json:"client"`
	Locale          string     `json:"locale,omitempty"`
	MetricSchema    string     `json:"metric_schema,omitempty"`
}
type SourceIdentity struct {
	ID      string `json:"id"`
	Name    string `json:"name,omitempty"`
	Version string `json:"version"`
}
type Capabilities struct {
	AccountsDiscover bool `json:"accounts_discover"`
	UsageRead        bool `json:"usage_read"`
	HealthRead       bool `json:"health_read,omitempty"`
}
type Privacy struct {
	Network          string `json:"network"`
	ReadsBrowserData bool   `json:"reads_browser_data"`
}
type InitializeResult struct {
	ProtocolVersion string         `json:"protocol_version"`
	Source          SourceIdentity `json:"source"`
	Capabilities    Capabilities   `json:"capabilities"`
	Privacy         Privacy        `json:"privacy"`
	Authorities     []string       `json:"authorities,omitempty"`
}

type SetupAction struct {
	Code  string `json:"code"`
	Label string `json:"label"`
	URL   string `json:"url,omitempty"`
}
type Account struct {
	ID           string        `json:"id"`
	Label        string        `json:"label"`
	ProviderID   string        `json:"provider_id"`
	ProviderName string        `json:"provider_name,omitempty"`
	Ready        bool          `json:"ready"`
	Setup        []SetupAction `json:"setup,omitempty"`
}
type AccountsResult struct {
	Accounts []Account `json:"accounts"`
}
type UsageParams struct {
	AccountIDs []string `json:"account_ids"`
}
type Metric struct {
	ProviderID   string     `json:"provider_id"`
	ProviderName string     `json:"provider_name,omitempty"`
	AccountID    string     `json:"account_id"`
	AccountLabel string     `json:"account_label,omitempty"`
	ID           string     `json:"metric_id"`
	Label        string     `json:"label"`
	Kind         string     `json:"kind"`
	Scope        string     `json:"scope"`
	Unit         string     `json:"unit,omitempty"`
	Currency     string     `json:"currency,omitempty"`
	Used         *float64   `json:"used,omitempty"`
	Limit        *float64   `json:"limit,omitempty"`
	Remaining    *float64   `json:"remaining,omitempty"`
	UsedPercent  *float64   `json:"used_percent,omitempty"`
	LimitKind    string     `json:"limit_kind"`
	WindowID     string     `json:"window_id,omitempty"`
	WindowStart  *time.Time `json:"window_start,omitempty"`
	ResetsAt     *time.Time `json:"resets_at,omitempty"`
	Authority    string     `json:"authority"`
	SourceDetail string     `json:"source_detail"`
	Coverage     string     `json:"coverage"`
	ObservedAt   time.Time  `json:"observed_at"`
	StaleAt      *time.Time `json:"stale_at,omitempty"`
	Partial      bool       `json:"partial,omitempty"`
}
type UsageResult struct {
	Metrics []Metric `json:"metrics"`
}
type HealthResult struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
	Message string `json:"message,omitempty"`
}

const maxString = 512

func validText(s string, required bool) bool {
	return (!required || s != "") && len(s) <= maxString && !strings.ContainsAny(s, "\x00\r\n")
}
func ValidateInitialize(v InitializeResult) error {
	if v.ProtocolVersion != Version || !validText(v.Source.ID, true) || !validText(v.Source.Version, true) || !v.Capabilities.AccountsDiscover || !v.Capabilities.UsageRead {
		return fmt.Errorf("%w: incompatible initialization", ErrInvalid)
	}
	if v.Privacy.Network != "none" && v.Privacy.Network != "provider_only" {
		return fmt.Errorf("%w: network declaration", ErrInvalid)
	}
	return nil
}
func ValidateAccounts(v AccountsResult) error {
	if len(v.Accounts) > 256 {
		return fmt.Errorf("%w: too many accounts", ErrInvalid)
	}
	seen := map[string]bool{}
	for _, a := range v.Accounts {
		if !validText(a.ID, true) || !validText(a.Label, true) || !validText(a.ProviderID, true) || seen[a.ID] {
			return fmt.Errorf("%w: account", ErrInvalid)
		}
		seen[a.ID] = true
		for _, s := range a.Setup {
			if !validText(s.Code, true) || !validText(s.Label, true) || !safeURL(s.URL) {
				return fmt.Errorf("%w: setup action", ErrInvalid)
			}
		}
	}
	return nil
}
func safeURL(s string) bool {
	if s == "" {
		return true
	}
	u, e := url.Parse(s)
	return e == nil && (u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))) && u.User == nil
}
func ValidateUsage(v UsageResult, accounts map[string]Account) error {
	if len(v.Metrics) > 4096 {
		return fmt.Errorf("%w: too many metrics", ErrInvalid)
	}
	seen := map[string]bool{}
	for _, m := range v.Metrics {
		key := m.ProviderID + "\x00" + m.AccountID + "\x00" + m.ID + "\x00" + m.WindowID
		if !validText(m.ProviderID, true) || !validText(m.AccountID, true) || !validText(m.ID, true) || !validText(m.Label, true) || !validText(m.Kind, true) || !validText(m.Scope, true) || !validText(m.Authority, true) || !validText(m.SourceDetail, true) || !validText(m.Coverage, true) || m.ObservedAt.IsZero() || seen[key] {
			return fmt.Errorf("%w: metric identity", ErrInvalid)
		}
		a, ok := accounts[m.AccountID]
		if !ok || a.ProviderID != m.ProviderID {
			return fmt.Errorf("%w: unknown account", ErrInvalid)
		}
		seen[key] = true
		for _, n := range []*float64{m.Used, m.Limit, m.Remaining, m.UsedPercent} {
			if n != nil && (math.IsNaN(*n) || math.IsInf(*n, 0)) {
				return fmt.Errorf("%w: non-finite quantity", ErrInvalid)
			}
		}
		switch m.Authority {
		case "official_api", "official_cli", "local_observation", "local_estimate", "internal_api":
		default:
			return fmt.Errorf("%w: authority", ErrInvalid)
		}
		switch m.LimitKind {
		case "finite", "unlimited", "unknown":
		default:
			return fmt.Errorf("%w: limit kind", ErrInvalid)
		}
	}
	return nil
}
