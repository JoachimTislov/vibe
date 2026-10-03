package tools

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestWorkspace(t *testing.T) Workspace {
	t.Helper()
	root := t.TempDir()
	w, err := NewWorkspace(root)
	if err != nil {
		t.Fatalf("NewWorkspace: %v", err)
	}
	return w
}

func TestResolveRejectsEscape(t *testing.T) {
	w := newTestWorkspace(t)
	if _, err := w.resolve("../outside"); err == nil {
		t.Error("relative escape accepted")
	}
	if _, err := w.resolve("/etc/passwd"); err == nil {
		t.Error("absolute outside path accepted")
	}
	// Symlink escape.
	outside := filepath.Dir(w.Root)
	link := filepath.Join(w.Root, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	if _, err := w.resolve("escape"); err == nil {
		t.Error("symlink escape accepted")
	}
}

func TestResolveWithin(t *testing.T) {
	w := newTestWorkspace(t)
	got, err := w.resolve("")
	if err != nil || got != w.Root {
		t.Fatalf("empty path: got %q, err %v", got, err)
	}
	sub := filepath.Join(w.Root, "a", "b")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	got, err = w.resolve("a/b/../b/../../a")
	if err != nil {
		t.Fatalf("in-root traversal: %v", err)
	}
	if want := filepath.Join(w.Root, "a"); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestTimeIn(t *testing.T) {
	res, err := TimeIn("Oslo")
	if err != nil {
		t.Fatalf("TimeIn(Oslo): %v", err)
	}
	if res.Timezone != "Europe/Oslo" {
		t.Errorf("timezone = %q, want Europe/Oslo", res.Timezone)
	}
	if res.Date == "" || res.LocalTime == "" || res.Weekday == "" {
		t.Errorf("incomplete result: %+v", res)
	}
	if _, err := TimeIn("Atlantis-of-nowhere"); err == nil {
		t.Error("unknown city accepted")
	}
}

func TestFileTools(t *testing.T) {
	w := newTestWorkspace(t)
	if err := os.WriteFile(filepath.Join(w.Root, "note.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(w.Root, "pkg"), 0o755); err != nil {
		t.Fatal(err)
	}

	res, err := ReadFileIn(w, "note.txt")
	if err != nil || res.Content != "hello" {
		t.Fatalf("read: %+v, err %v", res, err)
	}
	if _, err := ReadFileIn(w, "../etc/passwd"); err == nil {
		t.Error("escape read accepted")
	}

	ls, err := ListDirIn(w, "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	names := map[string]bool{}
	for _, e := range ls.Entries {
		names[e.Name] = true
	}
	if !names["note.txt"] || !names["pkg"] {
		t.Errorf("list missing entries: %+v", ls.Entries)
	}
}

func TestGitSummaryIn(t *testing.T) {
	w := newTestWorkspace(t)
	repo := filepath.Join(w.Root, "repo")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) {
		t.Helper()
		if out, err := runGitIn(w, "repo", args...); err != nil {
			t.Fatalf("git %v: %v (%s)", args, err, out)
		}
	}
	run("init", "-q", "-b", "main")
	run("config", "user.email", "t@example.com")
	run("config", "user.name", "T")
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "f.txt")
	run("commit", "-q", "-m", "init")

	// Dirty before commit, clean after; summary reflects both.
	res, err := GitSummaryIn(w, "repo")
	if err != nil {
		t.Fatalf("GitSummaryIn: %v", err)
	}
	if !res.Clean || res.Branch != "main" {
		t.Errorf("unexpected summary: %+v", res)
	}
	if len(res.RecentLog) != 1 || !strings.Contains(res.RecentLog[0], "init") {
		t.Errorf("unexpected log: %v", res.RecentLog)
	}

	if err := os.WriteFile(filepath.Join(repo, "g.txt"), []byte("y"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err = GitSummaryIn(w, "repo")
	if err != nil {
		t.Fatalf("GitSummaryIn dirty: %v", err)
	}
	if res.Clean || len(res.Status) != 1 {
		t.Errorf("expected dirty summary: %+v", res)
	}
}

func TestRunShellIn(t *testing.T) {
	w := newTestWorkspace(t)
	res, err := RunShellIn(w, "echo hello")
	if err != nil {
		t.Fatalf("RunShellIn: %v", err)
	}
	if res.Output != "hello" || res.ExitCode != 0 {
		t.Errorf("unexpected result: %+v", res)
	}
	if !strings.HasPrefix(res.Command, "echo") {
		t.Errorf("command not echoed: %+v", res)
	}
	if _, err := RunShellIn(w, "  "); err == nil {
		t.Error("empty command accepted")
	}
}

func TestClockSeam(t *testing.T) {
	// The clockTime seam lets tests pin time deterministically.
	old := clockTime
	defer func() { clockTime = old }()
	clockTime = func() time.Time { return time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC) }
	res, err := TimeIn("UTC")
	if err != nil {
		t.Fatal(err)
	}
	if res.Date != "2026-10-03" || res.Weekday != "Saturday" {
		t.Errorf("pinned clock wrong: %+v", res)
	}
}
