package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// gitTimeout bounds each git invocation.
const gitTimeout = 10 * time.Second

// GitSummaryArgs is the input of the git_summary tool.
type GitSummaryArgs struct {
	// Repository path relative to the workspace root; empty means the root itself.
	Repo string `json:"repo" jsonschema:"path of the git repository, relative to the workspace root"`
}

// GitSummaryResult is the output of the git_summary tool.
type GitSummaryResult struct {
	Repo      string   `json:"repo"`
	Branch    string   `json:"branch"`
	Clean     bool     `json:"clean"`
	Status    []string `json:"status,omitempty"`
	RecentLog []string `json:"recent_log,omitempty"`
}

// NewGitTool returns git_summary: branch, dirty state and recent history
// of a repository inside the workspace.
func NewGitTool(w Workspace) ([]tool.Tool, error) {
	gitSummary, err := functiontool.New(
		functiontool.Config{
			Name:        "git_summary",
			Description: "Reports the branch, uncommitted changes and recent commit log of a git repository inside the workspace. Works for submodules too. Empty repo path uses the workspace root.",
		},
		func(ctx agent.Context, args GitSummaryArgs) (GitSummaryResult, error) {
			return GitSummaryIn(w, args.Repo)
		},
	)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{gitSummary}, nil
}

// GitSummaryIn is the core of git_summary, callable outside the LLM loop.
func GitSummaryIn(w Workspace, repoArg string) (GitSummaryResult, error) {
	res := GitSummaryResult{Repo: repoArg}

	branch, err := runGitIn(w, repoArg, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return GitSummaryResult{}, err
	}
	res.Branch = strings.TrimSpace(branch)

	status, err := runGitIn(w, repoArg, "status", "--porcelain=v1")
	if err != nil {
		return GitSummaryResult{}, err
	}
	for _, line := range strings.Split(strings.TrimRight(status, "\n"), "\n") {
		if line != "" {
			res.Status = append(res.Status, line)
		}
	}
	res.Clean = len(res.Status) == 0

	logOut, err := runGitIn(w, repoArg, "log", "--oneline", "-5")
	if err == nil && strings.TrimSpace(logOut) != "" {
		res.RecentLog = strings.Split(strings.TrimRight(logOut, "\n"), "\n")
	}
	return res, nil
}

// runGitIn runs git in a workspace-resolved repository with a timeout.
func runGitIn(w Workspace, repoArg string, args ...string) (string, error) {
	path, err := w.resolve(repoArg)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", path}, args...)...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(out.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), msg)
	}
	return out.String(), nil
}
