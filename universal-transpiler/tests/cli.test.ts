/**
 * Integration tests for the universal-transpiler CLI (bin/cli.js).
 *
 * Every test spawns the real CLI via `node bin/cli.js` and asserts on its
 * output and exit code. Docker-dependent cases (rust run/compile/demo)
 * skip cleanly when the docker daemon is unavailable.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { probeDocker } from '../src/toolchains/docker';
import { UniversalEngine } from '../src/engine/universal-engine';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'cli.js');

let workDir: string;
let statePath: string;
let dockerAvailable = false;
let rustAvailable = false;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HELLO_GO = `package main

import (
\t"fmt"
\t"os"
)

func main() {
\tfmt.Println("hello from go")
\tfor _, a := range os.Args[1:] {
\t\tfmt.Println("go arg:", a)
\t}
}
`;

const FAIL_GO = `package main

import "os"

func main() {
\tos.Exit(7)
}
`;

const HELLO_RS = `fn main() {
    println!("hello from rust");
    for arg in std::env::args().skip(1) {
        println!("rust arg: {}", arg);
    }
}
`;

const HELLO_TS = `const greeting: string = "hello from typescript";
console.log(greeting);
for (const a of process.argv.slice(2)) {
  console.log("ts arg:", a);
}
`;

const FAIL_TS = `process.exit(7);
`;

const SAMPLE_TS = `interface Greet { name: string }
function greet(g: Greet): string {
  const msg: string = \`hi \${g.name}\`;
  console.log(msg);
  return msg;
}
greet({ name: "world" });
`;

const WEEKLY_DSL = `workflow food-tracking "Weekly groceries" {
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
`;

const BROKEN_DSL = `workflow food-tracking "Broken" {
    reference-date not-a-date
}
`;

function fixture(name: string, content: string): string {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, content);
  return p;
}

/** Run the CLI; resolves with stdout, stderr and the exit code (never rejects). */
async function cli(
  args: string[],
  timeoutMs = 120_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args], {
      cwd: ROOT,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    // Non-zero exit codes land here; the payload is the same shape.
    return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.code ?? 1 };
  }
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-cli-test-'));
  statePath = path.join(workDir, 'state.json');

  fixture('hello.go', HELLO_GO);
  fixture('fail.go', FAIL_GO);
  fixture('hello.rs', HELLO_RS);
  fixture('hello.ts', HELLO_TS);
  fixture('fail.ts', FAIL_TS);
  fixture('sample.ts', SAMPLE_TS);
  fixture('weekly.dsl', WEEKLY_DSL);
  fixture('broken.dsl', BROKEN_DSL);

  const goProject = path.join(workDir, 'goproject');
  fs.mkdirSync(goProject);
  fs.writeFileSync(path.join(goProject, 'go.mod'), 'module demo\n\ngo 1.21\n');
  fs.writeFileSync(
    path.join(goProject, 'main.go'),
    'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("built") }\n'
  );

  dockerAvailable = (await probeDocker()).available;
  if (dockerAvailable) {
    const engine = new UniversalEngine({ statePath });
    const rust = engine.toolchains.get('rust');
    if (rust) {
      await rust.probe();
      rustAvailable = rust.info.available;
    }
  }
}, 60_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI basics', () => {
  it('help exits 0 with usage', async () => {
    const r = await cli(['help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage:');
    expect(r.stdout).toContain('demo foodsavr');
  }, 30_000);

  it('status prints the toolchain table', async () => {
    const r = await cli(['status']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^rust\s+Rust/m);
    expect(r.stdout).toMatch(/^go\s+Go/m);
    expect(r.stdout).toContain('docker fallback');
  }, 60_000);

  it('unknown commands and unknown options fail with a non-zero exit', async () => {
    const unknown = await cli(['frobnicate']);
    expect(unknown.code).not.toBe(0);
    const badFlag = await cli(['status', '--nope']);
    expect(badFlag.code).not.toBe(0);
  }, 30_000);

  it('missing files fail with a non-zero exit', async () => {
    const r = await cli(['analyze', path.join(workDir, 'nope.go')]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('file not found');
  }, 30_000);
});

describe('CLI analyze', () => {
  it('analyzes a go file', async () => {
    const r = await cli(['analyze', path.join(workDir, 'hello.go'), '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Language:     go');
    expect(r.stdout).toContain('Route:');
    expect(r.stdout).toContain('Domain:');
    expect(r.stdout).toContain('Platform:');
  }, 60_000);

  it('analyzes a rust file', async () => {
    const r = await cli(['analyze', path.join(workDir, 'hello.rs'), '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Language:     rust');
    expect(r.stdout).toContain('Domain:');
    if (dockerAvailable) {
      // The rust toolchain is available through the docker fallback
      expect(r.stdout).toContain('Route:        native-run');
    }
  }, 60_000);
});

describe('CLI run', () => {
  it('runs a go program natively', async () => {
    const r = await cli(['run', path.join(workDir, 'hello.go'), '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('hello from go');
    expect(r.stderr).toContain('route: native-run');
  }, 120_000);

  it('exits non-zero for a failing go program', async () => {
    const r = await cli(['run', path.join(workDir, 'fail.go'), '--state', statePath]);
    expect(r.code).not.toBe(0);
  }, 120_000);

  it('auto-detects typescript, runs it and forwards args after --', async () => {
    const r = await cli([
      'run',
      path.join(workDir, 'hello.ts'),
      '--state',
      statePath,
      '--',
      'one',
      'two',
    ]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('auto-detected as typescript');
    expect(r.stdout).toContain('hello from typescript');
    expect(r.stdout).toContain('ts arg: one');
    expect(r.stdout).toContain('ts arg: two');
  }, 120_000);

  it('propagates the program exit code for node programs', async () => {
    const r = await cli(['run', path.join(workDir, 'fail.ts'), '--state', statePath]);
    expect(r.code).toBe(7);
  }, 120_000);

  it('runs a rust program through the docker fallback with args', async () => {
    if (!rustAvailable) return console.warn('skipping: rust unavailable (no rustc, no docker)');
    const r = await cli([
      'run',
      path.join(workDir, 'hello.rs'),
      '--state',
      statePath,
      '--',
      'alpha',
      'beta',
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('hello from rust');
    expect(r.stdout).toContain('rust arg: alpha');
    expect(r.stdout).toContain('rust arg: beta');
    if (dockerAvailable && !fs.existsSync('/usr/local/bin/rustc')) {
      expect(r.stderr).toContain('toolchain: docker:rust');
    }
  }, 300_000);
});

describe('CLI transpile', () => {
  it('transpiles typescript to javascript (code on stdout, strategy on stderr)', async () => {
    const r = await cli([
      'transpile',
      path.join(workDir, 'sample.ts'),
      'typescript',
      'javascript',
      '--state',
      statePath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('console.log');
    expect(r.stdout).not.toContain('interface');
    expect(r.stderr).toContain('strategy:');
  }, 120_000);

  it('transpiles rust to go via the structural strategy', async () => {
    const r = await cli([
      'transpile',
      path.join(workDir, 'hello.rs'),
      'rust',
      'go',
      '--state',
      statePath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('package main');
    expect(r.stderr).toContain('strategy: structural');
  }, 120_000);
});

describe('CLI compile', () => {
  it('compiles a rust file to a native binary via the docker fallback', async () => {
    if (!rustAvailable) return console.warn('skipping: rust unavailable (no rustc, no docker)');
    const out = path.join(workDir, 'hello-bin');
    const r = await cli([
      'compile',
      path.join(workDir, 'hello.rs'),
      '--output',
      out,
      '--state',
      statePath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(out);
    expect(fs.existsSync(out)).toBe(true);
    // The artifact is a real, runnable binary
    const { stdout } = await execFileAsync(out, { timeout: 30_000 });
    expect(stdout).toContain('hello from rust');
  }, 300_000);
});

describe('CLI build', () => {
  it('builds a go module project', async () => {
    const r = await cli(['build', path.join(workDir, 'goproject'), '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Ecosystem:    go');
    expect(r.stdout).toContain('Build system: go-mod');
  }, 180_000);
});

describe('CLI feedback and goals', () => {
  it('records client feedback and reports promotion', async () => {
    const r = await cli([
      'feedback',
      'acme',
      'platform-preference',
      'web-backend=native',
      '--approve',
      '--state',
      statePath,
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Subject:   platform-preference');
    expect(r.stdout).toContain('Value:     web-backend=native');
    expect(r.stdout).toContain('Approved:  yes');
    expect(r.stdout).toContain('Promoted:  yes');
  }, 60_000);

  it('rejects unknown feedback subjects', async () => {
    const r = await cli(['feedback', 'acme', 'nonsense', 'x', '--state', statePath]);
    expect(r.code).not.toBe(0);
  }, 60_000);

  it('defines a goal and advances it with the self-going loop', async () => {
    const defined = await cli([
      'goals',
      '--define',
      'run-hello-world-per-language',
      '--state',
      statePath,
    ]);
    expect(defined.code).toBe(0);
    expect(defined.stdout).toContain('[planned] run-hello-world-per-language');

    const advanced = await cli(['goals', '--advance', '--state', statePath]);
    expect(advanced.code).toBe(0);
    expect(advanced.stderr).toContain('advanced: run-hello-world-per-language');
    expect(advanced.stdout).toContain('[done] run-hello-world-per-language');
  }, 300_000);
});

describe('CLI demo', () => {
  it('runs the foodSavr demo through the rust docker target', async () => {
    if (!rustAvailable) return console.warn('skipping: rust unavailable (no rustc, no docker)');
    const r = await cli(['demo', 'foodsavr', '--target', 'rust', '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('product=Milk to_buy=5');
    expect(r.stdout).toContain('product=Bananas quantity=6 days_until_expiry=2');
    expect(r.stderr).toContain('docker:rust');
  }, 300_000);

  it('runs the foodSavr demo through the javascript target', async () => {
    const r = await cli(['demo', 'foodsavr', '--target', 'js', '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('"toBuy": 5');
    expect(r.stdout).toContain('"product": "Milk"');
  }, 120_000);

  it('rejects unknown demo targets', async () => {
    const r = await cli(['demo', 'foodsavr', '--target', 'cobol', '--state', statePath]);
    expect(r.code).not.toBe(0);
  }, 60_000);
});

describe('CLI demo recipes', () => {
  it('composes the recipe demo into a foodsavr spec and prints the workflow result', async () => {
    const r = await cli(['demo', 'recipes', '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('recipes demo: 3 recipes, 7 meals');
    // Parmesan is not in the pantry: it must be planned from scratch
    expect(r.stdout).toContain('product=parmesan toBuy=4 usableStock=0 needed=4');
    // Scaled meals: 8 eggs planned (14 needed - 6 usable stock)
    expect(r.stdout).toContain('product=Eggs toBuy=8 usableStock=6 needed=14');
    // Waste alerts from the composed inventory
    expect(r.stdout).toContain('product=Bananas quantity=6 daysUntilExpiry=2');
    expect(r.stdout).toContain('product=Yogurt quantity=2 daysUntilExpiry=4');
  }, 120_000);

  it('prints the composed spec and the workflow result with --json', async () => {
    const r = await cli(['demo', 'recipes', '--json', '--state', statePath]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout);

    // The composed spec: recipes -> meals -> foodsavr spec
    expect(payload.spec.domain).toBe('food-tracking');
    expect(payload.spec.referenceDate).toBe('2026-09-29');
    expect(payload.spec.horizonDays).toBe(7);
    expect(payload.spec.mealPlan).toHaveLength(7);
    expect(payload.spec.mealPlan[0].ingredients).toContainEqual({
      product: 'bananas',
      quantity: 1,
    });

    // The reference workflow result
    const parmesan = payload.result.shoppingList.find(
      (i: any) => i.product === 'parmesan'
    );
    expect(parmesan).toMatchObject({ toBuy: 4, usableStock: 0, needed: 4 });
    expect(payload.result.wasteAlerts).toHaveLength(4);
  }, 120_000);

  it('generates and executes the composed spec through the js target', async () => {
    const r = await cli(['demo', 'recipes', '--target', 'js', '--state', statePath]);
    expect(r.code).toBe(0);
    // Reference workflow output (human-readable) ...
    expect(r.stdout).toContain('product=parmesan toBuy=4');
    // ... followed by the generated program's output through the engine
    expect(r.stdout).toContain('"toBuy": 4');
    expect(r.stderr).toContain('route: native-run');
  }, 120_000);

  it('generates and executes the composed spec through the rust docker target', async () => {
    if (!rustAvailable) return console.warn('skipping: rust unavailable (no rustc, no docker)');
    const r = await cli(['demo', 'recipes', '--target', 'rust', '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('product=parmesan to_buy=4 usable_stock=0 needed=4');
    expect(r.stderr).toContain('docker:rust');
  }, 300_000);

  it('includes the execution report in --json output when --target is given', async () => {
    const r = await cli(['demo', 'recipes', '--json', '--target', 'js', '--state', statePath]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout);
    expect(payload.spec.mealPlan).toHaveLength(7);
    expect(payload.result.shoppingList).toHaveLength(7);
    expect(payload.execution).toMatchObject({
      target: 'javascript',
      route: 'native-run',
      ok: true,
    });
  }, 120_000);

  it('rejects unknown recipe demo targets', async () => {
    const r = await cli(['demo', 'recipes', '--target', 'cobol', '--state', statePath]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('unknown demo target');
  }, 60_000);
});

describe('CLI workflow', () => {
  it('runs a workflow DSL document and prints the shopping list and waste alerts', async () => {
    const r = await cli(['workflow', path.join(workDir, 'weekly.dsl'), '--state', statePath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('workflow: Weekly groceries (domain food-tracking, reference 2026-10-01, horizon 7 days)');
    // Expired milk is excluded by the rules block: 7 needed - 2 usable = 5 to buy
    expect(r.stdout).toContain('product=Milk toBuy=5 usableStock=2 needed=7 category=dairy');
    expect(r.stdout).toContain('product=Bananas toBuy=1 usableStock=6 needed=7 category=produce');
    expect(r.stdout).toContain('product=Pasta toBuy=0 usableStock=4 needed=3.5 category=dry goods');
    expect(r.stdout).toContain('product=Bananas quantity=6 daysUntilExpiry=2');
    expect(r.stdout).toContain('product=Milk quantity=2 daysUntilExpiry=3');
  }, 60_000);

  it('prints domain, title, spec and result with --json', async () => {
    const r = await cli(['workflow', path.join(workDir, 'weekly.dsl'), '--json', '--state', statePath]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout);

    expect(payload.domain).toBe('food-tracking');
    expect(payload.title).toBe('Weekly groceries');
    expect(payload.spec.domain).toBe('food-tracking');
    expect(payload.spec.referenceDate).toBe('2026-10-01');
    expect(payload.spec.horizonDays).toBe(7);
    expect(payload.spec.collections[0].products).toHaveLength(3);
    expect(payload.spec.mealPlan[0].name).toBe('Carbonara');

    const milk = payload.result.shoppingList.find((i: any) => i.product === 'Milk');
    expect(milk).toMatchObject({ toBuy: 5, usableStock: 2, needed: 7 });
    expect(payload.result.wasteAlerts).toHaveLength(2);
  }, 60_000);

  it('generates and executes the document through the js target', async () => {
    const r = await cli([
      'workflow',
      path.join(workDir, 'weekly.dsl'),
      '--target',
      'js',
      '--state',
      statePath,
    ]);
    expect(r.code).toBe(0);
    // Reference workflow output (human-readable) ...
    expect(r.stdout).toContain('product=Milk toBuy=5');
    // ... followed by the generated program's output through the engine
    expect(r.stdout).toContain('"toBuy": 5');
    expect(r.stderr).toContain('route: native-run');
  }, 120_000);

  it('includes the execution report in --json output when --target is given', async () => {
    const r = await cli([
      'workflow',
      path.join(workDir, 'weekly.dsl'),
      '--json',
      '--target',
      'js',
      '--state',
      statePath,
    ]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout);
    expect(payload.domain).toBe('food-tracking');
    expect(payload.result.shoppingList).toHaveLength(3);
    expect(payload.execution).toMatchObject({
      target: 'javascript',
      route: 'native-run',
      ok: true,
    });
  }, 120_000);

  it('reports a syntax error as file:line with exit code 1 and no stack trace', async () => {
    const r = await cli(['workflow', path.join(workDir, 'broken.dsl'), '--state', statePath]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/broken\.dsl:2: invalid ISO date "not-a-date"/);
    expect(r.stderr).not.toMatch(/\n\s+at /);
  }, 60_000);

  it('requires a document argument', async () => {
    const r = await cli(['workflow']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('workflow requires');
  }, 60_000);
});
