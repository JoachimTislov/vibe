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
