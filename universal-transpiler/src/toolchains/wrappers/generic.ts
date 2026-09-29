/**
 * Universal Transpiler - Generic Toolchains
 *
 * Wrappers for remaining ecosystems: Python, C/C++, C#, shell.
 * These share a simple pattern: interpret via runtime or compile via compiler.
 */

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
  makeTempDir,
  probeVersion,
  runCommand,
  whichSync,
  writeSourceFile,
} from '../exec';

/** Generic runtime-interpreted language (python3, ruby, php, perl...). */
export class GenericInterpreterToolchain implements Toolchain {
  info: ToolchainInfo;

  constructor(
    id: string,
    name: string,
    language: string,
    binary: string,
    extension: string,
    runArgs: string[] = []
  ) {
    this.info = {
      id,
      name,
      languages: [language],
      binaries: [binary],
      versions: {},
      available: false,
      extensions: [extension],
      frameworks: [],
    }
    ;(this as any)._runArgs = runArgs;
  }

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let found = false;
    for (const bin of this.info.binaries) {
      if (whichSync(bin)) {
        versions[bin] = probeVersion(bin) || bin;
        found = true;
      }
    }
    this.info.versions = versions;
    this.info.available = found;
    return this.info;
  }

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    // Interpreted languages have no separate compile step; write the file out
    const workDir = options.workDir || makeTempDir(this.info.id);
    const entryFile = options.entryFile || `main${this.info.extensions[0]}`;
    const filePath = writeSourceFile(workDir, entryFile, source);
    return {
      ok: true,
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 0,
      command: `write ${filePath}`,
      artifacts: [filePath],
      toolchain: this.info.id,
    };
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('run');
    const workDir = options.workDir || makeTempDir(this.info.id);
    const entryFile = options.entryFile || `main${this.info.extensions[0]}`;
    const filePath = writeSourceFile(workDir, entryFile, source);
    const runArgs: string[] = (this as any)._runArgs || [];

    return runCommand(this.info.binaries[0], [...runArgs, filePath, ...(options.args || [])], {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 60_000,
      stdin: options.stdin,
    });
  }

  async buildProject(_projectDir: string, _options: ProjectBuildOptions = {}): Promise<ExecResult> {
    return this.fail(`Project builds not supported for ${this.info.id}`);
  }

  async detectProject(_projectDir: string): Promise<ProjectInfo | null> {
    return null;
  }

  private unavailable(operation: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: `${this.info.binaries[0]} not found on PATH; cannot ${operation} ${this.info.name}.`,
      exitCode: null,
      durationMs: 0,
      command: `${this.info.binaries[0]} ${operation}`,
      artifacts: [],
      toolchain: this.info.id,
    };
  }

  private fail(message: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0,
      command: this.info.id,
      artifacts: [],
      toolchain: this.info.id,
    };
  }
}

/** C/C++ via gcc/clang. */
export class NativeCToolchain implements Toolchain {
  info: ToolchainInfo = {
    id: 'native-c',
    name: 'C/C++ (gcc/clang)',
    languages: ['c', 'cpp', 'c++'],
    binaries: ['gcc'],
    versions: {},
    available: false,
    extensions: ['.c', '.cpp', '.cc', '.cxx'],
    frameworks: [],
  };

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let found = false;
    for (const bin of ['gcc', 'clang', 'g++', 'clang++']) {
      if (whichSync(bin)) {
        versions[bin] = probeVersion(bin) || bin;
        if (bin === 'gcc') found = true;
      }
    }
    this.info.versions = versions;
    this.info.available = found;
    return this.info;
  }

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('compile');
    const workDir = options.workDir || makeTempDir('c');
    const isCpp = options.entryFile?.endsWith('.cpp') || false;
    const entryFile = options.entryFile || 'main.c';
    const filePath = writeSourceFile(workDir, entryFile, source);
    const outPath = options.outputPath || path.join(workDir, 'program');
    const compiler = isCpp ? (whichSync('g++') ? 'g++' : 'clang++') : 'gcc';

    const result = await runCommand(
      compiler,
      [filePath, '-o', outPath, ...(options.release ? ['-O2'] : []), ...(options.extraArgs || [])],
      { cwd: workDir, env: options.env, timeoutMs: options.timeoutMs || 120_000 }
    );
    result.artifacts = [outPath];
    return result;
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('run');
    const workDir = options.workDir || makeTempDir('c');
    const entryFile = options.entryFile || 'main.c';
    const filePath = writeSourceFile(workDir, entryFile, source);
    const outPath = path.join(workDir, 'program');
    const isCpp = entryFile.endsWith('.cpp');
    const compiler = isCpp ? (whichSync('g++') ? 'g++' : 'clang++') : 'gcc';

    const compileResult = await runCommand(compiler, [filePath, '-o', outPath], {
      cwd: workDir, env: options.env, timeoutMs: options.timeoutMs || 120_000,
    });
    if (!compileResult.ok) return compileResult;

    return runCommand(outPath, options.args || [], {
      cwd: workDir, env: options.env, timeoutMs: options.timeoutMs || 60_000, stdin: options.stdin,
    });
  }

  async buildProject(_projectDir: string, _options: ProjectBuildOptions = {}): Promise<ExecResult> {
    return this.fail('Project builds require make/cmake; not yet wrapped');
  }

  async detectProject(_projectDir: string): Promise<ProjectInfo | null> {
    return null;
  }

  private unavailable(operation: string): ExecResult {
    return {
      ok: false, stdout: '', stderr: `gcc not found on PATH; cannot ${operation} C natively.`,
      exitCode: null, durationMs: 0, command: `gcc ${operation}`, artifacts: [], toolchain: 'native-c',
    };
  }

  private fail(message: string): ExecResult {
    return { ok: false, stdout: '', stderr: message, exitCode: 1, durationMs: 0, command: 'native-c', artifacts: [], toolchain: 'native-c' };
  }
}

export function createPythonToolchain(): GenericInterpreterToolchain {
  return new GenericInterpreterToolchain('python', 'Python (python3)', 'python', 'python3', '.py');
}

export function createCToolchain(): NativeCToolchain {
  return new NativeCToolchain();
}

export function createRubyToolchain(): GenericInterpreterToolchain {
  return new GenericInterpreterToolchain('ruby', 'Ruby (ruby)', 'ruby', 'ruby', '.rb');
}

export function createPhpToolchain(): GenericInterpreterToolchain {
  return new GenericInterpreterToolchain('php', 'PHP (php)', 'php', 'php', '.php');
}
