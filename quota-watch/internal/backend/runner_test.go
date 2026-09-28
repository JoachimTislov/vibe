package backend

import (
	"context"
	"errors"
	"testing"
)

func TestRejectsRelativeExecutable(t *testing.T) {
	_, e := (ExecRunner{}).Run(context.Background(), Request{Path: "tool"})
	if !errors.Is(e, ErrUnsafe) {
		t.Fatalf("error=%v", e)
	}
}
