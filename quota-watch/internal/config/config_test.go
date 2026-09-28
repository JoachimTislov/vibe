package config

import (
	"io"
	"testing"
	"time"
)

func TestParse(t *testing.T) {
	c, err := Parse([]string{"--demo", "--refresh-interval=3s", "--concurrency=2"}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if !c.Demo || c.RefreshInterval != 3*time.Second || c.Concurrency != 2 {
		t.Fatalf("unexpected config: %#v", c)
	}
}
func TestParseRejectsInvalid(t *testing.T) {
	if _, err := Parse([]string{"--concurrency=0"}, io.Discard); err == nil {
		t.Fatal("expected error")
	}
}

func TestParseRejectsNonLoopbackListen(t *testing.T) {
	if _, err := Parse([]string{"--listen", "0.0.0.0:7331"}, io.Discard); err == nil {
		t.Fatal("expected non-loopback listen address to be rejected")
	}
}
