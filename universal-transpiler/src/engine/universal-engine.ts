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
import { PersistentState, getSharedState } from './persistent-state';
import { DefinitionVault } from '../vault/definition-vault';
import {
  mergePolicy,
  resolveStandards,
  type DecisionPolicy,
  type InterpretationMatch,
  type InterpretationReport,
  type ScopeSetup,
  type ScopeSetupInput,
} from './user-contract';
import { parseWorkflowDsl } from '../domains/workflow-dsl';
import type { FeedbackRecord, Goal } from './persistent-state';
import type { LLMClient } from '../core/universal-transpiler';

export interface EngineOptions {
  llm?: LLMClient;
  /** Default platform when nothing else decides */
  defaultPlatform?: PlatformTarget;
  debug?: boolean;
  timeoutMs?: number;
  /**
   * Persistent state file. Defaults to ~/.universal-transpiler/state.json.
   * Learned keyword definitions, client feedback, promoted upstream
   * preferences and progress goals are persisted here.
   */
  statePath?: string;
  /** Learning options forwarded to the persistent state */
  learn?: { minEncounters?: number; minDominance?: number; minKeywordLength?: number };
  /** Disable learning entirely (state still loads and records) */
  enableLearning?: boolean;
  /**
   * The decision policy: every "who decides" rule as data. Defaults in
   * DEFAULT_DECISION_POLICY; see GOVERNANCE.md for the full contract.
   */
  decisionPolicy?: Partial<DecisionPolicy>;
}

export interface EngineRunRequest extends RunOptions {
  /** Declared source language; auto-detected from syntax when absent */
  language?: string;
  /** Declared domain id; keyword analysis used when absent */
  domain?: string;
  /** Declared target platform; domain/framework analysis used when absent */
  platform?: PlatformTarget;
  /**
   * Identifies the client/subscriber. Per-client feedback (not yet
   * promoted upstream) applies to this client only; once promoted it
   * affects every client.
   */
  clientId?: string;
  /**
   * The user's scope this request runs under: restricts interpretation to
   * the scope's domains and applies the scope's standards/policy.
   */
  scope?: string;
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
  /** Persistent, self-going state: learned definitions, feedback, goals. */
  readonly state: PersistentState;
  /**
   * The definition vault: the transpiler's register of keyword
   * definitions scoped by domain. Domain analysis, learning and client
   * teaching all flow through it.
   */
  readonly vault: DefinitionVault;
  /** The active decision policy (data, not hardcoded behavior) */
  readonly policy: DecisionPolicy;
  private options: Required<Omit<EngineOptions, 'llm' | 'statePath' | 'learn' | 'decisionPolicy'>> & {
    llm?: LLMClient;
    statePath?: string;
    learn?: EngineOptions['learn'];
    decisionPolicy?: Partial<DecisionPolicy>;
  };

  constructor(options: EngineOptions = {}) {
    this.toolchains = new ToolchainRegistry();
    this.matrix = new TranspileMatrix(this.toolchains, options.llm);

    // Persistent state: shared machine-wide file unless overridden
    this.state = options.statePath
      ? new PersistentState(options.statePath, options.learn)
      : getSharedState();
    this.state.load();
    this.vault = new DefinitionVault(this.state);

    // Decision policy: every governance rule is data (GOVERNANCE.md)
    this.policy = mergePolicy(options.decisionPolicy);
    this.state.data.promotionThreshold =
      typeof this.policy.promotionThreshold === 'number'
        ? this.policy.promotionThreshold
        : Number.POSITIVE_INFINITY; // 'agent-decides': only the sweep promotes
    this.state.observeOnly = this.policy.learningMode === 'observe-only';

    this.options = {
      defaultPlatform: 'auto',
      debug: false,
      timeoutMs: 60_000,
      enableLearning: true,
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
  async analyze(
    source: string,
    request: EngineRunRequest = {},
    /** @internal interpret() learns once, at its own point in the report */
    _skipLearning = false
  ): Promise<EngineAnalyzeReport> {
    const notes: string[] = [];

    // 1. Language resolution
    let language = request.language;
    if (!language) {
      const candidates = detectLanguage(source);
      language = candidates[0]?.language || 'javascript';
      notes.push(`language auto-detected as ${language}`);
    }

    // 2. Domain analysis, informed by persistent state:
    //    - learned keyword definitions score alongside builtins
    //    - upstream platform preferences (promoted client feedback)
    //    - unpromoted per-client feedback applies to that client only
    if (request.clientId) this.state.touchClient(request.clientId);
    const clientOverrides = this.clientPlatformOverrides(request.clientId);
    // Keyword-domain feedback teaches a definition. Unpromoted feedback
    // applies to the client that gave it; promoted feedback already lives
    // in state.keywords and applies to everyone.
    const clientKeywords = this.clientKeywordDefinitions(request.clientId);
    const analysis = analyzeDomain({
      source,
      declaredDomain: request.domain,
      declaredPlatform: request.platform || (this.options.defaultPlatform as PlatformTarget),
      language,
      learnedKeywords: { ...this.vault.scoringMap(), ...clientKeywords },
      platformOverrides: this.validatedPlatformOverrides({
        ...this.state.data.upstream.platformPreferences,
        ...clientOverrides,
      }),
    });

    // 3. Learn from this encounter per the active policy:
    //    on -> candidates become definitions on corroboration;
    //    observe-only -> candidates recorded, never promoted;
    //    off -> no learning at all.
    const learningActive =
      this.options.enableLearning &&
      this.policy.learningMode !== 'off' &&
      !_skipLearning;
    if (learningActive) {
      this.state.learnFromSource(source, language);
    }

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

    // Record empirical evidence in the persistent state
    this.state.noteTranspile(`${language}->${fallbackTarget}`, transpilation.strategy, runResult.ok);

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
  // User contract: scopes, teaching, interpretation (GOVERNANCE.md)
  // ==========================================================================

  /**
   * Create or replace a user-owned scope setup. The scope setup is the
   * user-MUTABLE tier of the mutability contract: the user may change it
   * at any time; the system never writes it.
   */
  setupScope(input: ScopeSetupInput): ScopeSetup {
    const now = Date.now();
    const existing = (this.state.data.scopes[input.scopeId] as ScopeSetup | undefined);
    const setup: ScopeSetup = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.state.data.scopes[input.scopeId] = setup;
    this.state.save();
    return setup;
  }

  /**
   * Update the user's own scope. Returns undefined when the scope does
   * not exist (creating requires setupScope — explicit, never implicit).
   */
  updateScope(
    scopeId: string,
    changes: Partial<ScopeSetupInput>
  ): ScopeSetup | undefined {
    const existing = this.state.data.scopes[scopeId] as ScopeSetup | undefined;
    if (!existing) return undefined;
    const updated: ScopeSetup = {
      ...existing,
      ...changes,
      scopeId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.state.data.scopes[scopeId] = updated;
    this.state.save();
    return updated;
  }

  /** Read a scope setup (the user-owned state is always inspectable). */
  getScope(scopeId: string): ScopeSetup | undefined {
    return this.state.data.scopes[scopeId] as ScopeSetup | undefined;
  }

  /**
   * Teach a keyword definition through a scope.
   *
   * In-scope teaching (the keyword's domain is within the scope's
   * domains, or the scope declares no domains) persists immediately —
   * the persist-on-encounter contract.
   *
   * Out-of-scope teaching does NOT write a global definition: it is
   * recorded as a client proposal (a keyword-domain feedback record)
   * that only the system's corroboration rules can promote. Users cannot
   * reach outside the state they set up.
   */
  teachKeyword(
    scopeId: string,
    keyword: string,
    domain: string,
    options: { clientId?: string; semantics?: string; kind?: string; approve?: boolean } = {}
  ): { mode: 'defined' | 'proposed' } {
    const scope = this.getScope(scopeId);
    if (!scope) {
      throw new Error(`unknown scope "${scopeId}" — create it with setupScope first`);
    }
    const inScope = !scope.domains || scope.domains.includes(domain);
    if (inScope) {
      this.vault.define(keyword, domain, {
        semantics: options.semantics,
        taughtBy: options.clientId,
        source: 'client-promoted',
        confidence: options.approve ? 0.9 : 0.8,
      });
      return { mode: 'defined' };
    }
    // Out of scope: a proposal, promoted only by the system's rules
    const clientId = options.clientId ?? `scope:${scopeId}`;
    this.state.recordFeedback(
      clientId,
      'keyword-domain',
      `${keyword}=${domain}`,
      { approve: false }
    );
    return { mode: 'proposed' };
  }

  /**
   * The iteration contract, made visible: interpret an input by comparing
   * every token against the vault's history BEFORE anything else happens.
   * Returns what matched, what was new, what was learned during this
   * interpretation, the resulting analysis, the route, and the standards
   * that produced output would follow.
   *
   * This method never executes anything — it is the read-only face of
   * interpretation.
   */
  async interpret(
    source: string,
    request: EngineRunRequest = {}
  ): Promise<InterpretationReport> {
    const scope = request.scope ? this.getScope(request.scope) : undefined;

    // 1. Compare against history: which known keywords does this input contain?
    const lower = source.toLowerCase();
    const matched: InterpretationMatch[] = [];
    for (const record of this.vault.search()) {
      if (record.source !== 'builtin' && lower.includes(record.keyword)) {
        matched.push({
          keyword: record.keyword,
          domain: record.domain,
          source: record.source,
          learnedNow: false,
        });
      }
    }

    // 2. The analysis (scoped interpretation when a scope is set);
    //    learning is skipped here so it happens exactly once, below
    const analysisReport = await this.analyze(source, request, true);
    const analysis = analysisReport.analysis;

    // 3. Learning per the policy: which tokens were new?
    const candidatesBefore = new Set(Object.keys(this.state.data.candidates));
    const identifiers = Array.from(new Set(
      (source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
        .map((id) => id.toLowerCase())
        .filter((id) => id.length >= 4)
    ));
    const knownKeywords = new Set(
      this.vault.search().map((r) => r.keyword)
    );
    const newTokens = identifiers.filter(
      (id) => !knownKeywords.has(id) && !candidatesBefore.has(id)
    );

    const learned: InterpretationMatch[] = [];
    const learningActive =
      this.options.enableLearning && this.policy.learningMode === 'on';
    if (learningActive) {
      const promoted = this.state.learnFromSource(
        source,
        analysisReport.language
      );
      for (const def of promoted) {
        learned.push({
          keyword: def.keyword,
          domain: def.domain,
          source: def.source,
          learnedNow: true,
        });
        // Post-interpretation truth: a just-learned keyword IS history
        // now — reflect it in matched, marked learnedNow.
        const idx = matched.findIndex((m) => m.keyword === def.keyword);
        if (idx >= 0) {
          matched[idx].learnedNow = true;
        } else {
          matched.push({
            keyword: def.keyword,
            domain: def.domain,
            source: def.source,
            learnedNow: true,
          });
        }
      }
    }

    // 4. Standards for anything this interpretation would produce
    const target =
      request.platform && request.platform !== 'auto'
        ? request.platform
        : analysis.platform;
    const standards = resolveStandards(
      String(target),
      scope?.codeStandards
    );

    return {
      tokenCount: identifiers.length,
      matched,
      newTokens,
      learned,
      analysis,
      route: analysisReport.route,
      scope: request.scope,
      standards,
    };
  }

  // ==========================================================================
  // Vocabulary ingestion: documents enrich the vault
  // ==========================================================================

  /**
   * Ingest a workflow DSL document's vocabulary into the definition vault.
   * Product names, categories and meal names become persisted entity
   * definitions of their domain — so any future source mentioning them
   * scores toward that domain. This is the register being fed by the
   * high-level language definitions themselves.
   *
   * Returns the records created (or updated) by this ingestion.
   */
  ingestDocumentVocabulary(
    dslSource: string,
    options: { clientId?: string } = {}
  ): { domain: string; keyword: string; kind: string }[] {
    const doc = parseWorkflowDsl(dslSource);
    const created: { domain: string; keyword: string; kind: string }[] = [];

    for (const collection of doc.spec.collections) {
      for (const product of collection.products) {
        const existing = this.vault.lookupInDomain(product.name, doc.domain);
        if (existing) {
          this.vault.recordEncounter(product.name, doc.domain);
        } else {
          this.vault.define(product.name, doc.domain, {
            kind: 'entity',
            semantics: `food product tracked in collection "${collection.name}"`,
            confidence: 0.75,
            taughtBy: options.clientId,
          });
        }
        created.push({ domain: doc.domain, keyword: product.name, kind: 'entity' });

        if (product.category) {
          const catExisting = this.vault.lookupInDomain(product.category, doc.domain);
          if (!catExisting) {
            this.vault.define(product.category, doc.domain, {
              kind: 'entity',
              semantics: `product category (seen on ${product.name})`,
              confidence: 0.7,
              taughtBy: options.clientId,
            });
            created.push({ domain: doc.domain, keyword: product.category, kind: 'entity' });
          }
        }
      }
    }

    for (const meal of doc.spec.mealPlan ?? []) {
      if (!meal.name) continue;
      if (!this.vault.lookupInDomain(meal.name, doc.domain)) {
        this.vault.define(meal.name, doc.domain, {
          kind: 'entity',
          semantics: 'planned meal',
          confidence: 0.7,
          taughtBy: options.clientId,
        });
        created.push({ domain: doc.domain, keyword: meal.name, kind: 'entity' });
      }
    }

    this.state.logProgress(
      'keyword-learned',
      `ingested ${created.length} vocabulary entries from workflow document "${doc.title}"`
    );
    this.state.save();
    return created;
  }

  // ==========================================================================
  // Client feedback (moved upstream on promotion)
  // ==========================================================================

  /**
   * Record a client's feedback. Feedback lives on the client profile; once
   * the same feedback arrives from enough clients (or is approved), it is
   * promoted upstream into the shared definitions and applies to everyone.
   *
   * Value formats:
   *   platform-preference: "web-backend=native"        (domain=platform)
   *   output-style:        "go=explicit-types"          (scope=style)
   *   keyword-domain:      "wasm_bindgen=wasm"          (keyword=domain)
   *   transpile-pair / general: free-form value
   */
  feedback(
    clientId: string,
    subject: FeedbackRecord['subject'],
    value: string,
    options: { approve?: boolean } = {}
  ): FeedbackRecord {
    return this.state.recordFeedback(clientId, subject, value, options);
  }

  /** Explicitly promote a feedback value upstream (applies to all clients). */
  promoteUpstream(subject: FeedbackRecord['subject'], value: string): void {
    this.state.promoteFeedback(subject, value);
  }

  /** Client profiles with their feedback records. */
  clients(): Record<string, { requests: number; feedback: FeedbackRecord[] }> {
    const out: Record<string, { requests: number; feedback: FeedbackRecord[] }> = {};
    for (const [id, profile] of Object.entries(this.state.data.clients)) {
      out[id] = { requests: profile.requests, feedback: profile.feedback };
    }
    return out;
  }

  // ==========================================================================
  // Progress goals (the internal roadmap)
  // ==========================================================================

  defineGoal(title: string, notes?: string): Goal {
    return this.state.defineGoal(title, notes);
  }

  startGoal(goalId: string): void {
    this.state.startGoal(goalId);
  }

  completeGoal(goalId: string, notes?: string): void {
    this.state.completeGoal(goalId, notes);
  }

  goals(): Goal[] {
    return this.state.data.goals;
  }

  progressLog(limit = 50): { at: number; kind: string; detail: string }[] {
    return this.state.data.progressLog.slice(-limit);
  }

  /**
   * The self-going loop: advance planned goals the engine knows how to
   * satisfy on its own. Recognized goal titles:
   *   - "verify-transpile-pairs": exercise every structural transpile pair
   *     with a built-in sample and record the outcome in the persistent
   *     state (success rates become empirical evidence).
   *   - "promote-pending-feedback": run the upstream promotion sweep.
   *   - "run-hello-world-per-language": run a hello-world through every
   *     available native toolchain.
   * Unknown goals are left for the caller (or an LLM turn) to handle.
   */
  async autoAdvance(): Promise<{ advanced: string[]; stillPlanned: string[] }> {
    const advanced: string[] = [];
    const stillPlanned: string[] = [];

    for (const goal of this.state.data.goals) {
      if (goal.status !== 'planned') continue;

      const known =
        goal.title === 'verify-transpile-pairs' ||
        goal.title === 'promote-pending-feedback' ||
        goal.title === 'run-hello-world-per-language';

      // Unknown goals remain 'planned' — available for the caller or a
      // future strategy (e.g. an LLM turn) to pick up.
      if (!known) {
        stillPlanned.push(goal.title);
        continue;
      }

      this.state.startGoal(goal.id);
      try {
        if (goal.title === 'verify-transpile-pairs') {
          await this.goalVerifyTranspilePairs();
          this.state.completeGoal(goal.id, 'all structural pairs exercised');
        } else if (goal.title === 'promote-pending-feedback') {
          this.goalPromotePendingFeedback();
          this.state.completeGoal(goal.id, 'promotion sweep complete');
        } else if (goal.title === 'run-hello-world-per-language') {
          const results = await this.goalRunHelloWorlds();
          this.state.completeGoal(goal.id, results);
        }
        advanced.push(goal.title);
      } catch (err) {
        this.state.failGoal(goal.id, String(err));
      }
    }

    return { advanced, stillPlanned };
  }

  private async goalVerifyTranspilePairs(): Promise<void> {
    const samples: Record<string, string> = {
      rust: 'fn main() {\n    let x = 40;\n    println!("{}", x + 2);\n}\n',
      haskell: 'module Main where\n\nmain :: IO ()\nmain = do\n  putStrLn "verified"\n',
    };

    for (const pair of this.matrix.structuralPairs()) {
      const [from, to] = pair.split('->');
      const sample = samples[from];
      if (!sample) continue;
      const result = await this.matrix.transpile(sample, from, to);

      // Execute the produced source when a toolchain is available
      let ok = result.strategy === 'structural';
      if (ok) {
        const tc = this.toolchains.forLanguage(to);
        if (tc) {
          await tc.probe();
          if (tc.info.available) {
            const run = await tc.run(result.code, {
              timeoutMs: this.options.timeoutMs,
            });
            ok = run.ok;
          }
        }
      }
      this.state.noteTranspile(pair, result.strategy, ok);
    }
  }

  private goalPromotePendingFeedback(): void {
    // Promote every un-promoted feedback whose value is shared by >= 2 clients
    const byValue: Record<string, { subject: FeedbackRecord['subject']; value: string; clients: Set<string> }> = {};
    for (const profile of Object.values(this.state.data.clients)) {
      for (const fb of profile.feedback) {
        if (fb.promoted) continue;
        const key = `${fb.subject}::${fb.value}`;
        (byValue[key] ||= { subject: fb.subject, value: fb.value, clients: new Set() }).clients.add(profile.id);
      }
    }
    for (const entry of Object.values(byValue)) {
      if (entry.clients.size >= 2) {
        this.state.promoteFeedback(entry.subject, entry.value);
      }
    }
  }

  private async goalRunHelloWorlds(): Promise<string> {
    const samples: Record<string, { source: string; entryFile?: string }> = {
      go: { source: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("hello") }\n' },
      java: { source: 'public class Main {\n    public static void main(String[] a) { System.out.println("hello"); }\n}\n' },
      javascript: { source: 'console.log("hello");\n' },
      typescript: { source: 'const msg: string = "hello";\nconsole.log(msg);\n' },
      rust: { source: 'fn main() {\n    println!("hello");\n}\n' },
      haskell: { source: 'module Main where\n\nmain :: IO ()\nmain = do\n  putStrLn "hello"\n' },
      python: { source: 'print("hello")\n' },
    };

    const ran: string[] = [];
    for (const [language, sample] of Object.entries(samples)) {
      const report = await this.run(sample.source, { language });
      if (report.result.ok) ran.push(language);
    }
    return `ran: ${ran.join(', ')}`;
  }

  /** Filter feedback-sourced platforms down to the known PlatformTarget union. */
  private validatedPlatformOverrides(
    raw: Record<string, string>
  ): Record<string, PlatformTarget> {
    const valid: PlatformTarget[] = [
      'native', 'jvm', 'node', 'deno', 'browser', 'wasm', 'wasi', 'docker', 'ir',
    ];
    const out: Record<string, PlatformTarget> = {};
    for (const [domain, platform] of Object.entries(raw)) {
      if (valid.includes(platform as PlatformTarget)) {
        out[domain] = platform as PlatformTarget;
      }
    }
    return out;
  }

  /**
   * Keyword definitions from this client's unpromoted keyword-domain
   * feedback. They steer analysis for this client only until promoted.
   */
  private clientKeywordDefinitions(clientId?: string): Record<string, { domain: string; confidence: number }> {
    if (!clientId) return {};
    const profile = this.state.data.clients[clientId];
    if (!profile) return {};
    const out: Record<string, { domain: string; confidence: number }> = {};
    for (const fb of profile.feedback) {
      if (fb.subject === 'keyword-domain' && !fb.promoted) {
        const [keyword, domain] = fb.value.split('=');
        if (keyword && domain) out[keyword.trim().toLowerCase()] = { domain: domain.trim(), confidence: 0.6 };
      }
    }
    return out;
  }

  /** Per-client platform preferences from unpromoted feedback (client-local). */
  private clientPlatformOverrides(clientId?: string): Record<string, string> {
    if (!clientId) return {};
    const profile = this.state.data.clients[clientId];
    if (!profile) return {};
    const overrides: Record<string, string> = {};
    for (const fb of profile.feedback) {
      if (fb.subject === 'platform-preference' && !fb.promoted) {
        const [domain, platform] = fb.value.split('=');
        if (domain && platform) overrides[domain.trim()] = platform.trim();
      }
    }
    return overrides;
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
