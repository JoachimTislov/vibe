package tools

import (
	"fmt"
	"sort"
	"strings"
	"time"

	// Embed the timezone database so get_time works in minimal
	// containers (e.g. distroless/alpine) without /usr/share/zoneinfo.
	_ "time/tzdata"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// City-to-IANA timezone aliases for common lookups. Anything not listed
// can be given as a raw IANA name (e.g. "Europe/Oslo").
var cityZones = map[string]string{
	"oslo":          "Europe/Oslo",
	"bergen":        "Europe/Oslo",
	"copenhagen":    "Europe/Copenhagen",
	"stockholm":     "Europe/Stockholm",
	"helsinki":      "Europe/Helsinki",
	"london":        "Europe/London",
	"dublin":        "Europe/London",
	"paris":         "Europe/Paris",
	"berlin":        "Europe/Berlin",
	"amsterdam":     "Europe/Amsterdam",
	"madrid":        "Europe/Madrid",
	"rome":          "Europe/Rome",
	"new york":      "America/New_York",
	"san francisco": "America/Los_Angeles",
	"los angeles":   "America/Los_Angeles",
	"seattle":       "America/Los_Angeles",
	"chicago":       "America/Chicago",
	"dallas":        "America/Chicago",
	"denver":        "America/Denver",
	"toronto":       "America/Toronto",
	"vancouver":     "America/Vancouver",
	"sao paulo":     "America/Sao_Paulo",
	"tokyo":         "Asia/Tokyo",
	"seoul":         "Asia/Seoul",
	"beijing":       "Asia/Shanghai",
	"shanghai":      "Asia/Shanghai",
	"hong kong":     "Asia/Hong_Kong",
	"singapore":     "Asia/Singapore",
	"sydney":        "Australia/Sydney",
	"melbourne":     "Australia/Melbourne",
	"auckland":      "Pacific/Auckland",
	"dubai":         "Asia/Dubai",
	"bangalore":     "Asia/Kolkata",
	"mumbai":        "Asia/Kolkata",
	"delhi":         "Asia/Kolkata",
	"utc":           "UTC",
}

// GetTimeArgs is the input of the get_time tool.
type GetTimeArgs struct {
	// A city name (e.g. "Oslo") or an IANA timezone name (e.g. "Europe/Oslo").
	City string `json:"city" jsonschema:"a city like Oslo, or an IANA timezone like Europe/Oslo"`
}

// GetTimeResult is the output of the get_time tool.
type GetTimeResult struct {
	Timezone  string `json:"timezone"`
	LocalTime string `json:"local_time"`
	Date      string `json:"date"`
	Weekday   string `json:"weekday"`
}

// NewClockTool returns get_time: the real local time for a city or IANA
// timezone, replacing LLM guesswork with an actual clock.
func NewClockTool() (tool.Tool, error) {
	return functiontool.New(
		functiontool.Config{
			Name:        "get_time",
			Description: "Returns the current local time, date and weekday for a city or IANA timezone. Use this whenever the user asks about the current time or date anywhere.",
		},
		func(ctx agent.Context, args GetTimeArgs) (GetTimeResult, error) {
			return TimeIn(args.City)
		},
	)
}

// TimeIn is the core of get_time, callable outside the LLM loop.
func TimeIn(city string) (GetTimeResult, error) {
	zone, err := resolveZone(city)
	if err != nil {
		return GetTimeResult{}, err
	}
	now := clockTime().In(zone)
	return GetTimeResult{
		Timezone:  zone.String(),
		LocalTime: now.Format("15:04:05 MST"),
		Date:      now.Format("2006-01-02"),
		Weekday:   now.Weekday().String(),
	}, nil
}

func resolveZone(city string) (*time.Location, error) {
	if city == "" {
		return nil, fmt.Errorf("city is required")
	}
	key := strings.ToLower(strings.TrimSpace(city))
	if tz, ok := cityZones[key]; ok {
		return time.LoadLocation(tz)
	}
	// Not a known city: accept raw IANA names ("Europe/Oslo", "UTC", ...).
	if loc, err := time.LoadLocation(city); err == nil {
		return loc, nil
	}
	var suggestions []string
	for _, tz := range cityZones {
		if strings.HasPrefix(tz, strings.ToUpper(city[:1])+city[1:]) {
			suggestions = append(suggestions, tz)
		}
	}
	sort.Strings(suggestions)
	if len(suggestions) > 3 {
		suggestions = suggestions[:3]
	}
	if len(suggestions) == 0 {
		return nil, fmt.Errorf("unknown city %q: pass an IANA timezone name like Europe/Oslo", city)
	}
	return nil, fmt.Errorf("unknown city %q: did you mean %s?", city, strings.Join(suggestions, ", "))
}
