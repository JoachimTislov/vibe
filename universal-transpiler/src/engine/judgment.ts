/**
 * Universal Transpiler - Judgment Model Adapter (the Jev openness point)
 *
 * A judgment model is a machine-consumable decision layer: it receives a
 * typed question plus structured state and returns a typed choice with
 * scores, probabilities and confidence — no prose, no prompts. It sits
 * INSIDE the control loop of the system (routing, ranking, promotion,
 * retry/escalation) so the LLM tier stays reserved for tasks that
 * actually need language.
 *
 * The system ships a deterministic default (HeuristicJudgmentModel). Any
 * external decision model — Jev-style judgment models included — plugs in
 * through the same interface:
 *
 *   engine.judgment.register(jevAdapter);
 *   engine.setupScope({ scopeId, ..., decisionPolicy: { judgmentModel: 'jev' } });
 *
 * The provider NAME is policy data (DecisionPolicy.judgmentModel); the
 * implementation is registered once, in code. Swapping providers never
 * touches decision logic, because every decision site only builds typed
 * questions and consumes typed answers.
 */

// ============================================================================
// Typed questions and answers
// ============================================================================

/**
 * The decision kinds the system consults a judgment model for. Open by
 * design: domain agents may register their own kinds (e.g.
 * 'food-tracking:restock-priority').
 */
export type JudgmentKind =
  | 'select-domain-agent'
  | 'select-platform'
  | 'promote-feedback'
  | 'promote-candidate'
  | 'retry-or-escalate'
  | (string & {});

/** One admissible answer to a judgment question. */
export interface JudgmentOption<T extends string = string> {
  value: T;
  /** Human-readable answer, for traces and reports */
  label: string;
  /**
   * Deterministic evidence for this option, normalized 0..1 by the caller
   * (domain score, toolchain availability, feedback corroboration count...).
   * A judgment model may use, reweight or ignore these.
   */
  score: number;
  /** Additional structured evidence the model may consume */
  metadata?: Record<string, unknown>;
}

/**
 * A typed, machine-consumable decision request. `state` is structured
 * application state (analysis, scope setup, vault stats, policy) — never a
 * natural-language instruction to be obeyed.
 */
export interface JudgmentQuestion<T extends string = string> {
  kind: JudgmentKind;
  /** Structured state the decision is made over */
  state: Record<string, unknown>;
  options: JudgmentOption<T>[];
  /** What this decision is for; context only, never an instruction */
  context?: string;
}

/** The typed answer to a judgment question. */
export interface Judgment<T extends string = string> {
  /** The chosen option value */
  choice: T;
  /** Per-option scores, when the model ranks more than the winner */
  scores?: Record<string, number>;
  /** Per-option probabilities, when the model distributes mass */
  probabilities?: Record<string, number>;
  /** 0..1 — how sure the model is of the choice */
  confidence: number;
  /** Why (trace only; never parsed back into control flow) */
  rationale?: string;
  /** Which model decided (name from the registry) */
  model: string;
}

// ============================================================================
// The open adapter interface
// ============================================================================

export interface JudgmentModel {
  /** Registry name; selected by DecisionPolicy.judgmentModel */
  readonly name: string;
  /**
   * Decide a typed question. Implementations must:
   * - return a choice that is one of the question's option values
   * - be pure with respect to the system state (decisions are advisory
   *   points in a flow; the caller applies them)
   * - stay silent-model: typed in, typed out; no free-form generation
   */
  decide<T extends string>(question: JudgmentQuestion<T>): Promise<Judgment<T>>;
}

// ============================================================================
// Default implementation: deterministic heuristics
// ============================================================================

/**
 * The system's built-in judgment model: picks the highest-scoring option,
 * confidence from the winner's normalized margin over the runner-up.
 * Deterministic, replayable, zero external dependencies.
 */
export class HeuristicJudgmentModel implements JudgmentModel {
  readonly name = 'heuristic';

  decide<T extends string>(question: JudgmentQuestion<T>): Promise<Judgment<T>> {
    if (question.options.length === 0) {
      return Promise.reject(
        new Error(`judgment question "${question.kind}" has no options`)
      );
    }
    const sorted = [...question.options].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const runnerUp = sorted[1];
    const total = sorted.reduce((sum, o) => sum + Math.max(0, o.score), 0);
    const margin =
      runnerUp && runnerUp.score > 0
        ? (winner.score - runnerUp.score) / (winner.score + runnerUp.score)
        : winner.score > 0
          ? 1
          : 0;
    return Promise.resolve({
      choice: winner.value,
      scores: Object.fromEntries(sorted.map((o) => [o.value, o.score])),
      probabilities:
        total > 0
          ? Object.fromEntries(
              sorted.map((o) => [o.value, Math.max(0, o.score) / total])
            )
          : Object.fromEntries(sorted.map((o) => [o.value, 1 / sorted.length])),
      confidence: Number((0.5 + 0.5 * margin).toFixed(4)),
      rationale: `heuristic: highest score ${winner.score} among ${sorted.length} options`,
      model: this.name,
    });
  }
}

// ============================================================================
// Registry: named providers, selected by policy data
// ============================================================================

export class JudgmentModelRegistry {
  private readonly models = new Map<string, JudgmentModel>();

  constructor(defaultModel: JudgmentModel = new HeuristicJudgmentModel()) {
    this.models.set(defaultModel.name, defaultModel);
  }

  /** Register a provider (e.g. a Jev adapter) under its name. */
  register(model: JudgmentModel): this {
    this.models.set(model.name, model);
    return this;
  }

  /** Resolve by name; unknown names fall back to the first registered (default) model. */
  get(name?: string): JudgmentModel {
    if (name && this.models.has(name)) return this.models.get(name)!;
    return this.models.values().next().value!;
  }

  names(): string[] {
    return [...this.models.keys()];
  }
}
