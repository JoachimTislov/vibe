/**
 * Universal Transpiler - Rust -> Python Structural Transpiler Tests
 *
 * The strongest proof of correctness: the same Rust program runs natively
 * (docker-backed rustc) AND as transpiled Python (python3), and the
 * outputs must be identical.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { rustToPython } from '../src/engine/structural-transpilers';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-rustpy-state-'));
  engine = new UniversalEngine({
    timeoutMs: 180_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const PROGRAM = `// covered subset check
fn add(a: i32, b: i32) -> i32 {
    return a + b;
}

fn fib(n: i32) -> i32 {
    if n < 2 {
        return n;
    }
    let mut a = 0;
    let mut b = 1;
    let mut i = 0;
    while i < n {
        let next = a + b;
        a = b;
        b = next;
        i += 1;
    }
    return a;
}

fn classify(n: i32) -> i32 {
    if n % 15 == 0 {
        return 1;
    } else if n % 3 == 0 {
        return 2;
    } else if n % 5 == 0 {
        return 3;
    } else {
        return 4;
    }
}

fn half_of(total: i32) -> i32 {
    return total / 2;
}

fn area(w: f64, h: f64) -> f64 {
    return w * h;
}

fn main() {
    println!("add: {}", add(2, 3));
    let greeting = "hello from rust";
    let mut count = 2;
    count = count + 1;
    println!("{} count={}", greeting, count);
    println!("fib: {}", fib(10));
    for i in 0..5 {
        println!("i={}", i);
    }
    let mut total = 0;
    for i in 1..=10 {
        total += i;
    }
    println!("total: {}", total);
    let mut n = 0;
    loop {
        n += 1;
        if n >= 3 {
            break;
        }
    }
    println!("loop n: {}", n);
    let flags = true && !false || false;
    if flags {
        println!("flags ok");
    } else {
        println!("flags bad");
    }
    println!("classify: {} {} {} {}", classify(15), classify(9), classify(10), classify(7));
    println!("half: {}", half_of(21));
    println!("area: {}", area(2.5, 4.5));
    let raw = r#"raw with \\n and "quotes""#;
    println!("{}", raw);
    println!("done");
    println!();
}
`;

const UNSUPPORTED_PROGRAM = `use std::collections::HashMap;

#[derive(Debug)]
struct Point {
    x: i32,
    y: i32,
}

enum Color {
    Red,
    Green,
}

trait Shape {
    fn area(&self) -> f64;
}

impl Point {
    fn new(x: i32, y: i32) -> Self {
        Point { x, y }
    }
}

fn describe(p: &Point) -> String {
    format!("point")
}

fn main() {
    let m = match 1 {
        1 => "one",
        _ => "many",
    };
    let p = Point { x: 1, y: 2 };
    let r = &p;
    let d = *&5;
    let v = vec![1, 2, 3];
    let c = |x: i32| x + 1;
    let s = "a".to_string();
    let f: i32 = "5".parse::<i32>().unwrap();
    let answer = get()?;
    println!("{}", m);
}
`;

describe('rust -> python structural transpiler', () => {
  it('converts the practical subset and flags nothing unsupported', () => {
    const result = rustToPython(PROGRAM);
    expect(result.converted).toEqual(
      expect.arrayContaining([
        'comment',
        'fn',
        'fn-main',
        'fn-return-type-stripped',
        'let',
        'let-mut',
        'assignment',
        'compound-assignment',
        'boolean-literals',
        'logical-operators',
        'not-operator',
        'if',
        'elif',
        'else',
        'for-range',
        'for-range-inclusive',
        'while',
        'loop',
        'break-continue',
        'return',
        'integer-division',
        'println',
        'f-string',
        'raw-string',
        'main-guard',
      ])
    );
    expect(result.unsupported).toEqual([]);
    // structural conversion checks
    expect(result.code).toMatch(/def main\(\):/);
    expect(result.code).toMatch(/return total \/\/ 2/);
    expect(result.code).toMatch(/print\(f"add: \{add\(2, 3\)\}"\)/);
    expect(result.code).toMatch(/for i in range\(1, 11\):/);
    expect(result.code).toMatch(/while True:/);
    expect(result.code).toMatch(/if __name__ == "__main__":/);
  });

  it('produces identical output to docker-backed rustc (equivalence proof)', async () => {
    const rust = engine.toolchains.get('rust')!;
    const python = engine.toolchains.get('python')!;
    await rust.probe();
    await python.probe();
    if (!rust.info.available || !python.info.available) {
      return console.warn('skipping: rust (docker) or python3 unavailable');
    }

    // Native run (docker-backed rustc)
    const native = await rust.run(PROGRAM);
    expect(native.ok).toBe(true);

    // Transpiled run (structural rust->python, then python3)
    const transpiled = await engine.transpile(PROGRAM, 'rust', 'python');
    expect(transpiled.strategy).toBe('structural');
    expect(transpiled.via).toBe('rust->python');
    expect(transpiled.structuralReport?.unsupported).toEqual([]);

    const pyRun = await engine.run(transpiled.code, { language: 'python' });
    expect(pyRun.result.ok).toBe(true);

    // THE assertion: identical program output across runtimes
    expect(pyRun.result.stdout).toBe(native.stdout);
    expect(native.stdout).toBe(
      [
        'add: 5',
        'hello from rust count=3',
        'fib: 55',
        'i=0',
        'i=1',
        'i=2',
        'i=3',
        'i=4',
        'total: 55',
        'loop n: 3',
        'flags ok',
        'classify: 1 2 3 4',
        'half: 10',
        'area: 11.25',
        'raw with \\n and "quotes"',
        'done',
        '',
        '',
      ].join('\n')
    );
  }, 180_000);

  it('flags unsupported constructs instead of leaking them', () => {
    const result = rustToPython(UNSUPPORTED_PROGRAM);
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        'use-statement: use std::collections::HashMap;',
        'attribute: #[derive(Debug)]',
        'struct-definition: struct Point {',
        'enum-definition: enum Color {',
        'trait-definition: trait Shape {',
        'impl-block: impl Point {',
        'match-expression: let m = match 1 {',
        expect.stringContaining('struct-or-block-literal'),
        expect.stringContaining('reference-parameter'),
        expect.stringContaining('reference-operator'),
        expect.stringContaining('dereference'),
        expect.stringContaining('closure'),
        expect.stringContaining('method-call'),
        expect.stringContaining('macro-call'),
        expect.stringContaining('path-or-turbofish'),
        expect.stringContaining('try-operator'),
        expect.stringContaining('undeclared-identifier: m'),
        'println-argument: println!("{}", m)',
      ])
    );

    // The constructs must not survive as LIVE code (comments are fine)
    for (const line of result.code.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      expect(line).not.toMatch(
        /\blet\b|\bfn\b|\bmut\b|\bmatch\b|\bimpl\b|\bstruct\b|&|::|->|<|\||\?|!|;/
      );
    }
    // flagged constructs are preserved as comments
    expect(result.code).toMatch(/# \[unsupported: match-expression\]/);
    expect(result.code).toMatch(/# \[unsupported: impl-block\]/);
    expect(result.code).toMatch(/# \[unsupported\] let r = &p/);
    expect(result.code).toMatch(/# \[unsupported\] let c = \|x: i32\| x \+ 1/);
    // vec! is inside the supported subset and becomes a live list literal
    expect(result.code).toContain('v = [1, 2, 3]');
    // the entry point still exists
    expect(result.code).toMatch(/def main\(\):/);
    expect(result.code).toMatch(/if __name__ == "__main__":/);
  });

  it('the flagged program still transpiles to runnable Python (no live leaks)', async () => {
    const python = engine.toolchains.get('python')!;
    await python.probe();
    if (!python.info.available) {
      return console.warn('skipping: python3 unavailable');
    }
    const result = rustToPython(UNSUPPORTED_PROGRAM);
    const pyRun = await engine.run(result.code, { language: 'python' });
    expect(pyRun.result.ok).toBe(true);
    expect(pyRun.result.stdout).toBe('');
  }, 60_000);

  it('is deterministic', () => {
    const a = rustToPython(PROGRAM);
    const b = rustToPython(PROGRAM);
    expect(a.code).toBe(b.code);
    expect(a.converted).toEqual(b.converted);
    expect(a.unsupported).toEqual(b.unsupported);

    const c = rustToPython(UNSUPPORTED_PROGRAM);
    const d = rustToPython(UNSUPPORTED_PROGRAM);
    expect(c.code).toBe(d.code);
    expect(c.converted).toEqual(d.converted);
    expect(c.unsupported).toEqual(d.unsupported);
  });

  it('declares the pair in the matrix', () => {
    expect(engine.matrix.structuralPairs()).toEqual(
      expect.arrayContaining(['rust->python', 'rust->py', 'rs->python', 'rs->py'])
    );
    expect(engine.matrix.supports('rust', 'python')).toBe(true);
    expect(engine.matrix.supports('rust', 'py')).toBe(true);
    expect(engine.matrix.supports('rs', 'python')).toBe(true);
    expect(engine.matrix.supports('rs', 'py')).toBe(true);
  });

  it('routes the rs->py alias through the structural transpiler too', async () => {
    const result = await engine.transpile(PROGRAM, 'rs', 'py');
    expect(result.strategy).toBe('structural');
    expect(result.via).toBe('rs->py');
    expect(result.code).toMatch(/def main\(\):/);
    expect(result.code).toMatch(/if __name__ == "__main__":/);
    expect(result.code).toMatch(/return total \/\/ 2/);
  });
});
