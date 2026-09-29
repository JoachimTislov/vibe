package sourceprotocol

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"time"
)

var (
	ErrFrameTooLarge = errors.New("external source frame too large")
	ErrProtocol      = errors.New("external source protocol error")
	ErrExited        = errors.New("external source exited")
)

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *RPCError) Error() string { return fmt.Sprintf("external source RPC error %d", e.Code) }

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *RPCError       `json:"error"`
}
type pending struct {
	r   response
	err error
}
type Client struct {
	cmd      *exec.Cmd
	in       io.WriteCloser
	mu       sync.Mutex
	next     uint64
	waits    map[string]chan pending
	done     chan struct{}
	terminal error
	cancel   context.CancelFunc
}
type Options struct {
	Timeout   time.Duration
	MaxFrame  int
	MaxStderr int
	Dir       string
	Env       []string
}

func Start(ctx context.Context, executable string, args []string, o Options) (*Client, error) {
	if o.Timeout <= 0 {
		o.Timeout = 20 * time.Second
	}
	if o.MaxFrame <= 0 {
		o.MaxFrame = 1 << 20
	}
	if o.MaxStderr <= 0 {
		o.MaxStderr = 64 << 10
	}
	run, cancel := context.WithTimeout(ctx, o.Timeout)
	cmd := exec.CommandContext(run, executable, args...)
	cmd.Dir = o.Dir
	if cmd.Dir == "" {
		cmd.Dir = os.TempDir()
	}
	cmd.Env = append([]string(nil), o.Env...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	in, e := cmd.StdinPipe()
	if e != nil {
		cancel()
		return nil, e
	}
	out, e := cmd.StdoutPipe()
	if e != nil {
		cancel()
		return nil, e
	}
	cmd.Stderr = &limitWriter{remaining: o.MaxStderr}
	if e = cmd.Start(); e != nil {
		cancel()
		return nil, fmt.Errorf("start external source: %w", e)
	}
	c := &Client{cmd: cmd, in: in, waits: map[string]chan pending{}, done: make(chan struct{}), cancel: cancel}
	go c.read(out, o.MaxFrame)
	return c, nil
}

type limitWriter struct{ remaining int }

func (w *limitWriter) Write(p []byte) (int, error) {
	if len(p) > w.remaining {
		return 0, ErrFrameTooLarge
	}
	w.remaining -= len(p)
	return len(p), nil
}
func (c *Client) read(r io.Reader, max int) {
	br := bufio.NewReaderSize(r, 4096)
	for {
		line, e := br.ReadSlice('\n')
		if errors.Is(e, bufio.ErrBufferFull) || len(line) > max {
			c.finish(ErrFrameTooLarge)
			return
		}
		if e != nil {
			if e == io.EOF && len(line) == 0 {
				c.finish(ErrExited)
			} else {
				c.finish(ErrProtocol)
			}
			return
		}
		var v response
		if json.Unmarshal(line, &v) != nil || v.JSONRPC != "2.0" || len(v.ID) == 0 {
			c.finish(ErrProtocol)
			return
		}
		key := string(v.ID)
		c.mu.Lock()
		ch := c.waits[key]
		delete(c.waits, key)
		c.mu.Unlock()
		if ch == nil {
			c.finish(ErrProtocol)
			return
		}
		ch <- pending{r: v}
	}
}
func (c *Client) finish(e error) {
	c.mu.Lock()
	if c.terminal == nil {
		c.terminal = e
		for _, ch := range c.waits {
			ch <- pending{err: e}
		}
		c.waits = map[string]chan pending{}
		close(c.done)
	}
	c.mu.Unlock()
}
func (c *Client) Call(ctx context.Context, method string, params, out any) error {
	c.mu.Lock()
	if c.terminal != nil {
		e := c.terminal
		c.mu.Unlock()
		return e
	}
	c.next++
	id := strconv.FormatUint(c.next, 10)
	ch := make(chan pending, 1)
	c.waits[id] = ch
	b, e := json.Marshal(struct {
		JSONRPC string `json:"jsonrpc"`
		ID      uint64 `json:"id"`
		Method  string `json:"method"`
		Params  any    `json:"params,omitempty"`
	}{"2.0", c.next, method, params})
	if e == nil {
		_, e = c.in.Write(append(b, '\n'))
	}
	if e != nil {
		delete(c.waits, id)
	}
	c.mu.Unlock()
	if e != nil {
		return e
	}
	select {
	case p := <-ch:
		if p.err != nil {
			return p.err
		}
		if p.r.Error != nil {
			return p.r.Error
		}
		if len(p.r.Result) == 0 {
			return ErrProtocol
		}
		return json.Unmarshal(p.r.Result, out)
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.waits, id)
		c.mu.Unlock()
		return ctx.Err()
	}
}
func (c *Client) Close() {
	var ignored any
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	_ = c.Call(ctx, "shutdown", struct{}{}, &ignored)
	cancel()
	_ = c.in.Close()
	c.cancel()
	if c.cmd.Process != nil {
		_ = syscall.Kill(-c.cmd.Process.Pid, syscall.SIGKILL)
	}
	_ = c.cmd.Wait()
}
