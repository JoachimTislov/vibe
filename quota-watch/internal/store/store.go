package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/local/quota-watch/internal/provider"
)

var ErrCorrupt = errors.New("snapshot cache is corrupt")

// Store persists normalized snapshots independently of provider implementations.
type Store interface {
	Save(context.Context, []provider.Result) error
	Latest(context.Context) ([]provider.Result, error)
}

type Memory struct {
	mu      sync.RWMutex
	results []provider.Result
}

func NewMemory(initial []provider.Result) *Memory { return &Memory{results: clone(initial)} }
func (m *Memory) Save(ctx context.Context, results []provider.Result) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.results = clone(results)
	return nil
}
func (m *Memory) Latest(ctx context.Context) ([]provider.Result, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return clone(m.results), nil
}

// JSONFile stores one private, versioned snapshot using write-fsync-rename.
// After corrupt data is observed Save refuses to overwrite the evidence.
type JSONFile struct {
	path    string
	mu      sync.Mutex
	corrupt bool
}

func NewJSONFile(path string) *JSONFile { return &JSONFile{path: path} }

type envelope struct {
	Version int               `json:"version"`
	Results []provider.Result `json:"results"`
}

func (s *JSONFile) Latest(ctx context.Context) ([]provider.Result, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	b, err := os.ReadFile(s.path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read snapshot: %w", err)
	}
	var v envelope
	if json.Unmarshal(b, &v) != nil || v.Version != 1 {
		s.corrupt = true
		return nil, ErrCorrupt
	}
	return clone(v.Results), nil
}
func (s *JSONFile) Save(ctx context.Context, results []provider.Result) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.corrupt {
		return ErrCorrupt
	}
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create cache directory: %w", err)
	}
	if err := os.Chmod(dir, 0700); err != nil {
		return fmt.Errorf("secure cache directory: %w", err)
	}
	b, err := json.Marshal(envelope{Version: 1, Results: results})
	if err != nil {
		return fmt.Errorf("encode snapshot: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".snapshot-*")
	if err != nil {
		return fmt.Errorf("create temporary snapshot: %w", err)
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err = tmp.Chmod(0600); err == nil {
		_, err = tmp.Write(b)
	}
	if err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write snapshot: %w", err)
	}
	if err = os.Rename(name, s.path); err != nil {
		return fmt.Errorf("replace snapshot: %w", err)
	}
	return nil
}
func clone(in []provider.Result) []provider.Result {
	out := make([]provider.Result, len(in))
	for i := range in {
		out[i] = in[i]
		out[i].Metrics = append([]provider.Metric(nil), in[i].Metrics...)
	}
	return out
}
