package unit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/YOURNAME/agentic-gateway/pkg/config"
)

func TestConfigLoadRequiresPrivateRegularFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	data, err := json.Marshal(config.Default())
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := config.Load(path); err == nil {
		t.Fatal("world-readable configuration was accepted")
	}
	if err := os.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := config.Load(path); err != nil {
		t.Fatalf("private configuration was rejected: %v", err)
	}
}

func TestConfigLoadRejectsNonRegularFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config-dir")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := config.Load(path); err == nil {
		t.Fatal("directory configuration was accepted")
	}
}
