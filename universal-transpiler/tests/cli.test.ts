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
