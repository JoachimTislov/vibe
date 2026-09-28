package provider

import (
	"context"
	"time"
)

type DiscoveryStatus string

const (
	StatusReady              DiscoveryStatus = "ready"
	StatusNotDetected        DiscoveryStatus = "not_detected"
	StatusNeedsAuth          DiscoveryStatus = "needs_auth"
	StatusPermissionRequired DiscoveryStatus = "permission_required"
	StatusUnsupported        DiscoveryStatus = "unsupported"
	StatusError              DiscoveryStatus = "error"
)

type Discovery struct {
	ProviderID   string          `json:"provider_id"`
	ProviderName string          `json:"provider_name"`
	Status       DiscoveryStatus `json:"status"`
	Message      string          `json:"message,omitempty"`
	DashboardURL string          `json:"dashboard_url,omitempty"`
}

type Source string

const (
	SourceOfficialAPI      Source = "official_api"
	SourceOfficialCLI      Source = "official_cli"
	SourceLocalObservation Source = "local_observation"
	SourceLocalEstimate    Source = "local_estimate"
	SourceDemo             Source = "demo"
)

type Metric struct {
	ProviderID     string     `json:"provider_id"`
	ProviderName   string     `json:"provider_name"`
	AccountID      string     `json:"account_id"`
	AccountLabel   string     `json:"account_label,omitempty"`
	MetricID       string     `json:"metric_id"`
	Label          string     `json:"label"`
	Kind           string     `json:"kind"`
	Scope          string     `json:"scope"`
	Unit           string     `json:"unit,omitempty"`
	Used           *float64   `json:"used,omitempty"`
	Limit          *float64   `json:"limit,omitempty"`
	Remaining      *float64   `json:"remaining,omitempty"`
	UsedPercent    *float64   `json:"used_percent,omitempty"`
	LimitKind      string     `json:"limit_kind"`
	WindowID       string     `json:"window_id,omitempty"`
	WindowStart    *time.Time `json:"window_start,omitempty"`
	ResetsAt       *time.Time `json:"resets_at,omitempty"`
	Source         Source     `json:"source"`
	SourceDetail   string     `json:"source_detail,omitempty"`
	Coverage       string     `json:"coverage,omitempty"`
	BackendID      string     `json:"backend_id,omitempty"`
	BackendVersion string     `json:"backend_version,omitempty"`
	ObservedAt     time.Time  `json:"observed_at"`
	FetchedAt      time.Time  `json:"fetched_at"`
	StaleAt        *time.Time `json:"stale_at,omitempty"`
	Partial        bool       `json:"partial,omitempty"`
}

type Result struct {
	Discovery Discovery  `json:"discovery"`
	Metrics   []Metric   `json:"metrics"`
	ErrorCode string     `json:"error_code,omitempty"`
	Error     string     `json:"error,omitempty"`
	Attempted time.Time  `json:"attempted_at"`
	Succeeded *time.Time `json:"succeeded_at,omitempty"`
}

type Provider interface {
	ID() string
	Discover(context.Context) (Discovery, error)
	Fetch(context.Context) (Result, error)
}
