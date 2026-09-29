// Package discount searches explicitly configured public offer pages.
package discount

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/shopping-list/internal/domain"
	"golang.org/x/net/html"
)

type Source struct {
	URLs   []*url.URL
	Client *http.Client
}

func New(raw []string) (*Source, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		for _, ip := range ips {
			if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
				continue
			}
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if err == nil {
				return conn, nil
			}
		}
		return nil, fmt.Errorf("no public address for %s", host)
	}
	s := &Source{Client: &http.Client{Timeout: 12 * time.Second, Transport: transport}}
	for _, v := range raw {
		u, err := url.Parse(strings.TrimSpace(v))
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return nil, fmt.Errorf("invalid discount source %q", v)
		}
		if isPrivateHost(u.Hostname()) {
			return nil, fmt.Errorf("discount source %q resolves to a private host", v)
		}
		s.URLs = append(s.URLs, u)
	}
	return s, nil
}

func (s *Source) Search(ctx context.Context, products []string) ([]domain.Discount, error) {
	var out []domain.Discount
	for _, u := range s.URLs {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "Basket/1.0 (+personal shopping assistant)")
		client := *s.Client
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 || !strings.EqualFold(req.URL.Hostname(), u.Hostname()) {
				return http.ErrUseLastResponse
			}
			return nil
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetch %s: %w", u.Host, err)
		}
		if resp.StatusCode/100 != 2 {
			resp.Body.Close()
			continue
		}
		text, err := pageText(io.LimitReader(resp.Body, 2<<20))
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		lower := strings.ToLower(text)
		for _, p := range products {
			if strings.Contains(lower, strings.ToLower(strings.TrimSpace(p))) {
				out = append(out, domain.Discount{Product: p, Store: u.Host, Price: "See offer", SourceURL: u.String()})
			}
		}
	}
	return out, nil
}

func isPrivateHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified())
}

func pageText(r io.Reader) (string, error) {
	doc, err := html.Parse(r)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode && n.Parent != nil && n.Parent.Data != "script" && n.Parent.Data != "style" {
			b.WriteString(" ")
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return b.String(), nil
}
