# Universal Transpiler

A self-extending, self-going universal transpiler: run any syntax, in any
of Rust, Go, Java, Haskell, JavaScript/TypeScript, Python, C — and produce
output for any platform (native binary, JVM, node, browser, WebAssembly).
When a toolchain or transpiler is missing, the system fills the gap itself:
docker containers provide missing binaries, deterministic structural
transpilers cover key language pairs, and the live Mistral API generates
anything remaining — with the generated code verified by execution.

See `SELF_GOING.md` for the architecture and the learning/feedback model.

## Quick start

```bash
npm install
npm test                    # full suite (12 suites, 236+ tests)
node bin/cli.js status      # toolchain table incl. docker fallbacks
node bin/cli.js run app.ts  # any language: auto-detect -> route -> execute
node bin/cli.js demo foodsavr --target rust   # domain workflow demo
```

## How anything runs

```
source -> language detection -> domain analysis (keywords/frameworks)
       -> platform decision  -> execution tier:
           1. native toolchain (go, javac, node, tsc, gcc, python3, ...)
           2. docker fallback (rust:1-slim, haskell:9-slim, ...) when the
              host binary is missing — transparent, same interface
           3. transpile matrix for cross-language runs:
              native (tsc API) -> structural (deterministic pairs)
              -> AI-generated (live Mistral API)
```

Every tier is proven by equivalence tests: the same program must produce
identical output before and after transpilation, executed on real runtimes.

## What is learned persists

`~/.universal-transpiler/state.json` keeps learned keyword definitions,
per-client feedback (promoted upstream once corroborated by two clients),
transpile success statistics, and the internal goal/progress log that the
self-going loop (`engine.autoAdvance()`) advances on its own.
