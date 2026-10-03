# Setup: Cloudflare

Two viable Cloudflare paths, one dead end:

| Path | Verdict | Notes |
|------|---------|-------|
| Cloudflare Tunnel from any host | Recommended | Same container as the VPS guide; zero open ports; works from a homelab |
| Cloudflare Containers (beta) | Works | Same Docker image managed by Cloudflare; sleeps on inactivity |
| Cloudflare Workers | No | Workers are V8 isolates running JS/WASM - not Go server processes |

## 1. Prepare the image

Both paths need the image in a registry Cloudflare can reach:

```sh
cd vibe/agents
docker build -t ghcr.io/<you>/personal-agent:latest .
docker push ghcr.io/<you>/personal-agent:latest
```

## 2a. Path A: Cloudflare Tunnel (recommended)

Run the agent on any machine you control (VPS or homelab) exactly as in
[setup-vps.md](setup-vps.md) steps 1-3, then publish it through
Cloudflare's network without opening ports:

```sh
# Install cloudflared on the host
sudo mkdir -p /etc/cloudflared && cd /etc/cloudflared
cloudflared tunnel login
cloudflared tunnel create personal-agent
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: personal-agent
credentials-file: /etc/cloudflared/<tunnel-id>.json
ingress:
  - hostname: agent.example.com
    path: ^/mcp
    service: http://localhost:8081
  - hostname: agent.example.com
    service: http://localhost:8080
  - service: http_status:404
```

```sh
cloudflared tunnel route dns personal-agent agent.example.com
sudo cloudflared service install    # starts on boot
```

Protect the hostname: in the Cloudflare dashboard add an Access policy
(email OTP or a service token) on `agent.example.com` - the APIs have no
built-in auth, and Access gives you an identity layer for free. AI CLIs
that need to pass through Access can use service tokens as headers.

Then point CLIs at it:

```sh
claude mcp add --transport http personal-agent https://agent.example.com/mcp
```

## 2b. Path B: Cloudflare Containers (beta)

In the Cloudflare dashboard: Workers & Pages -> Containers:

1. Create a container application from
   `ghcr.io/<you>/personal-agent:latest`.
2. Instance: 1 vCPU / 1 GB is plenty.
3. Port: 8080. Command override: `["mcp"]` to serve MCP, or leave the
   default (`api`) for the REST API.
4. Secrets: set your provider key (`MISTRAL_API_KEY` etc.) and
   `AGENT_MODEL_PROVIDER`.
5. Optional: attach a volume at `/workspace` so file/git tools see a
   persistent workspace.
6. Deploy; Cloudflare fronts it with a `*.containers.cloudflare.com`
   style URL (or bind a custom domain) and handles TLS.

Caveats to plan around:

- Beta: limits and behavior can change.
- Instances sleep on inactivity; the first request after idle pays a
  cold start (seconds, since the image is small).
- Outbound HTTPS (to the model API) is fine from containers.
- For hard isolation boundaries, the VPS/Tailscale guides give you a
  full OS container to yourself; Cloudflare Containers give you a
  Cloudflare-managed sandbox.

## 3. Verify

From anywhere on the internet:

```sh
curl -s https://agent.example.com/mcp -X POST \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

A JSON-RPC result means the deployment is live.
