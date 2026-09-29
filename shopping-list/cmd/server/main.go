package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/example/shopping-list/internal/agents"
	"github.com/example/shopping-list/internal/httpserver"
	"github.com/example/shopping-list/internal/integrations/discount"
	"github.com/example/shopping-list/internal/integrations/mistral"
	store "github.com/example/shopping-list/internal/store/sqlite"
	webui "github.com/example/shopping-list/web"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	addr := env("LISTEN_ADDR", "127.0.0.1:8080")
	dbPath := env("DATABASE_PATH", "data/shopping.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o750); err != nil {
		return err
	}
	repo, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer repo.Close()
	fallback := agents.HistoryProfiler{}
	planner := mistral.New(os.Getenv("MISTRAL_API_KEY"), os.Getenv("MISTRAL_MODEL"), os.Getenv("MISTRAL_BASE_URL"), fallback)
	sources := split(os.Getenv("DISCOUNT_SOURCES"))
	finder, err := discount.New(sources)
	if err != nil {
		return err
	}
	apiHandler := httpserver.NewAPI(repo, planner, finder)
	mux := http.NewServeMux()
	mux.Handle("/shopping.v1.ShoppingService/", apiHandler)
	static, _ := fs.Sub(webui.Files, ".")
	mux.Handle("/", http.FileServerFS(static))
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	slog.Info("listening", "address", addr)
	err = srv.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func split(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	var out []string
	for _, x := range strings.Split(v, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}
