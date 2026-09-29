/**
 * Universal Transpiler - Toolchain Wrapper & Engine Tests
 *
 * Verifies the "large wrapper" architecture end to end:
 * - toolchain probing (availability is machine-dependent, asserted dynamically)
 * - language detection for every supported syntax
 * - native run: Go, Java, JS/TS
 * - fallback run: Rust -> Go (structural), Haskell -> JS (structural)
 * - native transpilation: TS -> JS via the bundled compiler API
 * - structural transpilation validity: transpiled Go compiles with `go build`
 * - framework detection across ecosystems
 * - domain -> platform routing
 * - project detection per ecosystem
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { UniversalEngine } from '../src/engine/universal-engine';
import { ToolchainRegistry } from '../src/toolchains/registry';
import { rustToGo, haskellToJavaScript } from '../src/engine/structural-transpilers';
import {
  analyzeDomain,
  canTargetPlatform,
  defaultPlatformFor,
} from '../src/domains/domain-analyzer';
import {
  detectFrameworksInSource,
  frameworksForEcosystem,
} from '../src/frameworks/framework-registry';
import { detectLanguage } from '../src/parsers/language-parsers';

// ============================================================================
// Fixtures
// ============================================================================

const GO_HELLO = `package main

import "fmt"

func main() {
	fmt.Println("hello from go")
}
`;

const JAVA_HELLO = `public class Main {
    public static void main(String[] args) {
        System.out.println("hello from java");
    }
}
`;

const TS_HELLO = `const msg: string = "hello from typescript";
function greet(name: string): string {
  return msg + " " + name;
}
console.log(greet("world"));
`;

const RUST_HELLO = `fn main() {
    let greeting = "hello from rust";
    let mut count = 2;
    count = count + 1;
    println!("{}", greeting);
    if count > 2 {
        println!("count is big");
    }
}
`;

const HASKELL_HELLO = `module Main where

main :: IO ()
main = do
  let name = "haskell"
  putStrLn ("hello from " ++ name)
`;

const REACT_SOURCE = `import React, { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;

const SPRING_SOURCE = `package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;

const ACTIX_SOURCE = `use actix_web::{get, App, HttpServer};

#[get("/")]
async fn hello() -> String {
    format!("hello world")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(hello))
        .bind("127.0.0.1:8080")?
        .run()
        .await
}
`;

// ============================================================================
// Engine + registry shared across tests
// ============================================================================

let engine: UniversalEngine;
let registry: ToolchainRegistry;

beforeAll(async () => {
  // Hermetic: a temp state file per suite so learned keywords and promoted
  // feedback can never leak between test runs.
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-engine-state-'));
  engine = new UniversalEngine({
    debug: false,
    timeoutMs: 60_000,
    statePath: path.join(stateDir, 'state.json'),
  });
  registry = engine.toolchains;
  await registry.probeAll();
});

// ============================================================================
// Toolchain probing
// ============================================================================

describe('Toolchain registry probing', () => {
  it('registers every supported ecosystem', () => {
    for (const id of ['rust', 'go', 'java', 'haskell', 'jsts', 'native-c', 'python']) {
      expect(registry.get(id)).toBeDefined();
    }
  });

  it('resolves languages through aliases', () => {
    expect(registry.forLanguage('golang')?.info.id).toBe('go');
    expect(registry.forLanguage('rs')?.info.id).toBe('rust');
    expect(registry.forLanguage('hs')?.info.id).toBe('haskell');
    expect(registry.forLanguage('ts')?.info.id).toBe('jsts');
    expect(registry.forLanguage('typescript')?.info.id).toBe('jsts');
    expect(registry.forLanguage('python3')?.info.id).toBe('python');
  });

  it('resolves toolchains from file extensions', () => {
    expect(registry.forExtension('.rs')?.info.id).toBe('rust');
    expect(registry.forExtension('.go')?.info.id).toBe('go');
    expect(registry.forExtension('.java')?.info.id).toBe('java');
    expect(registry.forExtension('.hs')?.info.id).toBe('haskell');
    expect(registry.forExtension('.ts')?.info.id).toBe('jsts');
  });

  it('probes availability and records versions for available toolchains', async () => {
    const infos = await registry.list();
    expect(infos.length).toBeGreaterThanOrEqual(8);

    for (const info of infos) {
      if (info.available) {
        expect(Object.keys(info.versions).length).toBeGreaterThan(0);
      }
    }
  });

  it('reports engine status with all toolchains', async () => {
    const status = await engine.status();
    const ids = status.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['rust', 'go', 'java', 'haskell', 'jsts']));
  });
});

// ============================================================================
// Language detection
// ============================================================================

describe('Language detection', () => {
  it('detects each supported syntax', () => {
    const cases: { source: string; languages: string[] }[] = [
      { source: GO_HELLO, languages: ['go'] },
      { source: JAVA_HELLO, languages: ['java'] },
      // The React fixture carries no TS type annotations, so it is valid
      // JS+JSX: detection may legitimately answer either.
      { source: REACT_SOURCE, languages: ['typescript', 'javascript'] },
      { source: ACTIX_SOURCE, languages: ['rust'] },
    ];

    for (const { source, languages } of cases) {
      const detected = detectLanguage(source);
      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some((d) => languages.includes(d.language))).toBe(true);
    }
  });

  it('uses filename extension with high confidence', () => {
    const detected = detectLanguage('anything', 'program.rs');
    expect(detected[0]?.language).toBe('rust');
    expect(detected[0]?.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

// ============================================================================
// Native execution: run anything whose toolchain exists
// ============================================================================

describe('Native run (Go/Java/JS)', () => {
  it('runs Go natively when the go toolchain is available', async () => {
    const go = registry.get('go')!;
    if (!go.info.available) {
      console.warn('skipping: go not available');
      return;
    }

    const result = await go.run(GO_HELLO);
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('hello from go');
  }, 120_000);

  it('runs Java natively when the JDK is available', async () => {
    const java = registry.get('java')!;
    if (!java.info.available) {
      console.warn('skipping: javac not available');
      return;
    }

    const result = await java.run(JAVA_HELLO);
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('hello from java');
  }, 120_000);

  it('runs TypeScript via the engine (transpile to JS, run with node)', async () => {
    const jsts = registry.get('jsts')!;
    if (!jsts.info.available) {
      console.warn('skipping: node not available');
      return;
    }

    const report = await engine.run(TS_HELLO, { language: 'typescript' });
    expect(report.route).toBe('native-run');
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout.trim()).toBe('hello from typescript world');
  }, 120_000);

  it('runs plain JavaScript natively', async () => {
    const jsts = registry.get('jsts')!;
    if (!jsts.info.available) {
      console.warn('skipping: node not available');
      return;
    }

    const report = await engine.run('console.log("plain js");', { language: 'javascript' });
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout.trim()).toBe('plain js');
  }, 120_000);
});

// ============================================================================
// Fallback execution: missing toolchains run via structural transpilation
// ============================================================================

describe('Fallback run (Rust->Go, Haskell->JS)', () => {
  it('runs Rust through the engine: native when rustc exists, transpiled otherwise', async () => {
    const rust = registry.get('rust')!;
    const report = await engine.run(RUST_HELLO, { language: 'rust' });

    if (rust.info.available) {
      expect(report.route).toBe('native-run');
    } else {
      expect(report.route).toBe('transpile-then-run');
      expect(report.transpilation?.strategy).toBe('structural');
      expect(report.executedLanguage).toBe('go');
    }

    expect(report.result.ok).toBe(true);
    expect(report.result.stdout).toContain('hello from rust');
    expect(report.result.stdout).toContain('count is big');
  }, 180_000);

  it('runs Haskell through the engine via structural transpilation to JS', async () => {
    const haskell = registry.get('haskell')!;
    const report = await engine.run(HASKELL_HELLO, { language: 'haskell' });

    if (haskell.info.available) {
      expect(report.route).toBe('native-run');
    } else {
      expect(report.route).toBe('transpile-then-run');
      expect(report.transpilation?.strategy).toBe('structural');
      expect(report.executedLanguage).toBe('javascript');
    }

    expect(report.result.ok).toBe(true);
    expect(report.result.stdout.trim()).toContain('hello from haskell');
  }, 180_000);
});

// ============================================================================
// Transpilation matrix
// ============================================================================

describe('Transpile matrix', () => {
  it('transpiles TypeScript to JavaScript natively (tier 1)', async () => {
    const result = await engine.transpile(TS_HELLO, 'typescript', 'javascript');
    expect(result.strategy).toBe('native');
    expect(result.via).toContain('typescript');
    expect(result.code).toContain('console.log');
    expect(result.code).not.toContain(': string');
  });

  it('transpiles Rust to Go structurally (tier 2) and the output is valid Go', async () => {
    const result = await engine.transpile(RUST_HELLO, 'rust', 'go');
    expect(result.strategy).toBe('structural');
    expect(result.via).toBe('rust->go');
    expect(result.code).toContain('package main');
    expect(result.code).toContain('func main()');
    expect(result.code).toContain('fmt.Println');
    expect(result.structuralReport?.converted).toEqual(
      expect.arrayContaining(['fn-main', 'let', 'println'])
    );

    // Prove the produced Go is valid: compile it when go is available
    const go = registry.get('go')!;
    if (go.info.available) {
      const compileResult = await go.compile(result.code);
      expect(compileResult.ok).toBe(true);
      expect(compileResult.stderr).not.toContain('syntax error');
    }
  }, 120_000);

  it('transpiles Haskell to JavaScript structurally', async () => {
    const result = await engine.transpile(HASKELL_HELLO, 'haskell', 'javascript');
    expect(result.strategy).toBe('structural');
    expect(result.code).toContain('async function main()');
    expect(result.code).toContain('console.log');
  });

  it('returns identity for same-language transpilation', async () => {
    const result = await engine.transpile(GO_HELLO, 'go', 'go');
    expect(result.strategy).toBe('native');
    expect(result.identity).toBe(true);
    expect(result.code).toBe(GO_HELLO);
  });

  it('declares which structural pairs it supports', () => {
    const pairs = engine.matrix.structuralPairs();
    expect(pairs).toContain('rust->go');
    expect(pairs).toContain('haskell->javascript');
  });
});

// ============================================================================
// Structural transpiler details
// ============================================================================

describe('Structural transpilers', () => {
  it('rustToGo maps types and constructs', () => {
    const rust = `fn compute(x: i32) -> i32 {
    let y: i64 = 10;
    let total = x + 2;
    total
}

struct Point {
    x: f64,
    y: f64,
}

fn main() {
    let p = Point { x: 1.0, y: 2.0 };
    println!("point made");
}
`;
    const result = rustToGo(rust);
    expect(result.code).toContain('func compute(x int32) int32 {');
    expect(result.code).toContain('type Point struct {');
    expect(result.code).toContain('x float64');
    expect(result.code).toContain('fmt.Println("point made")');
    expect(result.converted).toEqual(expect.arrayContaining(['fn', 'fn-main', 'struct', 'struct-field']));
  });

  it('rustToGo flags unsupported constructs instead of failing silently', () => {
    const result = rustToGo('fn main() {\n    match x {\n        1 => println!("one"),\n    }\n}\n');
    expect(result.unsupported).toContain('match-expression');
  });

  it('haskellToJavaScript converts do-blocks and function definitions', () => {
    const hs = `module Main where

double :: Int -> Int
double x = x * 2

main :: IO ()
main = do
  let n = double 21
  putStrLn "answer:"
  print n
`;
    const result = haskellToJavaScript(hs);
    expect(result.code).toContain('function double(x) {');
    expect(result.code).toContain('return x * 2;');
    expect(result.code).toContain('async function main()');
    expect(result.converted).toEqual(expect.arrayContaining(['function', 'main-do', 'let-binding']));
  });
});

// ============================================================================
// Framework detection
// ============================================================================

describe('Framework detection', () => {
  it('detects React and suggests browser platform', () => {
    const result = detectFrameworksInSource(REACT_SOURCE, 'typescript');
    expect(result.frameworks.map((f) => f.id)).toContain('react');
    expect(result.suggestedPlatform).toBe('browser');
    expect(result.domains).toContain('web-frontend');
  });

  it('detects Spring Boot in Java source', () => {
    const result = detectFrameworksInSource(SPRING_SOURCE, 'java');
    expect(result.frameworks.map((f) => f.id)).toContain('spring-boot');
    expect(result.suggestedPlatform).toBe('jvm');
  });

  it('detects Actix in Rust source', () => {
    const result = detectFrameworksInSource(ACTIX_SOURCE, 'rust');
    expect(result.frameworks.map((f) => f.id)).toContain('actix');
    expect(result.suggestedPlatform).toBe('native');
  });

  it('catalogs every ecosystem required by the spec', () => {
    for (const eco of ['jsts', 'java', 'rust', 'go', 'haskell']) {
      const fws = frameworksForEcosystem(eco);
      expect(fws.length).toBeGreaterThan(0);
    }
    expect(frameworksForEcosystem('jsts').map((f) => f.id)).toEqual(
      expect.arrayContaining(['react', 'next.js', 'vue', 'svelte', 'angular', 'express', 'nestjs'])
    );
    expect(frameworksForEcosystem('java').map((f) => f.id)).toEqual(
      expect.arrayContaining(['spring-boot', 'quarkus', 'micronaut', 'jakarta-ee'])
    );
    expect(frameworksForEcosystem('rust').map((f) => f.id)).toEqual(
      expect.arrayContaining(['actix', 'axum', 'rocket', 'tokio', 'bevy', 'wasm-bindgen'])
    );
    expect(frameworksForEcosystem('go').map((f) => f.id)).toEqual(
      expect.arrayContaining(['gin', 'echo', 'fiber', 'kubernetes', 'cobra'])
    );
    expect(frameworksForEcosystem('haskell').map((f) => f.id)).toEqual(
      expect.arrayContaining(['yesod', 'servant', 'snap-server', 'aeson'])
    );
  });
});

// ============================================================================
// Domain analysis and platform routing
// ============================================================================

describe('Domain analyzer', () => {
  it('routes web-frontend keywords to browser platform', () => {
    const result = analyzeDomain({
      source: 'function App() { const [state, setState] = useState(0); return <div/>; }',
    });
    expect(result.domain.id).toBe('web-frontend');
    expect(result.platform).toBe('browser');
  });

  it('routes server keywords to web-backend', () => {
    const result = analyzeDomain({
      source: 'app.listen(8080); router.get("/api", handler);',
    });
    expect(result.domain.id).toBe('web-backend');
  });

  it('routes wasm keywords to the wasm platform', () => {
    const result = analyzeDomain({
      source: '#[wasm_bindgen]\npub fn greet() -> String { "hi".into() }',
      declaredDomain: 'wasm',
    });
    expect(result.domain.id).toBe('wasm');
    expect(result.platform).toBe('wasm');
  });

  it('lets a declared platform override inference', () => {
    const result = analyzeDomain({
      source: REACT_SOURCE,
      declaredPlatform: 'wasm',
    });
    expect(result.platform).toBe('wasm');
  });

  it('forces jvm platform for java sources unless overridden', () => {
    const result = analyzeDomain({ source: 'public class Main {}', language: 'java' });
    expect(result.platform).toBe('jvm');
  });

  it('exposes platform capabilities per language', () => {
    expect(canTargetPlatform('rust', 'wasm')).toBe(true);
    expect(canTargetPlatform('java', 'wasm')).toBe(false);
    expect(canTargetPlatform('java', 'jvm')).toBe(true);
    expect(canTargetPlatform('jsts', 'browser')).toBe(true);
    expect(defaultPlatformFor('java')).toBe('jvm');
    expect(defaultPlatformFor('typescript')).toBe('node');
  });
});


// ============================================================================
// Platform-decided compile output
// ============================================================================

describe('Engine compile: platform decides the artifact', () => {
  it('compiles Rust to a Go binary when rustc is missing (transpile-then-compile)', async () => {
    const rust = registry.get('rust')!;
    const report = await engine.compile(RUST_HELLO, { language: 'rust', platform: 'native' });

    if (rust.info.available) {
      expect(report.route).toBe('native-compile');
    } else {
      expect(report.route).toBe('transpile-then-compile');
      expect(report.executedLanguage).toBe('go');
    }

    expect(report.result.ok).toBe(true);
    expect(report.result.artifacts.length).toBeGreaterThan(0);
    expect(fs.existsSync(report.result.artifacts[0])).toBe(true);
  }, 120_000);

  it('compiles Java to a JVM class artifact', async () => {
    const java = registry.get('java')!;
    if (!java.info.available) {
      console.warn('skipping: javac not available');
      return;
    }

    const report = await engine.compile(JAVA_HELLO, { language: 'java' });
    expect(report.route).toBe('native-compile');
    expect(report.analysis.platform).toBe('jvm');
    expect(report.result.ok).toBe(true);
    expect(report.result.artifacts[0]).toMatch(/\.class$/);
  }, 120_000);

  it('respects a declared wasm platform in routing analysis', async () => {
    const report = await engine.analyze(RUST_HELLO, { language: 'rust', platform: 'wasm' });
    expect(report.analysis.platform).toBe('wasm');
  });
});

// ============================================================================
// Engine analysis & project detection
// ============================================================================

describe('Engine analysis and project detection', () => {
  it('analyzes arbitrary syntax: language, domain, platform, route', async () => {
    const report = await engine.analyze(ACTIX_SOURCE, { language: 'rust' });
    expect(report.language).toBe('rust');
    expect(report.analysis.domain.id).toBe('web-backend');
    expect(report.analysis.frameworks).toContain('actix');
    expect(report.analysis.platform).toBe('native');
  });

  it('detects cargo projects through the registry', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-rust-'));
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[dependencies]\nactix-web = "4"\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.rs'), 'fn main() {}\n');

    const project = await registry.detectProject(dir);
    expect(project).not.toBeNull();
    expect(project!.ecosystem).toBe('rust');
    expect(project!.buildSystem).toBe('cargo');
    expect(project!.frameworks).toContain('actix');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects node/npm projects with framework resolution', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-node-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', next: '^14.0.0' },
      })
    );

    const project = await registry.detectProject(dir);
    expect(project).not.toBeNull();
    expect(project!.ecosystem).toBe('node');
    expect(project!.frameworks).toEqual(expect.arrayContaining(['react', 'next.js']));

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects maven and gradle java projects', async () => {
    const mavenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-java-'));
    fs.writeFileSync(
      path.join(mavenDir, 'pom.xml'),
      '<project><dependencies><dependency><groupId>org.springframework.boot</groupId></dependency></dependencies></project>'
    );
    const maven = await registry.detectProject(mavenDir);
    expect(maven!.ecosystem).toBe('java');
    expect(maven!.buildSystem).toBe('maven');
    expect(maven!.frameworks).toContain('spring-boot');
    fs.rmSync(mavenDir, { recursive: true, force: true });

    const gradleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-java-'));
    fs.writeFileSync(path.join(gradleDir, 'build.gradle'), "implementation 'io.quarkus:quarkus-core'");
    const gradle = await registry.detectProject(gradleDir);
    expect(gradle!.buildSystem).toBe('gradle');
    expect(gradle!.frameworks).toContain('quarkus');
    fs.rmSync(gradleDir, { recursive: true, force: true });
  });

  it('detects go modules and haskell stack projects', async () => {
    const goDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-go-'));
    fs.writeFileSync(path.join(goDir, 'go.mod'), 'module example.com/app\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.0\n');
    const goProject = await registry.detectProject(goDir);
    expect(goProject!.ecosystem).toBe('go');
    expect(goProject!.frameworks).toContain('gin');
    fs.rmSync(goDir, { recursive: true, force: true });

    const hsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-hs-'));
    fs.writeFileSync(path.join(hsDir, 'stack.yaml'), 'resolver: lts-22.0\n');
    fs.writeFileSync(path.join(hsDir, 'app.cabal'), 'build-depends: base, yesod\n');
    const hsProject = await registry.detectProject(hsDir);
    expect(hsProject!.ecosystem).toBe('haskell');
    expect(hsProject!.frameworks).toContain('yesod');
    fs.rmSync(hsDir, { recursive: true, force: true });
  });

  it('refuses to build unrecognized project directories', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-empty-'));
    await expect(engine.build(dir)).rejects.toThrow(/No recognizable project/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
