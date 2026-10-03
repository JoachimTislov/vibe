package tools

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Workspace is the root directory all file operations resolve against.
type Workspace struct {
	Root string
}

// DefaultWorkspace returns the workspace root: $AGENT_WORKSPACE if set,
// otherwise $HOME/projects.
func DefaultWorkspace() (Workspace, error) {
	if root := os.Getenv("AGENT_WORKSPACE"); root != "" {
		return NewWorkspace(root)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return Workspace{}, err
	}
	return NewWorkspace(filepath.Join(home, "projects"))
}

// NewWorkspace validates and canonicalizes a workspace root.
func NewWorkspace(root string) (Workspace, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return Workspace{}, err
	}
	info, err := os.Stat(abs)
	if err != nil {
		return Workspace{}, err
	}
	if !info.IsDir() {
		return Workspace{}, fmt.Errorf("workspace %s is not a directory", abs)
	}
	return Workspace{Root: abs}, nil
}

// resolve maps a user-supplied path to an absolute path inside the
// workspace. Empty means the workspace root. Paths that escape the root,
// including through symlinks, are rejected.
func (w Workspace) resolve(p string) (string, error) {
	if p == "" {
		return w.Root, nil
	}
	abs := p
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(w.Root, p)
	}
	abs = filepath.Clean(abs)

	// Collapse symlinks before the containment check: on the path itself
	// if it exists, otherwise on the deepest existing ancestor.
	real := abs
	if _, err := os.Lstat(real); err == nil {
		if r, err := filepath.EvalSymlinks(real); err == nil {
			real = r
		}
	} else if _, err := os.Lstat(filepath.Dir(real)); err == nil {
		if r, err := filepath.EvalSymlinks(filepath.Dir(real)); err == nil {
			real = filepath.Join(r, filepath.Base(real))
		}
	}

	rel, err := filepath.Rel(w.Root, real)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, "../") {
		return "", fmt.Errorf("path %q is outside the workspace", p)
	}
	return real, nil
}

// clockTime is a seam for tests; production uses time.Now.
var clockTime = time.Now
