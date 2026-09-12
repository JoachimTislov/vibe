package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// EnsureTelegramProfile creates only a missing non-secret CLI config. The
// selected CLI creates and owns authentication/session state during login.
func EnsureTelegramProfile(path string) error {
	if !filepath.IsAbs(path) {
		return errors.New("Telegram profile path must be absolute")
	}
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return errors.New("Telegram profile must be a regular file")
		}
		if info.Mode().Perm()&0077 != 0 {
			return errors.New("Telegram profile must be private (mode 0600)")
		}
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	info, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if info.Mode().Perm()&0077 != 0 {
		return errors.New("new Telegram profile requires a private directory (mode 0700)")
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	quoted, _ := json.Marshal(dir)
	_, writeErr := fmt.Fprintf(f, "config_directory = %s;\nlog_level = 0;\n", quoted)
	return errors.Join(writeErr, f.Close())
}
