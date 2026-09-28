package backend

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var (
	ErrTimeout     = errors.New("backend timed out")
	ErrOutputLimit = errors.New("backend output limit exceeded")
	ErrFailed      = errors.New("backend command failed")
	ErrUnsafe      = errors.New("unsafe backend command")
)

type Request struct {
	Path string
	Args []string
	Env  []string
}

type Output struct{ Stdout []byte }

type Runner interface {
	Run(context.Context, Request) (Output, error)
}

type ExecRunner struct {
	Timeout   time.Duration
	MaxStdout int64
	MaxStderr int64
	Dir       string
}

func (r ExecRunner) Run(ctx context.Context, req Request) (Output, error) {
	if !filepath.IsAbs(req.Path) || filepath.Clean(req.Path) != req.Path {
		return Output{}, ErrUnsafe
	}
	for _, arg := range req.Args {
		if strings.IndexByte(arg, 0) >= 0 {
			return Output{}, ErrUnsafe
		}
	}
	timeout := r.Timeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	maxOut := r.MaxStdout
	if maxOut <= 0 {
		maxOut = 4 << 20
	}
	maxErr := r.MaxStderr
	if maxErr <= 0 {
		maxErr = 64 << 10
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(runCtx, req.Path, req.Args...)
	cmd.Dir = r.Dir
	if cmd.Dir == "" {
		cmd.Dir = os.TempDir()
	}
	cmd.Env = append([]string(nil), req.Env...)
	cmd.Stdin = strings.NewReader("")
	var stdout, stderr limitedBuffer
	stdout.max, stderr.max = maxOut, maxErr
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
		return Output{}, ErrTimeout
	}
	if stdout.overflow || stderr.overflow {
		return Output{}, ErrOutputLimit
	}
	if err != nil {
		return Output{}, fmt.Errorf("%w (exit status only)", ErrFailed)
	}
	return Output{Stdout: stdout.Bytes()}, nil
}

type limitedBuffer struct {
	bytes.Buffer
	max      int64
	overflow bool
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.max - int64(b.Len())
	if remaining <= 0 {
		b.overflow = true
		return 0, ErrOutputLimit
	}
	if int64(len(p)) > remaining {
		_, _ = b.Buffer.Write(p[:remaining])
		b.overflow = true
		return int(remaining), ErrOutputLimit
	}
	_, err := io.Copy(&b.Buffer, bytes.NewReader(p))
	return n, err
}
