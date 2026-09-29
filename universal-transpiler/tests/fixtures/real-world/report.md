# Real-world proof report — UniversalEngine vs. real online open-source code

Date: 2026-09-29
Prover: `tests/fixtures/real-world/prove.ts`

```
npx ts-node --compilerOptions '{"module":"CommonJS","moduleResolution":"node"}' \
  tests/fixtures/real-world/prove.ts
```

Every file below was fetched with `curl` from `raw.githubusercontent.com` (exact
URLs recorded in `manifest.json` and per file below) and is persisted in this
directory, so future tests can run against real-world sources without network
access. Every fact in this report comes from the actual prover output — no
claims are made that were not executed.

## Toolchain status at run time (`engine.status()`)

```
  NOT AVAILABLE  rust       languages: rust
  available      go         languages: go
  available      java       languages: java, kotlin, scala, groovy
  NOT AVAILABLE  haskell    languages: haskell, haskell-literate
  available      jsts       languages: javascript, typescript, jsx, tsx, json
  available      native-c   languages: c, cpp, c++
  available      python     languages: python
  NOT AVAILABLE  ruby       languages: ruby
  available      php        languages: php
```

As expected on this machine: no `rustc`, no `ghc`. Rust and Haskell must go
through the structural transpile tier (rust -> go, haskell -> javascript).

---

## 1. go-hello.go — golang/example `hello/hello.go`

Source: https://raw.githubusercontent.com/golang/example/master/hello/hello.go
License: BSD-3-Clause (Go Authors)

| Aspect | Result |
|---|---|
| Detection (content) | `go` (0.4) — correct |
| Detection (filename) | `go` (0.9) |
| Domain | `cli` (score 11; keywords: gin, main, args, flag, command, stderr, printf, ...) |
| Frameworks | none |
| Platform / route | `native` / `native-run` |
| Execution | **failed**, exit 1 |

Real stderr:

```
main.go:30:2: no required module provides package golang.org/x/example/hello/reverse; to add it:
	go get golang.org/x/example/hello/reverse
```

What worked: language detection, domain analysis (CLI domain, correct — it is a
flag-parsing command-line program), platform decision and native routing.

What did not: this real file is not actually self-contained — it imports
`golang.org/x/example/hello/reverse`, a sibling package in an external Go
module. The engine's Go toolchain compiles the source inside a synthetic
module (`module transpiled`) with no dependency resolution, so `go run` fails.
Honest conclusion: the engine cannot run real-world Go files with external
module imports. The self-contained sibling below proves the happy path.

## 2. go-hello-gotypes.go — golang/example `gotypes/hello/hello.go`

Source: https://raw.githubusercontent.com/golang/example/master/gotypes/hello/hello.go
License: BSD-3-Clause (Go Authors)

| Aspect | Result |
|---|---|
| Detection (content) | `go` (0.2) — correct |
| Detection (filename) | `go` (0.9) |
| Domain | `cli` (score 7; keywords: main, println) |
| Platform / route | `native` / `native-run` |
| Execution | **ok**, exit 0, 91 ms |

Real stdout:

```
Hello, 世界
```

Full end-to-end success on a real Go project file: detected, routed natively,
compiled and executed with the real output (including non-ASCII).

## 3. js-linear-search.js — TheAlgorithms/JavaScript `Search/LinearSearch.js`

Source: https://raw.githubusercontent.com/TheAlgorithms/JavaScript/master/Search/LinearSearch.js
License: MIT

| Aspect | Result |
|---|---|
| Detection (content) | `javascript` (0.6) — correct |
| Detection (filename) | `javascript` (0.9) |
| Domain | `systems` (score 2; keywords: http, func, arc, rc) — wrong-ish, harmless |
| Platform / route | `native` (node) / `native-run` |
| Execution | **ok**, exit 0 |

Real stdout: *(empty)*. Real stderr: *(empty)*.

The file is a self-contained ES-module util (linear search). The engine ran it
with node and the module loaded cleanly, exiting 0. There is no stdout because
the upstream file only defines and exports functions — its demo calls are
commented out in the real source. The ES-module `export` statements were
handled transparently (the engine's default path transpiles the source to
CommonJS before invoking node). This is an honest "runs standalone, no output
by design" result.

## 4. java-luhn.java — TheAlgorithms/Java `Luhn.java` (current master)

Source: https://raw.githubusercontent.com/TheAlgorithms/Java/master/src/main/java/com/thealgorithms/others/Luhn.java
License: MIT

| Aspect | Result |
|---|---|
| Detection (content) | `javascript` (0.3) — **tie** with `java` (0.3), javascript won |
| Detection (filename) | `java` (0.9) — correct |
| Domain | `cli` (score 9) |
| Platform / route | `native` (jvm) / `native-run` |
| Execution (declared `java`) | **failed**, exit 1 |

Real stderr:

```
error: end of path to source file does not match its package name com.thealgorithms.others: /tmp/univ-java-Bf5AuO/Luhn.java
```

Two honest findings:

1. Content-based detection ties java/javascript at 0.3 and picks javascript —
   running with that auto-detection routes the Java file into node and fails
   with a JS syntax error (`var java = .util.Arrays;`). With the declared
   language `java`, routing is correct. Filename-based detection gets it right
   at 0.9.
2. Even with correct routing, the JDK refuses the file: the real file declares
   `package com.thealgorithms.others;` but the engine writes sources into a flat
   temp directory, and modern `java` single-file source mode requires the path
   to match the package. The engine's Java toolchain currently cannot run
   packaged classes from a single source string. The historical, unpackaged
   file below proves the JVM path works.

## 5. java-radix-sort.java — TheAlgorithms/Java `radixSort.java` (2017 revision)

Source: https://raw.githubusercontent.com/TheAlgorithms/Java/8c78d90d496ba91db9907608b85333265a647ea2/radixSort.java
License: MIT

| Aspect | Result |
|---|---|
| Detection (content) | `javascript` (0.2) — tie with `python` (0.2) and `java` (0.2) |
| Detection (filename) | `java` (0.9) — correct |
| Domain | `cli` (score 4; keywords: main, args, import, sort) |
| Platform / route | `native` (jvm) / `native-run` |
| Execution (declared `java`) | **ok**, exit 0, 378 ms |

Real stdout:

```
2 24 45 66 75 90 170 802
```

Full end-to-end success on a real Java project file with a `main` method: the
engine sorted `{170, 45, 75, 90, 802, 24, 2, 66}` via radix sort on the JVM and
printed the correctly sorted output.

## 6. rust-hello.rs — rust-lang/rustlings `exercises/00_intro/intro1.rs`

Source: https://raw.githubusercontent.com/rust-lang/rustlings/main/exercises/00_intro/intro1.rs
License: MIT

| Aspect | Result |
|---|---|
| Detection (content) | weak — 4-way tie at 0.1 (javascript, typescript, **rust**, css); javascript picked |
| Detection (filename) | `rust` (0.9) — correct |
| Domain | `cli` (score 5; keywords: main, cli, println, rc, path, file, read) |
| Route | `transpile-then-run` (rust toolchain missing) |
| Transpile | `rust -> go`, strategy `structural`, via `rust->go` |
| Structural report | converted: `[fn-main, println]`, unsupported: `[]` |
| Execution of transpiled Go | **failed**, exit 1 |

Real stderr (start):

```
# command-line-arguments
./main.go:15:18: invalid character U+0023 '#'
./main.go:15:19: syntax error: unexpected literal "       Welcome to...                      " in argument list; possibly missing comma or )
```

What worked: the routing decision (no rustc -> structural rust->go ->
execute with the available Go toolchain) and the core conversion (fn main,
println! -> fmt.Println). The generated Go contains a valid `func main()` with
`fmt.Println(...)` calls.

What only partially worked: the structural converter leaks Rust-only syntax
into the Go output — raw strings are copied verbatim (`fmt.Println(r#"..."#)`
is not valid Go) and bare `println!();` calls are not converted at all — so
`go run` rejects the generated code. Notably, `structuralReport.unsupported`
is empty here: the converter's capability report does not flag the raw strings
as unsupported, so its converted/unsupported lists under-report the gap. This
is exactly the "complex real files only partially transpile" case; the honest
result is: detection via filename works, structural transpile works for the
simple constructs, execution fails on the real file because of leaked Rust
syntax.

## 7. haskell-bubble-sort.hs — TheAlgorithms/Haskell `src/Sorts/BubbleSort.hs`

Source: https://raw.githubusercontent.com/TheAlgorithms/Haskell/master/src/Sorts/BubbleSort.hs
License: MIT

| Aspect | Result |
|---|---|
| Detection (content) | **failed** — haskell does not even appear in the candidates |
| Detection (filename) | **failed** — no `.hs` pattern in the detector |
| Domain | `cli` (score 5) |
| Route (declared `haskell`) | `transpile-then-run` (ghc missing) |
| Transpile | `haskell -> javascript`, strategy `structural`, via `haskell->javascript` |
| Execution of transpiled JS | **failed**, exit 1 (`ReferenceError: $ is not defined`) |

Real structural report (verbatim):

```
converted:   [module-decl, type-signature-dropped, function, comment, main-do, putStrLn]
unsupported: [line: else bubbleSort bpassed,
              line: bubblePass [] = [] -- Empty list is empty.,
              line: bubblePass [x] = [x] -- Singleton list is always trivially sorted.,
              line: bubblePass (x1:x2:xs) = if x1 > x2,
              line: then [x2] ++ (bubblePass ([x1] ++ xs)),
              line: else [x1] ++ (bubblePass ([x2] ++ xs))]
```

Generated JS (start):

```js
async function main() {
  console.log($ "Unsorted: " + show listToSort);
  console.log($ "Sorted: " + show (bubbleSort listToSort));
}
```

What worked: with the declared language, the engine correctly routed
transpile-then-run through the structural haskell->javascript tier, converted
the module declaration, main-do block and putStrLn calls, and honestly listed
everything it did not understand (guards, pattern-matching equations, where
clauses). The run then failed on the partially-converted output.

What did not: Haskell is invisible to the language detector (no content
patterns and no `.hs` extension entry — verified in
`src/parsers/language-parsers.ts`), and the structural converter emits
Haskell-only syntax (`$`, `show`) inside the converted lines without marking
those parts unsupported, so the JS output is not executable. Honest result:
routing and partial structural conversion proven; neither detection nor
execution succeeds on this real file.

---

## Summary

| Fixture | Detected (best) | Route | Executed | Outcome |
|---|---|---|---|---|
| go-hello.go | go (0.9 filename) | native-run | go | failed — external Go module import |
| go-hello-gotypes.go | go (0.9 filename) | native-run | go | **success** — `Hello, 世界` |
| js-linear-search.js | javascript (0.6 content) | native-run | node | **success** — exit 0, no output (module util) |
| java-luhn.java | java (0.9 filename; content tie) | native-run | java | failed — package declaration vs flat temp dir |
| java-radix-sort.java | java (0.9 filename) | native-run | jvm | **success** — `2 24 45 66 75 90 170 802` |
| rust-hello.rs | rust (0.9 filename; content weak) | transpile-then-run | go (via rust->go) | partial — converted fn-main/println, raw strings leaked, Go rejects output |
| haskell-bubble-sort.hs | not detectable | transpile-then-run (declared) | node (via haskell->js) | partial — 6 converted / 6 unsupported lines, JS not runnable |

### Engine capabilities proven on real online code

- Language detection from filename extension is reliable (0.9 for go, java,
  javascript, rust); content-based detection is reliable for Go and JS, ties
  on Java, weak on Rust, and entirely missing for Haskell.
- Domain analysis (cli domain, keyword scoring) and platform routing worked
  for every file, native and transpile routes both exercised.
- Native execution really works: real Go, node and JVM programs ran with real
  output (`Hello, 世界`, `2 24 45 66 75 90 170 802`).
- The fallback pipeline works as designed: without rustc/ghc the engine still
  routed rust -> structural transpile -> go execution and haskell -> structural
  transpile -> node execution, and reported converted/unsupported constructs.

### Honest limitations observed (real-world files)

1. Go files with external module imports fail (no dependency resolution).
2. Packaged Java classes fail in single-file mode (package vs path mismatch).
3. The rust->go structural converter leaks Rust raw strings and bare
   `println!()` without listing them as unsupported.
4. The haskell->javascript converter leaks `$`/`show` inside otherwise
   converted lines without flagging them.
5. Haskell has no detection patterns at all in the language detector.

## Reproducing

Fixtures are committed here; `prove.ts` reads only `manifest.json` and the
fixture files in this directory (no network at test time). Run:

```
npx ts-node --compilerOptions '{"module":"CommonJS","moduleResolution":"node"}' \
  tests/fixtures/real-world/prove.ts
```
