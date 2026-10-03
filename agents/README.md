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

## Configuration file (agent.json)

Optional; looked up at $AGENT_CONFIG or <workspace>/agent.json.
Environment variables override it.

```json
{
  "model": {"provider": "mistral", "model": "mistral-large-latest"},
  "access_key": "owner-only bearer token for the MCP endpoint",
  "mcp_allow_privileged": false,
  "mcp_servers": [
    {"name": "fetch", "command": ["npx", "-y", "@modelcontextprotocol/server-fetch"]},
    {"name": "todo", "url": "https://mcp.example.com", "bearer": "..."}
  ]
}
```

`mcp_servers` are MCP connections the agent makes as a client: their
tools appear next to the built-in ones, so the agent can act on your
behalf in other systems. `mcp_allow_privileged` auto-approves gated
tools over MCP (the endpoint is owner-key-only; off by default).

## Self-recording

Every tool call is journaled to `<workspace>/logs/journal/YYYY-MM-DD.jsonl`
(agent loop via ADK callbacks, direct MCP calls, and a startup
self-check). The agent reads its own journal with `journal_query` and
reports its health with `self_report` - provider, model, uptime, action
and error counts, running processes.

## Owner-only access

The MCP endpoint refuses to start without an access key
(AGENT_ACCESS_KEY or agent.json access_key) and answers 401 to every
request without a valid `Authorization: Bearer <key>` (constant-time
compare). Point clients at it with the header:

```sh
claude mcp add --transport http --header "Authorization: Bearer $AGENT_ACCESS_KEY" \
  personal-agent https://agent.example.com/mcp
```

## Recipes

- [docs/recipes/grocery-offers.md](docs/recipes/grocery-offers.md) -
  scraping sites without integration support, robots and scripts.

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
  clock.go     get_time        real local time for a city or IANA zone
  files.go     read_file       read a workspace file (64KB cap)
               list_dir        list a workspace directory
  git.go       git_summary     branch, dirty state and recent log
  shell.go     run_command     shell in the workspace root, gated
  fileops.go   write_file      write/create files (256KB cap), gated
               delete_path     delete files/dirs, gated
  processes.go list_processes  agent-started + filtered system processes
               start_process   detached background process, gated
               stop_process    stop by name (TERM then KILL), gated
  web.go       web_fetch       fetch page, extract text/links/selector
  journal.go   action journal (JSONL under logs/journal/)
  self.go      self_report     own health: provider, uptime, stats
               journal_query   audit own actions and errors
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
