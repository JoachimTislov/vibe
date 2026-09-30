/**
 * Universal Transpiler - TypeScript/JavaScript -> Python Structural
 * Transpiler Tests
 *
 * The strongest proof of correctness: the same JS/TS program runs
 * natively (node) AND as transpiled Python (python3), and the outputs
 * must be identical.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { jsToPython } from '../src/engine/structural-transpilers';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-tspy-state-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const PROGRAM = `function compute(limit) {
  let total = 0;
  for (let i = 0; i < limit; i++) {
    if (i % 3 === 0) {
      total += i;
    } else if (i % 3 === 1) {
      total += 1;
    } else {
      total -= 1;
    }
  }
  return total;
}

function main() {
  const result = compute(20);
  console.log("computed:", result);
  const values = [1, 2, 3];
  let count = 0;
  for (const v of values) {
    count += v;
  }
  console.log("sum:", count);
  const flag = true;
  if (flag && count > 5) {
    console.log("flag ok");
  }
}

main();
`;

const TS_PROGRAM = `function fib(n: number): number {
  if (n <= 1) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

const GREETING: string = "ts";

function main(limit: number): void {
  const result: number = fib(limit);
  console.log(\`fib: \${result}\`);
  console.log(GREETING);
}

main(10);
`;

describe('javascript/typescript -> python structural transpiler', () => {
  it('converts the practical subset and flags nothing unsupported', () => {
    const result = jsToPython(PROGRAM);
    expect(result.converted).toEqual(
      expect.arrayContaining([
        'function', 'for-range', 'for-of', 'if', 'elif', 'else',
        'console.log', 'return', 'declaration', 'assignment', 'boolean-literals',
      ])
    );
    expect(result.unsupported).toEqual([]);
  });

  it('produces identical output to native node (equivalence proof)', async () => {
    const jsts = engine.toolchains.get('jsts')!;
    const python = engine.toolchains.get('python')!;
    await jsts.probe();
    await python.probe();
    if (!jsts.info.available || !python.info.available) {
      return console.warn('skipping: node or python3 unavailable');
    }

    // Native run
    const native = await engine.run(PROGRAM, { language: 'javascript' });
    expect(native.result.ok).toBe(true);
    expect(native.route).toBe('native-run');

    // Transpiled run
    const transpiled = await engine.transpile(PROGRAM, 'javascript', 'python');
    expect(transpiled.strategy).toBe('structural');
    expect(transpiled.via).toBe('javascript->python');
    expect(transpiled.structuralReport?.unsupported).toEqual([]);

    const pyRun = await engine.run(transpiled.code, { language: 'python' });
    expect(pyRun.result.ok).toBe(true);

    // THE assertion: identical program output across runtimes
    expect(pyRun.result.stdout).toBe(native.result.stdout);
  }, 120_000);

  it('transpiles typescript through the native TS->JS pre-step with identical output', async () => {
    const jsts = engine.toolchains.get('jsts')!;
    const python = engine.toolchains.get('python')!;
    await jsts.probe();
    await python.probe();
    if (!jsts.info.available || !python.info.available) {
      return console.warn('skipping: node or python3 unavailable');
    }

    // Native run (the jsts toolchain lowers TS via the typescript API)
    const native = await engine.run(TS_PROGRAM, { language: 'typescript' });
    expect(native.result.ok).toBe(true);

    // Transpiled run: typescript -> python = native TS->JS + jsToPython
    const transpiled = await engine.transpile(TS_PROGRAM, 'typescript', 'python');
    expect(transpiled.strategy).toBe('structural');
    expect(transpiled.via).toBe('typescript->python');
    expect(transpiled.structuralReport?.converted).toEqual(
      expect.arrayContaining(['typescript-types-stripped', 'function', 'if', 'return', 'console.log'])
    );
    expect(transpiled.structuralReport?.unsupported).toEqual([]);
    // Type annotations must not survive into the Python
    expect(transpiled.code).not.toMatch(/: number|: string|: void/);

    const pyRun = await engine.run(transpiled.code, { language: 'python' });
    expect(pyRun.result.ok).toBe(true);
    expect(pyRun.result.stdout).toBe(native.result.stdout);
  }, 120_000);

  it('handles while, template literals, not/or, decreasing loops and object literals', async () => {
    const program = `function main() {
  let n = 5;
  while (n > 0) {
    console.log("countdown:", n);
    n -= 1;
  }
  const name = "world";
  console.log(\`hello \${name}\`);
  const ready = true;
  if (!ready || n === 0) {
    console.log("done");
  }
  for (let i = 5; i > 0; i--) {
    console.log("i:", i);
  }
  const item = { id: 7, label: "x" };
  console.log("id:", item.id);
}

main();
`;
    const result = jsToPython(program);
    expect(result.unsupported).toEqual([]);
    expect(result.converted).toEqual(
      expect.arrayContaining([
        'while', 'template-literal', 'not-operator', 'for-range',
        'object-literal', 'member-access', 'console.log',
      ])
    );
    // f-string for the template literal, dict + subscript for the object
    expect(result.code).toContain('print(f"hello {name}")');
    expect(result.code).toContain('item = {"id": 7, "label": "x"}');
    expect(result.code).toContain('print("id:", item["id"])');
    expect(result.code).toContain('for i in range(5, 0, -1):');

    const jsts = engine.toolchains.get('jsts')!;
    const python = engine.toolchains.get('python')!;
    await jsts.probe();
    await python.probe();
    if (!jsts.info.available || !python.info.available) {
      return console.warn('skipping: node or python3 unavailable');
    }

    const native = await engine.run(program, { language: 'javascript' });
    expect(native.result.ok).toBe(true);

    const transpiled = await engine.transpile(program, 'javascript', 'python');
    const pyRun = await engine.run(transpiled.code, { language: 'python' });
    expect(pyRun.result.ok).toBe(true);
    expect(pyRun.result.stdout).toBe(native.result.stdout);
  }, 120_000);

  it('flags unsupported constructs instead of leaking them', () => {
    const result = jsToPython(
      `import fs from "fs";

class Greeter {
  greet() {
    return "hi";
  }
}

async function load() {
  await Promise.resolve(1);
}

function risky(x) {
  try {
    return x;
  } catch (e) {
    return 0;
  }
}

const [a, b] = [1, 2];
const { p } = { p: 1 };
const merged = { ...{ p: 1 } };
const grade = a ? 1 : b ? 2 : 3;
const trimmed = "  x  ".trim();
`
    );
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        expect.stringContaining('module-system: import fs'),
        expect.stringContaining('class: class Greeter'),
        expect.stringContaining('async-function'),
        expect.stringContaining('try-catch: try'),
        expect.stringContaining('destructuring: const [a, b]'),
        expect.stringContaining('destructuring: const { p }'),
        expect.stringContaining('chained-ternary'),
        expect.stringContaining('js-method-call'),
      ])
    );
    // The constructs must not survive as LIVE code (comments are fine)
    expect(result.code).not.toMatch(/^import fs/m);
    expect(result.code).not.toMatch(/^\s*class Greeter/m);
    expect(result.code).not.toMatch(/^\s*async function load/m);
    expect(result.code).not.toMatch(/^\s*try\s*\{/m);
    expect(result.code).not.toMatch(/^\s*const \[a, b\]/m);
    expect(result.code).toMatch(/# \[unsupported: class\] class Greeter/);
    expect(result.code).toMatch(/# \[unsupported: try-catch\] try \{/);
    expect(result.code).toMatch(/# \[unsupported\] const \[a, b\] = \[1, 2\]/);
  });

  it('flags closures capturing mutation instead of leaking them', () => {
    const result = jsToPython(`let counter = 0;

function inc() {
  counter += 1;
}

inc();
console.log(counter);
`);
    expect(result.unsupported).toEqual(
      expect.arrayContaining([expect.stringContaining('closure-mutation: counter')])
    );
    expect(result.code).not.toMatch(/^\s*counter \+= 1/m);
    expect(result.code).toMatch(/# \[unsupported\] counter \+= 1/);
  });

  it('is deterministic', async () => {
    const a = jsToPython(PROGRAM);
    const b = jsToPython(PROGRAM);
    expect(a.code).toBe(b.code);
    expect(a.converted).toEqual(b.converted);
    expect(a.unsupported).toEqual(b.unsupported);

    // The matrix path (native TS->JS pre-step included) is deterministic too
    const t1 = await engine.transpile(TS_PROGRAM, 'typescript', 'python');
    const t2 = await engine.transpile(TS_PROGRAM, 'typescript', 'python');
    expect(t1.code).toBe(t2.code);
  });

  it('declares the pairs in the matrix (including aliases)', async () => {
    expect(engine.matrix.structuralPairs()).toEqual(
      expect.arrayContaining([
        'typescript->python', 'ts->python', 'typescript->py', 'ts->py',
        'javascript->python', 'js->python', 'javascript->py', 'js->py',
      ])
    );
    expect(engine.matrix.supports('typescript', 'python')).toBe(true);
    expect(engine.matrix.supports('javascript', 'python')).toBe(true);

    const alias = await engine.transpile('console.log("alias");\n', 'js', 'py');
    expect(alias.strategy).toBe('structural');
    expect(alias.via).toBe('js->py');
    expect(alias.code).toContain('print("alias")');

    const tsAlias = await engine.transpile(
      'const x: number = 1;\nconsole.log(x);\n',
      'ts',
      'py'
    );
    expect(tsAlias.strategy).toBe('structural');
    expect(tsAlias.via).toBe('ts->py');
    expect(tsAlias.code).toContain('print(x)');
  });
});
