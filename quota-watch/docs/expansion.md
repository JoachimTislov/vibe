# Expansion plan: broad coverage with near-zero setup

Research date: **2026-09-28**. This plan expands Quota Watch beyond its current
Codex/Claude adapters and Gemini/Cursor/GitHub presence cards. It is deliberately
honest about what “every subscription” can mean.

## Product promise and hard boundary

Quota Watch can automatically inventory and read every **supported, locally
discoverable** account, and offer a short setup path for supported accounts that need
authorization. It cannot safely discover every paid subscription in existence. There
is no universal subscription registry, and most consumer services expose neither a
usage API nor a remaining-quota API. A recurring card charge proves a purchase, not
the account, allowance, usage, renewal semantics, or remaining quota.

The UI should therefore promise:

> One automatic view of every supported subscription and usage source on this device,
> with a guided connection flow for everything else.

It must not promise “all subscriptions” without qualification. Automatic means no
manual entry of usage numbers; a one-time provider login or consent grant is sometimes
unavoidable. Browser cookies, browser profiles, email receipts and bank/payment data
must never be scanned by default. Those sources could be separate, explicit opt-in
features later, with narrow permissions and a preview before import.

## Recommended coverage strategy

Use three layers, in this order:

1. **Installed aggregators and official CLIs.** Reuse their structured CLI, local HTTP,
   or RPC output. This yields the broadest coverage with credentials remaining in the
   source that already owns them.
2. **Official provider APIs.** Add native adapters where an API exposes meaningful
   account usage, billing, credit or quota data. Prefer an installed official CLI's
   credential helper over copying its token.
3. **A generic external-source RPC.** Let arbitrary services and organizations supply
   normalized metrics without changes to Quota Watch. This is the only scalable answer
   to the long tail, but external sources must be installed and trusted explicitly.

Do not add model probes merely to obtain rate-limit headers: probes spend quota and can
have side effects. Do not silently replay private application OAuth tokens. Distinguish
subscription allowance, API billing, local activity, and API-call rate limits in both
the model and UI.

## Broadest realistic catalogue

The catalogue is a product catalogue, not a claim that every row is already fetchable.
Each entry has separate `detected`, `connected`, `supported`, `authority`, and
`coverage` fields. Detection alone must never produce a fabricated zero.

### Tier A: implement or delegate first

These sources have high user value and a structured interface or a mature open-source
adapter that can be wrapped.

| Family | Services | Best initial source | Safe automatic discovery |
| --- | --- | --- | --- |
| AI coding subscriptions | Codex/ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini CLI, Antigravity, OpenCode, Kiro, Windsurf, Zed, JetBrains AI, Amp, Devin, Factory, Augment, Warp, Kilo, Codebuff, Roo/Goose/Crush/Droid/Hermes | Codex app-server and Claude status-line where official; installed CodexBar/OpenUsage/OpenQuota/ccusage structured output for tested provider/source pairs; official CLI/local logs for activity | Executable name, known config directory, and explicit config override; never browser cookies by default |
| AI API platforms and coding plans | OpenAI, Anthropic, Azure OpenAI, Vertex/Gemini API, Bedrock, OpenRouter, Groq, Mistral, DeepSeek, xAI/Grok, Z.AI, Moonshot/Kimi, MiniMax, Alibaba, Synthetic, Perplexity, Together, Fireworks, Cerebras, Cohere, ElevenLabs, Deepgram, Poe, Venice, Chutes, OpenCode Zen | Official usage/cost/balance APIs where published; otherwise a reviewed installed aggregator adapter | Named environment variables and official CLI account status; report ordinary-key versus admin-key capability separately |
| Developer platforms | GitHub Actions/Packages/Codespaces, Vercel, Railway, Netlify, Cloudflare, GitLab, CircleCI, Render, Fly.io, Heroku | Official billing/usage APIs or an authenticated official CLI with machine output | Installed CLI plus its own account-status command; named token env only |
| Cloud spend and quotas | AWS, GCP, Azure, Oracle Cloud, DigitalOcean | Official cost-management, monitoring and quota APIs via existing CLI/SDK credential chain | `aws`, `gcloud`, `az`, `oci`, `doctl` presence and named profile/project metadata; no recursive credential-file reads |
| Observability and data infrastructure | Datadog, Grafana Cloud, Sentry, New Relic, Supabase, Neon, MongoDB Atlas, PlanetScale, Upstash, Redis Cloud, Aiven, Confluent Cloud, Snowflake | Official account/organization usage or billing export APIs | Installed official CLI, named token env, explicit organization/project selection |

The catalogue should initially expose Tier A services even when only detection or setup
guidance exists. This makes coverage visible without misrepresenting implementation.

### Tier B: catalogue and external RPC first

General consumer subscriptions—streaming, telecom, storage, gaming, news, fitness,
productivity and app-store purchases—rarely publish remaining-usage APIs. Add them only
through an official API, a user-installed external RPC source, or a later explicit
invoice/payment import. A renewal date or monthly price is an `inventory` metric, not a
usage limit. Spotify/Netflix/iCloud-style login sessions must not be scraped.

## Reuse existing open-source software

Runtime wrapping is preferred to copying implementations. Pin a tested version/schema,
call an installed binary with fixed arguments and a deadline, and keep its provider
source/provenance. Licenses still need review before bundling or copying code.

| Project | What to reuse | Integration decision |
| --- | --- | --- |
| [OpenUsage](https://github.com/janekbaraniewski/openusage) (Go, MIT) | Its current catalogue advertises 36 providers, zero-config detection, headless JSON reports, integrations, and Prometheus export. It covers coding agents, API platforms and local runtimes. | Highest-priority optional aggregate backend. Detect the installed binary; negotiate version/capabilities; consume only documented JSON/export commands. Do not auto-install or assume every remote adapter is passive—its OpenAI-style header probing can make model calls. |
| [CodexBar](https://github.com/steipete/CodexBar) (MIT) | Very broad provider catalogue and JSON CLI/local server; strong subscription-window coverage. Its provider IDs currently span Codex, Claude, Cursor, Copilot, Gemini, many coding plans, API platforms and proxy backends. | Highest-priority quota backend. Require explicit provider/source selection; never inherit an `auto` chain without exposing the resulting provenance. Do not enable cookie/private-endpoint strategies silently. |
| [OpenQuota](https://github.com/deviffyy/OpenQuota) (MIT) | Cross-platform subscription limits plus local activity; useful provider fixtures and semantics. | Add when a stable read-only JSON/HTTP export is verified. Do not scrape its UI or database schema. |
| [onWatch](https://github.com/onllm-dev/onWatch) (GPL-3.0) | Go daemon with current snapshots/history and documented authenticated HTTP endpoints; covers several coding-plan quota APIs. | Connect to an already-running, explicitly configured loopback service. Runtime interoperability is preferable; do not copy GPL implementation into this repository without a licensing decision. |
| [ccusage](https://github.com/ccusage/ccusage) (MIT) | Mature local transcript parsing and offline JSON reports. | Continue using it for device-local activity/cost estimates, never as proof of account-wide subscription allowance. |

OpenUsage already approaches the requested breadth, so Quota Watch should not recreate
dozens of fragile parsers. Its [README](https://github.com/janekbaraniewski/openusage/blob/main/README.md)
documents the current provider matrix and JSON reports. CodexBar's
[configuration reference](https://github.com/steipete/CodexBar/blob/main/docs/configuration.md)
is the current catalogue reference, while its provider-specific source choice still
needs per-adapter review. onWatch documents `/api/current`, history and summary reads in
its [repository](https://github.com/onllm-dev/onWatch); its API is marked beta, so its
schema must be version-gated.

## Sources users may already have

Discovery should inspect names and metadata, not secret values. Present each finding in
a setup report and fetch only after its source policy allows it.

### Installed programs

Allowlist executable discovery for:

- Aggregators: `codexbar`, `openusage`, `openquota`, `onwatch`, `ccusage`.
- AI clients: `codex`, `claude`, `gemini`, `gh`, `cursor`, `opencode`, `kiro`,
  `windsurf`, `zed`, `warp`, `ollama`.
- Developer/cloud CLIs: `vercel`, `railway`, `netlify`, `wrangler`, `gitlab`,
  `circleci`, `flyctl`, `render`, `heroku`, `aws`, `gcloud`, `az`, `oci`, `doctl`.

Detection does not execute a program. Capability probing may execute a fixed `version`
or read-only status command with closed stdin, bounded output and a deadline. Never run
package managers or remote install scripts automatically.

### Environment and config references

Check only a maintained allowlist of variable **names**, such as provider admin/API key
names, profile selectors, account/team/project IDs, and standard config-root overrides.
Return `present: true`, never the value. Do not enumerate the entire environment, search
arbitrary `.env` files, shell history or repositories.

Known default config roots can establish presence. Authentication should remain behind
the owning CLI whenever possible. OS keychains may be queried only through the official
CLI/credential helper or after a provider-specific consent step; never enumerate the
keychain. This accommodates interactive logins, refreshes, SSO and multiple profiles
without Quota Watch becoming a credential store.

### Existing local HTTP services

Only connect to configured loopback origins. Never scan ports. Pin allowed paths,
disable redirects, use that service's authentication, and do not forward unrelated
provider secrets. Candidate sources include CodexBar and onWatch. Record whether a GET
is a cached read or triggers remote polling.

## Official API expansion order

Native API work should follow demonstrated value and authorization simplicity:

1. GitHub user/org billing usage through an existing `gh` login with adequate billing
   permission; allowance may remain unknown.
2. OpenAI and Anthropic organization usage/cost APIs with existing admin keys.
3. Cursor team Admin API with an explicitly supplied admin key; personal Cursor remains
   detection-only unless a supported public API appears.
4. Vercel through an existing CLI login or access token. Vercel added official billing
   usage/cost access in 2026: `/v1/billing/charges` returns FOCUS JSONL, and
   [`vercel usage`](https://vercel.com/changelog/access-billing-usage-cost-data-api)
   displays the current/custom period.
5. Cloud account costs/quotas through existing official CLI credential chains. Require
   explicit account/project selection and least-privilege scopes.
6. Railway and other developer platforms after verifying that their public schema
   exposes billable usage. Railway provides an official public GraphQL endpoint and an
   authenticated [`railway api`](https://docs.railway.com/cli/api) command, but schema
   availability alone is not evidence of a remaining subscription allowance.

Cloudflare's [GraphQL Analytics API](https://developers.cloudflare.com/analytics/graphql-api/)
explicitly says its analytics are not billing measurements; label them product activity,
not invoice usage. Similar caveats must be captured per metric rather than hidden in a
provider-level badge.

## Setup experience

The first run should open a “coverage check” rather than an empty dashboard:

1. A bounded scan produces cards immediately: **Working**, **Can connect**, **Detected
   but unsupported**, **Needs permission**, and **Not found**.
2. “Connect everything safe” enables installed, passive, read-only sources in one step.
   The confirmation lists every executable and local endpoint that will be contacted.
3. Remaining cards offer one action: “Sign in with existing CLI”, “Grant billing-read”,
   “Choose account/project”, or “Install optional source”. Quota Watch never asks users
   to paste current usage.
4. An RPC setup wizard re-runs detection and verifies the connection. Installation
   instructions are copyable but never executed without explicit approval.
5. Advanced settings expose source precedence, account scope, refresh interval and the
   exact provenance of each metric. Sensible defaults keep them out of the main path.

New dashboard JSON-RPC methods should be additive:

| Method | Purpose |
| --- | --- |
| `catalog.list` | Stable provider catalogue, capabilities, setup mode and privacy class |
| `integrations.scan` | Queue/coalesce bounded rediscovery; returns a job ID |
| `integrations.list` | Discovery/connection status, selected source and safe diagnostics |
| `integration.plan` | Exact read-only actions, permissions and data scope before enabling |
| `integration.enable` | Enable a previously planned safe source; never accepts raw arbitrary commands |
| `integration.verify` | Refresh one integration and return sanitized capability results |
| `sources.list` | Installed aggregate/external sources, version and negotiated capabilities |

Mutation methods retain the existing same-origin header requirement. Raw tokens never
cross the browser RPC boundary. Setup errors use stable codes such as `not_installed`,
`needs_login`, `needs_scope`, `account_selection_required`, `unsupported_version`, and
`source_policy_blocked`.

## Generic external-source RPC protocol

Define `quota-watch.source.v1` as newline-delimited JSON-RPC 2.0 over stdio. Stdio keeps
the source local, portable and language-neutral. Local HTTP can be a later transport
with the same methods. Do not accept arbitrary command strings: users install a manifest
that contains an absolute executable path and a protocol version, then explicitly trust
it. Built-in manifests may target known, reviewed tools.

Lifecycle:

1. Host starts the process with a minimal environment, neutral working directory,
   closed interactive input, deadline and output limits.
2. Host sends `initialize` with protocol version, locale and supported metric schema.
3. Source replies with identity, version, source authority, network behavior and
   capabilities. Host rejects an incompatible version.
4. Host calls `accounts.discover`, then `usage.read` for selected opaque account IDs.
5. Host sends `shutdown`; cancellation kills and reaps the process group.

Required methods:

| Method | Result |
| --- | --- |
| `initialize` | Protocol/tool version, capabilities, authority classes, privacy declaration |
| `accounts.discover` | Opaque account IDs, safe labels, provider IDs, readiness and required setup actions |
| `usage.read` | Normalized metrics, observation timestamps, coverage and per-metric provenance |
| `health.read` | Safe health/version diagnostics without credential or path disclosure |
| `shutdown` | Acknowledgement before clean exit |

Optional methods include `catalog.list` and `history.read`; no v1 method may mutate a
provider account or initiate authentication. Notifications may report `usage.changed`
but the host remains responsible for refresh coalescing and rate limiting.

Every metric must include provider/account/metric identity, kind, scope, nullable
quantities, unit/currency, window/reset fields, authority (`official_api`,
`official_cli`, `local_observation`, `local_estimate`, `internal_api`), source detail,
coverage, observed time and freshness. The host validates finite numbers, maximum item
counts/string lengths, allowed URLs and account identity before merging. Overlapping
sources are alternatives selected by precedence, never summed automatically.

Example request (illustrative, not a shell contract):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocol_version":"1.0","client":{"name":"quota-watch","version":"0.1.0"}}}
```

Example response:

```json
{"jsonrpc":"2.0","id":1,"result":{"protocol_version":"1.0","source":{"id":"example-source","version":"1.2.0"},"capabilities":{"accounts_discover":true,"usage_read":true},"privacy":{"network":"provider_only","reads_browser_data":false}}}
```

Provider-specific raw JSON remains inside the source. This protocol is normalization,
not a way to label unofficial endpoints as official.

## Two disjoint implementation packages deliverable now

Both packages can be implemented and fully tested with temporary homes, fake
executables, loopback fakes and fixtures—no real credentials or outbound network.

### Package 1 — Catalogue and setup control plane

Scope:

- Versioned embedded provider catalogue with Tier A entries, aliases, executable/config
  markers, authorization type, authority/coverage description and dashboard/setup URLs.
- Bounded presence scanner for allowlisted executable names, named environment presence
  and known directories; never reads secret contents.
- New `catalog.list`, `integrations.scan`, `integrations.list`, and `integration.plan`
  JSON-RPC handlers.
- First-run coverage UI grouping working/connectable/unsupported/not-found sources, plus
  source-precedence explanations.
- Fixtures and tests for empty, fully detected, permission-needed, duplicate-backend and
  multi-account states; demo mode renders all states.

It does not fetch provider usage, run external sources, or alter current provider
adapters. Consequently it can land independently and makes setup visibly easier now.

### Package 2 — External-source RPC host and reference source

Scope:

- `quota-watch.source.v1` types, schema validation and bounded stdio JSON-RPC client.
- Explicit manifest loader from the Quota Watch config directory with absolute-path,
  ownership/permission and protocol-version checks; no auto-install and no shell.
- Reference fixture source executable implemented in Go, returning multiple accounts,
  quota/spend/activity metrics, partial/stale states and controlled protocol errors.
- Adapter that merges validated source results through the existing provider model,
  preserving backend/version/authority and deterministic source precedence.
- Unit/integration tests for handshake, out-of-order responses, oversized/malformed
  frames, timeout/cancellation, duplicate metrics, hostile labels/URLs and process exit.

It does not depend on the catalogue UI or Package 1 RPC methods. After it lands, narrow
built-in manifests/wrappers for installed OpenUsage and CodexBar can be added one at a
time against captured, licensed fixtures and tested versions.

## Acceptance criteria for breadth

- “Supported” always names a tested source and version; “detected” is not “connected”.
- First run requires zero configuration and shows useful findings within one second on
  a normal home directory because discovery is allowlisted and bounded.
- No secret value, transcript content, browser database, email or banking record reaches
  UI state, logs or snapshots.
- Users never type usage numbers. Required manual actions are limited to authorization,
  account selection and explicit installation/consent.
- Every number carries account scope, source authority, coverage and observation time.
- Unknown, stale, partial and permission-denied data remain visible and distinct from
  zero, unlimited and not installed.
- An external source cannot broaden its command, environment, origin or provider access
  after the user approves its manifest without another approval.

