package manager

import (
	"context"
	"github.com/local/quota-watch/internal/provider"
	"github.com/local/quota-watch/internal/store"
	"sync/atomic"
	"testing"
	"time"
)

type blockingProvider struct {
	started chan struct{}
	release chan struct{}
	calls   atomic.Int32
}

func (p *blockingProvider) ID() string { return "block" }
func (p *blockingProvider) Discover(context.Context) (provider.Discovery, error) {
	return provider.Discovery{}, nil
}
func (p *blockingProvider) Fetch(ctx context.Context) (provider.Result, error) {
	p.calls.Add(1)
	select {
	case p.started <- struct{}{}:
	default:
	}
	select {
	case <-p.release:
	case <-ctx.Done():
		return provider.Result{}, ctx.Err()
	}
	now := time.Now()
	return provider.Result{Discovery: provider.Discovery{ProviderID: "block"}, Succeeded: &now}, nil
}
func TestRefreshRequestsCoalesce(t *testing.T) {
	p := &blockingProvider{started: make(chan struct{}, 2), release: make(chan struct{}, 2)}
	m, err := New(Options{Providers: []provider.Provider{p}, Store: store.NewMemory(nil), Interval: time.Hour, OperationTimeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m.Start(ctx)
	select {
	case <-p.started:
	case <-time.After(time.Second):
		t.Fatal("initial refresh did not start")
	}
	if !m.RequestRefresh() {
		t.Fatal("first queued request rejected")
	}
	if m.RequestRefresh() {
		t.Fatal("duplicate request was not coalesced")
	}
	p.release <- struct{}{}
	select {
	case <-p.started:
	case <-time.After(time.Second):
		t.Fatal("queued refresh did not run")
	}
	p.release <- struct{}{}
}
