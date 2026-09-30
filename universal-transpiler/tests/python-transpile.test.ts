/**
 * Universal Transpiler - Python -> JavaScript Structural Transpiler Tests
 *
 * The strongest proof of correctness: the same Python program runs
 * natively (python3) AND as transpiled JavaScript (node), and the outputs
 * must be identical.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { pythonToJavaScript } from '../src/engine/structural-transpilers';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-py-state-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const PROGRAM = `def compute(limit):
    total = 0
    for i in range(limit):
        if i % 3 == 0:
            total = total + i
        elif i % 3 == 1:
            total = total + 1
        else:
            total = total - 1
    return total

def main():
    result = compute(20)
    print("computed:", result)
    values = [1, 2, 3]
    count = 0
    for v in values:
        count = count + v
    print("sum:", count)
    flag = True
    if flag and count > 5:
        print("flag ok")

if __name__ == "__main__":
    main()
`;

describe('python -> javascript structural transpiler', () => {
  it('converts the practical subset and flags nothing unsupported', () => {
    const result = pythonToJavaScript(PROGRAM);
    expect(result.converted).toEqual(
      expect.arrayContaining(['def', 'if', 'elif', 'else', 'for-range', 'for-in', 'print', 'main-guard'])
    );
    expect(result.unsupported).toEqual([]);
  });

  it('produces identical output to native python3 (equivalence proof)', async () => {
    const python = engine.toolchains.get('python')!;
    const jsts = engine.toolchains.get('jsts')!;
    if (!python.info.available || !jsts.info.available) {
      return console.warn('skipping: python3 or node unavailable');
    }

    // Native run
    const native = await python.run(PROGRAM);
    expect(native.ok).toBe(true);

    // Transpiled run
    const transpiled = await engine.transpile(PROGRAM, 'python', 'javascript');
    expect(transpiled.strategy).toBe('structural');
    expect(transpiled.via).toBe('python->javascript');

    const jsRun = await engine.run(transpiled.code, { language: 'javascript' });
    expect(jsRun.result.ok).toBe(true);

    // THE assertion: identical program output across runtimes
    expect(jsRun.result.stdout).toBe(native.stdout);
  }, 120_000);

  it('handles while loops, f-strings, and not/and/or', async () => {
    const program = `def main():
    n = 5
    while n > 0:
        print("countdown:", n)
        n = n - 1
    name = "world"
    print(f"hello {name}")
    ready = True
    if not ready or n == 0:
        print("done")

if __name__ == "__main__":
    main()
`;
    const python = engine.toolchains.get('python')!;
    const jsts = engine.toolchains.get('jsts')!;
    if (!python.info.available || !jsts.info.available) {
      return console.warn('skipping: python3 or node unavailable');
    }

    const native = await python.run(program);
    expect(native.ok).toBe(true);

    const transpiled = await engine.transpile(program, 'python', 'javascript');
    const jsRun = await engine.run(transpiled.code, { language: 'javascript' });
    expect(jsRun.result.ok).toBe(true);
    expect(jsRun.result.stdout).toBe(native.stdout);
  }, 120_000);

  it('flags unsupported python constructs instead of leaking them', () => {
    const result = pythonToJavaScript('import os\n\nclass Foo:\n    pass\n');
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        expect.stringContaining('python-construct: import os'),
        expect.stringContaining('python-construct: class Foo:'),
      ])
    );
    // The constructs must not survive as LIVE code (comments are fine)
    expect(result.code).not.toMatch(/^\s*import os/m);
    expect(result.code).not.toMatch(/^\s*class Foo/m);
    expect(result.code).toMatch(/\/\/ \[unsupported\] import os/);
  });

  it('is deterministic', () => {
    const a = pythonToJavaScript(PROGRAM);
    const b = pythonToJavaScript(PROGRAM);
    expect(a.code).toBe(b.code);
  });

  it('declares the pair in the matrix', () => {
    expect(engine.matrix.structuralPairs()).toEqual(
      expect.arrayContaining(['python->javascript', 'python->js'])
    );
    expect(engine.matrix.supports('python', 'javascript')).toBe(true);
  });
});
