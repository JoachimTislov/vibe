# Basket

A production-oriented shopping-list foundation written in Go. It remembers completed purchases and preferred stores, searches configured retailer offer pages, and can use Mistral to propose the next list. The UI is Go-app/WebAssembly with Tailwind CSS; frontend/backend calls use ConnectRPC.

## Capabilities

- Multiple versioned lists with a protected default list, archive rules, and idempotent creation.
- Rich items: decimal quantity, unit, category, store, notes, priority, due date, barcode, image, position, and estimated price.
- Explicit active/completed/archived lifecycle, undo, soft deletion, optimistic concurrency, and atomic batch completion.
- Unicode-normalized duplicate detection, optional quantity merging, idempotent adds, full-text-like filtering, pagination, and deterministic ordering.
- Immutable purchase history with actual store and price, usual-buy suggestions, multi-currency-safe summaries, and complete JSON export.
- Bounded Mistral planning, deterministic no-key fallback, and source-linked discount discovery with HTTPS allowlisting, DNS/private-address blocking, redirect restrictions, response limits, and timeouts.
- Responsive multi-list UI with stale-response protection, completed-item visibility, summaries, smart suggestions, and deal search.

The database also reserves normalized structures for pantry stock, expiry/low-stock tracking, recurring items, and cached offers. Those are schema extension points rather than falsely exposed as finished UI features.

## Run locally

Requirements: Go 1.26+, Node 24+, and `protoc` (only when changing the contract).

```sh
cp .env.example .env
npm install
make web
go run ./cmd/server
```

Open <http://127.0.0.1:8080>. The core app works without an API key. Set `MISTRAL_API_KEY` to enable model-generated suggestions and `DISCOUNT_SOURCES` to a comma-separated list of trusted HTTPS offer pages.

```sh
make test       # unit/integration tests
make test-e2e   # CLI + raw Connect-over-HTTP workflows
make lint       # go vet
docker compose up --build
docker compose -f compose.dev.yaml up --build
```

## CLI

`make build` produces `bin/shopping-cli` alongside the server. It is a real ConnectRPC client and supports lists, item creation/filtering, completion, restoration, archival, summaries, suggestions, discount searches, and export.

```sh
bin/shopping-cli --json lists
bin/shopping-cli add --list 1 --qty 2 --unit l --store Market Milk
bin/shopping-cli items --list 1 --all
bin/shopping-cli complete --version 1 42
bin/shopping-cli --json export
```

Global flags (`--server` and `--json`) go before the command. Command-specific flags go after the command and before positional names or IDs.

The end-to-end suite uses the production HTTP assembly and a deterministic in-process HTTP transport. Requests still cross the complete Connect JSON wire boundary, middleware, RPC service, migrations, and SQLite; it simply avoids binding a TCP port, so the suite works in restricted CI containers.

After editing `proto/shopping/v1/shopping.proto`, install `protoc-gen-go` and `protoc-gen-connect-go`, then run `make generate`.

This remains intended for a private household network. Public or multi-household deployment still requires an identity provider, authorization policy, encryption/key management, notification delivery, retailer-specific offer adapters, and an operational backup/restore policy. Those concerns cannot be made universally correct without deployment and retailer requirements.
