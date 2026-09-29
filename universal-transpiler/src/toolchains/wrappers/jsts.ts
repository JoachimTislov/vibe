/**
 * Universal Transpiler - JavaScript/TypeScript Toolchain
 *
 * Wraps node / deno / tsc / npm. Handles:
 * - run JS directly (node), run TS via transpile-then-run
 * - native TS->JS transpilation via the bundled typescript compiler API
 * - npm project builds (npm run build)
 * - frameworks: react, next, vue, svelte, angular, express, nest, astro...
 */

import * as path from 'path';
import * as ts from 'typescript';
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

const JS_FRAMEWORK_HINTS: Record<string, string> = {
  'react': 'react',
  'react-dom': 'react',
  'next': 'next.js',
  'vue': 'vue',
  'svelte': 'svelte',
  '@angular/core': 'angular',
  'express': 'express',
  '@nestjs/core': 'nestjs',
  'fastify': 'fastify',
  'astro': 'astro',
  'remix': 'remix',
  'gatsby': 'gatsby',
  '@vue/server-renderer': 'vue',
  'solid-js': 'solid',
  'preact': 'preact',
  'vite': 'vite',
  'webpack': 'webpack',
  'jest': 'jest',
  'mocha': 'mocha',
  'tailwindcss': 'tailwind',
};

export class JsTsToolchain implements Toolchain {
  info: ToolchainInfo = {
    id: 'jsts',
    name: 'JavaScript/TypeScript (node/deno/tsc)',
    languages: ['javascript', 'typescript', 'jsx', 'tsx', 'json'],
    binaries: ['node'],
    versions: {},
    available: false,
    extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'],
    frameworks: Object.values(JS_FRAMEWORK_HINTS),
  };

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let found = false;
    for (const bin of ['node', 'deno', 'npm', 'npx']) {
      if (whichSync(bin)) {
        versions[bin] = probeVersion(bin) || bin;
        if (bin === 'node') found = true;
      }
    }
    // tsc is bundled as a library dependency - always usable for transpilation
    versions['typescript-api'] = ts.version;
    this.info.versions = versions;
    this.info.available = found;
    return this.info;
  }

  // ==========================================================================
  // Native transpilation: TS/JSX -> JS via the typescript compiler API
  // ==========================================================================

  async nativeTranspile(
    source: string,
    from: string,
    to: string,
    _options: ToolchainContextOptions = {}
  ): Promise<{ code: string; toolchain: string } | null> {
    const normFrom = from.toLowerCase();
    const normTo = to.toLowerCase();

    // TypeScript family -> JavaScript
    if (
      ['typescript', 'ts', 'tsx'].includes(normFrom) &&
      ['javascript', 'js'].includes(normTo)
    ) {
      const jsx = normFrom === 'tsx' ? ts.JsxEmit.React : ts.JsxEmit.Preserve;
      const result = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          jsx,
          esModuleInterop: true,
        },
        fileName: normFrom === 'tsx' ? 'file.tsx' : 'file.ts',
      });
      return { code: result.outputText, toolchain: 'typescript-api' };
    }

    // JSX -> plain JS (strip JSX, keep functions)
    if (['jsx', 'javascript-jsx'].includes(normFrom) && ['javascript', 'js'].includes(normTo)) {
      const result = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
        },
        fileName: 'file.jsx',
      });
      return { code: result.outputText, toolchain: 'typescript-api' };
    }

    // ESM <-> CJS module conversion for JS
    if (normFrom === 'javascript' && normTo === 'commonjs') {
      const result = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
        },
        fileName: 'file.js',
      });
      return { code: result.outputText, toolchain: 'typescript-api' };
    }

    // ES version downleveling (js -> es5/es2015...)
    if (normFrom === 'javascript' && /^es(5|2015|2016|2017|2018|2019|2020|2021|2022)$/.test(normTo)) {
      const targetMap: Record<string, ts.ScriptTarget> = {
        es5: ts.ScriptTarget.ES5,
        es2015: ts.ScriptTarget.ES2015,
        es2016: ts.ScriptTarget.ES2016,
        es2017: ts.ScriptTarget.ES2017,
        es2018: ts.ScriptTarget.ES2018,
        es2019: ts.ScriptTarget.ES2019,
        es2020: ts.ScriptTarget.ES2020,
        es2021: ts.ScriptTarget.ES2021,
        es2022: ts.ScriptTarget.ES2022,
      };
      const result = ts.transpileModule(source, {
        compilerOptions: {
          target: targetMap[normTo] || ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
        },
        fileName: 'file.js',
      });
      return { code: result.outputText, toolchain: 'typescript-api' };
    }

    return null;
  }

  // ==========================================================================
  // Compile / Run
  // ==========================================================================

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('compile');

    const workDir = options.workDir || makeTempDir('jsts');
    const platform = options.platform || 'node';
    const isTS = options.entryFile?.endsWith('.ts') || options.entryFile?.endsWith('.tsx');

    if (platform === 'browser' || platform === 'node') {
      // Bundle-like output: transpile to JS (no module bundler assumed)
      const transpiled = await this.nativeTranspile(
        source,
        isTS ? 'typescript' : 'javascript',
        'javascript',
        options
      );
      const code = transpiled?.code || source;
      const outPath = options.outputPath || path.join(workDir, 'bundle.js');
      writeSourceFile(workDir, path.basename(outPath), code);
      const result = await this.succeed(workDir, 'tsc-transpile');
      result.artifacts = [outPath];
      return result;
    }

    // node/bun/deno: just write and declare success (script languages)
    const entryFile = options.entryFile || 'main.js';
    const filePath = writeSourceFile(workDir, entryFile, source);
    const result = await this.succeed(workDir, 'jsts-script');
    result.artifacts = [filePath];
    return result;
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('run');

    const workDir = options.workDir || makeTempDir('jsts');
    const entryFile = options.entryFile || 'main.ts';

    const isTypeScript = /\.(ts|tsx)$/.test(entryFile) || !options.entryFile;
    let filePath: string;

    if (isTypeScript) {
      // Deno runs TS natively
      if (whichSync('deno') && (options.platform === 'deno' || !this.info.versions['node'])) {
        filePath = writeSourceFile(workDir, 'main.ts', source);
        return runCommand('deno', ['run', filePath, ...(options.args || [])], {
          cwd: workDir,
          env: options.env,
          timeoutMs: options.timeoutMs || 60_000,
          stdin: options.stdin,
        });
      }
      // Transpile TS -> JS, then run with node
      const transpiled = await this.nativeTranspile(source, 'typescript', 'javascript', options);
      const jsCode = transpiled?.code || source;
      filePath = writeSourceFile(workDir, 'main.js', jsCode);
    } else {
      filePath = writeSourceFile(workDir, entryFile, source);
    }

    return runCommand('node', [filePath, ...(options.args || [])], {
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
    const pkgPath = path.join(projectDir, 'package.json');
    if (!fileExists(pkgPath)) {
      return this.fail('No package.json found; not a node project');
    }

    const pkg = JSON.parse(readTextFile(pkgPath) || '{}');
    const hasBuild = pkg.scripts && typeof pkg.scripts.build === 'string';
    if (!hasBuild) {
      return this.fail('package.json has no "build" script');
    }

    const npmCmd = whichSync('npm') ? 'npm' : whichSync('yarn') ? 'yarn' : null;
    if (!npmCmd) return this.fail('No npm/yarn on PATH');

    const result = await runCommand(npmCmd, ['run', 'build', ...(options.extraArgs || [])], {
      cwd: projectDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 300_000,
    });
    result.artifacts = [path.join(projectDir, 'dist'), path.join(projectDir, 'build')];
    return result;
  }

  async detectProject(projectDir: string): Promise<ProjectInfo | null> {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!fileExists(pkgPath)) return null;

    const pkg = JSON.parse(readTextFile(pkgPath) || '{}');
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    const frameworks: string[] = [];
    for (const depName of Object.keys(deps)) {
      const base = depName.startsWith('@') ? depName : depName.split('/')[0];
      if (JS_FRAMEWORK_HINTS[base]) frameworks.push(JS_FRAMEWORK_HINTS[base]);
    }

    const entryPoints: string[] = [];
    for (const candidate of ['src/index.ts', 'src/index.tsx', 'src/main.ts', 'src/main.tsx', 'index.js', 'src/App.tsx']) {
      if (fileExists(path.join(projectDir, candidate))) entryPoints.push(candidate);
    }

    return {
      root: projectDir,
      ecosystem: 'node',
      buildSystem: 'npm',
      frameworks,
      entryPoints,
      markers: ['package.json'],
      confidence: 1,
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async succeed(_workDir: string, via: string): Promise<ExecResult> {
    return {
      ok: true,
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 0,
      command: via,
      artifacts: [],
      toolchain: 'jsts',
    };
  }

  private unavailable(operation: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: `node not found on PATH; cannot ${operation} JS/TS natively.`,
      exitCode: null,
      durationMs: 0,
      command: `node ${operation}`,
      artifacts: [],
      toolchain: 'jsts',
    };
  }

  private fail(message: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0,
      command: 'jsts',
      artifacts: [],
      toolchain: 'jsts',
    };
  }
}

export function createJsTsToolchain(): JsTsToolchain {
  return new JsTsToolchain();
}
