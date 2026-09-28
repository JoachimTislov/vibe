package config

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"
)

type Config struct {
	Listen           string
	CachePath        string
	Demo             bool
	RefreshInterval  time.Duration
	OperationTimeout time.Duration
	Concurrency      int
}

func Defaults() Config {
	cache, err := os.UserCacheDir()
	if err != nil {
		cache = os.TempDir()
	}
	return Config{Listen: "127.0.0.1:7331", CachePath: filepath.Join(cache, "quota-watch", "snapshot.json"), RefreshInterval: 2 * time.Minute, OperationTimeout: 20 * time.Second, Concurrency: 3}
}
func Parse(args []string, stderr io.Writer) (Config, error) {
	c := Defaults()
	fs := flag.NewFlagSet("quota-watch", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&c.Listen, "listen", c.Listen, "loopback address for the dashboard")
	fs.StringVar(&c.CachePath, "cache", c.CachePath, "snapshot cache path (empty disables disk cache)")
	fs.BoolVar(&c.Demo, "demo", false, "use synthetic data without discovery, credentials, or network")
	fs.DurationVar(&c.RefreshInterval, "refresh-interval", c.RefreshInterval, "background refresh interval")
	fs.DurationVar(&c.OperationTimeout, "operation-timeout", c.OperationTimeout, "per-provider operation timeout")
	fs.IntVar(&c.Concurrency, "concurrency", c.Concurrency, "maximum concurrent provider operations")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if fs.NArg() != 0 {
		return Config{}, fmt.Errorf("unexpected arguments: %v", fs.Args())
	}
	if c.RefreshInterval <= 0 || c.OperationTimeout <= 0 || c.Concurrency < 1 {
		return Config{}, errors.New("intervals must be positive and concurrency must be at least one")
	}
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil {
		return Config{}, fmt.Errorf("invalid listen address: %w", err)
	}
	if host != "localhost" {
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			return Config{}, errors.New("listen address must be loopback-only")
		}
	}
	return c, nil
}
