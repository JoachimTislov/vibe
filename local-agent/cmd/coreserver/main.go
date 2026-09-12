package main

import (
	"context"
	"flag"
	"github.com/YOURNAME/agentic-gateway/internal/core"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	socket := flag.String("socket", filepath.Join(os.TempDir(), "agentic-gateway", "core.sock"), "private Unix socket")
	principal := flag.String("principal", "default", "allowed principal ID")
	timeout := flag.Duration("request-timeout", 5*time.Minute, "total request deadline")
	approval := flag.Duration("approval-timeout", 2*time.Minute, "approval deadline")
	flag.Parse()
	if *principal == "" {
		log.Fatal("principal must not be empty")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	srv := core.NewAgentServer(core.NewSingleUserResolver(*principal), core.Options{RequestTimeout: *timeout, ApprovalTimeout: *approval})
	if err := core.Listen(ctx, *socket, srv); err != nil {
		log.Fatal(err)
	}
}
