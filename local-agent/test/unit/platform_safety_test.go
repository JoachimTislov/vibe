package unit

import (
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/platform"
	"github.com/YOURNAME/agentic-gateway/pkg/runtime"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTelegramTextCannotInjectCommands(t *testing.T) {
	input := "hello\"\nmsg user#123 stolen\nquit\n\\payload\x00"
	quoted := platform.QuoteTelegram(input)
	if strings.ContainsAny(quoted, "\n\r\x00") || !strings.HasPrefix(quoted, `"`) || !strings.HasSuffix(quoted, `"`) || !strings.Contains(quoted, `\"\nmsg`) {
		t.Fatalf("unsafe Telegram command text: %q", quoted)
	}
}

func TestTelegramProfileIsPrivateAndNeverOverwritten(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profile", "config")
	if err := config.EnsureTelegramProfile(path); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	dir, _ := os.Stat(filepath.Dir(path))
	if info.Mode().Perm() != 0600 || dir.Mode().Perm() != 0700 {
		t.Fatal("profile is not private")
	}
	if err := os.WriteFile(path, []byte("existing profile"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := config.EnsureTelegramProfile(path); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != "existing profile" {
		t.Fatal("existing profile overwritten")
	}
}

func TestTelegramProfileRejectsInsecureExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(path, []byte("existing"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := config.EnsureTelegramProfile(path); err == nil {
		t.Fatal("insecure Telegram profile was accepted")
	}
}

func TestTelegramProfileRejectsInsecureExistingDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "profile")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := config.EnsureTelegramProfile(path); err == nil {
		t.Fatal("Telegram profile in an insecure directory was accepted")
	}
}

func TestModelCredentialsRequireSecureEndpoint(t *testing.T) {
	for _, endpoint := range []string{"http://remote.example", "https://user:pass@example.com", "file:///tmp/model", "http://127.0.0.1@evil.example"} {
		if runtime.ValidateEndpoint(endpoint) == nil {
			t.Errorf("unsafe endpoint accepted: %s", endpoint)
		}
	}
	for _, endpoint := range []string{"http://127.0.0.1:11434", "http://[::1]:11434", "https://model.example"} {
		if err := runtime.ValidateEndpoint(endpoint); err != nil {
			t.Errorf("valid endpoint rejected: %s: %v", endpoint, err)
		}
	}
}
