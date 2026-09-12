// Package observability provides the minimum needed to answer "why did the
// agent do that" after the fact: structured logs with one correlation ID
// threaded from adapter receipt through core dispatch, executor, and reply.
// Deliberately not doing distributed tracing yet — see ARCHITECTURE.md for
// when that becomes worth adding.
package observability

import (
	"context"
	"log/slog"
	"os"
)

type correlationIDKey struct{}

// WithCorrelationID returns a context carrying the given ID (typically a
// conversation_id or task_id) so every log line emitted downstream can
// include it without every function threading it through by hand.
func WithCorrelationID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, correlationIDKey{}, id)
}

func correlationID(ctx context.Context) string {
	if id, ok := ctx.Value(correlationIDKey{}).(string); ok {
		return id
	}
	return ""
}

// NewLogger returns the process-wide structured logger, writing JSON lines
// to stdout. Swap the handler here (e.g. to also write a local file) — this
// is the single construction point.
func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}

// L returns a logger with the context's correlation ID (if any) attached as
// a field, so call sites don't have to remember to add it themselves.
func L(ctx context.Context, logger *slog.Logger) *slog.Logger {
	if id := correlationID(ctx); id != "" {
		return logger.With("correlation_id", id)
	}
	return logger
}
