package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/YOURNAME/agentic-gateway/pkg/config"
	"github.com/YOURNAME/agentic-gateway/pkg/credentials"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Slack struct {
	cfg     config.Slack
	token   string
	mu      sync.Mutex
	threads map[string]string
}

func NewSlack(cfg config.Slack, store credentials.Store) (*Slack, error) {
	if cfg.Command == "" {
		cfg.Command = "slack"
	}
	if cfg.Mode == "" {
		cfg.Mode = "personal"
	}
	if cfg.TokenKey == "" {
		cfg.TokenKey = "slack-token"
	}
	if cfg.Mode != "personal" && cfg.Mode != "bot" {
		return nil, errors.New("Slack mode must be personal or bot")
	}
	if cfg.UserID == "" || len(cfg.Channels) == 0 {
		return nil, errors.New("Slack requires an owner user_id and channels")
	}
	if cfg.PollSeconds <= 0 {
		cfg.PollSeconds = 15
	}
	token, err := store.Get(cfg.TokenKey)
	if err != nil {
		return nil, errors.New("Slack token missing from OS keychain; run agent setup")
	}
	if cfg.Mode == "personal" && !strings.HasPrefix(token, "xoxp-") {
		return nil, errors.New("personal Slack mode needs an OAuth user token (xoxp-)")
	}
	if cfg.Mode == "bot" && !strings.HasPrefix(token, "xoxb-") {
		return nil, errors.New("bot Slack mode needs a bot token (xoxb-)")
	}
	return &Slack{cfg: cfg, token: token, threads: make(map[string]string)}, nil
}
func (s *Slack) api(ctx context.Context, method string, params any, result any) error {
	data, err := json.Marshal(params)
	if err != nil {
		return err
	}
	key := "SLACK_USER_TOKEN"
	if s.cfg.Mode == "bot" {
		key = "SLACK_BOT_TOKEN"
	}
	output, err := runCommand(ctx, s.cfg.Command, []string{"api", method, "--json", string(data), "--no-color", "--skip-update"}, []string{key + "=" + s.token, "SLACK_DISABLE_TELEMETRY=true"})
	if err != nil {
		return err
	}
	var envelope struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err = json.Unmarshal(output, &envelope); err != nil {
		return errors.New("Slack CLI did not return JSON; use slackapi/slack-cli with the api command")
	}
	if !envelope.OK {
		return fmt.Errorf("Slack API %s failed (%s)", method, envelope.Error)
	}
	if result != nil {
		return json.Unmarshal(output, result)
	}
	return nil
}

type slackMessage struct {
	TS       string `json:"ts"`
	ThreadTS string `json:"thread_ts"`
	User     string `json:"user"`
	Text     string `json:"text"`
	Subtype  string `json:"subtype"`
	BotID    string `json:"bot_id"`
}

func (s *Slack) Receive(ctx context.Context, emit func(Message) error) error {
	var auth struct {
		UserID string `json:"user_id"`
	}
	if err := s.api(ctx, "auth.test", map[string]any{}, &auth); err != nil {
		return err
	}
	if s.cfg.Mode == "personal" && auth.UserID != s.cfg.UserID {
		return errors.New("Slack token belongs to a different owner")
	}
	start := strconv.FormatInt(time.Now().Unix(), 10) + ".000000"
	cursors := map[string]string{}
	for _, channel := range s.cfg.Channels {
		cursors[channel] = start
	}
	poll := func(channel, thread, oldest string) (string, error) {
		method := "conversations.history"
		if thread != "" {
			method = "conversations.replies"
		}
		cursor := ""
		newest := oldest
		var messages []slackMessage
		for page := 0; page < 20; page++ {
			params := map[string]any{"channel": channel, "oldest": oldest, "limit": 100, "inclusive": false}
			if thread != "" {
				params["ts"] = thread
			}
			if cursor != "" {
				params["cursor"] = cursor
			}
			var response struct {
				Messages []slackMessage `json:"messages"`
				HasMore  bool           `json:"has_more"`
				Metadata struct {
					NextCursor string `json:"next_cursor"`
				} `json:"response_metadata"`
			}
			if err := s.api(ctx, method, params, &response); err != nil {
				return oldest, err
			}
			messages = append(messages, response.Messages...)
			cursor = response.Metadata.NextCursor
			if cursor != "" {
				continue
			}
			if response.HasMore {
				return oldest, errors.New("Slack pagination missing cursor")
			}
			// History pages arrive newest first. Sort the complete batch before
			// emitting, so prompts never overtake older prompts on another page.
			sort.Slice(messages, func(i, j int) bool { return messages[i].TS < messages[j].TS })
			for _, m := range messages {
				if m.TS <= oldest {
					continue
				}
				if m.TS > newest {
					newest = m.TS
				}
				_, _, command := commandText(m.Text)
				if m.User != s.cfg.UserID || m.Subtype != "" || m.BotID != "" || !command {
					continue
				}
				root := m.ThreadTS
				if root == "" {
					root = m.TS
				}
				conversation := channel + "/" + root
				s.mu.Lock()
				if _, exists := s.threads[conversation]; !exists && len(s.threads) >= 128 {
					s.mu.Unlock()
					return oldest, errors.New("Slack thread limit reached; restart the adapter before sending more commands")
				}
				s.threads[conversation] = root
				s.mu.Unlock()
				if err := emit(Message{ID: m.TS, Conversation: conversation, Text: m.Text, ReplyTarget: root}); err != nil {
					return oldest, err
				}
			}
			return newest, nil
		}
		return oldest, errors.New("Slack pagination limit exceeded")
	}
	for {
		for _, channel := range s.cfg.Channels {
			next, err := poll(channel, "", cursors[channel])
			if err != nil {
				return err
			}
			cursors[channel] = next
		}
		s.mu.Lock()
		threads := make(map[string]string, len(s.threads))
		for conv, ts := range s.threads {
			threads[conv] = ts
		}
		s.mu.Unlock()
		for conv, thread := range threads {
			channel, _, _ := strings.Cut(conv, "/")
			oldest := cursors[conv]
			if oldest == "" {
				oldest = thread
			}
			next, err := poll(channel, thread, oldest)
			if err != nil {
				return err
			}
			cursors[conv] = next
		}
		// Only top-level channels belong in the next history pass.
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(s.cfg.PollSeconds) * time.Second):
		}
	}
}
func (s *Slack) Reply(ctx context.Context, m Message, text string) error {
	channel, _, ok := strings.Cut(m.Conversation, "/")
	if !ok {
		return errors.New("invalid Slack conversation")
	}
	for len([]rune(text)) > 0 {
		runes := []rune(text)
		n := len(runes)
		if n > 3000 {
			n = 3000
		}
		if err := s.api(ctx, "chat.postMessage", map[string]any{"channel": channel, "thread_ts": m.ReplyTarget, "text": "[agent] " + string(runes[:n]), "mrkdwn": false, "unfurl_links": false, "unfurl_media": false}, nil); err != nil {
			return err
		}
		text = string(runes[n:])
	}
	return nil
}
