package platform

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Telegram uses the JSON notifications and command socket from vysheng/tg.
// Authentication remains an explicit interactive telegram-cli operation.
type Telegram struct {
	cfg    config.Telegram
	mu     sync.Mutex
	socket string
	ready  chan struct{}
}

func NewTelegram(cfg config.Telegram) (*Telegram, error) {
	if cfg.Command == "" {
		cfg.Command = "telegram-cli"
	}
	if cfg.Mode == "" {
		cfg.Mode = "personal"
	}
	if cfg.Mode != "personal" && cfg.Mode != "bot" {
		return nil, errors.New("Telegram mode must be personal or bot")
	}
	if cfg.UserID <= 0 || len(cfg.Peers) == 0 || cfg.ConfigFile == "" {
		return nil, errors.New("Telegram requires owner user_id, peers, and its CLI config_file")
	}
	if !filepath.IsAbs(cfg.ConfigFile) {
		return nil, errors.New("Telegram config_file must be an absolute private profile path")
	}
	if info, err := os.Lstat(cfg.ConfigFile); err == nil {
		if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
			return nil, errors.New("Telegram config_file must be a private regular profile")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, errors.New("could not inspect Telegram profile")
	}
	// The CLI creates authentication/session files beside this config. An
	// existing profile directory must therefore be private as well. A missing
	// directory is allowed here because `agent login telegram` creates it with
	// mode 0700 before the first interactive login.
	if info, err := os.Stat(filepath.Dir(cfg.ConfigFile)); err == nil {
		if !info.IsDir() || info.Mode().Perm()&0077 != 0 {
			return nil, errors.New("Telegram profile directory must be private")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, errors.New("could not inspect Telegram profile directory")
	}
	for _, peer := range cfg.Peers {
		if !regexp.MustCompile(`^(user|chat|channel):[1-9][0-9]*$`).MatchString(peer) {
			return nil, errors.New("Telegram peers use user:123, chat:123, or channel:123")
		}
	}
	return &Telegram{cfg: cfg, ready: make(chan struct{})}, nil
}

type telegramPeer struct {
	ID     string `json:"id"`
	Type   string `json:"peer_type"`
	PeerID int64  `json:"peer_id"`
}
type telegramMessage struct {
	Event   string       `json:"event"`
	ID      string       `json:"id"`
	Text    string       `json:"text"`
	From    telegramPeer `json:"from"`
	To      telegramPeer `json:"to"`
	Date    int64        `json:"date"`
	Service bool         `json:"service"`
}

func (t *Telegram) Receive(ctx context.Context, emit func(Message) error) error {
	dir, err := os.MkdirTemp("", "agent-tg-")
	if err != nil {
		return err
	}
	socket := filepath.Join(dir, "cli.sock")
	defer func() { os.Remove(socket); os.Remove(dir) }()
	args := []string{"--json", "-R", "-C", "-I", "-W", "-E", "--disable-link-preview", "--permanent-msg-ids", "--permanent-peer-ids", "-c", t.cfg.ConfigFile, "-S", socket}
	if t.cfg.PublicKey != "" {
		args = append(args, "-k", t.cfg.PublicKey)
	}
	if t.cfg.Mode == "bot" {
		args = append(args, "-b")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(ctx, t.cfg.Command, args...)
	cmd.Env = commandEnv()
	cmd.WaitDelay = time.Second
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err = cmd.Start(); err != nil {
		return errors.New("could not start vysheng/telegram-cli")
	}
	defer func() { cancel(); cmd.Wait() }()
	t.mu.Lock()
	t.socket = socket
	t.mu.Unlock()
	close(t.ready)
	since := time.Now().Unix()
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// The selected CLI prints a version banner before JSON notifications.
		if !strings.HasPrefix(line, "{") {
			continue
		}
		var m telegramMessage
		if json.Unmarshal([]byte(line), &m) != nil {
			return errors.New("invalid Telegram CLI JSON event")
		}
		if m.Event != "message" || m.Service || m.Date < since || m.From.Type != "user" || m.From.PeerID != t.cfg.UserID {
			continue
		}
		if !regexp.MustCompile(`^[0-9a-f]+$`).MatchString(m.ID) {
			continue
		}
		peer := m.To
		// Commands from the owner in a bot DM are addressed to the bot;
		// reply to the human sender. Personal self-chat uses m.To directly.
		if t.cfg.Mode == "bot" && peer.Type == "user" {
			peer = m.From
		}
		conversation := peer.Type + ":" + strconv.FormatInt(peer.PeerID, 10)
		allowed := false
		for _, p := range t.cfg.Peers {
			if p == conversation {
				allowed = true
				break
			}
		}
		if !allowed {
			continue
		}
		if err = emit(Message{ID: m.ID, Conversation: conversation, Text: m.Text, ReplyTarget: m.ID}); err != nil {
			return err
		}
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if scanner.Err() != nil {
		return errors.New("Telegram CLI stream failed")
	}
	return errors.New("Telegram CLI exited; run its login interactively to check authentication")
}

// QuoteTelegram follows interface.c's quoted token grammar. A newline in
// model output must never become a second telegram-cli command.
func QuoteTelegram(text string) string {
	text = strings.Map(func(r rune) rune {
		if r == 0 {
			return -1
		}
		return r
	}, text)
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`).Replace(text) + `"`
}

func (t *Telegram) Reply(ctx context.Context, m Message, text string) error {
	if !regexp.MustCompile(`^[0-9a-f]+$`).MatchString(m.ReplyTarget) {
		return errors.New("invalid Telegram reply ID")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	select {
	case <-t.ready:
	case <-ctx.Done():
		return ctx.Err()
	}
	t.mu.Lock()
	socket := t.socket
	t.mu.Unlock()
	for len([]rune(text)) > 0 {
		runes := []rune(text)
		n := len(runes)
		if n > 3000 {
			n = 3000
		}
		var conn net.Conn
		var err error
		for {
			conn, err = (&net.Dialer{}).DialContext(ctx, "unix", socket)
			if err == nil {
				break
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(25 * time.Millisecond):
			}
		}
		deadline, _ := ctx.Deadline()
		conn.SetDeadline(deadline)
		_, err = fmt.Fprintf(conn, "reply %s %s\n", m.ReplyTarget, QuoteTelegram("[agent] "+string(runes[:n])))
		if err == nil {
			reader := bufio.NewReader(conn)
			header, e := reader.ReadString('\n')
			err = e
			if err == nil {
				var count int
				if _, e = fmt.Sscanf(header, "ANSWER %d\n", &count); e != nil || count < 1 || count > 2<<20 {
					err = errors.New("invalid Telegram CLI response frame")
				} else {
					data := make([]byte, count)
					_, err = io.ReadFull(reader, data)
					if err == nil {
						var result struct {
							Event  string `json:"event"`
							Result string `json:"result"`
						}
						if json.Unmarshal(data, &result) != nil || result.Result == "FAIL" || (result.Event != "message" && result.Result != "SUCCESS") {
							err = errors.New("Telegram CLI rejected reply")
						}
					}
				}
			}
		}
		conn.Close()
		if err != nil {
			return err
		}
		text = string(runes[n:])
	}
	return nil
}
