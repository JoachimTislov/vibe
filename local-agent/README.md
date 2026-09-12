# Local agent gateway

One local Go core, reached through Slack, Telegram, a terminal/Neovim client,
or MCP. Clients are separate processes connected over a private Unix socket.
The core owns conversation history and tool approvals. Clients own model,
MCP, and platform connections: the core needs no internet access or credentials.

## Start here

For a fresh installation, follow [ONBOARDING.md](ONBOARDING.md). The short
path below is useful once the prerequisites and account profiles are ready.

Requirements: Go 1.25+, an OS keychain (Secret Service on Linux), and a model
provider. Neovim is required for the complete test suite. Generated protobuf
sources are included; `protoc` is only needed to change the wire contract.

```sh
make build
./bin/agent setup
./bin/agent doctor --config config.local.json
./bin/coreserver
```

In another terminal:

```sh
./bin/agent local --config config.local.json
# Or one prompt, suitable for scripts:
./bin/agent local --config config.local.json --prompt 'Explain this project'
```

Setup asks which clients to enable, which account mode to use, which chats
may trigger the agent, and whether to allow MCP tools. Tool operations are
disabled by default. Each enabled tool call still needs explicit approval.
Re-running setup preserves defaults and asks before replacing the configuration.

The default provider is an existing local Ollama service with `qwen3:8b`.
Install/pull your chosen model separately, then select its name during setup.
An HTTP provider uses Ollama's `/api/chat` contract, including tool calls.
HTTPS endpoints can use a bearer key from `model.keychain_key`. The core
does not contact that endpoint; the originating client does.

For a CLI model provider, configure a fixed JSON argv array. The command reads
one non-streaming Ollama-shaped chat request on stdin and writes
`{"message":{"role":"assistant","content":"..."}}` on stdout. Tool calls use
the same `message.tool_calls[].function` representation as the HTTP provider.
This is a protocol for trusted stateless model programs, not a general shell tool.

## Slack: the official CLI

Use **[slackapi/slack-cli](https://github.com/slackapi/slack-cli)** with the
`slack api` command. No alternative Slack CLI is used. `agent doctor` checks
that the installed command supports the required API interface. Install it
using the [official instructions](https://docs.slack.dev/tools/slack-cli/).

Personal mode uses a scoped OAuth user token (`xoxp-`). Bot mode accepts
`xoxb-`. Enter the token into the masked `agent setup` prompt; it is kept in
the OS keychain. The adapter supplies it only in the selected CLI child's
environment, never in command arguments or your project configuration.
`slack login` authenticates the development CLI; that login alone is not a
substitute for a token with access to the conversations selected here.

Choose your Slack user ID and channel/DM IDs during setup. Install/grant your
Slack app the relevant `chat:write` and conversation history scopes; private
channels require membership. Thread polling also requires token access to
`conversations.replies` for the chosen conversation types.
See the [method's token requirements](https://docs.slack.dev/reference/methods/conversations.replies/).

```sh
./bin/agent slack --config config.local.json
```

Post `agent: your prompt` in an allowed channel. Replies go into that message's
thread. Send `agent: approve ID` or `agent: deny ID` in the same thread when
the agent asks. Only commands from the configured owner are accepted.
This is ordinary message text, not a registered
[Slack slash command](https://docs.slack.dev/interactivity/implementing-slash-commands/).

History polling starts at adapter startup; it does not process your old
conversations. Polling defaults to 15 seconds and follows pagination.
Slack account/app rate limits still apply; set `slack.poll_seconds` accordingly.

## Telegram: vysheng/tg

Use **[vysheng/tg](https://github.com/vysheng/tg)**, whose binary is
`telegram-cli`. Build with JSON and libconfig support. The adapter uses its
`--json` events and `-S` Unix command socket; it does not substitute another
Telegram library or CLI.

Compatibility warning: `vysheng/tg` is a legacy `telegram-cli` codebase with
old native build dependencies and no modern release/support cadence. The
selected checkout builds and reaches its interactive login prompt with the
documented compatibility flags, but this repository has not claimed live
account delivery or production support for it. For a maintained personal/
bot MTProto implementation, evaluate [gotd/td](https://github.com/gotd/td)
before deploying beyond a controlled operator environment; switching clients
requires preserving the adapter's tested event and command-socket contract.

This selected upstream has legacy build dependencies. With a current OpenSSL
toolchain, its bundled RSA code may not compile; the upstream-supported
libgcrypt build works without changing the source tree:

```sh
git clone --recursive https://github.com/vysheng/tg
cd tg
./configure --disable-openssl --disable-liblua --enable-json --enable-libconfig
make COMPILE_FLAGS='-std=gnu11 -fcommon -O2 -DHAVE_CONFIG_H -Wall -Wextra -Wno-deprecated-declarations -Wno-unused-parameter -fno-strict-aliasing -fno-omit-frame-pointer -fPIC'
```

The command needs readline, event, jansson, libconfig, zlib, and libgcrypt
development packages. `agent doctor` checks the installed executable for JSON
support. On this machine the exact upstream checkout built with that command
and reached its phone-number prompt using a new private profile; no number,
login code, or message was entered. The E2E fixture validates the documented
command protocol, while live account delivery still requires the operator's
login.

Select personal mode first, or bot mode for a separate bot profile. Onboarding
defaults to a dedicated profile under the OS configuration directory. Then:

```sh
./bin/agent login telegram --config config.local.json
# Finish the selected CLI's phone/code/2FA flow, then quit it.
./bin/agent telegram --config config.local.json
```

Login creates a missing private profile configuration without overwriting an
existing one. `telegram-cli` owns its authentication/session files in that
profile. These files grant account access; keep the profile directory private.
The gateway does not copy them into the core, project config, or keychain.
Bot mode invokes the same CLI with `-b` and its interactive bot login.

The owner is your numeric Telegram user ID (`get_self` in the CLI can show
your personal account). Allowed peers are `user:123`, `chat:123`, or
`channel:123`. Saved Messages (`user:YOUR_ID`) is the default personal surface.
Send `/agent your prompt`; approvals use `/agent approve ID` or `/agent deny ID`
in the same chat. Other senders and peers are ignored. Replies are explicitly
marked `[agent]` and quoted for Telegram's command parser.

## Neovim

Add `integrations/neovim` to your runtime path, then configure the command:

```lua
vim.opt.rtp:append('/absolute/path/local-agent/integrations/neovim')
require('local_agent').setup({
  command = { '/absolute/path/local-agent/bin/agent', 'local', '--json',
              '--config', '/absolute/path/config.local.json' },
})
```

`:Agent explain this` opens the server reply in a scratch split. A visual
range is included as context. Approvals use `vim.ui.select`, with Deny first.
The plugin never evaluates model output as editor commands.

The same JSON-lines interface works with other editors:

```json
{"id":"question-1","conversation":"notes","text":"Summarize this note"}
{"approval_id":"ID_FROM_APPROVAL_EVENT","approved":true}
```

Stdout contains `reply` and `approval` events. Keep stdin open to answer
approvals; EOF and one-shot mode deny actions that cannot be confirmed.

## MCP in both directions

Clients can consume MCP servers over stdio or Streamable HTTP. Configure
`mcp` entries with a unique `name` and exactly one `command` argv array or
`url`. Advertised tool names are `server__tool`; `allowed_tools` selects the
tools to expose. `*` explicitly enables all configured tools, each requiring
core approval. MCP read-only annotations do not bypass approval.

Run `agent mcp --config config.local.json` (or `bin/mcp`) as a stdio MCP
server. Its `ask` tool forwards through the same core. Tool approvals use MCP
form elicitation; clients without elicitation support cannot approve actions.

## Verification and current limits

```sh
make fmt
make vet
make test
# Optional: exercise an unmodified official Slack CLI against local HTTPS fixtures.
AGENT_SLACK_CLI=/absolute/path/to/slack make test-upstream
# Regenerate after editing the proto:
make proto
```

Tests build the real core and clients as subprocesses. Each Slack/Telegram
test enters through its adapter and source-derived external CLI interface,
then verifies model requests, MCP results, approval enforcement, and the
server's final output delivered back to the platform. Only external services,
platform CLI binaries, and account credentials are fixtures. Neovim and MCP
have their own client-entrypoint tests. Tests do not log into accounts or
send real Slack/Telegram messages.

Conversation state and duplicate suppression are in memory; there is no
durable delivery/recovery promise. The core bounds conversations to 256,
queued messages per conversation to 16, and tool rounds to eight. Context
is reset after a completed exchange exceeds 32 messages. Slack watches up
to 128 command threads per adapter run. Restarting resets this state.
Attachments, ACP, autonomous jobs, and container/VM execution remain outside
the implemented command flow; the original isolation classifier/backends are
retained for future task execution. No arbitrary execution fallback is enabled.

Live checks remain separate from deterministic E2E tests. On 2026-09-12,
the real local CLI/core/Ollama path returned `LOCAL_AGENT_OK` from the existing
`gemma4:latest` model, and the unmodified official Slack CLI passed the
approval/denial E2E against a local HTTPS API fixture. Live Slack/Telegram
account login and delivery still require the operator's credentials; do not
treat fixture success as proof that an account is configured.

Project intent is in [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md), implementation
decisions in [ARCHITECTURE.md](ARCHITECTURE.md), and future ideas in
[EXTENSIONS.md](EXTENSIONS.md).
