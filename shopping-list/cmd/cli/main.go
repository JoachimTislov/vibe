package main

import (
	"context"
	"os"

	"github.com/example/shopping-list/internal/cli"
)

func main() {
	os.Exit((cli.Runner{Out: os.Stdout, Err: os.Stderr}).Run(context.Background(), os.Args[1:]))
}
