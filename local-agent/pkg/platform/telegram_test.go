package platform

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/YOURNAME/agentic-gateway/pkg/config"
)

func TestNewTelegramRejectsRelativeProfile(t *testing.T) {
	_, err := NewTelegram(config.Telegram{UserID: 42, ConfigFile: "relative/config", Peers: []string{"user:42"}})
	if err == nil {
		t.Fatal("relative Telegram profile path was accepted")
	}
}

func TestNewTelegramRejectsInsecureExistingProfile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(path, []byte("config_directory = \"/tmp\";\n"), 0644); err != nil {
		t.Fatal(err)
	}
	_, err := NewTelegram(config.Telegram{UserID: 42, ConfigFile: path, Peers: []string{"user:42"}})
	if err == nil {
		t.Fatal("insecure Telegram profile was accepted")
	}
}

func TestNewTelegramRejectsInsecureProfileDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "profile")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, []byte("config_directory = \"/tmp\";\n"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := NewTelegram(config.Telegram{UserID: 42, ConfigFile: path, Peers: []string{"user:42"}})
	if err == nil {
		t.Fatal("Telegram profile in an insecure directory was accepted")
	}
}
