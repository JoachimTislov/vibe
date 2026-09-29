package sourceprotocol

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type Manifest struct {
	ID              string   `json:"id"`
	ProtocolVersion string   `json:"protocol_version"`
	Executable      string   `json:"executable"`
	Args            []string `json:"args,omitempty"`
	Priority        int      `json:"priority,omitempty"`
}

func LoadManifests(dir string) ([]Manifest, error) {
	st, e := os.Stat(dir)
	if errors.Is(e, os.ErrNotExist) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	if !st.IsDir() || st.Mode().Perm()&0022 != 0 {
		return nil, fmt.Errorf("unsafe manifest directory permissions")
	}
	ents, e := os.ReadDir(dir)
	if e != nil {
		return nil, e
	}
	var out []Manifest
	seen := map[string]bool{}
	for _, ent := range ents {
		if ent.IsDir() || filepath.Ext(ent.Name()) != ".json" {
			continue
		}
		p := filepath.Join(dir, ent.Name())
		st, e = os.Lstat(p)
		if e != nil {
			return nil, e
		}
		if st.Mode()&os.ModeSymlink != 0 || st.Mode().Perm()&0077 != 0 {
			return nil, fmt.Errorf("unsafe manifest permissions: %s", ent.Name())
		}
		b, e := os.ReadFile(p)
		if e != nil {
			return nil, e
		}
		var m Manifest
		d := json.NewDecoder(strings.NewReader(string(b)))
		d.DisallowUnknownFields()
		if e = d.Decode(&m); e != nil {
			return nil, fmt.Errorf("manifest %s: %w", ent.Name(), e)
		}
		if d.Decode(&struct{}{}) != io.EOF {
			return nil, fmt.Errorf("manifest %s: trailing data", ent.Name())
		}
		if !validIdentifier(m.ID) || m.ProtocolVersion != Version || !filepath.IsAbs(m.Executable) || filepath.Clean(m.Executable) != m.Executable || seen[m.ID] || len(m.Args) > 32 {
			return nil, fmt.Errorf("invalid or duplicate manifest: %s", ent.Name())
		}
		for _, a := range m.Args {
			if len(a) > 1024 || strings.ContainsRune(a, 0) {
				return nil, fmt.Errorf("invalid manifest argument")
			}
		}
		ex, e := os.Stat(m.Executable)
		if e != nil || !ex.Mode().IsRegular() || ex.Mode().Perm()&0111 == 0 || ex.Mode().Perm()&0022 != 0 {
			return nil, fmt.Errorf("unsafe executable for %s", m.ID)
		}
		if runtime.GOOS != "windows" && stUid(ex) != 0 && stUid(st) != stUid(ex) {
			return nil, fmt.Errorf("manifest and executable owners differ")
		}
		seen[m.ID] = true
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Priority != out[j].Priority {
			return out[i].Priority > out[j].Priority
		}
		return out[i].ID < out[j].ID
	})
	return out, nil
}

func validIdentifier(s string) bool {
	if s == "" || len(s) > 128 {
		return false
	}
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.') {
			return false
		}
	}
	return true
}
