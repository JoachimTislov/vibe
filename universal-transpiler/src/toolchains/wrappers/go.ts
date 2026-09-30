/**
 * Universal Transpiler - Go Toolchain
 *
 * Wraps the go tool. Handles:
 * - single-file run (go run)
 * - module builds (go build), cross compilation via GOOS/GOARCH
 * - wasm targets (GOOS=js GOARCH=wasm)
 * - frameworks: gin, echo, fiber, chi, cobra, k8s operators
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
  dirExists,
  fileExists,
  makeTempDir,
  probeVersion,
  readTextFile,
  runCommand,
  whichSync,
  writeSourceFile,
} from '../exec';

const GO_FRAMEWORK_HINTS: Record<string, string> = {
  'github.com/gin-gonic/gin': 'gin',
  'github.com/labstack/echo': 'echo',
  'github.com/gofiber/fiber': 'fiber',
  'github.com/go-chi/chi': 'chi',
  'github.com/spf13/cobra': 'cobra',
  'k8s.io/apimachinery': 'kubernetes',
  'k8s.io/client-go': 'kubernetes',
  'gorm.io/gorm': 'gorm',
  'github.com/stretchr/testify': 'testify',
  'go.uber.org/zap': 'zap',
  'net/http': 'stdlib-http',
};

const GOOS_BY_PLATFORM: Record<string, { GOOS?: string; GOARCH?: string }> = {
  native: {},
  wasm: { GOOS: 'js', GOARCH: 'wasm' },
  wasi: { GOOS: 'wasip1', GOARCH: 'wasm' },
  // cross-compile examples
  windows: { GOOS: 'windows' },
  darwin: { GOOS: 'darwin' },
};

export class GoToolchain implements Toolchain {
  info: ToolchainInfo = {
    id: 'go',
    name: 'Go (go tool)',
    languages: ['go'],
    binaries: ['go'],
    versions: {},
    available: false,
    extensions: ['.go'],
    frameworks: Object.values(GO_FRAMEWORK_HINTS),
  };

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let found = false;
    for (const bin of ['go']) {
      if (whichSync(bin)) {
        versions[bin] = probeVersion(bin) || 'go';
        found = true;
      }
    }
    this.info.versions = versions;
    this.info.available = found;
    return this.info;
  }

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('compile');

    const workDir = options.workDir || makeTempDir('go');
    writeSourceFile(workDir, 'go.mod', 'module transpiled\n\ngo 1.21\n');
    const entryFile = options.entryFile || 'main.go';
    const filePath = writeSourceFile(workDir, entryFile, source);
    let outPath = options.outputPath || path.join(workDir, 'program');

    const platform = options.platform || 'native';
    if ((platform === 'wasm' || platform === 'wasi') && !outPath.endsWith('.wasm')) {
      outPath = `${outPath}.wasm`;
    }
    const env = this.platformEnv(platform, options.env);
    const args = ['build', '-o', outPath, ...(options.extraArgs || []), filePath];

    const result = await runCommand('go', args, {
      cwd: workDir,
      env,
      timeoutMs: options.timeoutMs || 120_000,
    });
    result.artifacts = fileExists(outPath) ? [outPath] : [];
    return result;
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('run');

    const workDir = options.workDir || makeTempDir('go');
    writeSourceFile(workDir, 'go.mod', 'module transpiled\n\ngo 1.21\n');
    const entryFile = options.entryFile || 'main.go';
    const filePath = writeSourceFile(workDir, entryFile, source);

    return runCommand('go', ['run', ...(options.extraArgs || []), filePath], {
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
    if (!fileExists(path.join(projectDir, 'go.mod'))) {
      return this.fail('No go.mod found; not a go module');
    }

    const env = this.platformEnv(options.platform || 'native', options.env);
    const args = ['build', ...(options.release ? ['-ldflags', '-s -w'] : [])];
    if (options.buildTarget) {
      // allow GOOS/GOARCH override via buildTarget like "windows/amd64"
      const [goos, goarch] = options.buildTarget.split('/');
      if (goos) env.GOOS = goos;
      if (goarch) env.GOARCH = goarch;
    }
    args.push(...(options.extraArgs || []));

    const result = await runCommand('go', args, {
      cwd: projectDir,
      env,
      timeoutMs: options.timeoutMs || 300_000,
    });
    result.artifacts = [path.join(projectDir)];
    return result;
  }

  async detectProject(projectDir: string): Promise<ProjectInfo | null> {
    const goMod = path.join(projectDir, 'go.mod');
    if (!fileExists(goMod)) return null;

    const content = readTextFile(goMod) || '';
    const frameworks: string[] = [];
    for (const hint of Object.keys(GO_FRAMEWORK_HINTS)) {
      if (content.includes(hint)) frameworks.push(GO_FRAMEWORK_HINTS[hint]);
    }

    const entryPoints: string[] = [];
    for (const candidate of ['main.go', 'cmd/main.go']) {
      if (fileExists(path.join(projectDir, candidate))) entryPoints.push(candidate);
    }

    return {
      root: projectDir,
      ecosystem: 'go',
      buildSystem: 'go-mod',
      frameworks,
      entryPoints,
      markers: ['go.mod'],
      confidence: 1,
    };
  }

  private platformEnv(platform: string, extra?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...(extra || {}) };
    const cfg = GOOS_BY_PLATFORM[platform];
    if (cfg) {
      if (cfg.GOOS) env.GOOS = cfg.GOOS;
      if (cfg.GOARCH) env.GOARCH = cfg.GOARCH;
    }
    return env;
  }

  private unavailable(operation: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: `go tool not found on PATH; cannot ${operation} Go natively.`,
      exitCode: null,
      durationMs: 0,
      command: `go ${operation}`,
      artifacts: [],
      toolchain: 'go',
    };
  }

  private fail(message: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0,
      command: 'go',
      artifacts: [],
      toolchain: 'go',
    };
  }
}

export function createGoToolchain(): GoToolchain {
  return new GoToolchain();
}
