# Setup: any VPS

Run the personal agent on any Linux VPS (Hetzner, DigitalOcean, Linode,
Hetzner cloud, Oracle free tier, a home server). Assumes a Debian/Ubuntu
host with root or sudo.

## 1. Host prerequisites

```sh
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER"   # log out and back in
```

## 2. Get the code and configure

```sh
git clone https://github.com/JoachimTislov/vibe.git
cd vibe/agents/deploy

# BYOK: pick exactly one provider and set its key
cat > .env <<EOF
AGENT_MODEL_PROVIDER=mistral
MISTRAL_API_KEY=your-key
# other providers:
# AGENT_MODEL_PROVIDER=openai      OPENAI_API_KEY=...
# AGENT_MODEL_PROVIDER=openrouter  OPENROUTER_API_KEY=...
# AGENT_MODEL_PROVIDER=groq        GROQ_API_KEY=...
# AGENT_MODEL_PROVIDER=anthropic   ANTHROPIC_API_KEY=...
# AGENT_MODEL_PROVIDER=gemini      GOOGLE_API_KEY=...
# AGENT_MODEL_PROVIDER=ollama      (keyless, needs Ollama reachable)
# AGENT_MODEL_PROVIDER=cli         AGENT_CLI_COMMAND='["claude","-p"]'
# AGENT_MODEL_PROVIDER=custom      AGENT_BASE_URL=... AGENT_MODEL=... [AGENT_API_KEY=...]
EOF
chmod 600 .env
```

## 3. Start (isolated process)

```sh
docker compose up -d --build
```

Compose runs two isolated containers, both bound to localhost only:

| Service    | Mode | Address            | Purpose                        |
|------------|------|--------------------|--------------------------------|
| agent      | api  | 127.0.0.1:8080     | ADK REST API (`/api/list-apps`) |
| agent-mcp  | mcp  | 127.0.0.1:8081     | MCP endpoint for AI CLIs       |

Each container is its own process boundary: non-root user, no host
filesystem except the `./workspace` volume, no inbound access except what
you front it with.

```sh
curl -s localhost:8080/api/list-apps        # ["personal_agent"]
curl -s localhost:8081/mcp -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

## 4. TLS with Caddy (recommended for public serving)

```sh
sudo apt install -y caddy
# /etc/caddy/Caddyfile
agent.example.com {
    basic_auth       # or Cloudflare Access in front; the APIs have no built-in auth
    reverse_proxy 127.0.0.1:8080
    handle_path /mcp* {
        reverse_proxy 127.0.0.1:8081
    }
}
sudo systemctl reload caddy
```

## 5. Point AI CLIs at it

```sh
# Claude Code
claude mcp add --transport http personal-agent https://agent.example.com/mcp

# Codex (~/.codex/config.toml)
[mcp_servers.personal-agent]
url = "https://agent.example.com/mcp"

# Gemini CLI (~/.gemini/settings.json)
{ "mcpServers": { "personal-agent": { "url": "https://agent.example.com/mcp" } } }

# Any other MCP-capable client (including Mistral CLIs/agents):
# streamable HTTP endpoint, no special extensions.
```

## 6. Operations

```sh
docker compose logs -f agent        # logs
docker compose pull && docker compose up -d --build   # update
docker compose down                 # stop
```

Back up `./deploy/workspace` (agent-visible files) and `.env` (keys).
