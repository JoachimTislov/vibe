package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/YOURNAME/agentic-gateway/pkg/adapterapp"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	path := flag.String("config", "config.local.json", "client configuration")
	flag.Parse()
	cfg, err := config.Load(*path)
	if err == nil {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		err = adapterapp.Run(ctx, "telegram", cfg, credentials.Keychain{})
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
