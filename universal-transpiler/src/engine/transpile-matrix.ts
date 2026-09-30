/**
 * Universal Transpiler - Transpile Matrix
 *
 * Routes a transpile request (source, from, to) through three tiers:
 *   1. Native transpilers bundled with toolchains (TS->JS via tsc API...)
 *   2. Deterministic structural transpilers (Rust->Go, Rust->Python,
 *      Haskell->JS...)
 *   3. AI/dynamic compiler generation (LLM-based CompilerGenerator)
 *
 * The first tier that handles the pair wins, so results are deterministic
 * and cacheable whenever a lower-numbered tier is available.
 */

import type { ToolchainRegistry } from '../toolchains/registry';
import type { LLMClient } from '../core/universal-transpiler';
import {
  goToJava,
  haskellToJavaScript,
  jsToPython,
  pythonToJavaScript,
  rustToGo,
  rustToPython,
  type StructuralTranspileResult,
} from './structural-transpilers';

export type TranspileStrategy = 'native' | 'structural' | 'ai-generated' | 'unsupported';

export interface MatrixTranspileResult {
  code: string;
  from: string;
  to: string;
  strategy: TranspileStrategy;
  /** Which converter produced the output (e.g. 'typescript-api', 'rust->go-structural') */
  via: string;
  /** Structural transpiler capability report (when strategy === 'structural') */
  structuralReport?: StructuralTranspileResult;
  /** Whether conversion was identity (from === to) */
  identity: boolean;
}

/** Pairs handled by the deterministic structural transpilers. */
const STRUCTURAL_PAIRS: Record<string, (source: string) => StructuralTranspileResult> = {
  'rust->go': rustToGo,
  'rust->golang': rustToGo,
  // Rust -> Python: deterministic structural converter (practical subset);
  // unsupported constructs are flagged in the structural report.
  'rust->python': rustToPython,
  'rust->py': rustToPython,
  'rs->python': rustToPython,
  'rs->py': rustToPython,
  'haskell->javascript': haskellToJavaScript,
  'haskell->js': haskellToJavaScript,
  'python->javascript': pythonToJavaScript,
  'python->js': pythonToJavaScript,
  // JS/TS -> Python: TypeScript input is lowered to JavaScript by the
  // native TS->JS step (typescript compiler API) before jsToPython runs.
  'javascript->python': jsToPython,
  'js->python': jsToPython,
  'javascript->py': jsToPython,
  'js->py': jsToPython,
  'typescript->python': jsToPython,
  'ts->python': jsToPython,
  'typescript->py': jsToPython,
  'ts->py': jsToPython,
  // Go -> Java: deterministic structural converter (practical subset);
  // unsupported constructs are flagged in the structural report.
  'go->java': goToJava,
  'go->jvm': goToJava,
  'golang->java': goToJava,
};

export class TranspileMatrix {
  constructor(
    private toolchains: ToolchainRegistry,
    private llm?: LLMClient
  ) {}

  /** Whether any tier can handle this pair. */
  supports(from: string, to: string): boolean {
    if (from === to) return true;
    const key = `${from}->${to}`.toLowerCase();
    if (STRUCTURAL_PAIRS[key]) return true;

    // Native pairs
    const fromTc = this.toolchains.forLanguage(from);
    if (fromTc?.nativeTranspile) {
      // cheap probe: toolchains with nativeTranspile declare JS-family pairs
      if (['typescript', 'tsx', 'jsx', 'javascript'].includes(from.toLowerCase()) &&
          ['javascript', 'js', 'commonjs', 'es5', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022'].includes(to.toLowerCase())) {
        return true;
      }
    }
    // AI fallback handles any pair when an LLM is configured
    return this.llm !== undefined;
  }

  /** Transpile through the tiered pipeline. */
  async transpile(
    source: string,
    from: string,
    to: string,
    options: { timeoutMs?: number } = {}
  ): Promise<MatrixTranspileResult> {
    // Identity
    if (from === to) {
      return {
        code: source,
        from,
        to,
        strategy: 'native',
        via: 'identity',
        identity: true,
      };
    }

    // Tier 1: native toolchain transpilers
    const native = await this.tryNative(source, from, to);
    if (native) return native;

    // Tier 2: deterministic structural transpilers
    const structural = await this.tryStructural(source, from, to);
    if (structural) return structural;

    // Tier 3: AI-generated conversion
    const ai = await this.tryAI(source, from, to, options);
    if (ai) return ai;

    return {
      code: source,
      from,
      to,
      strategy: 'unsupported',
      via: 'none',
      identity: true,
    };
  }

  // ------------------------------------------------------------------
  // Tier 1: native
  // ------------------------------------------------------------------

  private async tryNative(
    source: string,
    from: string,
    to: string
  ): Promise<MatrixTranspileResult | null> {
    const fromTc = this.toolchains.forLanguage(from);
    if (!fromTc?.nativeTranspile) return null;

    const result = await fromTc.nativeTranspile(source, from, to);
    if (!result) return null;

    return {
      code: result.code,
      from,
      to,
      strategy: 'native',
      via: result.toolchain,
      identity: false,
    };
  }

  // ------------------------------------------------------------------
  // Tier 2: structural
  // ------------------------------------------------------------------

  private async tryStructural(
    source: string,
    from: string,
    to: string
  ): Promise<MatrixTranspileResult | null> {
    const key = `${from}->${to}`.toLowerCase();
    const converter = STRUCTURAL_PAIRS[key];
    if (!converter) return null;

    // TypeScript input: lower to JavaScript first with the native TS->JS
    // step (typescript compiler API), then run the structural converter.
    let input = source;
    let lowered = false;
    if (/^(typescript|ts|tsx)$/.test(from.toLowerCase())) {
      const fromTc = this.toolchains.forLanguage(from);
      const js = fromTc?.nativeTranspile
        ? await fromTc.nativeTranspile(source, from, 'javascript')
        : null;
      if (!js) return null;
      input = js.code;
      lowered = true;
    }

    const report = converter(input);
    if (lowered) {
      report.converted = ['typescript-types-stripped', ...report.converted];
    }

    return {
      code: report.code,
      from,
      to,
      strategy: 'structural',
      via: key,
      structuralReport: report,
      identity: false,
    };
  }

  // ------------------------------------------------------------------
  // Tier 3: AI generation
  // ------------------------------------------------------------------

  private async tryAI(
    source: string,
    from: string,
    to: string,
    _options: { timeoutMs?: number }
  ): Promise<MatrixTranspileResult | null> {
    if (!this.llm) return null;

    try {
      const response = await this.llm.generate({
        system:
          `You are a precise source-to-source transpiler. Convert the given ` +
          `${from} code to idiomatic ${to}. Return ONLY the converted code, ` +
          `no markdown fences, no explanations. Preserve behavior exactly.`,
        user: source,
      });

      if (!response.content || response.content.trim().length === 0) return null;

      // Strip markdown fences if the model added them anyway
      let code = response.content.trim();
      const fence = code.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
      if (fence) code = fence[1];

      return {
        code,
        from,
        to,
        strategy: 'ai-generated',
        via: 'llm',
        identity: false,
      };
    } catch {
      return null;
    }
  }

  /** List all pair keys the structural tier handles (for introspection). */
  structuralPairs(): string[] {
    return Object.keys(STRUCTURAL_PAIRS);
  }
}
