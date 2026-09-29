/**
 * Universal Transpiler - Rust Toolchain
 *
 * Wraps rustc / cargo. Handles:
 * - single-file compile+run (rustc)
 * - cargo projects (build/test/run)
 * - wasm targets (wasm32-unknown-unknown, wasm-bindgen, wasm-pack)
 * - frameworks: actix, axum, tokio, rocket, bevy, serde ecosystems
 */

import * as path from 'path';
import type {
  CompileOptions,
  ExecResult,
  ProjectBuildOptions,
  ProjectInfo,
  RunOptions,
  Toolchain,
  ToolchainContextOptions,
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
import { ensureToolchainExecution, runInDocker, TOOLCHAIN_IMAGES } from '../docker';

const RUST_FRAMEWORK_HINTS: Record<string, string> = {
  'actix-web': 'actix',
  'actix': 'actix',
  'axum': 'axum',
  'rocket': 'rocket',
  'tokio': 'tokio',
  'warp': 'warp',
  'bevy': 'bevy',
  'serde': 'serde',
  'clap': 'clap',
  'wasm-bindgen': 'wasm-bindgen',
  'tauri': 'tauri',
  'iced': 'iced',
  'egui': 'egui',
};

export class RustToolchain implements Toolchain {
  /** rustc found on the host PATH (false when running via docker) */
  private nativeAvailable = false;

  info: ToolchainInfo = {
    id: 'rust',
    name: 'Rust (rustc/cargo)',
    languages: ['rust'],
    binaries: ['rustc'],
    versions: {},
    available: false,
    extensions: ['.rs'],
    frameworks: Object.keys(RUST_FRAMEWORK_HINTS),
  };

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let rustcPath: string | null = null;

    for (const bin of ['rustc', 'cargo', 'wasm-pack']) {
      const found = whichSync(bin);
      if (found) {
        versions[bin] = probeVersion(bin) || found;
        if (bin === 'rustc') rustcPath = found;
      }
    }

    this.nativeAvailable = rustcPath !== null;

    // Docker fallback: when rustc is missing on the host, a container
    // image can provide it.
    if (!this.nativeAvailable) {
      const resolved = await ensureToolchainExecution('rust', false);
      if (resolved.mode === 'docker' && resolved.image) {
        versions['docker-fallback'] = resolved.image;
      }
    }

    this.info.versions = versions;
    this.info.available = this.nativeAvailable || !!versions['docker-fallback'];
    return this.info;
  }

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    const workDir = options.workDir || makeTempDir('rust');

    // Docker fallback: compile inside the rust image. The container sees the
    // work directory mounted at /work, so all paths in the command are
    // /work-relative; artifacts are reported with their host paths.
    if (!this.nativeAvailable) {
      if (!this.info.available) return this.unavailable('compile', options);
      const entryFile = options.entryFile || 'main.rs';
      writeSourceFile(workDir, entryFile, source);
      const platform = options.platform || 'native';
      const target = platform === 'wasm' ? 'wasm32-unknown-unknown' : platform === 'wasi' ? 'wasm32-wasi' : null;
      const outName = 'program';
      const compileCmd = `rustc ${entryFile} -o ${outName} ${target ? `--target ${target}` : ''} ${options.release ? '-O' : ''}`.replace(/\s+/g, ' ');
      const result = await runInDocker(
        this.info.versions['docker-fallback'],
        ['bash', '-c', compileCmd],
        { workDir, timeoutMs: options.timeoutMs || 180_000, env: options.env }
      );
      const hostArtifact = path.join(workDir, outName);
      result.artifacts = fileExists(hostArtifact) ? [hostArtifact] : [];
      return result;
    }

    const entryFile = options.entryFile || 'main.rs';
    const filePath = writeSourceFile(workDir, entryFile, source);
    const outPath = options.outputPath || path.join(workDir, 'program');

    const platform = options.platform || 'native';
    let targetArgs: string[] = [];
    if (platform === 'wasm' || platform === 'wasi') {
      targetArgs = ['--target', platform === 'wasm' ? 'wasm32-unknown-unknown' : 'wasm32-wasi'];
    }

    const args = [
      filePath,
      '-o',
      outPath,
      ...targetArgs,
      ...(options.release ? ['-O'] : []),
      ...(options.extraArgs || []),
    ];

    const result = await runCommand('rustc', args, {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 60_000,
    });

    result.artifacts = fileExists(outPath) ? [outPath] : [];
    return result;
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    const workDir = options.workDir || makeTempDir('rust');

    // Docker fallback: compile and execute inside the rust image
    if (!this.nativeAvailable) {
      if (!this.info.available) return this.unavailable('run', options);
      const entryFile = options.entryFile || 'main.rs';
      writeSourceFile(workDir, entryFile, source);
      const cmd = `rustc ${entryFile} -o program && ./program ${(options.args || []).join(' ')}`.trim();
      return runInDocker(
        this.info.versions['docker-fallback'],
        ['bash', '-c', cmd],
        { workDir, timeoutMs: options.timeoutMs || 180_000, env: options.env, stdin: options.stdin }
      );
    }

    const filePath = writeSourceFile(workDir, options.entryFile || 'main.rs', source);
    const binPath = path.join(workDir, 'program');

    // Compile first
    const compileResult = await runCommand('rustc', [filePath, '-o', binPath], {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 60_000,
    });
    if (!compileResult.ok) {
      return compileResult;
    }

    // Execute
    return runCommand(binPath, options.args || [], {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 30_000,
      stdin: options.stdin,
    });
  }

  async buildProject(projectDir: string, options: ProjectBuildOptions = {}): Promise<ExecResult> {
    if (!this.info.available) {
      return this.unavailable('buildProject', options);
    }
    if (!dirExists(projectDir)) {
      return this.fail(`Project directory not found: ${projectDir}`);
    }

    const hasCargo = fileExists(path.join(projectDir, 'Cargo.toml'));
    if (!hasCargo) {
      return this.fail('No Cargo.toml found; not a cargo project');
    }

    const isCargo = !!whichSync('cargo');
    const platform = options.platform || 'native';
    const args = ['build', ...(options.release ? ['--release'] : [])];

    if (platform === 'wasm' || platform === 'wasi') {
      const target = options.buildTarget || (platform === 'wasm' ? 'wasm32-unknown-unknown' : 'wasm32-wasi');
      args.push('--target', target);
    }
    if (options.buildTarget && platform !== 'wasm' && platform !== 'wasi') {
      args.push('--target', options.buildTarget);
    }
    args.push(...(options.extraArgs || []));

    const command = isCargo ? 'cargo' : 'rustc';
    if (!isCargo) {
      return this.fail('cargo not available; cannot build cargo project with rustc alone');
    }

    const result = await runCommand(command, args, {
      cwd: projectDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 300_000,
    });
    result.artifacts = [path.join(projectDir, 'target')];
    return result;
  }

  async detectProject(projectDir: string): Promise<ProjectInfo | null> {
    const cargoToml = path.join(projectDir, 'Cargo.toml');
    if (!fileExists(cargoToml)) return null;

    const content = readTextFile(cargoToml) || '';
    const frameworks: string[] = [];
    for (const hint of Object.keys(RUST_FRAMEWORK_HINTS)) {
      if (content.includes(hint)) {
        frameworks.push(RUST_FRAMEWORK_HINTS[hint]);
      }
    }

    // Scan src/ for use statements
    const srcDir = path.join(projectDir, 'src');
    if (dirExists(srcDir)) {
      const srcMain = readTextFile(path.join(srcDir, 'main.rs')) || '';
      const srcLib = readTextFile(path.join(srcDir, 'lib.rs')) || '';
      const combined = `${srcMain}\n${srcLib}`;
      for (const hint of Object.keys(RUST_FRAMEWORK_HINTS)) {
        if (combined.includes(hint) && !frameworks.includes(RUST_FRAMEWORK_HINTS[hint])) {
          frameworks.push(RUST_FRAMEWORK_HINTS[hint]);
        }
      }
    }

    const entryPoints: string[] = [];
    for (const candidate of ['src/main.rs', 'src/lib.rs']) {
      if (fileExists(path.join(projectDir, candidate))) entryPoints.push(candidate);
    }

    return {
      root: projectDir,
      ecosystem: 'rust',
      buildSystem: 'cargo',
      frameworks,
      entryPoints,
      markers: ['Cargo.toml'],
      confidence: 1,
    };
  }

  private unavailable(operation: string, _options: ToolchainContextOptions = {}): ExecResult {
    const image = TOOLCHAIN_IMAGES['rust'];
    return {
      ok: false,
      stdout: '',
      stderr:
        `rustc not found on PATH and docker fallback unavailable (image ${image} not pullable); ` +
        `cannot ${operation} Rust. Install rust via https://rustup.rs, start docker, or rely ` +
        `on structural transpilation.`,
      exitCode: null,
      durationMs: 0,
      command: `rustc ${operation}`,
      artifacts: [],
      toolchain: 'rust',
    };
  }

  private fail(message: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0,
      command: 'rust',
      artifacts: [],
      toolchain: 'rust',
    };
  }
}

export function createRustToolchain(): RustToolchain {
  return new RustToolchain();
}
