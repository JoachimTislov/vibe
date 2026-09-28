# Quota Watch

Quota Watch is a local-first dashboard for automatically discovering and tracking usage limits across subscription services.

The current MVP is a working, local-only Go service with an embedded dashboard,
background refresh, a private snapshot cache, and a JSON-RPC 2.0 API. It discovers
supported tools automatically; users never copy usage numbers by hand.

## Development

```sh
go run ./cmd/quota-watch
# Or preview every UI state without reading credentials or making network calls:
go run ./cmd/quota-watch --demo
```

Then open <http://127.0.0.1:7331>.

## Automatic integrations

- Codex: installed CodexBar JSON CLI, with native `codex app-server` JSON-RPC fallback.
- Claude: installed ccusage offline JSON reports for device-local observations.
- GitHub Copilot, Gemini, and Cursor: safe presence/status discovery while supported
  read-only account sources are added.

Quota Watch only invokes installed tools through fixed argument lists with deadlines and
bounded output. Missing integrations become explanatory cards and never prevent startup.
See [research](docs/research.md) and [architecture](docs/architecture.md) for provider
capabilities, open-source references, and the distinction between account quotas, API
spend, and local observations.

## RPC

The dashboard calls `POST /rpc/v1` using JSON-RPC 2.0. The initial methods are
`state.get` and `refresh.request`. Refresh requests require the same-origin dashboard
header `X-Quota-Watch-RPC: 1`; usage responses are not exposed through CORS.

## Principles

- Local-first: credentials and usage data remain on the user's machine.
- Automatic: discover supported providers and refresh them in the background.
- Honest: distinguish authoritative API data from locally estimated usage.
- Extensible: each integration implements a small provider interface.
- Read-only: never mutate provider accounts or billing settings.
