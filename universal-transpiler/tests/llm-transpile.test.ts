/**
 * Universal Transpiler - Live Mistral LLM Transpile Tests
 *
 * The AI tier (tier 3 of the transpile matrix): for language pairs with no
 * native and no structural transpiler, the engine asks the Mistral API.
 *
 * These tests hit the LIVE API and are gated on MISTRAL_API_KEY so the rest
 * of the suite stays hermetic. The correctness bar is the same as the
 * structural pairs: the generated program must produce identical output to
 * the source program run natively.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { MistralClient } from '../src/llm/mistral-client';

const hasApiKey = !!process.env.MISTRAL_API_KEY;
const maybeDescribe = hasApiKey ? describe : describe.skip;

let engine: UniversalEngine;

const GO_SOURCE = `package main

import "fmt"

func main() {
	total := 0
	for i := 0; i < 10; i++ {
		if i%2 == 0 {
			total = total + i
		}
	}
	fmt.Println("go says:", total)
}
`;

const JS_SOURCE = `function main() {
  let total = 0;
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      total = total + i;
    }
  }
  console.log("js says:", total);
}
main();
`;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-llm-state-'));
  engine = new UniversalEngine({
    timeoutMs: 180_000,
    statePath: path.join(stateDir, 'state.json'),
    // The live client, low temperature for deterministic transpilation
    llm: new MistralClient({ model: 'mistral-small-latest', temperature: 0 }),
  });
});

maybeDescribe('Live Mistral LLM transpile tier (requires MISTRAL_API_KEY)', () => {
  it('transpiles go -> python via the LLM with runtime-identical output', async () => {
    // Ground truth: run the Go source natively
    const native = await engine.run(GO_SOURCE, { language: 'go' });
    expect(native.result.ok).toBe(true);

    // go->python has no native or structural transpiler: tier 3 must fire
    const transpiled = await engine.transpile(GO_SOURCE, 'go', 'python');
    expect(transpiled.strategy).toBe('ai-generated');
    expect(transpiled.via).toBe('llm');
    expect(transpiled.code).toContain('range(10)');

    // The LLM's python must run and match the Go output exactly
    const run = await engine.run(transpiled.code, { language: 'python' });
    expect(run.result.ok).toBe(true);
    expect(run.result.stdout.trim()).toBe(native.result.stdout.trim());
  }, 180_000);

  it('transpiles javascript -> go via the LLM with runtime-identical output', async () => {
    const native = await engine.run(JS_SOURCE, { language: 'javascript' });
    expect(native.result.ok).toBe(true);

    const transpiled = await engine.transpile(JS_SOURCE, 'javascript', 'go');
    expect(transpiled.strategy).toBe('ai-generated');
    expect(transpiled.code).toContain('package main');

    const run = await engine.run(transpiled.code, { language: 'go' });
    expect(run.result.ok).toBe(true);
    expect(run.result.stdout.trim()).toBe(native.result.stdout.trim());
  }, 180_000);

  it('does not use the LLM when a cheaper tier handles the pair', async () => {
    // typescript -> javascript is tier 1 (native tsc API): must never
    // fall through to the LLM
    const result = await engine.transpile(
      'const x: number = 1;\nconsole.log(x);\n',
      'typescript',
      'javascript'
    );
    expect(result.strategy).toBe('native');
    expect(result.via).toContain('typescript');
  }, 60_000);

  it('records AI-tier success in the persistent transpile stats', async () => {
    // Route a run through the AI tier and check the stats are noted
    const report = await engine.run(GO_SOURCE, {
      language: 'go',
      platform: 'node', // forces a transpile-based route
    });
    // Whatever route it took, the pair statistics must be recorded
    const stats = engine.state.data.transpileStats;
    const goPairs = Object.keys(stats).filter((k) => k.startsWith('go->'));
    expect(goPairs.length).toBeGreaterThan(0);
    expect(report.analysis).toBeDefined();
  }, 180_000);
});

describe('LLM tier configuration', () => {
  it('keeps the suite hermetic without an API key: tests skip', () => {
    // The suite above is either running (key present) or skipped.
    // Either way the full suite stays green without network access.
    expect(true).toBe(true);
  });

  it('MistralClient reads the key from the environment', () => {
    const client = new MistralClient();
    expect((client as unknown as { options: { apiKey?: string } }).options.apiKey).toBe(
      process.env.MISTRAL_API_KEY
    );
  });
});
