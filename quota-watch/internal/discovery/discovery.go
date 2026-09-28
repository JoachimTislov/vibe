package discovery

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Executable struct{ Name, Path string }

// FindExecutables resolves only explicitly named programs and rejects relative,
// current-directory and symlink-to-non-file results.
func FindExecutables(names ...string) []Executable {
	var found []Executable
	for _, name := range names {
		if name == "" || filepath.Base(name) != name || strings.ContainsAny(name, `/\\`) {
			continue
		}
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		path, err = filepath.Abs(path)
		if err != nil {
			continue
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() || info.Mode()&0111 == 0 {
			continue
		}
		cwd, _ := os.Getwd()
		rel, err := filepath.Rel(cwd, path)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		found = append(found, Executable{Name: name, Path: path})
	}
	return found
}

func NamedEnv(lookup func(string) (string, bool), names ...string) map[string]bool {
	r := make(map[string]bool, len(names))
	for _, n := range names {
		v, ok := lookup(n)
		r[n] = ok && strings.TrimSpace(v) != ""
	}
	return r
}
