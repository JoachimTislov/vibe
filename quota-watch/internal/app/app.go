package app

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

func Run(ctx context.Context, logger *slog.Logger) error {
	return RunWithService(ctx, logger, NewDemoService(time.Now))
}

func RunWithService(ctx context.Context, logger *slog.Logger, service Service) error {
	return RunWithServiceAt(ctx, logger, "127.0.0.1:7331", service)
}

// RunWithServiceAt serves the local dashboard on the configured loopback address.
func RunWithServiceAt(ctx context.Context, logger *slog.Logger, address string, service Service) error {
	server := &http.Server{
		Addr:              address,
		Handler:           NewHandler(service),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	logger.Info("dashboard available", "url", "http://"+address)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("serve dashboard: %w", err)
	}
	return nil
}
