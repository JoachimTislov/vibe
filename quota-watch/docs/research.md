# Quota Watch research

Research date: **2026-09-28**. These are design inputs, not claims that Quota Watch already implements the integrations. Sources are official documentation or primary project repositories; product details can change. No real account credentials were inspected or used in this research.

## Recommendation

There are already credible free, open-source solutions. **CodexBar** is the strongest broad alternative to evaluate first; **OpenUsage.sh** fits a terminal workflow, and **onWatch** closely matches a Go service with a browser dashboard and history. Building Quota Watch is reasonable for a small, inspectable Go binary with deliberately conservative discovery and clear source labeling, but provider breadth alone is not a differentiator.

A universal, fully automatic subscription quota API does not exist in the reviewed documentation. Separate subscription allowances, API organization spending, request throughput, local token observations, and ordinary recurring bills. Automatically discovering a credential does not establish that it can read billing, or that reusing it outside the original application is supported.

**Reuse is a primary implementation strategy.** Existing projects do not need to be written in Go: their JSON CLI, documented local HTTP endpoint, export file or other structured interface can feed a Go orchestrator/UI. Prefer a narrow wrapper over reimplementing a maintained parser or auth strategy, provided its behavior is compatible with the selected source policy.

## Existing software and licensing

Licenses below are the repository's stated license as inspected on the research date. Verify the exact revision and notices before copying code. MIT core with commercial directories is not an assertion that every feature is MIT.

| Project | License and primary source | Actual fit | Important limitation |
| --- | --- | --- | --- |
| CodexBar | [Repository](https://github.com/steipete/CodexBar), [MIT license](https://github.com/steipete/CodexBar/blob/main/LICENSE) | Multi-provider quota windows, resets, balances, usage/spend; macOS app, Linux CLI/desktop and web serving. Closest complete alternative. | Provider strategies include official APIs, CLI, private OAuth endpoints and cookies. Review each strategy, not only the provider name. |
| OpenUsage.sh | [Repository](https://github.com/janekbaraniewski/openusage), MIT | Go terminal dashboard; discovers tools and environment keys; headless JSON reports and local usage history. Particularly relevant implementation reference. | Local observations and remote account reports cover different scopes. Brand differs from OpenUsage.ai; do not conflate them. |
| onWatch | [Repository](https://github.com/onllm-dev/onWatch), GPL-3.0 | Go background service, SQLite history, local web dashboard, quota tracking and alerts across several requested services. | Private-provider integrations need independent review; incorporating GPL code carries redistribution obligations. |
| OpenQuota | [Repository](https://github.com/deviffyy/OpenQuota), MIT | Cross-platform Tauri desktop panel for Claude, Codex, Cursor, Copilot and others; usage, resets and estimated spend. | Desktop packaging differs from a lightweight browser service; release signing and provider methods deserve review. |
| Quotio | [Repository](https://github.com/nguyenphutrong/quotio), MIT | macOS application and cross-platform CLI, account aggregation and quota monitoring. | Also routes requests and switches accounts. That broader authority is outside a read-only dashboard's scope. |
| ccusage | [Repository](https://github.com/ccusage/ccusage), MIT | Local usage/cost reports from CLI session files, with several tool-specific readers. Good parser and fixture reference. | Token counts and list-price cost estimates do not establish remaining subscription quota or actual subscription charges. |
| Wallos | [Repository](https://github.com/ellite/Wallos), [GPL-3.0 license](https://github.com/ellite/Wallos/blob/main/LICENSE.md) | Self-hosted recurring-expense and subscription inventory. | Tracks bills and renewal schedules; its documented purpose does not establish automatic AI quota ingestion. |
| LiteLLM | [Repository](https://github.com/BerriAI/litellm), [MIT core; separate enterprise terms](https://github.com/BerriAI/litellm/blob/main/LICENSE) | API gateway, model-cost tracking and budgets for traffic passing through it. | Not an account-wide observer of ChatGPT, Claude or Cursor subscription allowances; routing all calls is a workflow change. |
| Langfuse | [Repository](https://github.com/langfuse/langfuse), [MIT core; separate enterprise terms](https://github.com/langfuse/langfuse/blob/main/LICENSE) | Instrumented application tracing, usage/cost analysis and evaluations. | Requires application telemetry; cannot reconstruct unobserved subscription consumption. |

CodexBar's [provider matrix](https://github.com/steipete/CodexBar/blob/main/docs/providers.md) explicitly separates auth and data strategies, and its [release page](https://github.com/steipete/CodexBar/releases) shows v0.68.0 artifacts dated 2026-09-27, including Linux binaries. Its breadth is evidence that integration is possible, not evidence that every endpoint is a supported public API. Evaluate existing tools without running remote install scripts or granting credentials during research.

## Reusable integration interfaces

| Tool/interface | Reviewed structured entry point | Recommended use |
| --- | --- | --- |
| CodexBar CLI | `codexbar usage --provider codex --source cli --format json`; `codexbar cost --provider claude --format json` | First optional backend: Codex windows and local Claude activity. Its explicit source flag and returned source metadata help avoid accidental fallback. |
| CodexBar local server | `codexbar serve`; documented `GET /usage`, `GET /cost`, token-gated dashboard support | Connect to an explicitly configured, existing loopback service. Confirm whether an endpoint triggers refresh before choosing a poll frequency. Do not start a second service automatically. |
| ccusage CLI | Installed `ccusage` with `--json` and `--offline`; provider subcommands vary by release | Local token/cost history backend with cached pricing. Version-check the exact command and preserve estimated-cost labels. Do not launch `npx ...@latest` in a polling loop. |
| OpenUsage.sh CLI | `openusage daily --json`, related weekly/monthly reports | Candidate aggregate usage backend. Review selected provider configuration first: its example settings include a model probe, so a report is not assumed to be a passive read without verification. |
| onWatch local service | Existing local dashboard/service | Promising optional HTTP backend after its JSON contract, auth, scope and refresh semantics are verified. The repository overview alone does not establish a stable API. |
| Quotio CLI / OpenQuota | CLI or local export where available | Further candidates; exact read-only JSON contract was not established in the fetched pages. Do not invent commands or scrape a desktop UI. |

The [CodexBar CLI reference](https://github.com/steipete/CodexBar/blob/main/docs/cli.md) documents JSON output, source selection and server endpoints. `--source api` can use tokens and does not by itself mean a public supported API; `auto` is a provider-specific fallback chain. Select provider/source pairs intentionally and validate returned provenance. Its local cost command has different behavior by provider: Cursor can use dashboard cookies, whereas Claude/Codex read local logs. The [ccusage README](https://github.com/ccusage/ccusage) documents JSON and offline output. [OpenUsage's README](https://github.com/janekbaraniewski/openusage) documents headless reports and config examples.

A subprocess boundary avoids language coupling but is not a security sandbox or automatic license exemption. Keep executable/version identification, underlying data source, and normalized metric provenance separate. Use already installed tools, record tested versions, enforce time/output limits, and expose unsupported schemas honestly. Review distribution obligations before bundling a tool; runtime discovery of a user's installation and copying its source are different implementation choices.

## Provider capability matrix

“Official” means documented by the provider. “Internal” means observable in a first-party client or community adapter but lacking a public integration contract. A cached official observation is authoritative **at its observation time**, not necessarily current.

| Surface | Supported source / authorization | What can be known | Automatic discovery | MVP decision |
| --- | --- | --- | --- | --- |
| Codex subscription | Official Codex app-server account methods, using existing CLI login | Named rate windows, used percent, reset; optional credits/activity | Installed CLI; `CODEX_HOME` and login managed by Codex | First-class read-only adapter; cached local windows as labeled fallback |
| OpenAI API | Organization Usage/Costs Admin APIs | API tokens/requests and monetary spend; spend-limit APIs are separate | Existing explicitly named admin-key environment variables | Official API adapter when eligible key is present; ordinary API key is insufficient evidence |
| Claude subscription | Official Claude Code status-line input | Five-hour/seven-day usage and reset for supported accounts/versions | Existing bridge output; normal local logs for token activity | Local observations first; opt-in status-line bridge for actual windows |
| Anthropic API | Usage/Cost Admin API; Enterprise Analytics is a separate surface | Organization API usage and costs | Existing admin-key environment variable | Official API adapter when eligible; do not substitute Claude login token |
| Gemini CLI / consumer plan | CLI `/stats model`; internal Code Assist quota RPC observed in clients | Model-specific quotas through CLI; local session activity | Known Gemini config/cache presence | Show discovery and supported local observations; defer internal RPC |
| Gemini API / Vertex | Cloud Monitoring plus quota APIs and correct project IAM | Project usage and quota configuration, with reporting lag | Explicit project + existing ADC/env metadata | Later official cloud adapter; an API key alone is not sufficient |
| GitHub Copilot | Official user/org/enterprise billing usage APIs | AI credits, legacy premium requests and charges; entitlement denominator may be absent | Existing `gh` login or GitHub token with required billing permission | Official billing adapter; retain unknown allowance |
| Cursor team/org | Official Admin APIs with admin key | Usage events, spending, billing cycle and exposed budgets | Explicit admin-key env/config reference | Later official adapter; personal app discovery may show unsupported status |
| Cursor individual | Dashboard and private app/session endpoints | Account usage where internal endpoint works | App config/token technically discoverable | No private-session replay in default MVP |
| Other subscriptions | Provider-specific official account/billing/quota API | Whatever the provider explicitly exposes | Only enumerated CLI/config/env sources | Add adapters independently; never infer consumption from a recurring payment |

## Provider findings

### Codex and OpenAI

The documented [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server) exposes `account/read`, `account/rateLimits/read`, change notifications, and `account/usage/read`. Initialize the JSON protocol before requests. Prefer `rateLimitsByLimitId` when present; use the older `rateLimits` only as fallback, avoiding duplicate windows. Preserve null fields, provider window durations, and reset timestamps. Activity totals are separate from quota percentages. Use only account-read methods; do not start a model turn, consume reset credits, send owner emails or invoke login/logout from background polling.

[Authentication documentation](https://learn.chatgpt.com/docs/auth) says Codex caches login in `auth.json` under `CODEX_HOME` or an OS credential store. Delegate authentication to the installed CLI to accommodate both and avoid handling raw tokens. Codex may refresh its own login as part of normal operation; “read-only account data” does not mean a subprocess cannot update its own credential cache. Older CLI versions may lack methods and must degrade honestly.

OpenAI [organization APIs](https://developers.openai.com/api/reference/python/resources/admin/subresources/organization) provide `/v1/organization/usage/completions`, `/v1/organization/costs` and separate spend-limit resources. The official [CLI documentation](https://developers.openai.com/api/docs/libraries/openai-cli) distinguishes `OPENAI_ADMIN_KEY` from ordinary `OPENAI_API_KEY`. Quota Watch can also accept a clearly documented project-specific alias; do not claim it is an official variable. API charges must remain distinct from the Codex subscription. Current [spend-limit documentation](https://developers.openai.com/api/docs/guides/spend-limits) distinguishes hard limits, spend alerts and provider-approved usage limits, so neither an alert threshold nor a plan price is automatically a quota denominator.

### Claude and Anthropic

Claude Code's official [status-line interface](https://code.claude.com/docs/en/statusline) supplies `rate_limits.five_hour` and `rate_limits.seven_day`, including `used_percentage` and `resets_at`. The relevant documentation requires v2.1.251+, supported Pro/Max accounts or a gateway spend limit, and a first API response. This is a promising supported bridge: an opt-in helper receives JSON locally, retains only usage fields and timestamp, and lets the dashboard read a sanitized cache. It is event-driven and may be stale when Claude is idle. Installing the bridge is configuration, not manual usage entry; it must preserve the existing status line.

[Usage and Cost API documentation](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) exposes `/v1/organizations/usage_report/messages` and `/v1/organizations/cost_report`, with pagination. Organization Admin authorization is required; ordinary workspace keys are insufficient. Enterprise Analytics credentials use a different API. Monetary values are decimal strings in cents and should not be interpreted as dollars.

Claude's [authentication rules](https://code.claude.com/docs/en/legal-and-compliance) distinguish native subscription OAuth from API integration authorization. They do not give this project a public contract for a private usage endpoint. [CodexBar's Claude adapter notes](https://github.com/steipete/CodexBar/blob/main/docs/claude.md) document OAuth, cookie and PTY strategies, but community use alone does not establish permission. Do not replay Claude OAuth credentials by default. Local assistant-message token observations may be useful, but cannot reliably infer opaque subscription allowances; deduplicate cumulative streaming records and disclose device coverage.

### Gemini and Google

[Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/) has distinct Google-login, API-key and Vertex modes. [CLI commands](https://geminicli.com/docs/reference/commands/) document `/stats model`; [quota documentation](https://geminicli.com/docs/resources/quota-and-pricing/) describes plan-dependent limits. Do not hardcode a daily entitlement from a marketing tier or confuse the CLI product with the Gemini web application.

The [Gemini API rate-limit guide](https://ai.google.dev/gemini-api/docs/rate-limits) states quotas apply per project, with different request/token windows. [AI Studio permissions](https://ai.google.dev/gemini-api/docs/troubleshoot-ai-studio) require monitoring and quota permissions for those dashboards. The [Service Usage quota API](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1beta1/services.consumerQuotaMetrics/list) reads effective limits, not a universal remaining balance. Correct Cloud Monitoring metric selection and IAM need a separately tested adapter.

[CodexBar's Gemini notes](https://github.com/steipete/CodexBar/blob/main/docs/gemini.md) describe `cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota` and compatibility failures for some consumer accounts. Treat these as internal integration evidence, not a public Google API commitment. Token refresh using another application's OAuth client is a substantial extra dependency. For the MVP, discovering `~/.gemini` must not imply live quota support.

### GitHub Copilot

Official [billing usage endpoints](https://docs.github.com/en/rest/billing/usage) include `GET /users/{username}/settings/billing/ai_credit/usage` and `.../premium_request/usage`. Fine-grained personal access tokens require user `Plan: read`; organization reports require appropriate administration permission. The returned `usageItems` distinguish gross, discounted and net quantities/amounts. Personally billed and employer-billed usage have different endpoints. A normal `gh` login may lack permission, so failure must say “billing permission required,” not “zero usage.”

GitHub's [legacy request billing guide](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/github-copilot-premium-requests) specifically limits that model to qualifying annual subscribers remaining after June 1, 2026. Do not assume every account uses premium requests or shares a fixed allowance. [CodexBar's Copilot notes](https://github.com/steipete/CodexBar/blob/main/docs/copilot.md) also use client/internal quota surfaces and private budget enrichment; those are separate from official REST billing. `gh auth token` or `gh api` can safely reuse the user's existing login in-process, but stderr/stdout tokens must never enter logs or the browser.

### Cursor

The official [team Admin API](https://cursor.com/docs/account/teams/admin-api) uses an admin key with HTTP Basic authentication and includes spending and usage reads such as `POST /teams/spend`. POST is a read here: authorize by endpoint semantics, not HTTP verb alone. Current documentation uses the billing cycle and preserves fractional cent precision. Report only the relevant account/team scope and handle pagination completely. [Organization APIs](https://cursor.com/docs/account/organizations/organization-admin-api) are a separate authorization surface.

No documented personal-account usage API was established in this research. [CodexBar's Cursor integration](https://github.com/steipete/CodexBar/blob/main/docs/cursor.md) describes dashboard requests authenticated by session cookies and local Cursor app tokens, including Linux `state.vscdb`. This proves technical feasibility, not public support. Default discovery should detect the application without extracting browser cookies or opening its token database. A later explicit experimental integration needs its own maintenance and security review.

## What “automatic” can safely mean

1. Inspect a short allowlist of known tool locations and named environment variables, including supported optional backends. Respect explicit config-directory overrides. Never search the whole home directory, shell history, browser profiles or arbitrary `.env` files for secrets.
2. Reuse an official CLI's account-read API or credential helper when possible. Detect missing permissions and tell the user which existing provider settings/login can resolve them.
3. Keep credentials in their original provider store or environment. A dashboard discovery record contains a source kind and status, never credential material.
4. Read only usage fields from bounded local session files. Prompts, completions, repository paths and conversation content are not dashboard data.
5. Represent unsupported, not installed, not authenticated, insufficient permission, stale, partial coverage and unknown limits explicitly. Zero and unlimited are measured facts, not fallback values.

A one-time provider login, admin authorization or bridge installation can be necessary. No manual entry of usage numbers is required. Fully unattended discovery of every paid subscription cannot be promised from the APIs reviewed.

## Extending beyond AI

Start with services that already provide account metrics: storage bytes, build minutes, monthly requests, seats, credit balances, SMS/email units or cloud spend. Give each metric its unit, scope, window and provenance. Subscription invoices can supply renewal/cost information but not remaining consumption; payment data and API usage are separate adapter families. Integrations with gateways such as LiteLLM are valid for their observed traffic only. Generic arbitrary-URL plugins and arbitrary shell scripts should wait until explicit trust boundaries exist.

## Research limits and next validation

The sources establish published interfaces and project capabilities, not successful authentication against a real account. Test provider parsing with synthetic fixtures and local HTTP/RPC fakes now. Before declaring a provider live-supported, check one authorized account of each supported auth mode, confirm account scope and reset semantics, and compare against the provider UI. Pin the tested CLI versions and representative schemas; record drift without retaining raw secrets or conversations. This is engineering risk analysis, not a legal opinion about any provider's terms.
