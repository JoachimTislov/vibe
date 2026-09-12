package core

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestListenRejectsInsecureSocketDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "socket")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	err := Listen(context.Background(), filepath.Join(dir, "core.sock"), NewAgentServer(NewSingleUserResolver("default"), Options{}))
	if !errors.Is(err, errPrivateSocketDirectory) {
		t.Fatalf("unexpected error: %v", err)
	}
}
