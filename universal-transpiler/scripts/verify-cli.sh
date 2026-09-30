#!/usr/bin/env bash
#
# Universal Transpiler CLI verification.
#
# Runs every CLI command against real execution: native toolchains plus the
# docker fallback for Rust. Exits non-zero on any failure.
#
# Rust-dependent steps are skipped (with a notice) when the docker daemon is
# not available; on a machine with docker they always run.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/bin/cli.js"
TMP="$(mktemp -d /tmp/universal-transpiler-verify-XXXXXX)"
STATE="$TMP/state.json"
trap 'rm -rf "$TMP"' EXIT

pass=0
skip=0

banner() { echo; echo "=== $1 ==="; }

fail() { echo "FAIL: $1" >&2; exit 1; }

skipped() { echo "SKIP: $1 (docker daemon unavailable)"; skip=$((skip + 1)); }

DOCKER=1
if ! docker info >/dev/null 2>&1; then DOCKER=0; fi

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
cat > "$TMP/hello.go" <<'EOF'
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println("hello from go")
	for _, a := range os.Args[1:] {
		fmt.Println("go arg:", a)
	}
}
EOF

cat > "$TMP/fail.go" <<'EOF'
package main

import "os"

func main() {
	os.Exit(7)
}
EOF

cat > "$TMP/fail.ts" <<'EOF'
process.exit(7);
EOF

cat > "$TMP/hello.rs" <<'EOF'
fn main() {
    println!("hello from rust");
    for arg in std::env::args().skip(1) {
        println!("rust arg: {}", arg);
    }
}
EOF

cat > "$TMP/hello.ts" <<'EOF'
const greeting: string = "hello from typescript";
console.log(greeting);
for (const a of process.argv.slice(2)) {
  console.log("ts arg:", a);
}
EOF

cat > "$TMP/sample.ts" <<'EOF'
interface Greet { name: string }
function greet(g: Greet): string {
  const msg: string = `hi ${g.name}`;
  console.log(msg);
  return msg;
}
greet({ name: "world" });
EOF

# ---------------------------------------------------------------------------
# 1. status (via npm start, the package.json entry point)
# ---------------------------------------------------------------------------
banner "npm start status"
cd "$ROOT"
npm start status > "$TMP/status.out" 2> "$TMP/status.err"
grep -q '^rust' "$TMP/status.out" || fail "status: rust toolchain missing"
grep -q '^go' "$TMP/status.out" || fail "status: go toolchain missing"
if [ "$DOCKER" = 1 ]; then
  grep -q 'docker (rust' "$TMP/status.out" || fail "status: rust docker fallback not reported"
fi
echo "ok - toolchain table printed (rust docker fallback: $([ "$DOCKER" = 1 ] && grep -o 'docker (rust[^ ]*' "$TMP/status.out" | head -1 || echo 'n/a'))"
pass=$((pass + 1))

# ---------------------------------------------------------------------------
# 2. analyze a .go file and a .rs file
# ---------------------------------------------------------------------------
banner "analyze hello.go"
node "$CLI" analyze "$TMP/hello.go" > "$TMP/analyze-go.out" 2> "$TMP/analyze-go.err"
grep -q 'Language:     go' "$TMP/analyze-go.out" || fail "analyze go: language not detected"
grep -q 'Route:        native-run' "$TMP/analyze-go.out" || fail "analyze go: route not native-run"
echo "ok - go analysis:"; sed 's/^/    /' "$TMP/analyze-go.out"
pass=$((pass + 1))

banner "analyze hello.rs"
node "$CLI" analyze "$TMP/hello.rs" > "$TMP/analyze-rs.out" 2> "$TMP/analyze-rs.err"
grep -q 'Language:     rust' "$TMP/analyze-rs.out" || fail "analyze rs: language not detected"
if [ "$DOCKER" = 1 ]; then
  grep -q 'Route:        native-run' "$TMP/analyze-rs.out" \
    || fail "analyze rs: expected native-run via docker fallback"
  echo "ok - rust routes natively through the docker fallback toolchain"
else
  echo "ok - rust detected (routing falls back to transpilation without docker)"
fi
sed 's/^/    /' "$TMP/analyze-rs.out"
pass=$((pass + 1))

# ---------------------------------------------------------------------------
# 3. run: go, rust (docker), typescript (auto-detect), args after --
# ---------------------------------------------------------------------------
banner "run hello.go"
node "$CLI" run "$TMP/hello.go" > "$TMP/run-go.out" 2> "$TMP/run-go.err"
grep -q 'hello from go' "$TMP/run-go.out" || fail "run go: no program output"
grep -q 'route: native-run' "$TMP/run-go.err" || fail "run go: wrong route"
echo "ok - go executed natively: $(grep 'route:' "$TMP/run-go.err")"
pass=$((pass + 1))

banner "run failing programs -- non-zero and exact exit codes"
set +e
node "$CLI" run "$TMP/fail.go" > /dev/null 2>&1
gocode=$?
node "$CLI" run "$TMP/fail.ts" > /dev/null 2>&1
tscode=$?
set -e
[ "$gocode" != 0 ] || fail "run go: expected non-zero exit code for a failing program"
[ "$tscode" = 7 ] || fail "run ts: expected the program exit code 7, got $tscode"
echo "ok - failing go program exits non-zero ($gocode); node program propagates its own exit code (7)"
pass=$((pass + 1))

banner "run hello.rs (docker fallback)"
if [ "$DOCKER" = 1 ]; then
  node "$CLI" run "$TMP/hello.rs" -- alpha beta > "$TMP/run-rs.out" 2> "$TMP/run-rs.err"
  grep -q 'hello from rust' "$TMP/run-rs.out" || fail "run rust: no program output"
  grep -q 'rust arg: alpha' "$TMP/run-rs.out" || fail "run rust: program args not forwarded"
  grep -q 'toolchain: docker:rust' "$TMP/run-rs.err" || fail "run rust: not executed via docker"
  echo "ok - rust executed via docker fallback with args: $(grep 'toolchain:' "$TMP/run-rs.err")"
  pass=$((pass + 1))
else
  skipped "run rust"
fi

banner "run hello.ts (auto-detect + args after --)"
node "$CLI" run "$TMP/hello.ts" -- one two > "$TMP/run-ts.out" 2> "$TMP/run-ts.err"
grep -q 'hello from typescript' "$TMP/run-ts.out" || fail "run ts: no program output"
grep -q 'ts arg: one' "$TMP/run-ts.out" || fail "run ts: program args not forwarded"
grep -q 'auto-detected as typescript' "$TMP/run-ts.err" || fail "run ts: language not auto-detected"
echo "ok - typescript auto-detected and executed with trailing args"
pass=$((pass + 1))

# ---------------------------------------------------------------------------
# 4. transpile: typescript -> javascript, rust -> go
# ---------------------------------------------------------------------------
banner "transpile sample.ts typescript javascript"
node "$CLI" transpile "$TMP/sample.ts" typescript javascript > "$TMP/ts2js.out" 2> "$TMP/ts2js.err"
grep -q 'console.log' "$TMP/ts2js.out" || fail "transpile ts->js: no javascript output"
grep -q 'strategy:' "$TMP/ts2js.err" || fail "transpile ts->js: strategy note missing on stderr"
echo "ok - $(cat "$TMP/ts2js.err" | sed 's/\[cli\] //')"
pass=$((pass + 1))

banner "transpile hello.rs rust go"
node "$CLI" transpile "$TMP/hello.rs" rust go > "$TMP/rs2go.out" 2> "$TMP/rs2go.err"
grep -q 'package main' "$TMP/rs2go.out" || fail "transpile rs->go: no go output"
grep -q 'strategy: structural' "$TMP/rs2go.err" || fail "transpile rs->go: expected structural strategy"
echo "ok - $(sed 's/\[cli\] //' "$TMP/rs2go.err")"
pass=$((pass + 1))

# ---------------------------------------------------------------------------
# 5. compile a rust file to a native artifact (docker fallback)
# ---------------------------------------------------------------------------
banner "compile hello.rs (docker fallback)"
if [ "$DOCKER" = 1 ]; then
  node "$CLI" compile "$TMP/hello.rs" --output "$TMP/hello-bin" > "$TMP/compile.out" 2> "$TMP/compile.err"
  grep -q "^$TMP/hello-bin$" "$TMP/compile.out" || fail "compile rs: artifact path not printed"
  [ -x "$TMP/hello-bin" ] || fail "compile rs: binary does not exist or is not executable"
  "$TMP/hello-bin" > "$TMP/hello-bin.out" || fail "compile rs: compiled binary does not run"
  grep -q 'hello from rust' "$TMP/hello-bin.out" || fail "compile rs: binary output mismatch"
  echo "ok - native binary exists and runs ($(grep 'toolchain:' "$TMP/compile.err"))"
  pass=$((pass + 1))
else
  skipped "compile rust"
fi

# ---------------------------------------------------------------------------
# 6. demo foodsavr --target rust (docker fallback)
# ---------------------------------------------------------------------------
banner "demo foodsavr --target rust"
if [ "$DOCKER" = 1 ]; then
  node "$CLI" demo foodsavr --target rust --state "$STATE" > "$TMP/demo.out" 2> "$TMP/demo.err"
  grep -q 'product=Milk to_buy=5' "$TMP/demo.out" || fail "demo rust: workflow output mismatch"
  grep -q 'toolchain: docker:rust' "$TMP/demo.err" || fail "demo rust: not executed via docker"
  echo "ok - foodSavr workflow executed through the rust docker target"
  pass=$((pass + 1))
else
  skipped "demo foodsavr rust"
fi

# ---------------------------------------------------------------------------
# 7. goals --advance with one defined goal
# ---------------------------------------------------------------------------
banner "goals --define + --advance"
node "$CLI" goals --define "run-hello-world-per-language" --state "$STATE" > "$TMP/goals1.out" 2> "$TMP/goals1.err"
grep -q '\[planned\] run-hello-world-per-language' "$TMP/goals1.out" || fail "goals: goal not defined"
node "$CLI" goals --advance --state "$STATE" > "$TMP/goals2.out" 2> "$TMP/goals2.err"
grep -q 'advanced: run-hello-world-per-language' "$TMP/goals2.err" || fail "goals --advance: goal not advanced"
grep -q '\[done\] run-hello-world-per-language' "$TMP/goals2.out" || fail "goals --advance: goal not completed"
echo "ok - self-going loop advanced the defined goal:"
sed 's/^/    /' "$TMP/goals2.out"
pass=$((pass + 1))

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "=== verification complete: $pass passed, $skip skipped, 0 failed ==="
[ "$skip" = 0 ] || echo "note: $skip docker-dependent step(s) skipped (docker daemon unavailable)"
