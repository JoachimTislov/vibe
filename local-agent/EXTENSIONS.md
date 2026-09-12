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

## #grocery — Telegram grocery list and allowlisted site lookup

**What**: expose a dedicated `/grocery` command in the Telegram adapter with
three explicit operations: `add`, `list`, and `delete`. The list is scoped to
the authenticated principal and a stable item ID. `list` is read-only;
`add` and `delete` are state changes that must pass the existing core approval
gate before they are committed. A future `search` operation may query selected
grocery websites, but Telegram text or model output must never choose an
arbitrary URL.

**Reuse existing free/open-source tooling**: use [Colly](https://github.com/gocolly/colly)
for bounded HTTP collection and [goquery](https://github.com/PuerkitoBio/goquery)
for HTML/CSS-selector parsing. Use [chromedp](https://github.com/chromedp/chromedp)
only for an explicitly allowlisted site that requires JavaScript rendering;
the default path must remain a plain HTTP fetch. Pin reviewed versions and
licenses in `go.mod`; do not copy a scraper wholesale or introduce a generic
"scrape any URL" tool.

**Site registry and access policy**:

- Onboarding selects named sites from an operator-maintained registry. Each
  site has an exact HTTPS origin, parser version, rate limit, and capabilities
  (`search`/read and, only if explicitly enabled, cart/list write).
- Scraping runs in the client/adapter process or an MCP tool, never in the
  core. Requests are limited to registered origins and known paths; redirects,
  private-network targets, arbitrary headers, and model-supplied URLs are
  rejected. Responses are size-limited, cached, and stripped of credentials
  before reaching the model or Telegram.
- Per-site login/session material is held in the OS keychain or the selected
  site's private session store. It is never placed in `config.local.json`, the
  grocery database, Telegram text, logs, or tool arguments.
- A site write action must display the site, item IDs, quantities, and the
  exact mutation in the approval prompt. Adding to a cart is distinct from
  placing an order; checkout, payment, address changes, and automatic
  purchasing are out of scope until explicitly designed and separately gated.

**Data and command design**:

- Store items locally in a small, mode-0600 durable store keyed by
  `principal_id`; do not make a website account the source of truth for the
  grocery list. An item has an opaque ID, normalized name, quantity/unit,
  notes, optional site/product reference, and timestamps.
- Telegram accepts `/grocery add <name> [quantity]`, `/grocery list`, and
  `/grocery delete <item-id>`. Natural-language prompts may be a convenience
  later, but the explicit command grammar remains the unambiguous entrypoint.
- Unknown commands, ambiguous delete names, non-owner senders, and peers not
  selected during onboarding are rejected without contacting a website.
- The core should receive a structured additive capability request rather
  than a raw URL or shell command. The Telegram adapter formats deterministic
  replies; it does not directly mutate storage or bypass approval.

**Delivery plan**:

1. Define `GroceryItem`, `GroceryAction`, and a bounded store interface;
   implement add/list/delete against a local test store with unit tests for
   principal isolation, duplicate IDs, and delete ambiguity.
2. Add a durable local store and onboarding fields for enabling grocery,
   selecting Telegram peers, and selecting named website capabilities. Keep
   existing configs valid through additive fields.
3. Add Telegram command parsing and a fixture E2E whose entrypoint is the
   Telegram CLI protocol. Assert owner filtering, list output, approval before
   add/delete, denial behavior, and that no website request occurs for local
   list operations.
4. Add one source-derived allowlisted website fixture using Colly/goquery.
   Test search parsing, redirect/URL rejection, rate limits, credential
   redaction, and an approved cart mutation; never use a real shopping account
   in deterministic tests.
5. Add optional operator-run live checks for one configured site, with an
   explicit dry-run default and a separate confirmation before any external
   write.

**Why deferred**: durable state, site-specific parsers, authentication
sessions, and write approvals are materially different risk surfaces from the
current prompt/reply gateway. Implement the local list and fixture contract
first; do not add generic web scraping or purchasing as a shortcut.

## Template for new entries

```
## #short-slug — Title

**What**: one or two sentences.

**Why deferred**: the actual blocking reason, not "no time yet."

**Reference**: links worth reading before starting.
```
