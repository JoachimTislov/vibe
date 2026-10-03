package tools

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteAndDeleteFile(t *testing.T) {
	w := newTestWorkspace(t)
	res, err := WriteFileIn(w, "robots/grocery.sh", "#!/bin/sh\necho offers\n")
	if err != nil || res.Bytes != 22 {
		t.Fatalf("write: %+v err %v", res, err)
	}
	raw, err := os.ReadFile(filepath.Join(w.Root, "robots", "grocery.sh"))
	if err != nil || string(raw) != "#!/bin/sh\necho offers\n" {
		t.Fatalf("content = %q err %v", raw, err)
	}
	if _, err := WriteFileIn(w, "../escape.txt", "x"); err == nil {
		t.Error("escape write accepted")
	}
	if _, err := WriteFileIn(w, "", strings.Repeat("x", maxWriteBytes+1)); err == nil {
		t.Error("oversized write accepted")
	}
	if _, err := DeletePathIn(w, ""); err == nil {
		t.Error("workspace root delete accepted")
	}
	del, err := DeletePathIn(w, "robots")
	if err != nil || !strings.HasPrefix(del.Deleted, w.Root) {
		t.Fatalf("delete: %+v err %v", del, err)
	}
	if _, err := os.Stat(filepath.Join(w.Root, "robots")); !os.IsNotExist(err) {
		t.Error("robots dir still exists")
	}
}

func TestProcessLifecycle(t *testing.T) {
	w := newTestWorkspace(t)
	started, err := StartProcessIn(w, "sleeper", "sleep 60")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if started.PID <= 0 {
		t.Fatalf("bad pid: %+v", started)
	}

	list, err := ListProcessesIn(w, "")
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, p := range list.Agent {
		if p.Name == "sleeper" && p.Running {
			found = true
		}
	}
	if !found {
		t.Fatalf("sleeper not listed as running: %+v", list.Agent)
	}

	if _, err := StartProcessIn(w, "sleeper", "sleep 30"); err == nil {
		t.Error("duplicate name accepted while running")
	}

	stopped, err := StopProcessIn(w, "sleeper")
	if err != nil || stopped.Name != "sleeper" {
		t.Fatalf("stop: %+v err %v", stopped, err)
	}
	if pidAlive(started.PID) {
		t.Error("process still alive after stop")
	}
	if _, err := StopProcessIn(w, "sleeper"); err == nil {
		t.Error("stopping a stopped process succeeded")
	}
}

func TestWebFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head><title>Offers</title></head><body>
		<a href="/week/42">Week 42</a><a href="https://example.com/x">External</a>
		<div class="offer">Kiwi 19 kr</div><div class="offer">Melk 15 kr</div>
		</body></html>`))
	}))
	defer srv.Close()

	res, err := WebFetchIn(nil, srv.URL, "")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if res.Status != 200 || res.Title != "Offers" {
		t.Errorf("status/title: %+v", res)
	}
	if !strings.Contains(res.Text, "Kiwi 19 kr") {
		t.Errorf("text missing offer: %q", res.Text)
	}
	if len(res.Links) != 2 {
		t.Errorf("links = %v", res.Links)
	}

	sel, err := WebFetchIn(nil, srv.URL, ".offer")
	if err != nil {
		t.Fatal(err)
	}
	if sel.Text != "Kiwi 19 kr\n---\nMelk 15 kr" {
		t.Errorf("selector text = %q", sel.Text)
	}

	if _, err := WebFetchIn(nil, "ftp://example.com/x", ""); err == nil {
		t.Error("non-http scheme accepted")
	}
	if _, err := WebFetchIn(nil, "not a url", ""); err == nil {
		t.Error("invalid url accepted")
	}
}

func TestWebFetchPlainText(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("kiwi=19\nmelk=15\n"))
	}))
	defer srv.Close()
	res, err := WebFetchIn(nil, srv.URL, "")
	if err != nil {
		t.Fatal(err)
	}
	if res.Text != "kiwi=19\nmelk=15" {
		t.Errorf("plain text = %q", res.Text)
	}
}

func TestJournalRecordAndQuery(t *testing.T) {
	w := newTestWorkspace(t)
	j, err := OpenJournal(w)
	if err != nil {
		t.Fatal(err)
	}
	j.Record("agent", "get_time", map[string]any{"city": "Oslo"}, map[string]any{"time": "10:00"}, nil)
	j.Record("mcp", "run_command", map[string]any{"command": "boom"}, nil, errFake)

	entries, err := j.Query(JournalQuery{Last: 10})
	if err != nil || len(entries) != 2 {
		t.Fatalf("query: %v err %v", entries, err)
	}
	if entries[0].Tool != "run_command" || entries[0].OK {
		t.Errorf("newest first broken: %+v", entries[0])
	}
	only, _ := j.Query(JournalQuery{Tool: "get_time"})
	if len(only) != 1 || only[0].Origin != "agent" {
		t.Errorf("tool filter: %+v", only)
	}
	errs, _ := j.Query(JournalQuery{ErrorsOnly: true})
	if len(errs) != 1 || !strings.Contains(errs[0].Error, "boom") {
		t.Errorf("errors filter: %+v", errs)
	}
	stats := j.Stats()
	if stats.Total != 2 || stats.Errors != 1 || stats.Last24h != 2 {
		t.Errorf("stats: %+v", stats)
	}
}

var errFake = &fakeError{"boom"}

type fakeError struct{ msg string }

func (e *fakeError) Error() string { return e.msg }
