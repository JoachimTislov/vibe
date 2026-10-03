# agents

Joachim's personal agent, built on the Google Agent Development Kit (ADK)
for Go. Started from the ADK hello-world, now a generalized agent harness:
model, persona and custom toolset are assembled in `main.go`, and every
capability the agent has is a typed Go function wrapped as an ADK tool.

## Run

```sh
export GOOGLE_API_KEY=...      # required
go run .                       # interactive console
GEMINI_MODEL=gemini-pro-latest go run .   # optional model override
```

## Configuration

| Env var           | Default               | Purpose                          |
|-------------------|-----------------------|----------------------------------|
| `GOOGLE_API_KEY`  | -                     | Gemini API key                   |
| `GEMINI_MODEL`    | `gemini-flash-latest` | Model for the agent              |
| `AGENT_WORKSPACE` | `$HOME/projects`      | Root for all workspace tools     |

## Structure

```
main.go        harness: model + agent + ADK launcher
persona.go     the personal agent's system instruction
tools/         custom toolset (workspace-rooted)
  clock.go     get_time      real local time for a city or IANA zone
  files.go     read_file     read a workspace file (64KB cap)
               list_dir      list a workspace directory
  git.go       git_summary   branch, dirty state and recent log
  shell.go     run_command   shell in the workspace root, HITL-gated
  workspace.go path resolution and escape protection
```

All tools resolve paths against the workspace root and reject anything
that escapes it, including through symlinks. `run_command` requires
explicit user confirmation on every invocation via the ADK
human-in-the-loop flow. Google Search grounding is added on top of the
custom tools.

## Tests

```sh
go test ./...
```

Tool cores (`TimeIn`, `ReadFileIn`, `ListDirIn`, `GitSummaryIn`,
`RunShellIn`, and path resolution) are tested directly, without the LLM
loop.
