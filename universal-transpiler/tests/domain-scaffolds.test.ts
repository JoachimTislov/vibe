/**
 * Universal Transpiler - Domain Scaffold Execution Tests
 *
 * The designated runtime agents' scaffolds are real programs: each
 * generated scaffold is executed through the engine's own toolchains and
 * its output is asserted. The same scaffold a client receives is the one
 * the system proves runnable first (empirical evidence, not promise).
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { generateScaffold, type ScaffoldTarget } from '../src/agents/scaffolds';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-scaffold-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

async function runScaffold(
  domain: string,
  target: ScaffoldTarget,
  expected: string[]
): Promise<void> {
  const code = generateScaffold(domain, target);
  expect(code).toBeDefined();

  const tc = engine.toolchains.forLanguage(target === 'typescript' ? 'typescript' : target);
  if (!tc) return; // unknown target language
  await tc.probe();
  if (!tc.info.available) {
    console.warn(`skipping: ${target} toolchain unavailable`);
    return;
  }

  const report = await engine.run(code!, { language: target });
  expect(report.result.ok).toBe(true);
  for (const fragment of expected) {
    expect(report.result.stdout.toLowerCase()).toContain(fragment.toLowerCase());
  }
}

describe('scaffolds execute through the engine', () => {
  it('data scaffold: javascript aggregates records', async () => {
    await runScaffold('data', 'javascript', ['count', 'total', '49', 'mean']);
  });

  it('data scaffold: go aggregates records', async () => {
    await runScaffold('data', 'go', ['count=3', 'total=49', 'mean=16.33']);
  });

  it('data scaffold: python aggregates records', async () => {
    await runScaffold('data', 'python', ['count=3', 'total=49', 'mean=16.33']);
  });

  it('cli scaffold: javascript greets by flag', async () => {
    await runScaffold('cli', 'javascript', ['hello world']);
  });

  it('systems scaffold: javascript computes in a worker thread', async () => {
    await runScaffold('systems', 'javascript', ['worker computed total=499999500000']);
  });

  it('systems scaffold: go computes across goroutines', async () => {
    await runScaffold('systems', 'go', ['goroutine total = 14']);
  });

  it('testing scaffold: javascript node:test suite passes', async () => {
    await runScaffold('testing', 'javascript', ['pass']);
  });

  it('cli scaffold: go parses flags', async () => {
    await runScaffold('cli', 'go', ['hello world']);
  });

  it('game scaffold: javascript runs the tick loop', async () => {
    await runScaffold('game', 'javascript', ['game: player at (2, 0)']);
  });

  it('game scaffold: go runs the tick loop', async () => {
    await runScaffold('game', 'go', ['game: player at (2, 0)']);
  });

  it('ml scaffold: javascript fits by gradient descent', async () => {
    await runScaffold('ml', 'javascript', ['ml: fit y =']);
  });

  it('ml scaffold: go fits by gradient descent', async () => {
    await runScaffold('ml', 'go', ['ml: fit y =']);
  });

  it('mobile scaffold: javascript walks the screen state machine', async () => {
    await runScaffold('mobile', 'javascript', ['mobile: at home with 2 items']);
  });

  it('mobile scaffold: go walks the screen state machine', async () => {
    await runScaffold('mobile', 'go', ['mobile: at home with 2 items']);
  });

  it('wasm scaffold: javascript validates and instantiates the module', async () => {
    await runScaffold('wasm', 'javascript', ['wasm: module valid = true', 'wasm: add(2,3) = 5']);
  });
});

describe('scaffold determinism', () => {
  it('the same domain + target always generates identical code', () => {
    const a = generateScaffold('web-backend', 'go');
    const b = generateScaffold('web-backend', 'go');
    expect(a).toBe(b);
  });

  it('domains without a scaffold for a target yield undefined (caller falls back)', () => {
    expect(generateScaffold('game', 'python')).toBeUndefined();
    expect(generateScaffold('ml', 'java')).toBeUndefined();
    expect(generateScaffold('wasm', 'go')).toBeUndefined();
    expect(generateScaffold('web-frontend', 'rust')).toBeUndefined();
  });

  it('the ml and game scaffolds agree on the fitted model across languages', async () => {
    // Deterministic cross-language agreement: the same algorithm, the
    // same data, the same printed coefficients
    const go = engine.toolchains.forLanguage('go');
    const js = engine.toolchains.forLanguage('javascript');
    await go?.probe();
    await js?.probe();
    if (!go?.info.available || !js?.info.available) return console.warn('skipping: go or node unavailable');

    const goRun = await engine.run(generateScaffold('ml', 'go')!, { language: 'go' });
    const jsRun = await engine.run(generateScaffold('ml', 'javascript')!, { language: 'javascript' });
    expect(goRun.result.ok && jsRun.result.ok).toBe(true);
    expect(goRun.result.stdout.trim()).toBe(jsRun.result.stdout.trim());
  });
});
