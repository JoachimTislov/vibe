//go:build upstream

package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// This gate is intentionally separate from the deterministic default suite.
// It executes an unmodified, operator-supplied official Slack CLI, with only
// its HTTPS API server and the keychain replaced by test services. No account
// login or real Slack message is sent. Missing prerequisites fail, not skip.
func TestOfficialSlackCLIEntrypoint(t *testing.T) {
	binary := os.Getenv("AGENT_SLACK_CLI")
	if binary == "" {
		t.Fatal("set AGENT_SLACK_CLI to a built slackapi/slack-cli executable")
	}
	binary, err := exec.LookPath(binary)
	if err != nil {
		t.Fatal(err)
	}
	binary, err = filepath.Abs(binary)
	if err != nil {
		t.Fatal(err)
	}
	testPlatformApproval(t, "slack", binary)
}
