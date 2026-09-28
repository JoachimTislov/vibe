package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/local/quota-watch/internal/app"
	"github.com/local/quota-watch/internal/config"
	"github.com/local/quota-watch/internal/discovery"
	"github.com/local/quota-watch/internal/manager"
	"github.com/local/quota-watch/internal/provider"
	"github.com/local/quota-watch/internal/providers/demo"
	"github.com/local/quota-watch/internal/store"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	cfg, err := config.Parse(os.Args[1:], os.Stderr)
	if err != nil {
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	providers := discovery.Providers(discovery.IntegrationOptions{})
	mode := "normal"
	if cfg.Demo {
		providers = []provider.Provider{demo.New()}
		mode = "demo"
	}
	var snapshots store.Store = store.NewMemory(nil)
	if cfg.CachePath != "" {
		snapshots = store.NewJSONFile(cfg.CachePath)
	}
	mgr, err := manager.New(manager.Options{Providers: providers, Store: snapshots, Logger: logger, Mode: mode, Interval: cfg.RefreshInterval, OperationTimeout: cfg.OperationTimeout, Concurrency: cfg.Concurrency})
	if err != nil {
		logger.Error("configure quota-watch", "error", err)
		os.Exit(2)
	}
	mgr.Start(ctx)
	if err := app.RunWithServiceAt(ctx, logger, cfg.Listen, serviceAdapter{manager: mgr}); err != nil {
		logger.Error("quota-watch stopped", "error", err)
		os.Exit(1)
	}
}

type serviceAdapter struct{ manager *manager.Manager }

func (a serviceAdapter) State(context.Context) (app.State, error) {
	s := a.manager.State()
	return app.State{SchemaVersion: "1", GeneratedAt: s.GeneratedAt, Mode: s.Mode, Refreshing: s.Refresh.Running, Providers: s.Results}, nil
}
func (a serviceAdapter) RequestRefresh(context.Context) (app.RefreshState, error) {
	accepted := a.manager.RequestRefresh()
	return app.RefreshState{Accepted: accepted, Coalesced: !accepted, Requested: time.Now().UTC()}, nil
}
