package tools

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

const (
	webFetchTimeout = 20 * time.Second
	maxWebBody      = 2 << 20
	maxWebText      = 32 * 1024
	maxWebLinks     = 50
)

// WebFetchArgs is the input of the web_fetch tool.
type WebFetchArgs struct {
	URL      string `json:"url" jsonschema:"absolute http(s) URL to fetch"`
	Selector string `json:"selector,omitempty" jsonschema:"optional CSS selector; when set, text is extracted from matching elements instead of the whole page"`
}

// WebFetchResult is the output of the web_fetch tool.
type WebFetchResult struct {
	URL       string   `json:"url"`
	Status    int      `json:"status"`
	Title     string   `json:"title,omitempty"`
	Text      string   `json:"text"`
	Links     []string `json:"links,omitempty"`
	Bytes     int      `json:"bytes"`
	Truncated bool     `json:"truncated,omitempty"`
}

// NewWebTool returns web_fetch: fetch a page and extract text, for
// scraping sites without integration support.
func NewWebTool() (tool.Tool, error) {
	return functiontool.New(
		functiontool.Config{
			Name:        "web_fetch",
			Description: "Fetches an http(s) page and returns its title, readable text and up to 50 links. An optional CSS selector extracts text from specific elements (e.g. '.offer-card'). Use for scraping websites without an API.",
		},
		func(ctx agent.Context, args WebFetchArgs) (WebFetchResult, error) {
			return WebFetchIn(http.DefaultClient, args.URL, args.Selector)
		},
	)
}

// WebFetchIn is the core of web_fetch, callable outside the LLM loop.
func WebFetchIn(client *http.Client, rawURL, selector string) (WebFetchResult, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "http" && u.Scheme != "https" || u.Host == "" {
		return WebFetchResult{}, fmt.Errorf("invalid http(s) URL %q", rawURL)
	}
	if client == nil {
		client = &http.Client{Timeout: webFetchTimeout}
	} else {
		client = &http.Client{Transport: client.Transport, Timeout: webFetchTimeout}
	}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, u.String(), nil)
	if err != nil {
		return WebFetchResult{}, err
	}
	req.Header.Set("User-Agent", "personal-agent/0.1 (+https://github.com/JoachimTislov/vibe)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5")
	resp, err := client.Do(req)
	if err != nil {
		return WebFetchResult{}, fmt.Errorf("fetch %q: %w", rawURL, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxWebBody))
	if err != nil {
		return WebFetchResult{}, fmt.Errorf("read body of %q: %w", rawURL, err)
	}
	res := WebFetchResult{URL: rawURL, Status: resp.StatusCode, Bytes: len(body)}
	if len(body) >= maxWebBody {
		res.Truncated = true
	}

	// Plain text responses skip HTML parsing.
	if ct := resp.Header.Get("Content-Type"); strings.Contains(ct, "text/plain") {
		res.Text = truncate(strings.TrimSpace(string(body)), maxWebText)
		return res, nil
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		// Not parseable HTML: return raw text.
		res.Text = truncate(string(body), maxWebText)
		return res, nil
	}
	res.Title = strings.TrimSpace(doc.Find("title").First().Text())
	doc.Find("script,style,noscript").Remove()

	if selector != "" {
		var texts []string
		doc.Find(selector).Each(func(_ int, s *goquery.Selection) {
			if t := strings.TrimSpace(s.Text()); t != "" {
				texts = append(texts, t)
			}
		})
		res.Text = truncate(strings.Join(texts, "\n---\n"), maxWebText)
	} else {
		res.Text = truncate(strings.TrimSpace(doc.Text()), maxWebText)
	}

	doc.Find("a[href]").Each(func(_ int, s *goquery.Selection) {
		if len(res.Links) >= maxWebLinks {
			return
		}
		href, _ := s.Attr("href")
		if href == "" {
			return
		}
		if abs, err := u.Parse(href); err == nil && abs.IsAbs() {
			res.Links = append(res.Links, abs.String())
		}
	})
	return res, nil
}
