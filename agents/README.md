# agents

Joachim's personal agent, built on the Google Agent Development Kit (ADK)
for Go. Started from the ADK hello-world, now a generalized agent harness:
model, persona and custom toolset are assembled in `main.go`, and every
capability the agent has is a typed Go function wrapped as an ADK tool.

## Run

```sh
export MISTRAL_API_KEY=...     # required (default provider)
go run .                       # interactive console
AGENT_MODEL_PROVIDER=gemini GOOGLE_API_KEY=... go run .   # Gemini instead
```

## Configuration

| Env var           | Default               | Purpose                          |
|-------------------|-----------------------|----------------------------------|
| `MISTRAL_API_KEY`  | -                     | Mistral API key (default provider) |
| `MISTRAL_MODEL`    | `mistral-large-latest`| Model for the mistral provider    |
| `GOOGLE_API_KEY`   | -                     | Gemini API key (gemini provider)  |
| `AGENT_MODEL_PROVIDER` | `mistral`         | Provider: mistral or gemini       |
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
mistralmodel/  ADK model.LLM adapter for Mistral chat completions
```

All tools resolve paths against the workspace root and reject anything
that escapes it, including through symlinks. `run_command` requires
explicit user confirmation on every invocation via the ADK
human-in-the-loop flow. Google Search grounding is added on top of the
custom tools.

## Deployment

`agents api` serves the ADK REST API in production mode (no dev console);
`agents a2a` serves the Agent2Agent protocol. See [DEPLOY.md](DEPLOY.md)
for the Docker image, VPS/Cloudflare options and the security checklist.

## Tests

```sh
go test ./...
```

Tool cores (`TimeIn`, `ReadFileIn`, `ListDirIn`, `GitSummaryIn`,
`RunShellIn`, and path resolution) are tested directly, without the LLM
loop.
