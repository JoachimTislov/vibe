# ARCHITECTURE.md

This file answers "what do we build this with, and why" for every decision in
`SOURCE_OF_TRUTH.md`. If `SOURCE_OF_TRUTH.md` says *what*, this says *how*,
and links to the tooling that gets you there. Update this when a tooling
choice changes; don't update it for new wishlist items (that's the other
file's job).

## Language: Go, with named Rust exceptions

Go is the default for this entire project: goroutines map cleanly onto the
actor-per-conversation model, static binaries make adapter distribution
trivial, and the platform SDK ecosystem (below) is mature enough that there's
no missing capability forcing a second language for the common path.

Rust is called out explicitly, per component, only where the Go ecosystem is
genuinely thinner — not as a general "or use Rust" escape hatch:

- **microVM isolation (the "vm" executor tier).** Firecracker itself is
  written in Rust. There is an official Go SDK
  (`github.com/firecracker-microvm/firecracker-go-sdk`) that drives it over
  its API socket, so Go still works here — you are not required to write
  Rust — but if you ever need to go deeper than the SDK exposes (custom
  jailer behavior, vsock plumbing), you're reading/patching Rust source, not
  Go.
- **MTProto (raw Telegram protocol, not the Bot API).** If the wishlist ever
  needs user-account-level Telegram access instead of bot-token access, the
  most complete client library is `grammers` (Rust). The Go equivalent
  (`gotd/td`) exists and is usable, but is the less battle-tested of the two.
  For bot-token access (the default plan), this doesn't matter — the
  Telegram Bot API is fine in Go.
- **Headless browser automation at scale.** `chromedp` (Go) is fine for
  normal use. `chromiumoxide` (Rust) is worth knowing about only if profiling
  ever shows the CDP protocol layer itself as a bottleneck — unlikely to
  matter before it's a real, measured problem.

Everything else below is Go-only; don't introduce Rust for it without a
specific measured reason.

### If Go needs to call into Rust directly (FFI, not a subprocess)

The named exceptions above (Firecracker internals, `grammers` for MTProto)
are treated as **separate processes** reached over the existing gRPC
contract, per this project's own separate-process invariant in
`SOURCE_OF_TRUTH.md`. That's the default and should stay the default.

There is a second option worth knowing about, for the narrower case where a
subprocess/IPC hop is itself the problem — a hot path called per-message or
per-frame, where gRPC's serialization and context-switch overhead would
matter: **cgo-based FFI**, calling a Rust library's functions directly from
Go in the same process. This gets you Rust's memory safety and performance
for the specific hot function while the surrounding orchestration stays in
Go's simpler, faster-to-write ecosystem. Concretely:

- Compile the Rust code as a `cdylib`/`staticlib` exposing `extern "C"`
  functions (no Rust ABI crosses the boundary — only the C ABI does).
  `cbindgen` generates the matching C header from the Rust source
  automatically, which is what Go's `import "C"` cgo preamble compiles
  against.
- This is real, working glue, not a research project — cgo-to-Rust is a
  well-worn pattern — but it comes with real costs worth weighing against
  the subprocess default:
  - `CGO_ENABLED=1` is required, which complicates cross-compilation and
    gives up the trivially-portable static Go binary this project otherwise
    gets for free.
  - Panics must be caught on the Rust side (`std::panic::catch_unwind`)
    before crossing back into Go — an uncaught Rust panic across the FFI
    boundary is undefined behavior, not a recoverable Go error.
  - A crash in the Rust library takes down the whole Go process with it,
    since it's in-process — the opposite of the fault isolation the
    subprocess/gRPC approach gives every other component in this project.
- **Default to the subprocess approach.** Reach for cgo/FFI only if
  profiling shows a specific hot path where the IPC hop is the measured
  bottleneck — not preemptively, and not just because a Rust library
  happens to be available for something Go can already do.

## Core ↔ adapter contract: gRPC over a Unix domain socket

The generated contract is checked into `gen/core/v1`. `internal/core/server.go`
now runs the service. `pkg/client` is the shared adapter-side protocol client;
adapters use it and do not import core internals. Version 1.1 extends the
existing fields with principal binding, a tool catalog, and capability
request/results. Original 1.0 Hello messages remain accepted; their first
inbound principal binds the stream.

The core owns bounded in-memory conversation actors and chat history, scoped
by principal, adapter, and conversation. It asks the originating client for
model turns and MCP tool calls through the same stream. `pkg/runtime` makes
those calls. No HTTP client, model credential, or platform token is present
in the core. A deployment can therefore deny network egress to the core while
allowing it for selected clients. This is an architectural separation, not
an installed firewall or container policy.

Every model-requested tool goes through the core approval gate, including
tools advertised as read-only. Approval IDs are random, expire, and are bound
to the originating session, principal, and conversation. Capability results
are correlated the same way. The stream reader remains active while a
conversation waits for model/tool results or approval. Disconnect and shutdown
cancel pending work. Replies are responses to explicit user requests; arbitrary
platform sends are not exposed as an unapproved core action.

- Wire contract lives in `proto/core/v1/core.proto`, compiled with
  `protoc`/`buf` into Go structs. This is the actual source of truth for the
  message shapes — `SOURCE_OF_TRUTH.md` describes intent, this proto file is
  what adapters compile against.
- Local transport is a Unix domain socket (`net.Listen("unix", path)`),
  wrapped by a standard `grpc.Server`. gRPC does not care whether it's
  running over a Unix socket or TCP — the service definition, generated
  code, and application logic are identical either way. This is what makes
  "don't block remote later" free: swapping the listener from
  `unix://` to `tcp://` behind mTLS (via `credentials.NewTLS`) is a transport
  change, not a rewrite. TCP/mTLS is not implemented in this checkpoint.
- Contract evolution: additive-only. New fields get new tag numbers; new
  message kinds are added as new `oneof` variants in the envelope, never by
  repurposing an existing field. This is what lets an adapter written today
  keep working against a core built a year from now.
- Bidirectional streaming (`stream AdapterEnvelope` in, `stream CoreEnvelope`
  out) rather than unary request/response, so the core can push approval
  requests or async task updates to an adapter without the adapter having to
  poll.

## Secrets: OS keychain via `go-keyring`

- `github.com/zalando/go-keyring` wraps macOS Keychain, Linux Secret
  Service (via `libsecret`/D-Bus), and Windows DPAPI behind one interface.
  This satisfies the invariant directly — no plaintext secrets file, no env
  var dump.
- `pkg/credentials` defines a small `Store` interface so the keyring
  dependency is swappable later (e.g. if a headless Linux box without a
  Secret Service daemon needs a different backend) without touching callers.

Onboarding uses masked terminal input and writes non-secret config atomically
with mode 0600. Slack credentials are fetched from keychain for each adapter
run and supplied to `slack api` in its private child environment. Command
arguments and error messages omit tokens. The selected Telegram CLI owns its
private, file-backed authentication session; `agent login telegram` creates
only a missing non-secret profile and runs its interactive login unchanged.

## Execution backends (per-task isolation policy)

The original container/VM executors remain explicit unimplemented backends;
they are not connected to a runnable fallback path. Current model commands
are trusted, fixed stateless provider argv configured by the operator. MCP
server commands are also operator configuration, never model-supplied argv.
Their network and execution boundary is the client process. General
multi-step and persistent task execution still requires implementing the
corresponding isolated executor before it can be exposed.

`internal/executor/policy.go` classifies each task into one of three tiers;
`internal/executor/{host,container,vm}.go` implement the corresponding
backend behind a single `Executor` interface.

- **Host tier** — direct `os/exec`. For quick, stateless work (e.g. forward a
  prompt to a model API and return the answer). Same trust boundary as your
  user account, so this tier is reserved for the lowest-risk task class.
- **Container tier** — Docker Engine API (via `github.com/docker/docker/client`,
  the official Go client) or shelling out to the `docker` CLI for a simpler
  v1. For long-running, multi-step tasks (research, multi-file edits) where
  you want filesystem/network containment without the overhead of a full VM
  per task. Consider layering `gVisor` (`runsc`) as the container runtime for
  stronger syscall containment if the container tier ever runs less-trusted
  code.
- **VM tier** — for an agent process that is genuinely persistent (never
  stops), a full VM boundary is worth the overhead. Options, roughly in order
  of effort: (1) a plain long-lived VM you SSH into, orchestrated via
  `golang.org/x/crypto/ssh` — lowest effort, good enough for v1; (2)
  Firecracker microVMs via `firecracker-go-sdk` — proper per-agent VM
  isolation with fast boot, more moving parts to operate. Start with (1),
  move to (2) only once the VM tier is actually load-bearing.

## Observability

- `log/slog` (Go stdlib, 1.21+) for structured logs, one correlation ID
  (`conversation_id` or `task_id`) threaded through every log line from
  adapter receipt to core dispatch to executor to reply. This is the minimum
  needed to answer "why did the agent do that" after the fact.
- Not doing distributed tracing (OpenTelemetry) on day one — revisit once
  there's more than one core instance or the request path is deep enough
  that log correlation alone stops being enough.

## Platform adapter SDKs (Go)

- **Slack** — user-selected `https://github.com/slackapi/slack-cli`.
  `pkg/platform/slack.go` calls `slack api auth.test`, conversation
  history/replies, and `chat.postMessage`. Personal and bot tokens are
  explicit configuration choices. Polling watches only selected channels
  and owner-issued `agent: ...` messages. CLI `api` command/JSON behavior was
  inspected at `fcb07820d23096758f075ed7a45f5599bab706da`.
- **Discord** — `github.com/bwmarrin/discordgo`, mature, handles the gateway
  websocket directly.
- **Telegram** — user-selected `https://github.com/vysheng/tg`.
  `pkg/platform/telegram.go` starts its `telegram-cli` JSON event stream
  and private Unix command socket. Replies use the `ANSWER <length>` framed
  socket protocol, with quoted text and validated permanent message IDs.
  Source protocol inspected at `6547c0b21b977b327b3c5e8142963f4bc246187a`.
  The exact upstream checkout builds with `--disable-openssl --disable-liblua
  --enable-json --enable-libconfig` and `-fcommon` on current GCC; it reached
  the interactive phone-number prompt with a new private profile. No account
  credentials or substitute CLI are used.
- **MCP** (both as a bridge target and, longer-term, a way to be reachable
  from MCP-speaking surfaces) — `github.com/modelcontextprotocol/go-sdk`,
  the official SDK, maintained in collaboration with Google. Packages:
  `mcp` (client/server), `jsonrpc` (custom transports), `auth`/`oauthex`
  (OAuth primitives). The client runtime consumes stdio and Streamable HTTP
  tools; `pkg/mcpfront` exposes the gateway's `ask` tool over stdio. Human
  approvals are MCP form elicitation requests; unsupported/declined requests
  deny the core action.

## Prior art worth knowing, not depending on

- **Matterbridge** (Go) — a mature multi-protocol chat relay covering most
  of the same platforms. Not an agent framework and not a dependency of this
  project, but its adapter-per-platform structure is a useful reference for
  shaping `cmd/adapters/`.
- **OpenClaw** — the closest existing "one agent, many channels" product.
  Different language (Node.js), different design center (autonomous
  heartbeat daemon vs. this project's explicit approval-gated router), and
  has had a serious RCE in the wild — a useful cautionary reference for the
  isolation-tier decisions above, not a codebase to build on.

## Build/test tooling

- `buf` for proto linting/generation (`buf.gen.yaml`, not committed yet —
  add when the proto file grows past what raw `protoc` invocations handle
  comfortably).
- `make fmt` runs Go formatting; `make vet` runs `go vet ./...`; `make test`
  runs the race-enabled suite. E2E tests launch real core/client processes
  and use the public client operations as entrypoints, including headless
  Neovim and the SDK's MCP client. External platform CLI processes and model
  endpoints are protocol fixtures, while core dispatch, approval, history,
  MCP SDK transports, and reply routing are real. Each Slack and Telegram
  test asserts on the final server output delivered through the platform
  CLI and proves a tool runs only after the owner's approval. Fixture
  coverage does not assert that upstream Telegram login still works.
