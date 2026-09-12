package main

import (
	"context"
	"flag"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"github.com/YOURNAME/agentic-gateway/pkg/mcpfront"
	"github.com/YOURNAME/agentic-gateway/pkg/runtime"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	path := flag.String("config", "config.local.json", "client configuration")
	flag.Parse()
	cfg, err := config.Load(*path)
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	r, err := runtime.New(ctx, cfg, credentials.Keychain{})
	if err != nil {
		log.Fatal(err)
	}
	defer r.Close()
	if err = mcpfront.New(cfg, r).Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(err)
	}
}
