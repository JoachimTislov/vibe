// Package manager coordinates provider refreshes and exposes an immutable public snapshot.
package manager

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/local/quota-watch/internal/provider"
	"github.com/local/quota-watch/internal/store"
)

type RefreshState struct {
	Running      bool       `json:"running"`
	Queued       bool       `json:"queued"`
	LastStarted  *time.Time `json:"last_started,omitempty"`
	LastFinished *time.Time `json:"last_finished,omitempty"`
}
type State struct {
	SchemaVersion int               `json:"schema_version"`
	GeneratedAt   time.Time         `json:"generated_at"`
	Mode          string            `json:"mode"`
	Results       []provider.Result `json:"providers"`
	Refresh       RefreshState      `json:"refresh"`
	CacheWarning  string            `json:"cache_warning,omitempty"`
}
type Options struct {
	Providers                  []provider.Provider
	Store                      store.Store
	Logger                     *slog.Logger
	Mode                       string
	Interval, OperationTimeout time.Duration
	Concurrency                int
	Clock                      func() time.Time
}
type Manager struct {
	providers         []provider.Provider
	store             store.Store
	logger            *slog.Logger
	mode              string
	interval, timeout time.Duration
	concurrency       int
	now               func() time.Time
	mu                sync.RWMutex
	results           []provider.Result
	refresh           RefreshState
	cacheWarning      string
	requests          chan struct{}
	once              sync.Once
}

func New(o Options) (*Manager, error) {
	if len(o.Providers) == 0 {
		return nil, errors.New("at least one provider is required")
	}
	seen := map[string]bool{}
	for _, p := range o.Providers {
		if p == nil || p.ID() == "" || seen[p.ID()] {
			return nil, fmt.Errorf("provider IDs must be nonempty and unique")
		}
		seen[p.ID()] = true
	}
	if o.Store == nil {
		o.Store = store.NewMemory(nil)
	}
	if o.Logger == nil {
		o.Logger = slog.New(slog.NewTextHandler(discardWriter{}, nil))
	}
	if o.Interval <= 0 {
		o.Interval = 2 * time.Minute
	}
	if o.OperationTimeout <= 0 {
		o.OperationTimeout = 20 * time.Second
	}
	if o.Concurrency <= 0 {
		o.Concurrency = 3
	}
	if o.Clock == nil {
		o.Clock = time.Now
	}
	if o.Mode == "" {
		o.Mode = "normal"
	}
	return &Manager{providers: append([]provider.Provider(nil), o.Providers...), store: o.Store, logger: o.Logger, mode: o.Mode, interval: o.Interval, timeout: o.OperationTimeout, concurrency: o.Concurrency, now: o.Clock, requests: make(chan struct{}, 1)}, nil
}

type discardWriter struct{}

func (discardWriter) Write(p []byte) (int, error) { return len(p), nil }

// Start returns immediately. It loads cached state and performs refreshes in background.
func (m *Manager) Start(ctx context.Context) { m.once.Do(func() { go m.run(ctx) }) }

// RequestRefresh queues at most one additional refresh. It never waits for providers.
func (m *Manager) RequestRefresh() bool {
	select {
	case m.requests <- struct{}{}:
		m.mu.Lock()
		m.refresh.Queued = true
		m.mu.Unlock()
		return true
	default:
		return false
	}
}
func (m *Manager) State() State {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r := clone(m.results)
	return State{SchemaVersion: 1, GeneratedAt: m.now().UTC(), Mode: m.mode, Results: r, Refresh: m.refresh, CacheWarning: m.cacheWarning}
}

func (m *Manager) run(ctx context.Context) {
	if cached, err := m.store.Latest(ctx); err == nil {
		m.mu.Lock()
		m.results = clone(cached)
		m.mu.Unlock()
	} else {
		m.mu.Lock()
		m.cacheWarning = "cached snapshot unavailable"
		m.mu.Unlock()
		m.logger.Warn("cache load failed", "error", err)
	}
	m.RequestRefresh()
	timer := time.NewTicker(m.interval)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			m.RequestRefresh()
		case <-m.requests:
			m.refreshAll(ctx)
		}
	}
}
func (m *Manager) refreshAll(parent context.Context) {
	started := m.now().UTC()
	m.mu.Lock()
	m.refresh.Running = true
	m.refresh.Queued = false
	m.refresh.LastStarted = &started
	m.mu.Unlock()
	type item struct {
		id string
		r  provider.Result
	}
	out := make(chan item, len(m.providers))
	sem := make(chan struct{}, m.concurrency)
	var wg sync.WaitGroup
	for _, p := range m.providers {
		wg.Add(1)
		go func(p provider.Provider) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-parent.Done():
				return
			}
			defer func() { <-sem }()
			ctx, cancel := context.WithTimeout(parent, m.timeout)
			defer cancel()
			r, err := p.Fetch(ctx)
			if r.Discovery.ProviderID == "" {
				r.Discovery.ProviderID = p.ID()
			}
			if r.Attempted.IsZero() {
				r.Attempted = m.now().UTC()
			}
			if err != nil {
				r.ErrorCode = "refresh_failed"
				r.Error = "refresh failed"
			}
			out <- item{id: p.ID(), r: r}
		}(p)
	}
	wg.Wait()
	close(out)
	m.mu.Lock()
	byID := map[string]provider.Result{}
	for _, r := range m.results {
		byID[r.Discovery.ProviderID] = r
	}
	for x := range out {
		old := byID[x.id]
		if x.r.ErrorCode != "" && len(old.Metrics) > 0 {
			x.r.Metrics = old.Metrics
			x.r.Succeeded = old.Succeeded
		}
		byID[x.id] = x.r
	}
	next := make([]provider.Result, 0, len(byID))
	for _, r := range byID {
		next = append(next, r)
	}
	sort.Slice(next, func(i, j int) bool { return next[i].Discovery.ProviderID < next[j].Discovery.ProviderID })
	m.results = next
	finished := m.now().UTC()
	m.refresh.Running = false
	m.refresh.LastFinished = &finished
	m.mu.Unlock()
	if err := m.store.Save(parent, next); err != nil {
		m.mu.Lock()
		m.cacheWarning = "snapshot could not be saved"
		m.mu.Unlock()
		m.logger.Warn("cache save failed", "error", err)
	}
}
func clone(in []provider.Result) []provider.Result {
	out := make([]provider.Result, len(in))
	for i := range in {
		out[i] = in[i]
		out[i].Metrics = append([]provider.Metric(nil), in[i].Metrics...)
	}
	return out
}
