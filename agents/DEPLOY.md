# Deploying the personal agent

The agent serves two production modes via the ADK production launcher
(REST API + A2A, no dev console):

```sh
agents api               # ADK REST API under /api (port 8080 by default)
agents a2a               # Agent2Agent protocol
```

Both listen on plain HTTP — TLS and auth belong to the layer in front.

## Setup guides

- [docs/setup-vps.md](docs/setup-vps.md) - any VPS, Docker Compose
- [docs/setup-tailscale.md](docs/setup-tailscale.md) - tailnet or public internet, zero open ports; Headscale section incl.
- [docs/setup-cloudflare.md](docs/setup-cloudflare.md) - Cloudflare Tunnel or Containers

## Where to run it

| Target | Fit | Notes |
|---|---|---|
| VPS (Docker) | Best | The agent is a long-lived Go process with a shell tool and a workspace volume; a VPS runs it as-is. |
| Cloudflare Tunnel + VPS | Best (secure) | Same container, zero open inbound ports; agent reachable only through Cloudflare. |
| Cloudflare Containers | Possible | Beta; runs the same Docker image behind a Cloudflare-managed route. Sleeps on inactivity — first request after idle pays a cold start. |
| Cloudflare Workers | No | Workers run JS/WASM on V8 isolates, not Go server processes. |

Recommendation: a small VPS (1 vCPU / 1 GB is plenty) with the compose
file, fronted by Caddy or a Cloudflare Tunnel. On Cloudflare specifically,
Containers work but the VPS path is simpler and always-on.

## VPS quick start

```sh
cd agents/deploy
echo 'GOOGLE_API_KEY=...' > .env
docker compose up -d --build
curl -s localhost:8080/api/list-apps | head   # smoke test: ["personal_agent"]
```

TLS with Caddy (automatic Let's Encrypt), `Caddyfile`:

```
agent.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Or with a Cloudflare Tunnel (`cloudflared`), no ports open at all:

```sh
cloudflared tunnel --url http://localhost:8080
```

## Cloudflare Containers

Push the same image to a registry and point a Cloudflare Container at it:

```sh
docker build -t ghcr.io/yourname/personal-agent .
docker push ghcr.io/yourname/personal-agent
```

In the Cloudflare dashboard: Workers & Pages -> Containers -> create from
the image, set `GOOGLE_API_KEY` as a secret, set the port to 8080. Attach
a volume at `/workspace` if you want the file/git/shell tools to see a
persistent workspace.

## Security checklist

- The ADK REST API has **no built-in authentication**. Do not expose it
  publicly. Use Cloudflare Access, Caddy `basic_auth`, or an mTLS proxy.
- `MISTRAL_API_KEY` (or `GOOGLE_API_KEY` for the gemini provider) enters
  only as an environment secret.
- All file/git/shell tools are confined to `$AGENT_WORKSPACE` (default
  `/workspace` in the container) with symlink escape protection.
- `run_command` still requires human-in-the-loop confirmation; over the
  API/A2A the confirmation request flows back to the calling client.
  Treat any client you connect to it as trusted.

## What the local-agent project inspired here

`local-agent` (in this monorepo) splits one credential-free core from
thin clients: the core owns history and tool approvals, clients own
model/platform connections. The personal agent keeps that separation of
concerns in mind: the container holds no credentials except the Gemini
key, all state lives in the workspace volume, and approvals stay
explicit. Adapters (Slack/Telegram/MCP) would attach over the REST API
or A2A exactly like local-agent's clients attach over its Unix socket.
