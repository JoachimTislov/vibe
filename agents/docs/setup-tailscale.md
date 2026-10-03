# Setup: Tailscale / Headscale (tailnet or public internet)

Expose the agent from any machine - VPS, homelab, Raspberry Pi - through
Tailscale, with zero open inbound ports. Two levels:

| Level | Command | Who can reach it |
|-------|---------|------------------|
| Tailnet only | `tailscale serve` | Your devices only (recommended) |
| Public internet | `tailscale funnel` | Anyone with the URL (use with care) |

The agent keeps running in an isolated container process; Tailscale only
forwards traffic to `localhost`.

This guide works with the official Tailscale control server and, with
the differences described at the bottom, with **Headscale**, the
self-hosted control server.

## 1. Install and start the agent

Follow [setup-vps.md](setup-vps.md) steps 1-3 on the host (a full VPS
guide also works for a homelab box). Both services are up:

- ADK REST API on `127.0.0.1:8080`
- MCP on `127.0.0.1:8081`

## 2. Install Tailscale on the host

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale status        # note the machine name, e.g. agentbox
```

## 3a. Tailnet-only serving (private)

```sh
sudo tailscale serve --bg --https=443 http://localhost:8080        # REST API
sudo tailscale serve --bg --https=8443 http://localhost:8081       # MCP on a second port
```

Or keep MCP on its default path on one port:

```sh
sudo tailscale serve --bg --https=443 http://localhost:8081
```

From any of your devices:

```sh
claude mcp add --transport http personal-agent https://agentbox.tailnet-name.ts.net/mcp
```

TLS certificates are issued and renewed automatically by Tailscale.
No ports are opened; the connection rides your tailnet.

## 3b. Public internet via Funnel

Funnel publishes the endpoint on the public internet through
Cloudflare's network, still without opening ports on the host:

```sh
sudo tailscale funnel 443 on
sudo tailscale funnel --bg 443 http://localhost:8081
sudo tailscale funnel status
```

The MCP endpoint is now `https://agentbox.tailnet-name.ts.net/` - usable
by anyone who knows the URL, including hosted agents (Claude, Codex,
Gemini, Mistral cloud offerings) that can be configured with a remote MCP
URL.

Security reality check:

- The MCP endpoint has **no built-in authentication**. Funnel makes it
  public. That is acceptable for read-only usage, but anyone can also
  call `ask_agent` and spend your model credits.
- Options, in order of effort:
  1. Prefer `tailscale serve` (tailnet-only) unless you truly need
     public reachability.
  2. Run a tiny auth proxy in front (Caddy `basic_auth`) and funnel to
     that instead.
  3. Use a funnel allowlist on a hostname you rotate.
- The agent process itself stays isolated: container, non-root user,
  workspace volume only. Tailscale never runs inside the container.

## 4. Verify

```sh
curl -s https://agentbox.tailnet-name.ts.net/mcp -X POST \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

A JSON-RPC result means the agent is reachable through Tailscale.

## 5. Headscale instead of the Tailscale control server

[Headscale](https://headscale.net) is the self-hosted, open-source
control server; the same `tailscale` client joins it. Setting it up:

```sh
# On the control server (docs: headscale.net/stable):
#   install headscale, configure dns.magic_dns + base_domain, start it
headscale users create joachim
headscale preauthkeys create --user joachim --expiration 1h

# On the agent host and on each of your client devices:
sudo tailscale up --login-server https://headscale.example.com --authkey <key>
```

What changes for this guide:

| Feature | Official Tailscale | Headscale |
|---|---|---|
| Direct tailnet access (WireGuard) | Works | Works |
| `tailscale serve` with HTTPS | Works, auto-certificates | Feature gap: the node HTTPS certificate flow is not implemented (headscale issue #1921) |
| `tailscale funnel` (public internet) | Works | Not available - it depends on Tailscale's cloud/Cloudflare integration |

Practical consequences:

- **Tailnet-only: fully works, and it is simpler than `serve`.** Your
  devices reach the container directly at its tailnet address:

  ```sh
  claude mcp add --transport http personal-agent http://agentbox:8081/mcp
  # or by tailnet IP: http://100.x.y.z:8081/mcp
  ```

  The traffic is WireGuard-encrypted end to end; the plain HTTP rides
  inside it. For TLS inside the tailnet, run Caddy on the host with any
  certificate you like and point it at `127.0.0.1:8081`.

- **Public internet: use a normal reverse proxy instead of funnel.**
  Point a domain at the host, open 443, and let Caddy terminate TLS:

  ```
  agent.example.com {
      reverse_proxy 127.0.0.1:8081
  }
  ```

  Or skip open ports entirely with the Cloudflare Tunnel path from
  [setup-cloudflare.md](setup-cloudflare.md) - it is control-server
  agnostic and works behind Headscale.

Headscale keeps the isolation story unchanged: the agent process stays in
its container; only the coordination of your devices moves to your own
server.
