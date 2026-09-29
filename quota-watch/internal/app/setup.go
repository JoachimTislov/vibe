package app

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/local/quota-watch/internal/catalog"
	"github.com/local/quota-watch/internal/integrations"
)

// SetupService is an optional extension. Existing Service implementations remain valid.
type SetupService interface {
	Catalog(context.Context) (catalog.Catalogue, error)
	ScanIntegrations(context.Context) (ScanState, error)
	Integrations(context.Context) (integrations.Report, error)
	IntegrationPlan(context.Context, string) (integrations.Plan, error)
}

type ScanState struct {
	JobID     string              `json:"job_id"`
	Accepted  bool                `json:"accepted"`
	Coalesced bool                `json:"coalesced"`
	Report    integrations.Report `json:"report"`
}

type localSetup struct {
	mu      sync.Mutex
	scanner *integrations.Scanner
	report  integrations.Report
	last    time.Time
	jobs    uint64
}

func newLocalSetup() *localSetup                                         { return &localSetup{scanner: integrations.NewScanner()} }
func (s *localSetup) Catalog(context.Context) (catalog.Catalogue, error) { return catalog.TierA(), nil }
func (s *localSetup) ScanIntegrations(context.Context) (ScanState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	coalesced := !s.last.IsZero() && now.Sub(s.last) < time.Second
	if !coalesced {
		s.report = s.scanner.Scan()
		s.last = now
		s.jobs++
	}
	return ScanState{JobID: fmt.Sprintf("scan-%d", s.jobs), Accepted: !coalesced, Coalesced: coalesced, Report: s.report}, nil
}
func (s *localSetup) Integrations(context.Context) (integrations.Report, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.report.ScannedAt.IsZero() {
		s.report = s.scanner.Scan()
		s.last = time.Now()
		s.jobs++
	}
	return s.report, nil
}
func (s *localSetup) IntegrationPlan(_ context.Context, id string) (integrations.Plan, error) {
	if p, ok := s.scanner.Plan(id); ok {
		return p, nil
	}
	return integrations.Plan{}, fmt.Errorf("unknown integration")
}
