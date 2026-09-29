# The Self-Going Universal Transpiler

The engine is a universal handle over all languages and frameworks: any syntax
in, the internally developed state decides the optimal output.

## Architecture

```
                      ┌─────────────────────────────────────────────┐
                      │            PersistentState (on disk)        │
                      │  ~/.universal-transpiler/state.json         │
                      │                                             │
                      │  keywords:      learned definitions         │
                      │  candidates:    unconfirmed observations    │
                      │  clients:       per-client profiles         │
                      │  upstream:      promoted preferences        │
                      │  goals:         internal roadmap           │
                      │  progressLog:   auditable history          │
                      │  transpileStats: empirical success rates    │
                      └───────────────────┬─────────────────────────┘
                                          │  load / save (atomic)
                  ┌───────────────────────┴───────────────────────┐
                  v                                               v
          ┌──────────────┐  analyze   ┌──────────────────────┐
 source ──>│ language     │───────────>│ domain analyzer      │
          │ detection    │            │ (builtin + learned   │
          └──────────────┘            │  keywords, upstream  │
                                      │  platform prefs)    │
                                      └──────────┬──────────┘
                                                 v
                                     platform decision
                                                 │
                    ┌────────────────────────────┴────────────────────┐
                    v                                                 v
          native toolchain available                    no toolchain
          (rustc, go, javac, ghc, tsc, gcc)             (structural transpile:
                    │                                    rust->go, haskell->js)
                    v                                                 v
              compile / run                              compile / run
```

## The learning contract: persist on encounter

Every `analyze()` / `run()` call feeds the source through `learnFromSource`:

1. Unknown identifiers co-occurring with known domain keywords are recorded as
   **candidates** — immediately persisted.
2. After repeated encounters (default: 3 sources, 60% domain dominance), a
   candidate is promoted to a **keyword definition** — persisted, and from then
   on it scores in every future domain analysis.
3. Explicit teaching (`engine.state.defineKeyword`) or client feedback
   (`keyword-domain` subject) persists immediately.

Nothing learned is ever lost across restarts: the state file is the entity's
memory.

## Client feedback -> upstream promotion

Feedback is recorded per client. It leaves the client namespace and becomes
shared main-source definitions when:

- the same feedback arrives from **2 distinct clients**, or
- a client marks it `approve: true`.

Promoted values live in `state.upstream` and apply to **every** client:

```ts
engine.feedback('client-a', 'platform-preference', 'web-backend=wasm');
engine.feedback('client-b', 'platform-preference', 'web-backend=wasm');
// -> promoted upstream; any client's web-backend source now targets wasm
//    unless it declares a platform explicitly.
```

Unpromoted feedback applies only to the client that gave it — the state is
adjusted to satisfy each subscriber individually, then upstreamed once the
preference is corroborated.

## The self-going loop

```ts
engine.defineGoal('verify-transpile-pairs');
engine.defineGoal('run-hello-world-per-language');
engine.defineGoal('promote-pending-feedback');
await engine.autoAdvance();   // advances every goal it knows how to satisfy
```

`autoAdvance` executes its own roadmap: exercises every structural transpile
pair, runs hello-worlds through every toolchain, promotes corroborated
feedback — recording each step in the progress log and the empirical transpile
statistics.

## Repository layout

One parent repository at `~/projects/vibe` contains every project:

```
vibe/                     <- single git repo (no nested repos)
├── universal-transpiler/ <- this project
├── girly/
├── quota-watch/
└── shopping-list/
```

Former nested `.git` directories are preserved in `.nested-git-backup/`
(gitignored) and can be restored if ever needed.
