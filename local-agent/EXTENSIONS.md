# EXTENSIONS.md

Backlog of ideas that aren't built yet, with enough detail and reference
links that picking one up later doesn't require re-deriving the design from
scratch. This is the file that grows messily over time — that's fine, that's
its job. `SOURCE_OF_TRUTH.md` should only ever contain a one-line pointer
into this file, never the detail itself.

Each entry: what it is, why it's deferred, and links worth reading before
starting it.

---

## #cross-platform-identity — Unify conversations across adapters

**What**: a task started in a Slack thread should be checkable from Telegram
— "hey, how's that research task going" — without the human having to
remember which platform they used to start it.

**Why deferred**: needs a real identity/correlation scheme
(`principal_id` + a platform-agnostic `conversation_id` that adapters map
their native thread/chat IDs onto) before it's worth building — premature
without at least two adapters running to correlate between.

**Reference**: this is the same problem `Matterbridge` solves for plain
message relay (https://github.com/42wim/matterbridge) — worth reading how it
maps native channel/user IDs across platforms before designing this project's
version, even though Matterbridge isn't agent-aware.

## #multi-agent — Coordinator + specialist subagents

**What**: a coordinator agent posts a task, spins up subagents (research,
code, review) as separate executions, stitches results into one thread.
Debate/review pattern (draft → critique → summarize) is a variant worth
supporting the same way.

**Why deferred**: needs the executor tiers (host/container/vm) and the
approval gate solid first — subagent orchestration is a consumer of both,
not a replacement for either.

**Open design questions to resolve before building**: are subagents separate
OS processes or goroutines against the same core loop; how do they address
each other (registry vs. hardcoded wiring per workflow); who arbitrates
disagreement between two subagents.

**Reference**: OpenClaw's multi-agent Telegram supergroup pattern
(https://github.com/raulvidis/openclaw-multi-agent-kit) — bot-to-bot
communication via topic channels, cron schedules, escalation chains. Useful
as a pattern reference even though it's built on a different runtime.

## #mcp-bridge — Additional MCP-facing surfaces

**Implemented**: clients consume external MCP tools over stdio/Streamable HTTP,
and `agent mcp` exposes the core through an `ask` tool with approval elicitation.
Both directions have end-to-end coverage. Network connections belong to the
originating client, not the core. See README.md for configuration.

**Deferred**: validating additional consumer-facing MCP hosts and their
elicitation support. No claim is made that a particular chat product accepts
local MCP servers; verify that product's current integration contract first.

**Reference**: `github.com/modelcontextprotocol/go-sdk` (see
ARCHITECTURE.md). Registry of existing MCP servers worth consuming:
https://geminicli.com/extensions/ and the broader
https://github.com/rdmgator12/Gemini-Awesome-List- for what's already out
there before building a redundant one.

## #social-business-apis — Meta Graph API / LinkedIn Marketing API adapters

**What**: adapters for Facebook Page / Instagram Business posting,
scheduling, comment/DM triage, and insights via the Graph API; LinkedIn
company-page posting via the Marketing Developer Platform if/when access is
granted.

**Why deferred**: lower priority than the chat platforms, and LinkedIn
specifically requires an approved partnership that takes real lead time to
acquire — worth starting the application early if this becomes a priority,
since the adapter code itself is the easy part.

**Explicitly not in scope, ever, without a change to `SOURCE_OF_TRUTH.md`
invariants**: personal-profile automation on any of these platforms
(auto-connect, auto-DM, feed scraping, auto-follow). This is a standing
non-goal, not a "later" item — see `SOURCE_OF_TRUTH.md` §3.

## #android-native-frontdoor — Android client independent of Gemini

**What**: a thin Android adapter (native app, or Termux + Tasker) that talks
to core over the same transport as any other adapter, giving a phone-native
front door that doesn't depend on Google ever opening up Gemini's Connected
Apps surface.

**Why deferred**: no wishlist item currently needs it ahead of the chat
platform adapters; revisit once Slack/Telegram/Discord adapters are stable
and a mobile-specific trigger (e.g. location-based, notification-based)
becomes a real want rather than a hypothetical.

## #digest-and-status — Morning digest, EOD rollup, meeting prep

**What**: core-side skills that pull from multiple sources (calendar, git,
local notes, adapter-visible channel activity) and produce a single summary
posted to whichever adapter is configured as the "default" output.

**Why deferred**: this is the first real *consumer* of having more than one
adapter running plus local data access — sequence it after at least one chat
adapter and the host-tier executor are working, not before.

## #local-internet-access — Bounded web fetch/scrape capability

**What**: a host-tier capability the agent can invoke for fetching/scraping,
with caching so repeated queries don't re-fetch every time.

**Reference**: if scraping volume ever grows enough to trigger IP-based
rate limiting from target sites, proxy services (Bright Data, ScraperAPI) or
a Cloudflare Worker as a caching fetch layer are the standard mitigations —
not needed at low volume, worth knowing before it becomes a problem.

## Template for new entries

```
## #short-slug — Title

**What**: one or two sentences.

**Why deferred**: the actual blocking reason, not "no time yet."

**Reference**: links worth reading before starting.
```
