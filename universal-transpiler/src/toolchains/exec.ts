/**
 * Universal Transpiler - Toolchain Process Helpers
 *
 * Thin helpers over child_process used by every native toolchain wrapper.
 */

import { spawn, spawnSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ExecResult } from './types';

/** Find a binary on PATH (returns full path or null). */
export function whichSync(binary: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'command';
    const flag = process.platform === 'win32' ? '' : '-v';
    const out = execSync(`${cmd} ${flag} ${binary}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.trim().split('\n')[0];
    return first || null;
  } catch {
    return null;
  }
}

/** Probe a binary's version string (best-effort). */
export function probeVersion(binary: string): string | null {
  const candidates = ['--version', '-version'];
  for (const flag of candidates) {
    try {
      const res = spawnSync(binary, [flag], { encoding: 'utf8', timeout: 5000 });
      const out = ((res.stdout || '') + (res.stderr || '')).trim();
      if (res.status === 0 && out) {
        const line = out.split('\n')[0];
        return line.slice(0, 120);
      }
    } catch {
      // keep trying
    }
  }
  return null;
}

/** Create a fresh temp working directory. */
export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `univ-${prefix}-`));
}

/** Write a file (creating parent dirs as needed) and return its path. */
export function writeSourceFile(dir: string, filename: string, content: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
}

/** Spawn a toolchain command asynchronously, returning a unified ExecResult. */
export async function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<ExecResult> {
  const startTime = Date.now();
  return new Promise<ExecResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : null;

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr: `${stderr}${err.message}`,
        exitCode: null,
        durationMs: Date.now() - startTime,
        command: `${command} ${args.join(' ')}`,
        artifacts: [],
        toolchain: command,
      });
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr: timedOut ? `${stderr}\n[timeout after ${options.timeoutMs}ms]` : stderr,
        exitCode: code,
        durationMs: Date.now() - startTime,
        command: `${command} ${args.join(' ')}`,
        artifacts: [],
        toolchain: command,
      });
    });
  });
}

/** Check whether a path exists and is a file. */
export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Check whether a directory exists. */
export function dirExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** Read a file's text, or null. */
export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}
