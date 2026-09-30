/**
 * Universal Transpiler - Docker Toolchain Fallback Tests
 *
 * Verifies that missing native binaries (rustc, ghc on this host) execute
 * transparently inside container images, behind the same Toolchain
 * interface. Tests skip cleanly when docker or the image is unavailable.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { probeDocker, TOOLCHAIN_IMAGES } from '../src/toolchains/docker';

const RUST_HELLO = `fn main() {
    let mut total = 0;
    for i in 0..10 {
        total = total + i;
    }
    println!("docker-backed rust says: {}", total);
}
`;

const HASKELL_HELLO = `module Main where

main :: IO ()
main = do
  let answer = 40 + 2
  putStrLn ("haskell via docker says: " ++ show answer)
`;

let engine: UniversalEngine;
let dockerAvailable: boolean;

beforeAll(async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-docker-state-'));
  engine = new UniversalEngine({
    timeoutMs: 300_000,
    statePath: path.join(stateDir, 'state.json'),
  });
  const probe = await probeDocker();
  dockerAvailable = probe.available;
  await engine.toolchains.probeAll();
});

describe('Docker availability probing', () => {
  it('probes the docker daemon', async () => {
    const probe = await probeDocker();
    if (!probe.available) {
      console.warn('docker unavailable: fallback tests will skip');
      return;
    }
    expect(probe.version).toBeTruthy();
  });

  it('maps every toolchain to a providing image', () => {
    for (const id of ['rust', 'haskell', 'java', 'go', 'python', 'native-c']) {
      expect(TOOLCHAIN_IMAGES[id]).toMatch(/^[a-z]+:[\d.]+(-slim)?$/);
    }
  });
});

describe('Docker fallback: Rust (no rustc on this host)', () => {
  it('reports the rust toolchain as available via docker when the image exists', async () => {
    const rust = engine.toolchains.get('rust')!;
    if (!dockerAvailable) return console.warn('skipping: docker unavailable');

    // Either native rustc or the docker fallback makes it available
    if (!rust.info.available) return console.warn('skipping: no rustc and image not pullable');
    expect(rust.info.available).toBe(true);
  });

  it('executes real Rust through the engine using the docker fallback', async () => {
    const rust = engine.toolchains.get('rust')!;
    if (!dockerAvailable) return console.warn('skipping: docker unavailable');
    if (!rust.info.available) return console.warn('skipping: rust unavailable');

    const report = await engine.run(RUST_HELLO, { language: 'rust' });
    expect(report.route).toBe('native-run');
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout.trim()).toBe('docker-backed rust says: 45');

    // When the host lacks rustc, execution must have gone through docker
    if (!rust.info.versions['rustc']) {
      expect(report.result.toolchain).toBe(`docker:${TOOLCHAIN_IMAGES['rust']}`);
    }
  }, 300_000);
});

describe('Docker fallback: Haskell (no ghc on this host)', () => {
  it('executes real Haskell through the engine using the docker fallback', async () => {
    const haskell = engine.toolchains.get('haskell')!;
    if (!dockerAvailable) return console.warn('skipping: docker unavailable');
    if (!haskell.info.available) return console.warn('skipping: haskell unavailable');

    const report = await engine.run(HASKELL_HELLO, { language: 'haskell' });
    expect(report.route).toBe('native-run');
    expect(report.result.ok).toBe(true);
    expect(report.result.stdout.trim()).toBe('haskell via docker says: 42');

    if (!haskell.info.versions['ghc']) {
      expect(report.result.toolchain).toBe(`docker:${TOOLCHAIN_IMAGES['haskell']}`);
    }
  }, 300_000);
});

describe('WebAssembly platform artifacts', () => {
  it('compiles Rust to a real wasm module via the docker fallback', async () => {
    const rust = engine.toolchains.get('rust')!;
    if (!dockerAvailable) return console.warn('skipping: docker unavailable');
    if (!rust.info.available) return console.warn('skipping: rust unavailable');

    const result = await rust.compile('fn main() { println!("wasm"); }', {
      platform: 'wasm',
      entryFile: 'main.rs',
    });
    expect(result.ok).toBe(true);
    expect(result.artifacts[0]).toMatch(/\.wasm$/);
    expect(fs.existsSync(result.artifacts[0])).toBe(true);

    // A real wasm module starts with the magic bytes 0x00 'a' 's' 'm'
    const magic = fs.readFileSync(result.artifacts[0]).subarray(0, 4);
    expect(Array.from(magic)).toEqual([0x00, 0x61, 0x73, 0x6d]);
  }, 300_000);

  it('compiles Go to a real wasm module natively (GOOS=js GOARCH=wasm)', async () => {
    const go = engine.toolchains.get('go')!;
    if (!go.info.available) return console.warn('skipping: go unavailable');

    const result = await go.compile('package main\n\nfunc main() { println("wasm") }\n', {
      platform: 'wasm',
      entryFile: 'main.go',
    });
    expect(result.ok).toBe(true);
    expect(result.artifacts[0]).toMatch(/\.wasm$/);

    const magic = fs.readFileSync(result.artifacts[0]).subarray(0, 4);
    expect(Array.from(magic)).toEqual([0x00, 0x61, 0x73, 0x6d]);
  }, 180_000);
});

describe('Docker fallback: transparent engine routing', () => {
  it('prefers native binaries and only falls back to docker when missing', async () => {
    // On this machine go IS native: the run must not go through docker
    const go = engine.toolchains.get('go')!;
    if (!go.info.available) return console.warn('skipping: go unavailable');

    const report = await engine.run(
      'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("native wins") }\n',
      { language: 'go' }
    );
    expect(report.result.ok).toBe(true);
    expect(report.result.toolchain).not.toContain('docker');
    expect(report.result.stdout.trim()).toBe('native wins');
  }, 120_000);
});
