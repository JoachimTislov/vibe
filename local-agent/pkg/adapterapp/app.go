// Package adapterapp wires client-side components for standalone binaries.
package adapterapp

import (
	"context"
	"errors"
	"github.com/YOURNAME/agentic-gateway/pkg/client"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"github.com/YOURNAME/agentic-gateway/pkg/platform"
	"github.com/YOURNAME/agentic-gateway/pkg/runtime"
)

func Run(ctx context.Context, name string, cfg config.Config, store credentials.Store) error {
	var transport platform.Transport
	var err error
	switch name {
	case "slack":
		transport, err = platform.NewSlack(cfg.Slack, store)
	case "telegram":
		transport, err = platform.NewTelegram(cfg.Telegram)
	default:
		return errors.New("unknown platform")
	}
	if err != nil {
		return err
	}
	r, err := runtime.New(ctx, cfg, store)
	if err != nil {
		return err
	}
	defer r.Close()
	c, err := client.Dial(ctx, cfg.Socket, cfg.Principal, name, r)
	if err != nil {
		return err
	}
	defer c.Close()
	return platform.Run(ctx, c, transport)
}
