package platform

import "testing"

func TestCommandText(t *testing.T) {
	for _, tt := range []struct {
		input, text, prefix string
		ok                  bool
	}{
		{"agent: hello", "hello", "agent: ", true},
		{"agent: approve abc", "approve abc", "agent: ", true},
		{"/agent hello", "hello", "/agent ", true},
		{"/agent deny abc", "deny abc", "/agent ", true},
		{"[agent] agent: hello", "", "", false},
		{"ordinary text", "", "", false},
		{"agent:hello", "", "", false},
	} {
		t.Run(tt.input, func(t *testing.T) {
			text, prefix, ok := commandText(tt.input)
			if text != tt.text || prefix != tt.prefix || ok != tt.ok {
				t.Fatalf("got (%q, %q, %t)", text, prefix, ok)
			}
		})
	}
}
