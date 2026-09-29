/**
 * Universal Transpiler - Haskell Toolchain
 *
 * Wraps ghc / runghc / stack / cabal. Handles:
 * - single-file interpret (runghc)
 * - compile to native binary (ghc)
 * - stack/cabal project builds
 * - frameworks: yesod, servant, snap, aeson, lens ecosystems
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  CompileOptions,
  ExecResult,
  ProjectBuildOptions,
  ProjectInfo,
  RunOptions,
  Toolchain,
  ToolchainInfo,
} from '../types';
import {
  dirExists,
  fileExists,
  makeTempDir,
  probeVersion,
  readTextFile,
  runCommand,
  whichSync,
  writeSourceFile,
} from '../exec';

const HASKELL_FRAMEWORK_HINTS: Record<string, string> = {
  'yesod': 'yesod',
  'Yesod': 'yesod',
  'servant': 'servant',
  'Servant': 'servant',
  'snap': 'snap-server',
  'aeson': 'aeson',
  'lens': 'lens',
  'text': 'text',
  'containers': 'containers',
  'mtl': 'mtl',
  'persistent': 'persistent',
  'hspec': 'hspec',
  'quickcheck': 'quickcheck',
  'QuickCheck': 'quickcheck',
  'stm': 'stm',
};

/** Extract the Haskell module name from source (Main by default). */
export function extractHaskellModuleName(source: string): string {
  const match = source.match(/module\s+([A-Z][A-Za-z0-9_.]*)/);
  return match ? match[1] : 'Main';
}

export class HaskellToolchain implements Toolchain {
  info: ToolchainInfo = {
    id: 'haskell',
    name: 'Haskell (ghc/runghc/stack)',
    languages: ['haskell', 'haskell-literate'],
    binaries: ['ghc'],
    versions: {},
    available: false,
    extensions: ['.hs', '.lhs'],
    frameworks: Object.values(HASKELL_FRAMEWORK_HINTS),
  };

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let found = false;
    for (const bin of ['ghc', 'runghc', 'stack', 'cabal']) {
      if (whichSync(bin)) {
        versions[bin] = probeVersion(bin) || bin;
        if (bin === 'ghc') found = true;
      }
    }
    this.info.versions = versions;
    this.info.available = found;
    return this.info;
  }

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('compile');

    const workDir = options.workDir || makeTempDir('haskell');
    const entryFile = options.entryFile || 'Main.hs';
    const filePath = writeSourceFile(workDir, entryFile, source);
    const outPath = options.outputPath || path.join(workDir, 'program');

    const args = [
      '-o', outPath,
      ...(options.release ? ['-O2'] : []),
      ...(options.extraArgs || []),
      filePath,
    ];

    const result = await runCommand('ghc', args, {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 180_000,
    });
    result.artifacts = fileExists(outPath) ? [outPath] : [];
    return result;
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('run');

    const workDir = options.workDir || makeTempDir('haskell');
    const entryFile = options.entryFile || 'Main.hs';
    const filePath = writeSourceFile(workDir, entryFile, source);

    // Prefer runghc for fast interpretation
    if (whichSync('runghc')) {
      return runCommand('runghc', [filePath, ...(options.args || [])], {
        cwd: workDir,
        env: options.env,
        timeoutMs: options.timeoutMs || 60_000,
        stdin: options.stdin,
      });
    }

    // Fall back to compile + execute
    const outPath = path.join(workDir, 'program');
    const compileResult = await runCommand('ghc', ['-o', outPath, filePath], {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 180_000,
    });
    if (!compileResult.ok) return compileResult;

    return runCommand(outPath, options.args || [], {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 60_000,
      stdin: options.stdin,
    });
  }

  async buildProject(projectDir: string, options: ProjectBuildOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('buildProject');
    if (!dirExists(projectDir)) {
      return this.fail(`Project directory not found: ${projectDir}`);
    }

    const hasStack = fileExists(path.join(projectDir, 'stack.yaml'));
    const hasCabal = fileExists(path.join(projectDir, 'project-name.cabal')) ||
      fileExists(path.join(projectDir, '*.cabal'));

    if (hasStack && whichSync('stack')) {
      const args = ['build', ...(options.extraArgs || [])];
      const result = await runCommand('stack', args, {
        cwd: projectDir,
        env: options.env,
        timeoutMs: options.timeoutMs || 600_000,
      });
      result.artifacts = [path.join(projectDir, '.stack-work')];
      return result;
    }

    if (hasCabal && whichSync('cabal')) {
      const args = ['build', ...(options.extraArgs || [])];
      const result = await runCommand('cabal', args, {
        cwd: projectDir,
        env: options.env,
        timeoutMs: options.timeoutMs || 600_000,
      });
      result.artifacts = [path.join(projectDir, 'dist-newstyle')];
      return result;
    }

    return this.fail('No stack.yaml or .cabal file found (or tools missing)');
  }

  async detectProject(projectDir: string): Promise<ProjectInfo | null> {
    const hasStack = fileExists(path.join(projectDir, 'stack.yaml'));
    let hasCabal = false;
    try {
      hasCabal = fs
        .readdirSync(projectDir)
        .some((f) => f.endsWith('.cabal'));
    } catch {
      return null;
    }
    if (!hasStack && !hasCabal) return null;

    // Gather framework hints from any .cabal file (stack projects have one too)
    const frameworks: string[] = [];
    let cabalContent = '';
    try {
      const cabalFile = fs
        .readdirSync(projectDir)
        .find((f) => f.endsWith('.cabal'));
      if (cabalFile) cabalContent = readTextFile(path.join(projectDir, cabalFile)) || '';
    } catch {
      cabalContent = '';
    }

    for (const hint of Object.keys(HASKELL_FRAMEWORK_HINTS)) {
      if (cabalContent.includes(hint)) {
        const fw = HASKELL_FRAMEWORK_HINTS[hint];
        if (!frameworks.includes(fw)) frameworks.push(fw);
      }
    }

    return {
      root: projectDir,
      ecosystem: 'haskell',
      buildSystem: hasStack ? 'stack' : 'cabal',
      frameworks,
      entryPoints: ['app/Main.hs', 'src'],
      markers: hasStack ? ['stack.yaml'] : ['*.cabal'],
      confidence: 1,
    };
  }

  private unavailable(operation: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr:
        `ghc/runghc not found on PATH; cannot ${operation} Haskell natively. ` +
        `Install ghcup (https://www.haskell.org/ghcup/) to enable native execution. ` +
        `The engine will fall back to transpilation.`,
      exitCode: null,
      durationMs: 0,
      command: `ghc ${operation}`,
      artifacts: [],
      toolchain: 'haskell',
    };
  }

  private fail(message: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0,
      command: 'haskell',
      artifacts: [],
      toolchain: 'haskell',
    };
  }
}

export function createHaskellToolchain(): HaskellToolchain {
  return new HaskellToolchain();
}
