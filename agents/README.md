# agents

Joachim's personal agent, built on the Google Agent Development Kit (ADK)
for Go. Started from the ADK hello-world, now a generalized agent harness:
model, persona and custom toolset are assembled in `main.go`, and every
capability the agent has is a typed Go function wrapped as an ADK tool.

## Run

```sh
export MISTRAL_API_KEY=...     # required for the default provider
go run .                       # interactive console
go run . mcp                   # MCP server for AI CLIs (port 8080)
go run . api                   # ADK REST API (deployment mode)
```

## BYOK model backends

`AGENT_MODEL_PROVIDER` selects the brain; bring the matching key or CLI:

| Provider | Key env | Model env (default) |
|---|---|---|
| `mistral` (default) | `MISTRAL_API_KEY` | `MISTRAL_MODEL` (mistral-large-latest) |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| `openrouter` | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (openrouter/auto) |
| `groq` | `GROQ_API_KEY` | `GROQ_MODEL` |
| `ollama` | - (keyless, local) | `OLLAMA_MODEL` (qwen3:8b) |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| `gemini` | `GOOGLE_API_KEY` | `GEMINI_MODEL` (gemini-flash-latest) |
| `cli` | - | `AGENT_CLI_COMMAND` (JSON argv, e.g. `["claude","-p"]`) |
| `custom` | `AGENT_API_KEY` (optional) | `AGENT_BASE_URL` + `AGENT_MODEL` |

All OpenAI-compatible providers go through `openaicomp/`; `anthropic`
has its own Messages API adapter; `cli` delegates whole turns to an
installed AI CLI (text in on stdin, answer on stdout; no function
calling in that mode).

## Using the agent from AI CLIs

`agents mcp` serves MCP (streamable HTTP, endpoint `/mcp`): the
read-only tools directly (`get_time`, `read_file`, `list_dir`,
`git_summary`) plus `ask_agent`, the full LLM agent as one tool.
Point Claude Code, Codex, Gemini CLI or any MCP client at the URL -
see the setup guides in `docs/`.

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
openaicomp/     ADK model.LLM adapter for any OpenAI-compatible endpoint
anthropicmodel/  ADK model.LLM adapter for the Anthropic Messages API
climodel/       ADK model.LLM adapter delegating to an AI CLI
mcpserver/      MCP server: tools + ask_agent for AI CLIs
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
