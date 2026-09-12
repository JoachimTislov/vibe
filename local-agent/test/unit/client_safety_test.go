package unit

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/YOURNAME/agentic-gateway/pkg/client"
)

func TestClientRejectsInsecureSocketDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "socket")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	_, err := client.Dial(context.Background(), filepath.Join(dir, "core.sock"), "default", "test", nil)
	if err == nil {
		t.Fatal("client accepted an insecure core socket directory")
	}
}
