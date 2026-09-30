/**
 * Universal Transpiler - User Contract
 *
 * The user-facing relation and its data model (see GOVERNANCE.md):
 * - ScopeSetup: what the user sets up — scope, expected functionality,
 *   code standards (defaulting to each language's ecosystem standards),
 *   decision policies. User-mutable, persisted.
 * - DecisionPolicy: every "who decides" rule as data, not hardcoded
 *   behavior — open for change by design.
 * - InterpretationReport: the iteration contract made visible — every
 *   input compared against vault history before anything else happens.
 *
 * The mutability contract is enforced by the API surface itself: there is
 * no user path that writes the system's internal history (learned
 * definitions, statistics, progress). Users mutate their scope setup,
 * their feedback, and their teachings — nothing else.
 */

import type { DomainAnalysisResult } from '../domains/domain-analyzer';
import type { PlatformTarget } from '../toolchains/types';

// ============================================================================
// Code standards
// ============================================================================

export interface CodeStandards {
  /**
   * Style standard for produced code. Absent = the target language's
   * ecosystem standard (LANGUAGE_STANDARDS).
   */
  style?: string;
  /** Documentation convention for produced code */
  documentation?: 'language-default' | 'doc-comments' | 'jsdoc' | 'docstrings' | 'haddock' | 'none';
  /** Per-language overrides: { go: 'gofmt', rust: 'rustfmt' } */
  perLanguage?: Record<string, string>;
}

/**
 * Each language's ecosystem-standard conventions. The system defaults to
 * these for produced code — the user never has to state what the
 * ecosystem already defines.
 */
export const LANGUAGE_STANDARDS: Record<string, CodeStandards> = {
  go: { style: 'gofmt', documentation: 'doc-comments' },
  rust: { style: 'rustfmt', documentation: 'doc-comments' },
  java: { style: 'google-java-format', documentation: 'doc-comments' },
  javascript: { style: 'prettier', documentation: 'jsdoc' },
  typescript: { style: 'prettier', documentation: 'jsdoc' },
  python: { style: 'pep8', documentation: 'docstrings' },
  haskell: { style: 'hlint-conformant', documentation: 'haddock' },
  c: { style: 'gnu', documentation: 'doc-comments' },
  cpp: { style: 'llvm', documentation: 'doc-comments' },
};

/** Resolve the effective standards for a target language. */
export function resolveStandards(
  target: string,
  userStandards?: CodeStandards
): CodeStandards {
  const lang = target.toLowerCase();
  const ecosystem = LANGUAGE_STANDARDS[lang] ?? { style: 'language-default', documentation: 'language-default' as const };
  const perLanguage = userStandards?.perLanguage?.[lang];

  return {
    style: perLanguage ?? userStandards?.style ?? ecosystem.style,
    documentation: userStandards?.documentation ?? ecosystem.documentation,
  };
}

// ============================================================================
// Expected functionality
// ============================================================================

/**
 * A declarative expectation the user places on the system: what it must
 * do within this scope. The system organizes, defines, creates and
 * produces to satisfy these; it decides HOW autonomously.
 */
export interface ExpectedFunctionality {
  /** Human-readable statement of what the system must produce */
  description: string;
  /** The domain this expectation lives in (scopes the interpretation) */
  domain?: string;
  /** Machine-checkable acceptance where expressible: output must contain these */
  outputContains?: string[];
  /** The platform the result must target (optional; otherwise the system decides) */
  platform?: PlatformTarget;
}

// ============================================================================
// Decision policy: every rule is data
// ============================================================================

export interface DecisionPolicy {
  /**
   * Who resolves the target platform:
   * - 'user-then-system' (default): user-declared platform wins; otherwise
   *   client feedback, framework and domain inference decide
   * - 'user-only': only a user-declared platform counts; anything else
   *   falls back to the domain default, never inferred feedback
   * - 'system': the system decides from its own analysis (same as
   *   user-then-system minus declared-platform priority)
   */
  platformResolution: 'user-only' | 'user-then-system' | 'system';
  /**
   * How many distinct clients must corroborate feedback before it moves
   * upstream (applies to every client). A number, or 'agent-decides' to
   * let the system's promotion sweep decide case by case.
   */
  promotionThreshold: number | 'agent-decides';
  /**
   * - 'on' (default): unknown keywords enter the candidate -> definition
   *   lifecycle and steer future interpretation
   * - 'observe-only': candidates are recorded but never promoted
   * - 'off': no learning; interpretation uses existing history only
   */
  learningMode: 'on' | 'observe-only' | 'off';
  /**
   * The judgment-model provider NAME (see engine/judgment.ts): which
   * registered decision model the system consults for typed decisions
   * (agent routing, platform selection, promotion, retry/escalate).
   * 'heuristic' (default) is the built-in deterministic model. Any
   * registered provider — a Jev-style judgment model included — is
   * selectable here, in policy data, with no code change.
   */
  judgmentModel: string;
}

export const DEFAULT_DECISION_POLICY: DecisionPolicy = {
  platformResolution: 'user-then-system',
  promotionThreshold: 2,
  learningMode: 'on',
  judgmentModel: 'heuristic',
};

export function mergePolicy(overrides?: Partial<DecisionPolicy>): DecisionPolicy {
  return { ...DEFAULT_DECISION_POLICY, ...overrides };
}

// ============================================================================
// Scope setup: the user-owned, user-mutable state
// ============================================================================

export interface ScopeSetup {
  scopeId: string;
  /** Domains this scope covers; keyword teaching is restricted to these when set */
  domains?: string[];
  expectedFunctionality?: ExpectedFunctionality[];
  codeStandards?: CodeStandards;
  decisionPolicy?: Partial<DecisionPolicy>;
  createdAt: number;
  updatedAt: number;
}

/** Input shape for creating/updating a scope (timestamps managed by the engine). */
export type ScopeSetupInput = Omit<ScopeSetup, 'createdAt' | 'updatedAt'>;

// ============================================================================
// Interpretation report: the iteration contract, made visible
// ============================================================================

export interface InterpretationMatch {
  keyword: string;
  domain: string;
  /** Where the definition came from: learned | client-promoted */
  source: string;
  /** True when the definition was learned/confirmed during this very interpretation */
  learnedNow: boolean;
}

export interface InterpretationReport {
  /** How many tokens the input contained */
  tokenCount: number;
  /** Vault-history hits: keywords in the input that already had definitions */
  matched: InterpretationMatch[];
  /** Tokens with no vault history — recorded as candidates (when learning is on) */
  newTokens: string[];
  /** Definitions promoted during this interpretation (candidate -> definition) */
  learned: InterpretationMatch[];
  /** The resulting domain analysis */
  analysis: DomainAnalysisResult;
  /** The routing decision the engine would take */
  route: 'native-run' | 'transpile-then-run';
  /** The scope this interpretation ran under, if any */
  scope?: string;
  /** Standards that produced output would follow */
  standards: CodeStandards;
}
