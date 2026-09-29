/**
 * Universal Transpiler - Toolchain Registry
 *
 * Central registry of native toolchain wrappers. Probes availability once,
 * maps languages/extensions to toolchains, and provides the fallback
 * ordering the engine uses when a native toolchain is missing.
 */

import type { Toolchain, ToolchainInfo, ProjectInfo } from './types';
import { createRustToolchain } from './wrappers/rust';
import { createGoToolchain } from './wrappers/go';
import { createJavaToolchain } from './wrappers/java';
import { createHaskellToolchain } from './wrappers/haskell';
import { createJsTsToolchain } from './wrappers/jsts';
import {
  createCToolchain,
  createPhpToolchain,
  createPythonToolchain,
  createRubyToolchain,
} from './wrappers/generic';

/** Language aliases normalized to canonical toolchain languages. */
const LANGUAGE_ALIASES: Record<string, string> = {
  rs: 'rust',
  rust: 'rust',
  go: 'go',
  golang: 'go',
  java: 'java',
  jvm: 'java',
  kotlin: 'java',
  kt: 'java',
  scala: 'java',
  haskell: 'haskell',
  hs: 'haskell',
  ghc: 'haskell',
  javascript: 'jsts',
  js: 'jsts',
  typescript: 'jsts',
  ts: 'jsts',
  tsx: 'jsts',
  jsx: 'jsts',
  node: 'jsts',
  deno: 'jsts',
  python: 'python',
  py: 'python',
  python3: 'python',
  c: 'native-c',
  cpp: 'native-c',
  'c++': 'native-c',
  ruby: 'ruby',
  rb: 'ruby',
  php: 'php',
};

/** File extension -> canonical language. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'java',
  '.scala': 'java',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
};

export class ToolchainRegistry {
  private toolchains: Map<string, Toolchain> = new Map();
  private probed = false;

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const rust = createRustToolchain();
    const go = createGoToolchain();
    const java = createJavaToolchain();
    const haskell = createHaskellToolchain();
    const jsts = createJsTsToolchain();
    const c = createCToolchain();
    const python = createPythonToolchain();
    const ruby = createRubyToolchain();
    const php = createPhpToolchain();

    for (const tc of [rust, go, java, haskell, jsts, c, python, ruby, php]) {
      this.toolchains.set(tc.info.id, tc);
    }
  }

  /** Register a custom toolchain. */
  register(toolchain: Toolchain): void {
    this.toolchains.set(toolchain.info.id, toolchain);
    this.probed = false;
  }

  /** Probe every registered toolchain for availability (idempotent). */
  async probeAll(): Promise<ToolchainInfo[]> {
    const infos = await Promise.all(
      Array.from(this.toolchains.values()).map((tc) => tc.probe())
    );
    this.probed = true;
    return infos;
  }

  /** Get a toolchain by its canonical id (rust, go, java, haskell, jsts...). */
  get(id: string): Toolchain | undefined {
    return this.toolchains.get(id);
  }

  /** Resolve a toolchain from a language name or alias. */
  forLanguage(language: string): Toolchain | undefined {
    const canonical = LANGUAGE_ALIASES[language.toLowerCase()];
    if (!canonical) return undefined;
    return this.toolchains.get(canonical);
  }

  /** Resolve a toolchain from a file extension. */
  forExtension(ext: string): Toolchain | undefined {
    const language = EXTENSION_TO_LANGUAGE[ext.toLowerCase()];
    if (!language) return undefined;
    return this.forLanguage(language);
  }

  /** The language an extension maps to. */
  languageForExtension(ext: string): string | undefined {
    return EXTENSION_TO_LANGUAGE[ext.toLowerCase()];
  }

  /** List all known toolchain infos (probing first if needed). */
  async list(): Promise<ToolchainInfo[]> {
    if (!this.probed) return this.probeAll();
    return Array.from(this.toolchains.values()).map((tc) => tc.info);
  }

  /** Which toolchains are currently available natively. */
  async available(): Promise<ToolchainInfo[]> {
    const all = await this.list();
    return all.filter((info) => info.available);
  }

  /**
   * Fallback chain for a language: the native toolchain first, then
   * toolchains that can *run* transpiled output for common targets.
   */
  fallbackChain(language: string): Toolchain[] {
    const primary = this.forLanguage(language);
    const chain: Toolchain[] = [];
    if (primary) chain.push(primary);

    // Universal fallback targets: node runs almost anything transpiled
    const jsts = this.get('jsts');
    if (jsts && primary !== jsts) chain.push(jsts);
    return chain;
  }

  /** Detect which toolchain owns a project directory. */
  async detectProject(projectDir: string): Promise<ProjectInfo | null> {
    for (const tc of this.toolchains.values()) {
      const info = await tc.detectProject(projectDir);
      if (info) return info;
    }
    return null;
  }
}

let defaultRegistry: ToolchainRegistry | null = null;

export function getToolchainRegistry(): ToolchainRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolchainRegistry();
  }
  return defaultRegistry;
}
