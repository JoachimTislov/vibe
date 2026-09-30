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

cat > "$TMP/weekly.dsl" <<'EOF'
workflow food-tracking "Weekly groceries" {
    reference-date 2026-10-01
    horizon 7 days

    collection pantry "Pantry" {
        product Milk (dairy): 2 expiring 2026-10-04, 1 expired 2026-09-28
        product Pasta (dry goods): 4 non-expiring
        product Bananas (produce): 6 expiring 2026-10-03
    }

    consume Milk at 1 per day
    consume Pasta at 0.5 per day
    consume Bananas at 1 per day

    meal 2026-10-02 "Carbonara" needs Pasta x2, Milk x1
}

rules {
    exclude expired stock
}
EOF

cat > "$TMP/broken.dsl" <<'EOF'
workflow food-tracking "Broken" {
    reference-date not-a-date
}
EOF

cat > "$TMP/vault-meals.dsl" <<'EOF'
workflow food-tracking "Vault meals" {
    reference-date 2026-10-01
    horizon 3 days

    collection fridge "Fridge" {
        product Kefir (dairy): 2 expiring 2026-10-03
        product Quinoa (grains): 1 non-expiring
    }

    consume Kefir at 1 per day

    meal 2026-10-01 "Kefir bowl" needs Kefir x1
}
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
# 6b. demo recipes: composition into a foodsavr spec + execution
# ---------------------------------------------------------------------------
banner "demo recipes (compose -> foodsavr spec -> run)"
node "$CLI" demo recipes --state "$STATE" > "$TMP/demo-recipes.out" 2> "$TMP/demo-recipes.err"
grep -q 'recipes demo: 3 recipes, 7 meals' "$TMP/demo-recipes.out" || fail "demo recipes: scenario header missing"
grep -q 'product=parmesan toBuy=4 usableStock=0 needed=4' "$TMP/demo-recipes.out" \
  || fail "demo recipes: parmesan not planned from scratch"
grep -q 'product=Eggs toBuy=8 usableStock=6 needed=14' "$TMP/demo-recipes.out" \
  || fail "demo recipes: scaled meal quantities wrong"
grep -q 'product=Bananas quantity=6 daysUntilExpiry=2' "$TMP/demo-recipes.out" \
  || fail "demo recipes: waste alert missing"
echo "ok - recipe demo composed into a foodsavr spec and run"
pass=$((pass + 1))

banner "demo recipes --json (composed spec + workflow result)"
node "$CLI" demo recipes --json --state "$STATE" > "$TMP/demo-recipes-json.out" 2> "$TMP/demo-recipes-json.err"
grep -q '"mealPlan"' "$TMP/demo-recipes-json.out" || fail "demo recipes --json: composed spec missing"
grep -q '"referenceDate": "2026-09-29"' "$TMP/demo-recipes-json.out" || fail "demo recipes --json: reference date missing"
grep -q '"horizonDays": 7' "$TMP/demo-recipes-json.out" || fail "demo recipes --json: horizon missing"
grep -q '"toBuy": 4' "$TMP/demo-recipes-json.out" || fail "demo recipes --json: workflow result missing"
echo "ok - JSON output carries the composed spec and the workflow result"
pass=$((pass + 1))

banner "demo recipes --target js (generate + execute through the engine)"
node "$CLI" demo recipes --target js --state "$STATE" > "$TMP/demo-recipes-js.out" 2> "$TMP/demo-recipes-js.err"
grep -q 'product=parmesan toBuy=4' "$TMP/demo-recipes-js.out" || fail "demo recipes js: reference output missing"
grep -q '"toBuy": 4' "$TMP/demo-recipes-js.out" || fail "demo recipes js: generated program output missing"
grep -q 'route: native-run' "$TMP/demo-recipes-js.err" || fail "demo recipes js: route not reported"
echo "ok - composed spec executed through the engine (js target)"
pass=$((pass + 1))

banner "demo recipes --target rust (docker fallback)"
if [ "$DOCKER" = 1 ]; then
  node "$CLI" demo recipes --target rust --state "$STATE" > "$TMP/demo-recipes-rs.out" 2> "$TMP/demo-recipes-rs.err"
  grep -q 'product=parmesan to_buy=4 usable_stock=0 needed=4' "$TMP/demo-recipes-rs.out" \
    || fail "demo recipes rust: composed spec output mismatch"
  grep -q 'toolchain: docker:rust' "$TMP/demo-recipes-rs.err" || fail "demo recipes rust: not executed via docker"
  echo "ok - composed spec executed through the rust docker target"
  pass=$((pass + 1))
else
  skipped "demo recipes rust"
fi

# ---------------------------------------------------------------------------
# 6c. workflow: run a workflow DSL document (parse -> run -> print)
# ---------------------------------------------------------------------------
banner "workflow weekly.dsl (parse + reference run)"
node "$CLI" workflow "$TMP/weekly.dsl" --state "$STATE" > "$TMP/workflow.out" 2> "$TMP/workflow.err"
grep -q 'workflow: Weekly groceries' "$TMP/workflow.out" || fail "workflow: document title missing"
# Expired milk is excluded by the rules block: 7 needed - 2 usable = 5 to buy
grep -q 'product=Milk toBuy=5 usableStock=2 needed=7' "$TMP/workflow.out" || fail "workflow: shopping list wrong"
grep -q 'product=Bananas quantity=6 daysUntilExpiry=2' "$TMP/workflow.out" || fail "workflow: waste alert missing"
echo "ok - DSL document parsed and run:"; sed 's/^/    /' "$TMP/workflow.out"
pass=$((pass + 1))

banner "workflow weekly.dsl --json + --target js"
node "$CLI" workflow "$TMP/weekly.dsl" --json --state "$STATE" > "$TMP/workflow-json.out" 2> "$TMP/workflow-json.err"
grep -q '"domain": "food-tracking"' "$TMP/workflow-json.out" || fail "workflow json: domain missing"
grep -q '"title": "Weekly groceries"' "$TMP/workflow-json.out" || fail "workflow json: title missing"
grep -q '"toBuy": 5' "$TMP/workflow-json.out" || fail "workflow json: workflow result missing"
node "$CLI" workflow "$TMP/weekly.dsl" --target js --state "$STATE" > "$TMP/workflow-js.out" 2> "$TMP/workflow-js.err"
grep -q 'product=Milk toBuy=5' "$TMP/workflow-js.out" || fail "workflow js: reference output missing"
grep -q '"toBuy": 5' "$TMP/workflow-js.out" || fail "workflow js: generated program output missing"
grep -q 'route: native-run' "$TMP/workflow-js.err" || fail "workflow js: route not reported"
echo "ok - workflow document executed through the engine (js target)"
pass=$((pass + 1))


# ---------------------------------------------------------------------------
# 6d. dispatch: the full flow (interpret -> judgment -> domain agent)
# ---------------------------------------------------------------------------
banner "dispatch weekly.dsl (judgment-routed domain agent)"
node "$CLI" dispatch "$TMP/weekly.dsl" --state "$STATE" > "$TMP/dispatch.out" 2> "$TMP/dispatch.err"
grep -q 'agent: agent:food-tracking (domain food-tracking)' "$TMP/dispatch.err" || fail "dispatch: wrong agent routed"
grep -q 'judgment: model heuristic chose agent:food-tracking' "$TMP/dispatch.err" || fail "dispatch: judgment trace missing"
grep -q '"toBuy": 5' "$TMP/dispatch.out" || fail "dispatch: workflow result missing"
grep -q 'idempotency_key' "$TMP/dispatch.out" || fail "dispatch: shopping.v1 payloads missing"
echo "ok - dispatch routed to the designated food-tracking agent"
sed 's/^/    /' "$TMP/dispatch.err"
pass=$((pass + 1))

banner "dispatch server.js --produce scaffold --code-target go (designated web-backend agent)"
cat > "$TMP/server.js" <<'JS'
const router = require('express');
const http = require('http');
const server = http.createServer((req, res) => res.send('ok'));
app.listen(3000);
JS
node "$CLI" dispatch "$TMP/server.js" --produce scaffold --code-target go --state "$STATE" > "$TMP/scaffold.out" 2> "$TMP/scaffold.err"
grep -q 'agent: agent:web-backend (domain web-backend)' "$TMP/scaffold.err" || fail "dispatch scaffold: wrong agent routed"
grep -q 'package main' "$TMP/scaffold.out" || fail "dispatch scaffold: go scaffold missing"
grep -q 'net/http' "$TMP/scaffold.out" || fail "dispatch scaffold: http server scaffold wrong"
grep -q 'standards: style gofmt' "$TMP/scaffold.err" || fail "dispatch scaffold: go ecosystem standard missing"
echo "ok - the web-backend agent produced a gofmt-standard net/http scaffold"
sed 's/^/    /' "$TMP/scaffold.err" | head -6
pass=$((pass + 1))

banner "dispatch --output writes a runnable artifact to disk"
cat > "$TMP/tool.js" <<'JS'
const argv = require('process').argv;
console.log('cli: args', argv.slice(2).join(','));
JS
node "$CLI" dispatch "$TMP/tool.js" --produce scaffold --code-target go --output "$TMP/scaffold-artifact.go" --state "$STATE" > /dev/null 2> "$TMP/out.err"
grep -q "artifact written to" "$TMP/out.err" || fail "dispatch output: artifact note missing"
grep -q 'package main' "$TMP/scaffold-artifact.go" || fail "dispatch output: artifact content wrong"
# The written artifact is a real program: run it through the engine
node "$CLI" run "$TMP/scaffold-artifact.go" --state "$STATE" -- --name=written-by-cli > "$TMP/out-run.out" 2> "$TMP/out-run.err"
grep -q 'hello written-by-cli' "$TMP/out-run.out" || fail "dispatch output: written artifact did not run"
echo "ok - artifact written via --output and re-executed through the engine"
pass=$((pass + 1))

banner "dispatch foodsavr.system (the 5GL bridge: workflow inside a system)"
cat > "$TMP/foodsavr.system" <<'SYS'
system food-tracking "foodsavr service" {
    record Product {
        id
        name
        category
    }

    workflow "Weekly groceries" {
        reference-date 2026-10-01
        horizon 7 days

        collection pantry "Pantry" {
            product Milk (dairy): 2 expiring 2026-10-04
            product Pasta (dry goods): 4 non-expiring
        }

        consume Milk at 1 per day
        consume Pasta at 0.5 per day
    }

    rules {
        exclude expired stock
        count expiring-soon stock
    }

    module shopping {
        shopping-list
        resource Product
    }
}
SYS
node "$CLI" dispatch "$TMP/foodsavr.system" --produce code --code-target go --state "$STATE" > "$TMP/food.out" 2> "$TMP/food.err"
grep -q 'agent: agent:food-tracking (domain food-tracking)' "$TMP/food.err" || fail "bridge: wrong agent routed"
grep -q 'compiled the food-tracking system declaration' "$TMP/food.err" || fail "bridge: declaration not compiled"
grep -q 'http.HandleFunc("/shopping-list"' "$TMP/food.out" || fail "bridge: shopping-list route missing"
grep -q 'productStore' "$TMP/food.out" || fail "bridge: product store missing"
node "$CLI" dispatch "$TMP/foodsavr.system" --produce workflow-result --state "$STATE" > "$TMP/food-wf.out" 2> "$TMP/food-wf.err"
grep -q '"toBuy": 5' "$TMP/food-wf.out" || fail "bridge: embedded workflow result missing"
echo "ok - the bridge: one document, embedded workflow + system shell"
pass=$((pass + 1))

banner "dispatch orders.system (the generalized 5GL system declaration)"
cat > "$TMP/orders.system" <<'SYS'
# The orders service, declared
system web-backend "Orders service" {
    platform native

    record Order {
        id
        customer
        total
    }

    module api {
        endpoint GET /health
        endpoint GET /orders
        endpoint POST /orders
    }
}
SYS
node "$CLI" dispatch "$TMP/orders.system" --produce code --code-target go --state "$STATE" > "$TMP/system.out" 2> "$TMP/system.err"
grep -q 'agent: agent:web-backend (domain web-backend)' "$TMP/system.err" || fail "dispatch system: wrong agent routed"
grep -q 'compiled the system declaration' "$TMP/system.err" || fail "dispatch system: declaration not compiled"
grep -q 'type Order struct' "$TMP/system.out" || fail "dispatch system: declared record missing"
grep -q 'http.HandleFunc("/orders"' "$TMP/system.out" || fail "dispatch system: declared route missing"
grep -q 'standards: style gofmt' "$TMP/system.err" || fail "dispatch system: go standard missing"
node "$CLI" dispatch "$TMP/orders.system" --produce dsl --state "$STATE" > "$TMP/system-dsl.out" 2> /dev/null
grep -q 'system web-backend "Orders service"' "$TMP/system-dsl.out" || fail "dispatch system: dsl re-emission missing"
echo "ok - a system declaration compiled to a go server and re-emitted as canonical DSL"
pass=$((pass + 1))

banner "dispatch weekly.dsl --produce code --code-target go"
node "$CLI" dispatch "$TMP/weekly.dsl" --produce code --code-target go --state "$STATE" > "$TMP/dispatch-go.out" 2> "$TMP/dispatch-go.err"
grep -q 'package main' "$TMP/dispatch-go.out" || fail "dispatch code: go program missing"
grep -q 'generated standalone go program' "$TMP/dispatch-go.err" || fail "dispatch code: generation note missing"
echo "ok - dispatch produced a standalone go program for the same input"
pass=$((pass + 1))

banner "workflow broken.dsl (syntax error -> file:line, exit 1)"
set +e
node "$CLI" workflow "$TMP/broken.dsl" > "$TMP/workflow-bad.out" 2> "$TMP/workflow-bad.err"
badcode=$?
set -e
[ "$badcode" = 1 ] || fail "workflow bad: expected exit code 1, got $badcode"
grep -q "$TMP/broken.dsl:2:" "$TMP/workflow-bad.err" || fail "workflow bad: file:line prefix missing on stderr"
grep -q 'invalid ISO date' "$TMP/workflow-bad.err" || fail "workflow bad: error message missing on stderr"
if grep -q '    at ' "$TMP/workflow-bad.err"; then fail "workflow bad: stack trace leaked"; fi
echo "ok - syntax error reported as file:line with exit code 1: $(cat "$TMP/workflow-bad.err")"
pass=$((pass + 1))

# ---------------------------------------------------------------------------
# 6d. vault: define, list --domain, lookup, ingest, stats, candidates
# ---------------------------------------------------------------------------
VAULT_STATE="$TMP/vault-state.json"

banner "vault define + list --domain + lookup"
node "$CLI" vault define kale food-tracking \
  --kind entity --semantics "leafy green vegetable" --confidence 0.9 \
  --state "$VAULT_STATE" > "$TMP/vault-define.out" 2> "$TMP/vault-define.err"
grep -q 'Keyword:     kale' "$TMP/vault-define.out" || fail "vault define: record not printed"
grep -q 'Source:      learned' "$TMP/vault-define.out" || fail "vault define: source missing"
node "$CLI" vault list --domain food-tracking --state "$VAULT_STATE" \
  > "$TMP/vault-list.out" 2> "$TMP/vault-list.err"
grep -q '^kale' "$TMP/vault-list.out" || fail "vault list: defined keyword missing from its domain"
node "$CLI" vault lookup kale --state "$VAULT_STATE" > "$TMP/vault-lookup.out" 2> "$TMP/vault-lookup.err"
grep -q 'food-tracking' "$TMP/vault-lookup.out" || fail "vault lookup: domain missing"
grep -q 'entity' "$TMP/vault-lookup.out" || fail "vault lookup: kind missing"
echo "ok - vault define/list/lookup round-trip:"
sed 's/^/    /' "$TMP/vault-define.out"
pass=$((pass + 1))

banner "vault ingest (DSL vocabulary -> entity definitions)"
node "$CLI" vault ingest "$TMP/vault-meals.dsl" --client acme --state "$VAULT_STATE" \
  > "$TMP/vault-ingest.out" 2> "$TMP/vault-ingest.err"
grep -q 'Ingested 5 vocabulary entries into domain food-tracking' "$TMP/vault-ingest.out" \
  || fail "vault ingest: entry count wrong"
grep -q '^  kefir (entity)' "$TMP/vault-ingest.out" || fail "vault ingest: kefir not registered"
grep -q '^  quinoa (entity)' "$TMP/vault-ingest.out" || fail "vault ingest: quinoa not registered"
grep -q '^  dairy (entity)' "$TMP/vault-ingest.out" || fail "vault ingest: category not registered"
node "$CLI" vault list --domain food-tracking --text quinoa --state "$VAULT_STATE" \
  > "$TMP/vault-list2.out" 2> "$TMP/vault-list2.err"
grep -q '^quinoa' "$TMP/vault-list2.out" || fail "vault ingest: quinoa not listed under food-tracking"
node "$CLI" vault lookup kefir --state "$VAULT_STATE" > "$TMP/vault-lookup2.out" 2> "$TMP/vault-lookup2.err"
grep -q 'food-tracking' "$TMP/vault-lookup2.out" || fail "vault ingest: kefir not lookup-able"
node "$CLI" vault stats --state "$VAULT_STATE" > "$TMP/vault-stats.out" 2> "$TMP/vault-stats.err"
grep -q 'Definitions:        6' "$TMP/vault-stats.out" || fail "vault stats: definition total wrong"
grep -q '  food-tracking: 6' "$TMP/vault-stats.out" || fail "vault stats: domain total missing"
grep -q '  client-promoted: 5' "$TMP/vault-stats.out" || fail "vault stats: source totals missing"
grep -q 'Pending candidates: 0' "$TMP/vault-stats.out" || fail "vault stats: pending candidate count missing"
node "$CLI" vault candidates --state "$VAULT_STATE" > "$TMP/vault-candidates.out" 2> "$TMP/vault-candidates.err"
grep -q 'pending' "$TMP/vault-candidates.out" || fail "vault candidates: output missing"
echo "ok - DSL vocabulary ingested into the vault:"
sed 's/^/    /' "$TMP/vault-ingest.out"
sed 's/^/    /' "$TMP/vault-stats.out"
pass=$((pass + 1))

banner "vault lookup of an unpromoted client-taught keyword"
node "$CLI" feedback bob keyword-domain "kombucha=food-tracking" --state "$VAULT_STATE" \
  > /dev/null 2>&1
node "$CLI" vault lookup kombucha --state "$VAULT_STATE" > "$TMP/vault-lookup3.out" 2> "$TMP/vault-lookup3.err"
grep -q 'food-tracking' "$TMP/vault-lookup3.out" || fail "vault lookup: taught keyword domain missing"
grep -q 'bob' "$TMP/vault-lookup3.out" || fail "vault lookup: teaching client (owner) missing"
echo "ok - unpromoted client-taught entry surfaced with its owner:"
sed 's/^/    /' "$TMP/vault-lookup3.out"
pass=$((pass + 1))

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
