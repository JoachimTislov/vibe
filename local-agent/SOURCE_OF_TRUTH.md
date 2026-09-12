# SOURCE_OF_TRUTH.md

This file is the only place intent lives. It is meant to stay cheap to update:
append a line, change a status tag, done. It does **not** contain wire schemas
(`proto/core/v1/core.proto`), tooling choices (`ARCHITECTURE.md`), or backlog
detail (`EXTENSIONS.md`) — those files exist so this one can stay short.

Rule for maintaining this file: if an edit here takes more than five minutes,
the content belongs in one of the other two files instead, and this file
should just link to it.

---

## 1. Non-negotiable invariants

These are the load-bearing decisions. Changing one of these is a project-wide
migration, not a config edit — treat any change here as requiring a pass over
every adapter and the core.

- Every request that enters the core carries a `principal_id`. There is
  exactly one principal today, but nothing in core, storage, or the approval
  gate is allowed to assume there is only ever one.
- Adapters are separate OS processes. No adapter compiles against core
  internals; the only contract between them is `proto/core/v1/core.proto`.
- The core never talks to a platform API directly. Platform-specific code
  lives only in adapters.
- State-changing actions require an explicit approval step, enforced by the
  core's dispatch layer, not by individual skills choosing to ask nicely.
- Secrets (platform tokens, model API keys) live only in the OS keychain,
  never in the gateway config, logs, or committed anywhere. The selected
  external CLI owns its login session: `vysheng/tg` stores session files in
  a private profile. Slack tokens are injected only into the official CLI
  child's environment from the keychain. The core receives no credentials.
- Execution isolation is chosen per task, not fixed globally:
  - quick, stateless hand-off to a model/API provider → **host** process
  - long-running, multi-step task (research, multi-file edits) → **container**
  - persistent / always-on agent that never stops → **VM**
  (see `internal/executor/policy.go` for the classifier and
  `ARCHITECTURE.md` for the backend tooling behind each tier)
- The core↔adapter wire contract only changes additively (new fields, new
  oneof variants). Breaking an existing adapter is treated as a bug, not a
  version bump users are expected to absorb.
- This is the only project. New platform support, new capability, new
  workflow — all of it extends this repo. A second, competing scaffold is
  itself a bug.

## 2. Desired capabilities (the wishlist)

Status tags: `idea` → `planned` → `building` → `done`. Keep entries to one
line; if it needs more than a line, put the detail in `EXTENSIONS.md` and
link it from here.

- [done]    Core exposes a stable gRPC contract over a Unix socket to adapters
- [building] Slack adapter using `slackapi/slack-cli`; personal/bot modes and CLI-entrypoint E2E implemented; live account verification pending
- [building] Telegram adapter using `vysheng/tg`; personal/bot modes and CLI-entrypoint E2E implemented; upstream build/startup verified, account login and delivery pending
- [done] Local CLI and Neovim entrypoint, including conversation history and explicit tool approvals
- [done] Client-owned model API/CLI and MCP access; core has no internet dependency
- [done] Interactive onboarding selects clients, account modes, allowed peers, and MCP operations
- [done]    Full deterministic E2E suite: core, local, Neovim, Slack, Telegram, MCP, onboarding; live account checks remain separate
- [planned] Discord adapter (gateway websocket)
- [idea]    Digest generation (morning brief, EOD status rollup) as a
            core-side skill, platform-agnostic
- [idea]    Delegated work: "do X" in a thread → agent runs it via the
            executor, reports back with results/diff in the same thread
- [idea]    Cross-platform conversation correlation (task started in Slack,
            checked from Telegram) — see EXTENSIONS.md #cross-platform-identity
- [idea]    Multi-agent orchestration (coordinator + specialist subagents)
            — see EXTENSIONS.md #multi-agent
- [done]    MCP bridge in both directions through clients: consume stdio/HTTP tools and expose the core through stdio `ask` with elicitation approvals
- [idea]    Local internet access (fetch/scrape) as a bounded, host-tier
            capability
- [non-goal, permanent] Personal-account social media automation (auto-DM,
            auto-follow, feed scraping) on platforms whose ToS forbid it.
            Business/creator API integrations (Meta Graph API, LinkedIn
            Marketing API) are in scope; personal-profile automation is not,
            regardless of how the request is phrased later.

## 3. Explicit non-goals (for now)

- Not a multi-tenant SaaS product. Single-user today; the `principal_id`
  plumbing exists so this can change later without a rewrite, not because
  it's needed now.
- Not reimplementing OpenClaw's autonomy/heartbeat model. This project is a
  router/gateway with an explicit approval gate, not a daemon that acts
  unprompted by default.
- Not chasing every platform on day one. Adapters get added when a wishlist
  item needs them, not speculatively.

## 4. Changelog

Keep this to one line per change. Newest first.

- `2026-09-12` — real core/client transport, client-owned AI/MCP, selected platform CLI integrations, onboarding, Neovim, and E2E tests.
- `YYYY-MM-DD` — initial scaffold: invariants, wishlist, non-goals established.
