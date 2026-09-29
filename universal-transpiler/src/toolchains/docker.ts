/**
 * Universal Transpiler - Docker Toolchain Fallback
 *
 * Runs missing native binaries inside Docker containers. When a toolchain
 * (rustc, ghc, ...) is not installed on the host, the wrappers mount a temp
 * work directory into a container image that ships the toolchain and
 * execute there — transparently, behind the same Toolchain interface.
 */

import type { ExecResult } from './types';
import { runCommand, whichSync } from './exec';

/** Canonical image for each toolchain id (slim variants: smaller pull). */
export const TOOLCHAIN_IMAGES: Record<string, string> = {
  rust: 'rust:1-slim',
  haskell: 'haskell:9-slim',
  java: 'openjdk:21-slim',
  go: 'golang:1',
  python: 'python:3-slim',
  'native-c': 'gcc:13',
  ruby: 'ruby:3-slim',
  php: 'php:8-cli',
  jsts: 'node:20-slim',
};

export interface DockerProbeResult {
  /** docker CLI on PATH and daemon reachable */
  available: boolean;
  version: string | null;
  /** Which toolchain images are already present locally */
  localImages: string[];
}

let dockerProbeCache: DockerProbeResult | null = null;

/** Probe the docker daemon (cached per process). */
export async function probeDocker(): Promise<DockerProbeResult> {
  if (dockerProbeCache) return dockerProbeCache;

  const result: DockerProbeResult = { available: false, version: null, localImages: [] };
  if (!whichSync('docker')) {
    dockerProbeCache = result;
    return result;
  }

  const versionRes = await runCommand('docker', ['version', '--format', '{{.Server.Version}}'], {
    timeoutMs: 15_000,
  });
  if (!versionRes.ok) {
    dockerProbeCache = result;
    return result;
  }
  result.available = true;
  result.version = versionRes.stdout.trim();

  const imagesRes = await runCommand('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}'], {
    timeoutMs: 15_000,
  });
  if (imagesRes.ok) {
    result.localImages = imagesRes.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  dockerProbeCache = result;
  return result;
}

/** Whether an image is present locally. */
export async function dockerImageExists(image: string): Promise<boolean> {
  const probe = await probeDocker();
  if (!probe.available) return false;
  return probe.localImages.includes(image);
}

/** Pull an image (no-op when already present). Returns success. */
export async function pullImage(image: string, timeoutMs = 600_000): Promise<boolean> {
  if (await dockerImageExists(image)) return true;
  const res = await runCommand('docker', ['pull', image], { timeoutMs });
  if (res.ok) {
    // refresh the cache
    dockerProbeCache = null;
    await probeDocker();
    return true;
  }
  return false;
}

export interface DockerRunOptions {
  /** Host directory mounted at /work inside the container */
  workDir: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
}

/**
 * Run a command inside a container with the work directory mounted.
 * The container is removed after execution (--rm).
 */
export async function runInDocker(
  image: string,
  command: string[],
  options: DockerRunOptions
): Promise<ExecResult> {
  const args = [
    'run',
    '--rm',
    '-v', `${options.workDir}:/work`,
    '-w', '/work',
    ...Object.entries(options.env || {}).map(([k, v]) => ['--env', `${k}=${v}`]).flat(),
    image,
    ...command,
  ];

  const result = await runCommand('docker', args, {
    cwd: options.workDir,
    timeoutMs: options.timeoutMs || 120_000,
    stdin: options.stdin,
  });
  result.command = `docker run ${image} ${command.join(' ')}`;
  result.toolchain = `docker:${image}`;
  return result;
}

/**
 * Resolve how a toolchain will execute. Native binaries always win; the
 * docker fallback engages only when the host binary is missing and a
 * providing image exists (pulling it on first use).
 */
export async function ensureToolchainExecution(
  toolchainId: string,
  nativeAvailable: boolean
): Promise<{ mode: 'native' | 'docker' | 'unavailable'; image?: string }> {
  if (nativeAvailable) return { mode: 'native' };

  const image = TOOLCHAIN_IMAGES[toolchainId];
  const probe = await probeDocker();
  if (!probe.available || !image) return { mode: 'unavailable' };

  if (await dockerImageExists(image)) return { mode: 'docker', image };
  if (await pullImage(image)) return { mode: 'docker', image };
  return { mode: 'unavailable' };
}
