/**
 * Universal Transpiler - Go -> Java Structural Transpiler Tests
 *
 * The strongest proof of correctness: the same Go program runs natively
 * (go run) AND as transpiled Java (javac/java), and the outputs must be
 * identical.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { goToJava } from '../src/engine/structural-transpilers';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-gojava-state-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const PROGRAM = `package main

import "fmt"

func compute(limit int) int {
	total := 0
	for i := 0; i < limit; i++ {
		if i%3 == 0 {
			total += i
		} else if i%3 == 1 {
			total += 1
		} else {
			total -= 1
		}
	}
	return total
}

func sum(values []int) int {
	total := 0
	for _, v := range values {
		total += v
	}
	return total
}

func firstIndex(values []int, target int) int {
	for i, v := range values {
		if v == target {
			return i
		}
	}
	return -1
}

func area(w float64, h float64) float64 {
	return w * h
}

func greet(name string) string {
	return "hello " + name
}

func main() {
	fmt.Println("computed:", compute(20))
	values := [3]int{1, 2, 3}
	fmt.Println("sum:", sum(values[:]))
	fmt.Println("index:", firstIndex(values[:], 2))
	fmt.Println("area:", area(2.5, 4.5))
	fmt.Println("greet:", greet("world"))
	count := 0
	for count < 3 {
		count++
	}
	fmt.Println("count:", count)
	flag := count == 3 && count > 2
	if flag {
		fmt.Println("flag ok")
	} else {
		fmt.Println("flag bad")
	}
	r := 'a'
	fmt.Println("rune:", r)
	fmt.Println("join", 1, 2, 3)
}
`;

const JOIN_PROGRAM = `package main

import "fmt"

func main() {
	fmt.Println("a", 1, "b", 2.5)
	fmt.Println("only")
	fmt.Println()
}
`;

const UNSUPPORTED_PROGRAM = `package main

import "fmt"

type Point struct {
	X int
	Y int
}

func (p Point) String() string {
	return "point"
}

func worker(done chan bool) {
	defer close(done)
	go func() {
		done <- true
	}()
}

func pair() (int, string) {
	return 1, "one"
}

func main() {
	p := Point{1, 2}
	nums := []int{1, 2, 3}
	ages := map[string]int{"a": 1}
	ch := make(chan int)
	x, y := pair()
	double := func(n int) int { return n * 2 }
	items := append(nums, 4)
	fmt.Println(p, nums, ages, x, y, double(2), items)
	_ = ch
	_ = worker
}
`;

describe('go -> java structural transpiler', () => {
  it('converts the practical subset and flags nothing unsupported', () => {
    const result = goToJava(PROGRAM);
    expect(result.converted).toEqual(
      expect.arrayContaining([
        'package-main',
        'import-dropped',
        'func-main',
        'func',
        'short-decl',
        'array-literal',
        'println',
        'if',
        'else-if',
        'else',
        'for-c-style',
        'for-range',
        'for-range-indexed',
        'for-cond',
        'increment',
        'assignment',
        'return',
      ])
    );
    expect(result.unsupported).toEqual([]);
  });

  it('produces identical output to native go run (equivalence proof)', async () => {
    const go = engine.toolchains.get('go')!;
    const java = engine.toolchains.get('java')!;
    await go.probe();
    await java.probe();
    if (!go.info.available || !java.info.available) {
      return console.warn('skipping: go or javac/java unavailable');
    }

    // Native run (go run)
    const native = await go.run(PROGRAM);
    expect(native.ok).toBe(true);

    // Transpiled run (engine.run with language java)
    const transpiled = await engine.transpile(PROGRAM, 'go', 'java');
    expect(transpiled.strategy).toBe('structural');
    expect(transpiled.via).toBe('go->java');

    const javaRun = await engine.run(transpiled.code, { language: 'java' });
    expect(javaRun.result.ok).toBe(true);

    // THE assertion: identical program output across runtimes
    expect(javaRun.result.stdout).toBe(native.stdout);
    expect(native.stdout).toBe(
      [
        'computed: 64',
        'sum: 6',
        'index: 1',
        'area: 11.25',
        'greet: hello world',
        'count: 3',
        'flag ok',
        'rune: 97',
        'join 1 2 3',
        '',
      ].join('\n')
    );
  }, 120_000);

  it('joins multi-argument Println with spaces (Go semantics)', () => {
    const result = goToJava(JOIN_PROGRAM);
    expect(result.unsupported).toEqual([]);
    expect(result.code).toMatch(/System\.out\.println\("a" \+ " " \+ 1 \+ " " \+ "b" \+ " " \+ 2\.5\);/);
    expect(result.code).toMatch(/System\.out\.println\("only"\);/);
    expect(result.code).toMatch(/System\.out\.println\(\);/);
  });

  it('multi-arg println join semantics match native go run', async () => {
    const go = engine.toolchains.get('go')!;
    const java = engine.toolchains.get('java')!;
    if (!go.info.available || !java.info.available) {
      return console.warn('skipping: go or javac/java unavailable');
    }

    const native = await go.run(JOIN_PROGRAM);
    expect(native.ok).toBe(true);

    const transpiled = await engine.transpile(JOIN_PROGRAM, 'go', 'java');
    const javaRun = await engine.run(transpiled.code, { language: 'java' });
    expect(javaRun.result.ok).toBe(true);
    expect(javaRun.result.stdout).toBe(native.stdout);
    expect(native.stdout).toBe('a 1 b 2.5\nonly\n\n');
  }, 120_000);

  it('flags unsupported constructs instead of leaking them', () => {
    const result = goToJava(UNSUPPORTED_PROGRAM);
    expect(result.unsupported).toEqual(
      expect.arrayContaining([
        'struct',
        'method-receiver',
        expect.stringContaining('unsupported-type: chan bool'),
        'defer',
        'goroutine',
        'multiple-return-values',
        'slice-literal',
        'map-literal',
        'struct-literal',
        'closure',
        'make',
        'append',
      ])
    );

    // The constructs must not survive as LIVE code (comments are fine)
    for (const line of result.code.split('\n')) {
      if (line.trim().startsWith('//')) continue;
      expect(line).not.toMatch(/:=|\bchan\b|<-|\bdefer\b|\bgo\s+\w|\bstruct\b|\bfunc\b/);
    }
    expect(result.code).toMatch(/\/\/ \[unsupported\] type Point struct \{/);
    expect(result.code).toMatch(/\/\/ \[unsupported\] defer close\(done\)/);
    expect(result.code).toMatch(/\/\/ \[unsupported\] nums := \[\]int\{1, 2, 3\}/);
    // the main class and entry point still exist
    expect(result.code).toMatch(/public class Main \{/);
    expect(result.code).toMatch(/public static void main\(String\[\] args\) \{/);
  });

  it('is deterministic', () => {
    const a = goToJava(PROGRAM);
    const b = goToJava(PROGRAM);
    expect(a.code).toBe(b.code);
    expect(a.converted).toEqual(b.converted);
    expect(a.unsupported).toEqual(b.unsupported);
  });

  it('declares the pair in the matrix', () => {
    expect(engine.matrix.structuralPairs()).toEqual(
      expect.arrayContaining(['go->java', 'go->jvm', 'golang->java'])
    );
    expect(engine.matrix.supports('go', 'java')).toBe(true);
    expect(engine.matrix.supports('go', 'jvm')).toBe(true);
  });

  it('routes go->jvm through the structural transpiler too', async () => {
    const result = await engine.transpile(PROGRAM, 'go', 'jvm');
    expect(result.strategy).toBe('structural');
    expect(result.via).toBe('go->jvm');
    expect(result.code).toMatch(/public class Main \{/);
  });
});
