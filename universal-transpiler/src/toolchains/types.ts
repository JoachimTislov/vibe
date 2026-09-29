/**
 * Universal Transpiler - Toolchain Types
 *
 * Unified interface wrapping native compilers/interpreters.
 * Every ecosystem (Rust, Go, Java, Haskell, JS/TS, C/C++, ...) is exposed
 * through the same Toolchain interface so the engine can route any syntax
 * to the right toolchain, or fall back to transpilation when a toolchain
 * is unavailable.
 */

import type { LanguageDefinition } from '../core/universal-transpiler';

// ============================================================================
// Platform Targets
// ============================================================================

export type PlatformTarget =
  | 'native'        // host binary (rustc a.out, go build, javac->java, gcc)
  | 'jvm'           // JVM bytecode / jar
  | 'node'          // Node.js script / CommonJS
  | 'deno'          // Deno runtime
  | 'browser'       // browser bundle (ESM, IIFE)
  | 'wasm'          // WebAssembly module
  | 'wasi'          // WebAssembly System Interface
  | 'docker'        // container image build
  | 'ir'            // intermediate representation (LLVM IR, JVM .class as IR)
  | 'auto';         // decide from domain + keywords

export type OutputMode =
  | 'run'           // execute and capture the result
  | 'compile'       // produce an artifact (binary/jar/bundle)
  | 'transpile'     // produce source in another language
  | 'interpret';    // evaluate in an interpreter

// ============================================================================
// Execution Results
// ============================================================================

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  command: string;
  /** Artifact produced (binary path, jar, bundle, wasm file...) */
  artifacts: string[];
  /** Toolchain used to produce this result */
  toolchain: string;
}

export interface ToolchainInfo {
  /** Canonical toolchain id, e.g. 'rust', 'go', 'java', 'haskell', 'jsts' */
  id: string;
  /** Human readable name */
  name: string;
  /** Languages this toolchain can build/run */
  languages: string[];
  /** Binary names required, e.g. ['rustc'] or ['cargo'] */
  binaries: string[];
  /** Detected versions of the binaries (filled by probing) */
  versions: Record<string, string>;
  /** Whether all required binaries were found on PATH */
  available: boolean;
  /** File extensions handled, e.g. ['.rs'] */
  extensions: string[];
  /** Frameworks supported within this ecosystem */
  frameworks: string[];
}

// ============================================================================
// Options
// ============================================================================

export interface ToolchainContextOptions {
  /** Working directory for temp artifacts; defaults to os tmp dir */
  workDir?: string;
  /** Environment variables passed to the toolchain */
  env?: Record<string, string>;
  /** Timeout for compile/run steps (ms) */
  timeoutMs?: number;
  /** Extra CLI args forwarded to the toolchain binary */
  extraArgs?: string[];
  /** Debug logging */
  debug?: boolean;
  /** Offline mode: avoid network-dependent steps (dependency fetching) */
  offline?: boolean;
}

export interface CompileOptions extends ToolchainContextOptions {
  /** Target platform for the produced artifact */
  platform?: PlatformTarget;
  /** Release/optimized build */
  release?: boolean;
  /** Entry file name (defaults per-language, e.g. main.rs, Main.java) */
  entryFile?: string;
  /** Module/package name used for java/haskell entry points */
  moduleName?: string;
  /** Output artifact path (defaults to temp dir) */
  outputPath?: string;
}

export interface RunOptions extends ToolchainContextOptions {
  /** Args passed to the program itself */
  args?: string[];
  /** stdin content piped to the program */
  stdin?: string;
  /** Target platform to run on (jvm, native, node...) */
  platform?: PlatformTarget;
  /** If true, compile first (when needed), then execute */
  compileFirst?: boolean;
  /** Entry file name (e.g. main.rs, Main.java, main.ts) */
  entryFile?: string;
  /** Module/class name for java/haskell entry points */
  moduleName?: string;
}

export interface ProjectBuildOptions extends ToolchainContextOptions {
  platform?: PlatformTarget;
  release?: boolean;
  /** Target within a multi-target project (wasm32-unknown-unknown, js, ...) */
  buildTarget?: string;
}

// ============================================================================
// Project / Framework Detection
// ============================================================================

export interface ProjectInfo {
  /** Root directory of the project */
  root: string;
  /** Ecosystem detected: rust | go | java | haskell | jsts | node | ... */
  ecosystem: string;
  /** Build system: cargo | go-mod | maven | gradle | stack | cabal | npm | ... */
  buildSystem: string;
  /** Frameworks detected (react, spring-boot, actix, gin, yesod, ...) */
  frameworks: string[];
  /** Entry points guessed from project layout */
  entryPoints: string[];
  /** Marker files that led to detection */
  markers: string[];
  /** Confidence 0..1 */
  confidence: number;
}

export interface FrameworkSpec {
  /** Canonical framework id */
  id: string;
  name: string;
  ecosystem: string;
  /** Marker files that hint at this framework */
  markerFiles: string[];
  /** Imports/dependencies that indicate this framework */
  dependencyPatterns: string[];
  /** Source-level import statements indicating this framework */
  importPatterns: string[];
  /** Domains this framework typically belongs to */
  domains: string[];
  /** Default target platform when using this framework */
  defaultPlatform: PlatformTarget;
}

// ============================================================================
// The unified Toolchain interface
// ============================================================================

export interface Toolchain {
  /** Static info (id, languages, binaries, extensions) */
  info: ToolchainInfo;

  /** Probe PATH for required binaries and record versions. */
  probe(): Promise<ToolchainInfo>;

  /** Compile source to an artifact for the given platform. */
  compile(source: string, options?: CompileOptions): Promise<ExecResult>;

  /** Run source directly (interpret, or compile-then-run). */
  run(source: string, options?: RunOptions): Promise<ExecResult>;

  /** Build an existing project directory with its native build system. */
  buildProject(projectDir: string, options?: ProjectBuildOptions): Promise<ExecResult>;

  /**
   * Transpile source to another language using native facilities
   * (e.g. tsc for TS->JS). Returns null if this toolchain has no
   * native transpiler for the pair.
   */
  nativeTranspile?(
    source: string,
    from: string,
    to: string,
    options?: ToolchainContextOptions
  ): Promise<{ code: string; toolchain: string } | null>;

  /** Detect whether a project directory belongs to this toolchain. */
  detectProject(projectDir: string): Promise<ProjectInfo | null>;

  /** Language definitions for the parser layer (optional) */
  languageDefinitions?(): LanguageDefinition[];
}
