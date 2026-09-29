/**
 * Universal Transpiler - Java Toolchain
 *
 * Wraps javac / java (and gradle/maven when present). Handles:
 * - single-source run (java 11+ single-file mode: `java Main.java`)
 * - compile to .class / jar (jvm platform)
 * - maven/gradle project builds
 * - frameworks: spring-boot, quarkus, micronaut, jakarta, junit
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

const JAVA_FRAMEWORK_HINTS: Record<string, string> = {
  'org.springframework.boot': 'spring-boot',
  'spring-boot-starter': 'spring-boot',
  'io.quarkus': 'quarkus',
  'io.micronaut': 'micronaut',
  'jakarta.servlet': 'jakarta-ee',
  'javax.servlet': 'java-ee',
  'org.junit.jupiter': 'junit',
  'org.testng': 'testng',
  'org.hibernate': 'hibernate',
  'org.slf4j': 'slf4j',
  'org.apache.kafka': 'kafka',
  'org.reactivestreams': 'reactive-streams',
  'io.projectreactor': 'reactor',
  'com.google.guava': 'guava',
};

/** Extract the public class name from Java source (needed for the file name). */
export function extractJavaClassName(source: string): string {
  const match = source.match(/public\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (match) return match[1];
  const anyClass = source.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (anyClass) return anyClass[1];
  return 'Main';
}

/**
 * Extract the package declaration (e.g. "com.example.util" from
 * "package com.example.util;"). javac requires the source file to live at
 * <dir>/<package path>/<Class>.java — a flat temp dir breaks packaged
 * classes (found by the real-world prover).
 */
export function extractJavaPackage(source: string): string | null {
  const match = source.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  return match ? match[1] : null;
}

/** Where the source file must be written so javac accepts the package. */
export function javaSourcePath(workDir: string, source: string): { filePath: string; fqcn: string } {
  const pkg = extractJavaPackage(source);
  const className = extractJavaClassName(source);
  if (!pkg) {
    return { filePath: path.join(workDir, `${className}.java`), fqcn: className };
  }
  const pkgDir = path.join(workDir, ...pkg.split('.'));
  return {
    filePath: path.join(pkgDir, `${className}.java`),
    fqcn: `${pkg}.${className}`,
  };
}

export class JavaToolchain implements Toolchain {
  info: ToolchainInfo = {
    id: 'java',
    name: 'Java (javac/java)',
    languages: ['java', 'kotlin', 'scala', 'groovy'],
    binaries: ['javac'],
    versions: {},
    available: false,
    extensions: ['.java'],
    frameworks: Object.values(JAVA_FRAMEWORK_HINTS),
  };

  async probe(): Promise<ToolchainInfo> {
    const versions: Record<string, string> = {};
    let found = false;
    for (const bin of ['java', 'javac', 'mvn', 'gradle']) {
      if (whichSync(bin)) {
        versions[bin] = probeVersion(bin) || bin;
        if (bin === 'javac') found = true;
      }
    }
    this.info.versions = versions;
    this.info.available = found;
    return this.info;
  }

  async compile(source: string, options: CompileOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('compile');

    const workDir = options.workDir || makeTempDir('java');
    const className = options.moduleName || extractJavaClassName(source);
    const placement = javaSourcePath(workDir, options.entryFile ? '' : source);
    const filePath = options.entryFile
      ? writeSourceFile(workDir, options.entryFile, source)
      : writeSourceFile(path.dirname(placement.filePath), path.basename(placement.filePath), source);

    const args = [
      '-d', workDir,
      ...(options.release ? ['-O'] : []),
      ...(options.extraArgs || []),
      filePath,
    ];

    const result = await runCommand('javac', args, {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 120_000,
    });

    const classFile = path.join(
      workDir,
      ...((extractJavaPackage(source) || '').split('.').filter(Boolean)),
      `${className}.class`
    );
    result.artifacts = fileExists(classFile) ? [classFile] : [];
    return result;
  }

  async run(source: string, options: RunOptions = {}): Promise<ExecResult> {
    if (!this.info.available) return this.unavailable('run');

    const workDir = options.workDir || makeTempDir('java');
    const placement = javaSourcePath(workDir, options.entryFile ? '' : source);
    const filePath = options.entryFile
      ? writeSourceFile(workDir, options.entryFile, source)
      : writeSourceFile(path.dirname(placement.filePath), path.basename(placement.filePath), source);

    const javaVersion = this.info.versions['java'] || '';
    const supportsSingleFile = !/version "1[.]/.test(javaVersion); // java 11+

    if (supportsSingleFile && options.compileFirst !== true) {
      // Single-file source mode (JEP 330) - fastest path
      return runCommand('java', [filePath, ...(options.args || [])], {
        cwd: workDir,
        env: options.env,
        timeoutMs: options.timeoutMs || 60_000,
        stdin: options.stdin,
      });
    }

    // Compile then run (with the fully qualified class name)
    const compileResult = await runCommand('javac', ['-d', workDir, filePath], {
      cwd: workDir,
      env: options.env,
      timeoutMs: options.timeoutMs || 120_000,
    });
    if (!compileResult.ok) return compileResult;

    return runCommand('java', ['-cp', workDir, placement.fqcn, ...(options.args || [])], {
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

    const hasMaven = fileExists(path.join(projectDir, 'pom.xml'));
    const hasGradle =
      fileExists(path.join(projectDir, 'build.gradle')) ||
      fileExists(path.join(projectDir, 'build.gradle.kts'));

    if (hasMaven && whichSync('mvn')) {
      const args = ['package', '-DskipTests', ...(options.release ? [] : ['-Dmaven.test.skip=true']), ...(options.extraArgs || [])];
      const result = await runCommand('mvn', args, {
        cwd: projectDir,
        env: options.env,
        timeoutMs: options.timeoutMs || 600_000,
      });
      result.artifacts = [path.join(projectDir, 'target')];
      return result;
    }

    if (hasGradle && whichSync('gradle')) {
      const args = ['build', '-x', 'test', ...(options.extraArgs || [])];
      const result = await runCommand('gradle', args, {
        cwd: projectDir,
        env: options.env,
        timeoutMs: options.timeoutMs || 600_000,
      });
      result.artifacts = [path.join(projectDir, 'build')];
      return result;
    }

    if (hasMaven) return this.fail('pom.xml found but mvn not on PATH');
    if (hasGradle) return this.fail('build.gradle found but gradle not on PATH');
    return this.fail('No pom.xml or build.gradle found; not a java build project');
  }

  async detectProject(projectDir: string): Promise<ProjectInfo | null> {
    const pom = path.join(projectDir, 'pom.xml');
    const gradle = path.join(projectDir, 'build.gradle');
    const gradleKts = path.join(projectDir, 'build.gradle.kts');

    const marker: string | null = fileExists(pom) ? 'pom.xml'
      : fileExists(gradle) ? 'build.gradle'
      : fileExists(gradleKts) ? 'build.gradle.kts'
      : null;
    if (!marker) return null;

    const content =
      readTextFile(pom) ||
      readTextFile(gradle) ||
      readTextFile(gradleKts) ||
      '';

    const frameworks: string[] = [];
    for (const hint of Object.keys(JAVA_FRAMEWORK_HINTS)) {
      if (content.includes(hint)) frameworks.push(JAVA_FRAMEWORK_HINTS[hint]);
    }

    const entryPoints: string[] = [];
    const mainJava = path.join(projectDir, 'src', 'main', 'java');
    if (dirExists(mainJava)) entryPoints.push('src/main/java');

    return {
      root: projectDir,
      ecosystem: 'java',
      buildSystem: marker === 'pom.xml' ? 'maven' : 'gradle',
      frameworks,
      entryPoints,
      markers: [marker],
      confidence: 1,
    };
  }

  private unavailable(operation: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: `javac not found on PATH; cannot ${operation} Java natively.`,
      exitCode: null,
      durationMs: 0,
      command: `javac ${operation}`,
      artifacts: [],
      toolchain: 'java',
    };
  }

  private fail(message: string): ExecResult {
    return {
      ok: false,
      stdout: '',
      stderr: message,
      exitCode: 1,
      durationMs: 0,
      command: 'java',
      artifacts: [],
      toolchain: 'java',
    };
  }
}

export function createJavaToolchain(): JavaToolchain {
  return new JavaToolchain();
}
