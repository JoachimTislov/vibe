package ccusage

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/local/quota-watch/internal/backend"
)

type Client struct {
	Path, Version string
	Runner        backend.Runner
	Env           []string
}
type Totals struct {
	InputTokens, OutputTokens, CacheTokens int64
	CostUSD                                float64
}

func (c Client) ClaudeTotals(ctx context.Context) (Totals, error) {
	if c.Runner == nil {
		return Totals{}, errors.New("ccusage runner unavailable")
	}
	o, e := c.Runner.Run(ctx, backend.Request{Path: c.Path, Args: []string{"daily", "--json", "--offline"}, Env: c.Env})
	if e != nil {
		return Totals{}, e
	}
	return ParseDaily(o.Stdout)
}
func ParseDaily(b []byte) (Totals, error) {
	var r struct {
		Totals *struct {
			Input         int64   `json:"inputTokens"`
			Output        int64   `json:"outputTokens"`
			CacheCreation int64   `json:"cacheCreationTokens"`
			CacheRead     int64   `json:"cacheReadTokens"`
			Cost          float64 `json:"totalCost"`
		} `json:"totals"`
		Daily []struct {
			Input         int64   `json:"inputTokens"`
			Output        int64   `json:"outputTokens"`
			CacheCreation int64   `json:"cacheCreationTokens"`
			CacheRead     int64   `json:"cacheReadTokens"`
			Cost          float64 `json:"totalCost"`
		} `json:"daily"`
	}
	if json.Unmarshal(b, &r) != nil {
		return Totals{}, errors.New("unsupported ccusage JSON")
	}
	var t Totals
	if r.Totals != nil {
		t = Totals{r.Totals.Input, r.Totals.Output, r.Totals.CacheCreation + r.Totals.CacheRead, r.Totals.Cost}
		return t, nil
	}
	if r.Daily == nil {
		return t, errors.New("unsupported ccusage schema")
	}
	for _, d := range r.Daily {
		t.InputTokens += d.Input
		t.OutputTokens += d.Output
		t.CacheTokens += d.CacheCreation + d.CacheRead
		t.CostUSD += d.Cost
	}
	return t, nil
}
