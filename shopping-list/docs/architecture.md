# Architecture

Basket is a single-household modular monolith. A Go-app WASM client talks to the Go server through a protobuf-defined ConnectRPC API. The server owns credentials, SQLite, scraping, and planning. The contract supports multiple lists, rich item metadata, lifecycle changes, atomic completion, optimistic concurrency, summaries, filtering, history, export, suggestions, and offers.

```text
Go-app UI → ConnectRPC handlers → domain ports → SQLite
                                    ├── history profiler
                                    ├── Mistral planner (optional)
                                    └── discount sources (allowlist)
```

## Agent boundaries

The history profiler, discount finder, and list planner are narrow application agents. They receive typed data and bounded tools; none receives shell, filesystem, SQL, or arbitrary-URL access. Suggestions always require user action. Without a Mistral key, the history profiler provides deterministic results.

Discount pages are untrusted evidence. Only configured public HTTPS URLs are fetched, cross-host redirects are rejected, responses are capped at 2 MiB, and scraped text is never passed through as instructions. Add authentication and DNS-resolution-level rebinding protection before exposing the application publicly.

Completing an item updates it and records purchase history in one transaction; batch completion is all-or-nothing and repeated IDs are collapsed. Undo removes the matching completion record. SQLite uses WAL, a busy timeout, foreign keys, versioned migrations, and a single connection for predictable write serialization.

## Invariants

- Prices are integer minor units and totals remain separated by currency.
- Client mutations carry record versions; stale updates return an aborted/conflict response.
- Idempotency keys make retried list and item creation safe.
- Item deletion is archival, so history and recovery remain possible.
- Unicode NFKC plus case folding makes search and duplicate merging stable across composed characters and casing.
- Archiving the only list, a default list without a replacement, or a list containing active items is rejected.
- Export iterates every page and therefore does not silently truncate at the normal API page limit.

## Deliberate boundaries

“Every shopping-list feature” is not a finite requirement. Household membership, authentication, push delivery, barcode databases, retailer APIs, tax/coupon rules, accessibility targets, locale-specific unit conversion, and backup policy depend on concrete providers and jurisdictions. The core isolates these behind protobuf evolution, domain ports, and versioned migrations so they can be added without giving an AI agent arbitrary SQL, network, filesystem, or shell access.
