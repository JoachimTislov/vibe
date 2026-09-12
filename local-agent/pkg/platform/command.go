package platform

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"time"
)

func commandEnv() []string {
	var env []string
	for _, key := range []string{"PATH", "HOME", "LANG", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"} {
		if value, ok := os.LookupEnv(key); ok {
			env = append(env, key+"="+value)
		}
	}
	return env
}

type outputBuffer struct{ bytes.Buffer }

func (b *outputBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 2<<20 {
		return 0, errors.New("CLI output exceeds limit")
	}
	return b.Buffer.Write(p)
}
func runCommand(ctx context.Context, binary string, args, extraEnv []string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Env = append(commandEnv(), extraEnv...)
	cmd.WaitDelay = time.Second
	var output outputBuffer
	cmd.Stdout = &output
	// Third-party stderr may contain credentials; expose only operation errors.
	if err := cmd.Run(); err != nil {
		return nil, errors.New("platform CLI command failed; run its auth/status command interactively")
	}
	return output.Bytes(), nil
}
