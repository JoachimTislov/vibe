/**
 * Universal Transpiler - Universal Engine
 *
 * The large wrapper. One facade over every native toolchain, the framework
 * registry, the domain analyzer and the transpile matrix.
 *
 * Pipeline for any input:
 *   syntax -> language detection -> domain analysis (keywords/frameworks)
 *          -> platform decision -> routing:
 *               available native toolchain  -> compile/run natively
 *               missing toolchain           -> transpile via matrix -> run
 *
 * Domain + keywords + declared platform decide the output artifact.
 */

import type {
  ExecResult,
  PlatformTarget,
  ProjectBuildOptions,
  ProjectInfo,
  RunOptions,
} from '../toolchains/types';
import { ToolchainRegistry } from '../toolchains/registry';
import { detectLanguage } from '../parsers/language-parsers';
import {
  analyzeDomain,
  canTargetPlatform,
  defaultPlatformFor,
  type DomainAnalysisResult,
} from '../domains/domain-analyzer';
import { TranspileMatrix, type MatrixTranspileResult } from './transpile-matrix';
import type { LLMClient } from '../core/universal-transpiler';

export interface EngineOptions {
  llm?: LLMClient;
  /** Default platform when nothing else decides */
  defaultPlatform?: PlatformTarget;
  debug?: boolean;
  timeoutMs?: number;
}

export interface EngineRunRequest extends RunOptions {
  /** Declared source language; auto-detected from syntax when absent */
  language?: string;
  /** Declared domain id; keyword analysis used when absent */
  domain?: string;
  /** Declared target platform; domain/framework analysis used when absent */
  platform?: PlatformTarget;
}

export interface EngineRunReport {
  result: ExecResult;
  /** The language that actually executed (may differ after transpilation) */
  executedLanguage: string;
  /** The language the source was detected/declared as */
  sourceLanguage: string;
  /** Full domain analysis of the input */
  analysis: DomainAnalysisResult;
  /** Route taken: native-run | transpile-then-run | failed */
  route: 'native-run' | 'transpile-then-run' | 'failed';
  /** Transpilation performed, if any */
  transpilation?: MatrixTranspileResult;
  /** Project info when running a project directory */
  project?: ProjectInfo;
}

export interface EngineCompileReport {
  result: ExecResult;
  /** Language the artifact was produced with (may differ after transpilation) */
  executedLanguage: string;
  /** Language the source was detected/declared as */
  sourceLanguage: string;
  analysis: DomainAnalysisResult;
  route: 'native-compile' | 'transpile-then-compile' | 'failed';
  transpilation?: MatrixTranspileResult;
}

export interface EngineAnalyzeReport {
  language: string;
  languageCandidates: { language: string; confidence: number }[];
  analysis: DomainAnalysisResult;
  project?: ProjectInfo;
  route: 'native-run' | 'transpile-then-run';
  fallbackTarget?: string;
  notes: string[];
}

export class UniversalEngine {
  readonly toolchains: ToolchainRegistry;
  readonly matrix: TranspileMatrix;
  private options: Required<Omit<EngineOptions, 'llm'>> & { llm?: LLMClient };

  constructor(options: EngineOptions = {}) {
    this.toolchains = new ToolchainRegistry();
    this.matrix = new TranspileMatrix(this.toolchains, options.llm);
    this.options = {
      defaultPlatform: 'auto',
      debug: false,
      timeoutMs: 60_000,
      ...options,
    };
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  /** Detect the language of a source string. */
  detect(source: string, filename?: string): { language: string; confidence: number }[] {
    return detectLanguage(source, filename);
  }

  /** Full analysis: language + domain + platform + routing decision. */
  async analyze(source: string, request: EngineRunRequest = {}): Promise<EngineAnalyzeReport> {
    const notes: string[] = [];

    // 1. Language resolution
    let language = request.language;
    if (!language) {
      const candidates = detectLanguage(source);
      language = candidates[0]?.language || 'javascript';
      notes.push(`language auto-detected as ${language}`);
    }

    // 2. Domain analysis (keywords + declared)
    const analysis = analyzeDomain({
      source,
      declaredDomain: request.domain,
      declaredPlatform: request.platform || (this.options.defaultPlatform as PlatformTarget),
      language,
    });

    // 3. Routing: native vs transpile
    const tc = this.toolchains.forLanguage(language);
    let route: EngineAnalyzeReport['route'] = 'transpile-then-run';
    let fallbackTarget: string | undefined;

    if (tc) {
      await tc.probe();
      if (tc.info.available && canTargetPlatform(language, analysis.platform)) {
        route = 'native-run';
      } else {
        notes.push(
          tc.info.available
            ? `${language} toolchain available but cannot target ${analysis.platform}`
            : `${language} toolchain unavailable on this machine`
        );
        fallbackTarget = this.chooseFallbackTarget(language, analysis.platform);
        notes.push(`falling back to ${fallbackTarget}`);
      }
    } else {
      notes.push(`no toolchain registered for ${language}`);
      fallbackTarget = this.chooseFallbackTarget(language, analysis.platform);
    }

    return {
      language,
      languageCandidates: request.language ? [{ language, confidence: 1 }] : detectLanguage(source).slice(0, 5),
      analysis,
      route,
      fallbackTarget,
      notes,
    };
  }

  // ==========================================================================
  // Run: any syntax -> domain/platform-decided execution
  // ==========================================================================

  async run(source: string, request: EngineRunRequest = {}): Promise<EngineRunReport> {
    const report = await this.analyze(source, request);
    const { language, analysis } = report;
    const platform = analysis.platform;

    // Route 1: native toolchain run
    if (report.route === 'native-run' && language) {
      const tc = this.toolchains.forLanguage(language)!;
      const result = await tc.run(source, {
        ...request,
        platform,
        timeoutMs: request.timeoutMs || this.options.timeoutMs,
        debug: request.debug ?? this.options.debug,
      });
      return {
        result,
        executedLanguage: language,
        sourceLanguage: language,
        analysis,
        route: 'native-run',
      };
    }

    // Route 2: transpile to a runnable language, then run
    const fallbackTarget = report.fallbackTarget || 'javascript';
    const transpilation = await this.matrix.transpile(source, language, fallbackTarget);
    if (transpilation.strategy === 'unsupported') {
      return {
        result: {
          ok: false,
          stdout: '',
          stderr:
            `Cannot run ${language}: no native toolchain on PATH and no transpiler ` +
            `for ${language} -> ${fallbackTarget}. ` +
            `Notes: ${report.notes.join('; ')}`,
          exitCode: 1,
          durationMs: 0,
          command: 'engine.run',
          artifacts: [],
          toolchain: 'engine',
        },
        executedLanguage: language,
        sourceLanguage: language,
        analysis,
        route: 'failed',
        transpilation,
      };
    }

    // Run the transpiled source on the fallback toolchain
    const fallbackTc = this.toolchains.forLanguage(fallbackTarget)!;
    await fallbackTc.probe();
    const runResult = await fallbackTc.run(transpilation.code, {
      ...request,
      platform: this.platformForLanguage(fallbackTarget),
      timeoutMs: request.timeoutMs || this.options.timeoutMs,
    });

    return {
      result: runResult,
      executedLanguage: fallbackTarget,
      sourceLanguage: language,
      analysis,
      route: 'transpile-then-run',
      transpilation,
    };
  }

  // ==========================================================================
  // Transpile: any pair via the tiered matrix
  // ==========================================================================

  async transpile(
    source: string,
    from: string,
    to: string
  ): Promise<MatrixTranspileResult> {
    const fromLang = from || detectLanguage(source)[0]?.language || 'javascript';
    return this.matrix.transpile(source, fromLang, to);
  }

  // ==========================================================================
  // Compile: any syntax -> platform-decided artifact
  // ==========================================================================

  async compile(
    source: string,
    request: EngineRunRequest & { outputPath?: string } = {}
  ): Promise<EngineCompileReport> {
    const report = await this.analyze(source, request);
    const { language, analysis } = report;
    const platform = analysis.platform;

    // Native toolchain compile
    if (report.route === 'native-run' && language) {
      const tc = this.toolchains.forLanguage(language)!;
      const result = await tc.compile(source, {
        ...request,
        platform,
        outputPath: request.outputPath,
        timeoutMs: request.timeoutMs || this.options.timeoutMs,
      });
      return {
        result,
        sourceLanguage: language,
        executedLanguage: language,
        analysis,
        route: 'native-compile',
      };
    }

    // No native toolchain: transpile to a platform-capable language, then
    // compile that output for the requested platform.
    const fallbackTarget = report.fallbackTarget || 'javascript';
    const transpilation = await this.matrix.transpile(source, language, fallbackTarget);

    if (transpilation.strategy === 'unsupported') {
      return {
        result: {
          ok: false,
          stdout: '',
          stderr:
            `Cannot compile ${language} for ${platform}: no native toolchain on PATH ` +
            `and no transpiler for ${language} -> ${fallbackTarget}.`,
          exitCode: 1,
          durationMs: 0,
          command: 'engine.compile',
          artifacts: [],
          toolchain: 'engine',
        },
        sourceLanguage: language,
        executedLanguage: language,
        analysis,
        route: 'failed',
      };
    }

    const fallbackTc = this.toolchains.forLanguage(fallbackTarget)!;
    await fallbackTc.probe();
    const compileResult = await fallbackTc.compile(transpilation.code, {
      ...request,
      platform: this.platformForLanguage(fallbackTarget),
      outputPath: request.outputPath,
    });

    return {
      result: compileResult,
      sourceLanguage: language,
      executedLanguage: fallbackTarget,
      analysis,
      route: 'transpile-then-compile',
      transpilation,
    };
  }

  // ==========================================================================
  // Build: project directories via native build systems
  // ==========================================================================

  async build(
    projectDir: string,
    options: ProjectBuildOptions = {}
  ): Promise<{ project: ProjectInfo; result: ExecResult }> {
    const project = await this.toolchains.detectProject(projectDir);
    if (!project) {
      throw new Error(
        `No recognizable project found in ${projectDir} ` +
        `(looked for Cargo.toml, go.mod, pom.xml, build.gradle, package.json, stack.yaml, *.cabal)`
      );
    }

    const tc = this.toolchains.get(project.ecosystem === 'node' ? 'jsts' : project.ecosystem);
    if (!tc) {
      throw new Error(`No toolchain registered for ecosystem ${project.ecosystem}`);
    }

    await tc.probe();
    const result = await tc.buildProject(projectDir, {
      ...options,
      platform: options.platform || this.projectDefaultPlatform(project),
      timeoutMs: options.timeoutMs || 600_000,
    });

    return { project, result };
  }

  // ==========================================================================
  // Introspection
  // ==========================================================================

  /** Report every toolchain, its availability and versions. */
  async status(): Promise<
    { id: string; name: string; available: boolean; languages: string[]; versions: Record<string, string>; frameworks: string[] }[]
  > {
    const infos = await this.toolchains.list();
    return infos.map((i) => ({
      id: i.id,
      name: i.name,
      available: i.available,
      languages: i.languages,
      versions: i.versions,
      frameworks: i.frameworks,
    }));
  }

  // ==========================================================================
  // Internal routing helpers
  // ==========================================================================

  /**
   * Choose a fallback language for a source that has no usable native
   * toolchain. Preference order:
   *   1. a language reachable from `sourceLanguage` by a structural
   *      transpiler, whose toolchain is available and can target `platform`
   *   2. a language whose toolchain is available and can target `platform`
   *      (the AI tier will handle conversion)
   *   3. JavaScript (the universal lingua franca)
   */
  private chooseFallbackTarget(sourceLanguage: string, platform: PlatformTarget): string {
    const pairs = this.matrix.structuralPairs();
    const reachable = new Set<string>();
    for (const pair of pairs) {
      const [from, to] = pair.split('->');
      if (from === sourceLanguage.toLowerCase()) reachable.add(to);
    }

    const preferences: Record<string, string[]> = {
      native: ['go', 'native-c', 'javascript', 'python'],
      jvm: ['java', 'javascript', 'go'],
      node: ['javascript', 'python', 'go'],
      browser: ['javascript'],
      wasm: ['javascript', 'go', 'rust'],
      wasi: ['go', 'javascript'],
      docker: ['go', 'java', 'javascript'],
      ir: ['javascript', 'java'],
      deno: ['javascript'],
      auto: ['javascript', 'go', 'python'],
    };
    const preferred = preferences[platform] || preferences.auto;

    // Tier 1: structurally reachable AND platform-capable, in preference order
    for (const lang of preferred) {
      const tc = this.toolchains.forLanguage(lang);
      if (tc && reachable.has(lang) && canTargetPlatform(lang, platform)) {
        return lang;
      }
    }

    // Tier 2: any platform-capable language the structural tier can reach
    for (const lang of reachable) {
      const tc = this.toolchains.forLanguage(lang);
      if (tc && canTargetPlatform(lang, platform)) {
        return lang;
      }
    }

    // Tier 3: platform-capable preference (AI tier will convert)
    for (const lang of preferred) {
      const tc = this.toolchains.forLanguage(lang);
      if (tc && canTargetPlatform(lang, platform)) {
        return lang;
      }
    }

    return 'javascript';
  }

  private platformForLanguage(language: string): PlatformTarget {
    return defaultPlatformFor(language) as PlatformTarget;
  }

  private projectDefaultPlatform(project: ProjectInfo): PlatformTarget {
    if (project.ecosystem === 'java') return 'jvm';
    if (project.ecosystem === 'node') return 'node';
    return 'native';
  }
}

let defaultEngine: UniversalEngine | null = null;

export function getUniversalEngine(options?: EngineOptions): UniversalEngine {
  if (!defaultEngine) {
    defaultEngine = new UniversalEngine(options);
  }
  return defaultEngine;
}
