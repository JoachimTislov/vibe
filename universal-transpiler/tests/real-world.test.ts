/**
 * Universal Transpiler - Real-World Proof Tests
 *
 * Runs the engine against REAL source files fetched from well-known
 * open-source projects (see tests/fixtures/real-world/manifest.json for
 * exact URLs and licenses). The fixtures are committed, so these tests
 * are hermetic — no network access needed.
 *
 * Every assertion below was verified against actual engine output:
 * - golang/example hello (self-contained variant) runs natively
 * - TheAlgorithms/Java Luhn (packaged class) runs on the JVM — proves
 *   package-aware source placement
 * - TheAlgorithms/Java radix sort runs and sorts correctly
 * - TheAlgorithms/JavaScript linear search loads cleanly under node
 * - rust-lang/rustlings intro1.rs (raw strings + banner) executes via
 *   structural rust->go transpilation on a machine with no rustc
 * - TheAlgorithms/Haskell bubble sort converts honestly: unsupported
 *   constructs (guards, pattern matching) are flagged, never leaked
 * - golang/example hello/hello.go fails honestly on its real external
 *   module import (missing dependency, not an engine bug)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { UniversalEngine } from '../src/engine/universal-engine';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'real-world');

function fixture(name: string): string {
  const content = fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
  return content;
}

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-realworld-state-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

describe('Real-world proof: golang/example', () => {
  it('runs the self-contained hello.go natively and prints the greeting', async () => {
    const report = await engine.run(fixture('go-hello-gotypes.go'), { language: 'go' });
    expect(report.route).toBe('native-run');
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('Hello,');
  }, 120_000);

  it('fails honestly on the real file with an external module import', async () => {
    // hello/hello.go imports golang.org/x/example/hello/reverse — a real
    // dependency not vendored in the fixture. The engine must surface the
    // missing-module error, not hide it.
    const report = await engine.run(fixture('go-hello.go'), { language: 'go' });
    expect(report.result.ok).toBe(false);
    expect(report.result.stderr).toContain('no required module provides package');
  }, 120_000);
});

describe('Real-world proof: TheAlgorithms/Java', () => {
  it('runs the PACKAGED Luhn class on the JVM (package-aware placement)', async () => {
    // Luhn.java declares `package com.thealgorithms.others;` — javac requires
    // the source at <dir>/com/thealgorithms/others/Luhn.java. The engine
    // must place it correctly and run the fully-qualified class.
    const report = await engine.run(fixture('java-luhn.java'), { language: 'java' });
    expect(report.route).toBe('native-run');
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('Luhn algorithm usage examples');
    expect(report.result.stdout).toContain('is valid');
    expect(report.result.stdout).toContain('is not valid');
  }, 120_000);

  it('runs the radix sort and prints the sorted sequence', async () => {
    const report = await engine.run(fixture('java-radix-sort.java'), { language: 'java' });
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout.trim()).toContain('2 24 45 66 75 90 170 802');
  }, 120_000);
});

describe('Real-world proof: TheAlgorithms/JavaScript', () => {
  it('loads the linear-search module cleanly under node', async () => {
    const report = await engine.run(fixture('js-linear-search.js'), { language: 'javascript' });
    expect(report.route).toBe('native-run');
    expect(report.result.ok).toBe(true);
    expect(report.result.exitCode).toBe(0);
  }, 120_000);
});

describe('Real-world proof: rust-lang/rustlings (no rustc on this machine)', () => {
  it('transpiles the real intro exercise rust->go and executes the banner', async () => {
    const report = await engine.run(fixture('rust-hello.rs'), { language: 'rust' });

    // The fixture uses r#"..."# raw strings; if rustc were installed the
    // route would be native-run. On this machine it must go through the
    // structural converter and still produce the correct output.
    if (report.route === 'transpile-then-run') {
      expect(report.transpilation?.strategy).toBe('structural');
      expect(report.executedLanguage).toBe('go');
      // Raw strings must be converted, not leaked
      expect(report.transpilation?.code).not.toContain('r#"');
    }

    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('Welcome to...');
    expect(report.result.stdout).toContain('This exercise compiles successfully');
  }, 180_000);
});

describe('Real-world proof: TheAlgorithms/Haskell (no ghc on this machine)', () => {
  it('converts honestly: supported constructs convert, unsupported ones are flagged', async () => {
    const report = await engine.run(fixture('haskell-bubble-sort.hs'), { language: 'haskell' });

    if (report.route === 'transpile-then-run') {
      expect(report.transpilation?.strategy).toBe('structural');
      expect(report.executedLanguage).toBe('javascript');

      const converted = report.transpilation?.structuralReport?.converted || [];
      const unsupported = report.transpilation?.structuralReport?.unsupported || [];

      // The module declaration, function defs and main-do block convert
      expect(converted).toEqual(
        expect.arrayContaining(['module-decl', 'function', 'main-do'])
      );

      // Guards / pattern matching / $-composition are beyond the subset:
      // they must be flagged, never silently leaked as invalid JS
      expect(unsupported.length).toBeGreaterThan(0);
      expect(unsupported.some((u) => u.includes('bubblePass'))).toBe(true);

      // No leaked Haskell-only syntax in executable statements
      const code = report.transpilation?.code || '';
      for (const line of code.split('\n')) {
        if (line.trim().startsWith('//')) continue;
        expect(line).not.toMatch(/\bshow\b/);
      }
    }

    // The converted main body is fully commented out (all unsupported),
    // so the program runs and exits cleanly
    expect(report.result.ok).toBe(true);
  }, 180_000);
});

describe('Real-world proof: detection across ecosystems', () => {
  it('detects each real file by its extension', async () => {
    const cases: { file: string; language: string }[] = [
      { file: 'go-hello-gotypes.go', language: 'go' },
      { file: 'java-luhn.java', language: 'java' },
      { file: 'js-linear-search.js', language: 'javascript' },
      { file: 'rust-hello.rs', language: 'rust' },
      { file: 'haskell-bubble-sort.hs', language: 'haskell' },
    ];

    for (const { file, language } of cases) {
      const detected = engine.detect(fixture(file), file);
      expect(detected[0]?.language).toBe(language);
      expect(detected[0]?.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });
});
