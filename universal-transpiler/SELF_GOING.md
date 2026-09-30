# The Self-Going Universal Transpiler

A universal handle over all languages and frameworks: any syntax in, the
internally developed state decides the optimal output. Everything the system
learns persists to disk; every capability below is proven by executing real
code.

## The pipeline

```
                      ┌─────────────────────────────────────────────┐
                      │            PersistentState (on disk)        │
                      │  ~/.universal-transpiler/state.json         │
                      │                                             │
                      │  keywords:       learned definitions        │
                      │  candidates:     unconfirmed observations   │
                      │  clients:        per-client profiles        │
                      │  upstream:       promoted preferences        │
                      │  goals:          internal roadmap           │
                      │  progressLog:    auditable history           │
                      │  transpileStats: empirical success rates     │
                      └───────────────────┬─────────────────────────┘
                                          │  load / save (atomic)
                  ┌───────────────────────┴───────────────────────┐
                  v                                               v
          ┌──────────────┐  analyze   ┌──────────────────────┐
 source ──>│ language     │───────────>│ domain analyzer      │
          │ detection    │            │ builtin + learned    │
          │ (content +   │            │ keywords, upstream   │
          │  filename)   │            │ platform prefs       │
          └──────────────┘            └──────────┬──────────┘
                                                 v
                                     platform decision
                                                 │
                    ┌────────────────────────────┼────────────────────┐
                    v                            v                    v
          execution tier                  transpile matrix
          (native first)                 (when a tier is missing)
          ┌──────────────┐               1. native    (tsc API: TS->JS...)
          │ native       │               2. structural (deterministic:
          │ rustc/cargo  │                  rust->go, haskell->js,
          │ go, javac,   │                  python->js, js/ts->python)
          │ ghc, node,   │               3. AI-generated (live Mistral
          │ gcc, python3 │                  API for any remaining pair)
          ├──────────────┤
          │ docker       │   Missing host binaries run inside containers
          │ fallback     │   (rust:1-slim, haskell:9-slim, ...) mounted
          │              │   at /work — transparent, same interface
          └──────────────┘
                    │
                    v
        platform-decided artifact: native binary | jvm class | node script
        | browser bundle | wasm module | .wasm via docker targets
```

## Verified capabilities (all by real execution, 236+ tests)

| Capability | Proof |
|---|---|
| Run any syntax | Go/Java/JS/TS/Python natively; Rust + Haskell via docker; unknown pairs via LLM |
| Rust on a rustc-less host | real rustlings exercise runs through `docker:rust:1-slim` |
| Real-world sources | fixtures from golang/example, TheAlgorithms (Java/JS/Haskell), rust-lang/rustlings |
| LLM fills gaps | go→python and js→go via live Mistral API; generated code executes with identical stdout to the native source |
| Structural pairs | rust→go, haskell→js, python→js, js/ts→python — byte-identical output equivalence tests |
| WebAssembly | rust→wasm32 via docker, go→wasm via GOOS=js; artifacts verified by magic bytes |
| Real project builds | the sibling shopping-list project: detected (go-mod, cmd/* entry points), built with `go build ./...` |
| Domain workflows | foodSavr: track food → consumption/meal plans → shopping list + waste alerts |
| Backend integration | workflow results become shopping.v1.AddItemRequest payloads validated against the real proto |
| Self-going loop | defineGoal + autoAdvance: exercises pairs, runs hello-worlds per language, promotes feedback |

## The learning contract: persist on encounter

Every `analyze()` / `run()` feeds the source through `learnFromSource`:

1. Unknown identifiers co-occurring with known domain keywords become
   **candidates** — persisted immediately.
2. After repeated encounters (default 3, 60% dominance) a candidate is
   promoted to a **keyword definition** — persisted, and scores in every
   future domain analysis.
3. Explicit teaching (`engine.state.defineKeyword`) or client feedback
   (`keyword-domain`) persists immediately.

## Client feedback -> upstream promotion

Feedback is recorded per client. Unpromoted feedback applies only to the
client that gave it; the same feedback from 2 clients (or one `approve:
true`) moves it **upstream** into shared state affecting everyone:

```ts
engine.feedback('client-a', 'platform-preference', 'web-backend=wasm');
engine.feedback('client-b', 'platform-preference', 'web-backend=wasm');
// -> upstream; every client's web-backend sources now target wasm
```

## The self-going loop

```ts
engine.defineGoal('verify-transpile-pairs');
engine.defineGoal('run-hello-world-per-language');
engine.defineGoal('promote-pending-feedback');
await engine.autoAdvance();
```

## CLI

```
node bin/cli.js status|analyze|run|transpile|compile|build|feedback|goals|demo
scripts/verify-cli.sh   # 12 real-execution checks
```

## Domains

- **food-tracking** (modeled on github.com/JoachimTislov/foodsavr): products
  with ISO expiry dates, foodsavr's exact status semantics (expired <0,
  expiringToday 0, expiringSoon 1–6), consumption plans or meal-plan-derived
  rates, shopping lists + waste alerts; deterministic codegen to JS/Go/Rust
  with runtime-identical output.
- **recipes** (composition): recipes → scheduled meals → composed
  FoodWorkflowSpec → workflow → shopping-list service payloads.

## Repository layout

One parent repository at `~/projects/vibe` contains every project
(universal-transpiler, girly, quota-watch, shopping-list). Former nested
`.git` directories are preserved in `.nested-git-backup/` (gitignored).
