/**
 * Universal Transpiler - Persistent State
 *
 * The self-going entity's memory. Everything learned is persisted to disk
 * so the system keeps its definitions across restarts:
 *
 * - keyword definitions: a new keyword encountered in source is noted as a
 *   candidate immediately; once it repeatedly co-occurs with a domain's
 *   known keywords across encounters, it is promoted to a persistent
 *   definition and influences future domain analysis.
 * - client profiles + feedback: feedback is recorded per client; when the
 *   same feedback arrives from multiple clients (or is explicitly approved)
 *   it is promoted upstream into the shared definitions that affect every
 *   client.
 * - transpile statistics: per-pair success rates, used to report and rank
 *   what the entity has empirically proven.
 * - progress goals: the internal roadmap. The engine advances it on its own
 *   (autoAdvance) and consults it when deciding how to produce output.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DOMAIN_CATALOG } from '../domains/domain-analyzer';

// ============================================================================
// Types
// ============================================================================

export type KeywordSource = 'builtin' | 'learned' | 'client-promoted';

export interface KeywordDefinition {
  keyword: string;
  domain: string;
  confidence: number;
  source: KeywordSource;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  /** Vault enrichment (persisted): what the keyword denotes in the domain */
  kind?: string;
  /** Vault enrichment (persisted): human-readable semantics */
  semantics?: string;
  /** Vault enrichment (persisted): a concrete hint consumers act on */
  hint?: string;
  /** Vault enrichment (persisted): which client taught this definition */
  taughtBy?: string;
}

export interface FeedbackRecord {
  id: string;
  clientId: string;
  subject: 'platform-preference' | 'transpile-pair' | 'output-style' | 'keyword-domain' | 'general';
  value: string;
  createdAt: number;
  /** Explicit promotion approval by the client */
  approve?: boolean;
  /** Whether this record has been merged upstream */
  promoted?: boolean;
}

export interface ClientProfile {
  id: string;
  createdAt: number;
  lastSeen: number;
  requests: number;
  feedback: FeedbackRecord[];
}

export type GoalStatus = 'planned' | 'in_progress' | 'done' | 'failed';

export interface Goal {
  id: string;
  title: string;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
  notes?: string;
}

export interface ProgressEntry {
  at: number;
  kind: 'goal-defined' | 'goal-started' | 'goal-done' | 'goal-failed' |
        'keyword-candidate' | 'keyword-learned' |
        'feedback-recorded' | 'feedback-promoted' |
        'transpile-verified' | 'client-seen' | 'note';
  detail: string;
}

export interface PersistentStateData {
  version: string;
  createdAt: number;
  updatedAt: number;
  /** Confirmed keyword -> domain definitions (persistent, domain-scoped keys) */
  keywords: Record<string, KeywordDefinition>;
  /**
   * User-owned scope setups (the user-mutable tier of the mutability
   * contract). The system never writes these; the user owns them.
   */
  scopes: Record<string, unknown>;
  /**
   * How many distinct clients must corroborate feedback before it moves
   * upstream. Configurable policy data (was a hardcoded constant).
   */
  promotionThreshold: number;
  /** Unconfirmed keyword candidates awaiting repeated evidence */
  candidates: Record<string, Record<string, number>>;
  clients: Record<string, ClientProfile>;
  goals: Goal[];
  progressLog: ProgressEntry[];
  transpileStats: Record<string, { uses: number; successes: number; strategy: string }>;
  /** Promoted (upstreamed) preferences applied for every client */
  upstream: {
    platformPreferences: Record<string, string>;
    outputStyles: Record<string, string>;
  };
}

export interface LearnOptions {
  /** Minimum distinct encounters before a candidate becomes a definition */
  minEncounters?: number;
  /** Minimum share of domain observations for confirmation */
  minDominance?: number;
  /** Identifier length threshold for learning */
  minKeywordLength?: number;
}

// ============================================================================
// Persistent State
// ============================================================================

const DEFAULT_MIN_ENCOUNTERS = 3;
const DEFAULT_MIN_DOMINANCE = 0.6;
// (The promotion threshold is policy data: state.data.promotionThreshold)

export class PersistentState {
  readonly statePath: string;
  data: PersistentStateData;
  private options: Required<LearnOptions>;
  /**
   * Policy flag: when true, unknown keywords are recorded as candidates
   * but never promoted to definitions. Controlled by the engine's
   * decision policy (learningMode: 'observe-only').
   */
  observeOnly = false;

  constructor(statePath?: string, options?: LearnOptions) {
    this.statePath =
      statePath || path.join(os.homedir(), '.universal-transpiler', 'state.json');
    this.options = {
      minEncounters: options?.minEncounters ?? DEFAULT_MIN_ENCOUNTERS,
      minDominance: options?.minDominance ?? DEFAULT_MIN_DOMINANCE,
      minKeywordLength: options?.minKeywordLength ?? 4,
    };
    this.data = this.freshState();
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private freshState(): PersistentStateData {
    return {
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      keywords: {},
      scopes: {},
      promotionThreshold: 2,
      candidates: {},
      clients: {},
      goals: [],
      progressLog: [],
      transpileStats: {},
      upstream: { platformPreferences: {}, outputStyles: {} },
    };
  }

  /** Load persisted state from disk (keeps builtins merged). */
  load(): PersistentStateData {
    try {
      const raw = fs.readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistentStateData;
      this.data = { ...this.freshState(), ...parsed };
      return this.data;
    } catch {
      // No state yet (first run) or unreadable: start fresh.
      return this.data;
    }
  }

  /** Persist to disk atomically (tmp file + rename). */
  save(): void {
    this.data.updatedAt = Date.now();
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.statePath);
  }

  // ==========================================================================
  // Keyword learning — persist definitions on encounter
  // ==========================================================================

  /** All domain keywords from the built-in catalog, lowercased. */
  private builtinKeywordDomain(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const domain of DOMAIN_CATALOG) {
      for (const kw of domain.keywords) map[kw] = domain.id;
    }
    return map;
  }

  /**
   * Learn from a source string. Returns keywords learned (promoted to
   * definitions) during this encounter. Every candidate observation and
   * every learned definition is persisted.
   */
  learnFromSource(source: string, _language?: string): KeywordDefinition[] {
    const builtin = this.builtinKeywordDomain();
    const lower = source.toLowerCase();

    // Which domains does this source signal? (via known keywords present)
    const domainSignal: Record<string, number> = {};
    for (const [kw, domain] of Object.entries(builtin)) {
      if (lower.includes(kw)) domainSignal[domain] = (domainSignal[domain] || 0) + 1;
    }
    for (const def of Object.values(this.data.keywords)) {
      if (lower.includes(def.keyword)) domainSignal[def.domain] = (domainSignal[def.domain] || 0) + 1;
    }
    const signaled = Object.entries(domainSignal)
      .sort((a, b) => b[1] - a[1])
      .map(([d]) => d);

    // Extract identifiers
    const identifiers = Array.from(new Set(
      (source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
        .map((id) => id.toLowerCase())
        .filter((id) => id.length >= this.options.minKeywordLength)
    ));

    const learned: KeywordDefinition[] = [];
    const now = Date.now();

    for (const id of identifiers) {
      // Known keyword (defined in ANY domain): bump occurrence stats
      const existing = Object.values(this.data.keywords).find((d) => d.keyword === id);
      if (existing) {
        existing.occurrences += 1;
        existing.lastSeen = now;
        continue;
      }
      if (builtin[id]) continue; // builtin keywords tracked implicitly

      // Unknown identifier: record candidate observations against signaled domains
      if (signaled.length === 0) continue;
      const candidates = (this.data.candidates[id] ||= {});

      // The identifier is observed once per source, attributed to the top domains
      for (const domain of signaled.slice(0, 2)) {
        candidates[domain] = (candidates[domain] || 0) + 1;
      }

      // Promote to a persistent definition once evidence is strong
      const total = Object.values(candidates).reduce((a, b) => a + b, 0);
      const [topDomain, topCount] = Object.entries(candidates).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      if (
        this.observeOnly
      ) {
        // observe-only policy: candidates are recorded but never promoted
        continue;
      }
      if (
        topDomain &&
        total >= this.options.minEncounters &&
        topCount / total >= this.options.minDominance
      ) {
        const def: KeywordDefinition = {
          keyword: id,
          domain: topDomain,
          confidence: Math.min(0.9, 0.3 + 0.15 * (topCount - this.options.minEncounters + 1)),
          source: 'learned',
          firstSeen: now,
          lastSeen: now,
          occurrences: total,
        };
        // Domain-scoped key: one keyword may be defined per domain
        this.data.keywords[`${id}::${topDomain}`] = def;
        delete this.data.candidates[id];
        this.logProgress('keyword-learned', `"${id}" -> domain ${topDomain} (after ${total} encounters)`);
        learned.push(def);
      } else {
        this.logProgress('keyword-candidate', `"${id}" observed with ${topDomain ?? 'no domain'} (${total}/${this.options.minEncounters} encounters)`);
      }
    }

    this.save();
    return learned;
  }

  /**
   * Teach a keyword definition explicitly (e.g. from client feedback).
   * Persisted immediately — this is the "persist desired functionality and
   * definitions upon new encounter" contract.
   */
  /** Storage key for a domain-scoped keyword record. */
  static keywordKey(keyword: string, domain: string): string {
    return `${keyword.toLowerCase()}::${domain}`;
  }

  defineKeyword(keyword: string, domain: string, source: KeywordSource = 'client-promoted', confidence = 0.8): KeywordDefinition {
    const now = Date.now();
    const key = PersistentState.keywordKey(keyword, domain);
    const existing = this.data.keywords[key];
    const def: KeywordDefinition = {
      keyword: keyword.toLowerCase(),
      domain,
      confidence,
      source,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,
      occurrences: (existing?.occurrences ?? 0) + 1,
      kind: existing?.kind,
      semantics: existing?.semantics,
      hint: existing?.hint,
      taughtBy: existing?.taughtBy,
    };
    this.data.keywords[key] = def;
    delete this.data.candidates[def.keyword];
    this.logProgress('keyword-learned', `"${def.keyword}" defined as ${domain} (${source})`);
    this.save();
    return def;
  }

  /**
   * Learned keyword definitions as a scoring map for domain analysis.
   * When a keyword is defined in several domains, the analyzer scores it
   * in EACH domain it is defined in — so the map is flattened to the
   * highest-confidence definition per keyword here, while the vault
   * exposes the full domain-scoped records for consumers that need them.
   */
  learnedKeywordMap(): Record<string, { domain: string; confidence: number }> {
    const map: Record<string, { domain: string; confidence: number }> = {};
    for (const def of Object.values(this.data.keywords)) {
      if (def.source === 'builtin') continue;
      const current = map[def.keyword];
      if (!current || def.confidence > current.confidence) {
        map[def.keyword] = { domain: def.domain, confidence: def.confidence };
      }
    }
    return map;
  }

  getKeywordDefinition(keyword: string): KeywordDefinition | undefined {
    return Object.values(this.data.keywords).find((d) => d.keyword === keyword.toLowerCase());
  }

  // ==========================================================================
  // Clients and feedback
  // ==========================================================================

  /** Register activity for a client (created on first request). */
  touchClient(clientId: string): ClientProfile {
    const now = Date.now();
    let profile = this.data.clients[clientId];
    if (!profile) {
      profile = { id: clientId, createdAt: now, lastSeen: now, requests: 0, feedback: [] };
      this.data.clients[clientId] = profile;
      this.logProgress('client-seen', `client "${clientId}" registered`);
    }
    profile.lastSeen = now;
    profile.requests += 1;
    this.save();
    return profile;
  }

  /** Record feedback for a client. Auto-promotes when the threshold is met. */
  recordFeedback(
    clientId: string,
    subject: FeedbackRecord['subject'],
    value: string,
    options: { approve?: boolean } = {}
  ): FeedbackRecord {
    this.touchClient(clientId);
    const record: FeedbackRecord = {
      id: `fb-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      clientId,
      subject,
      value,
      createdAt: Date.now(),
      approve: options.approve,
    };
    this.data.clients[clientId].feedback.push(record);
    this.logProgress('feedback-recorded', `client "${clientId}" -> ${subject}: ${value}`);
    this.save();

    // Promotion threshold check: identical subject+value from enough
    // clients (the threshold is policy data, configurable per system)
    const agreeing = Object.values(this.data.clients).filter((c) =>
      c.feedback.some((f) => f.subject === subject && f.value === value)
    );
    if (options.approve || agreeing.length >= this.data.promotionThreshold) {
      this.promoteFeedback(subject, value);
    }
    return record;
  }

  /**
   * Promote a feedback value upstream: it leaves the per-client namespace
   * and becomes part of the shared definitions every client benefits from.
   */
  promoteFeedback(subject: FeedbackRecord['subject'], value: string): void {
    switch (subject) {
      case 'platform-preference': {
        // value format: "<domainId>=<platform>"
        const [domain, platform] = value.split('=');
        if (domain && platform) {
          this.data.upstream.platformPreferences[domain.trim()] = platform.trim();
        }
        break;
      }
      case 'output-style': {
        // value format: "<scope>=<style>" (scope is a language or domain)
        const [scope, style] = value.split('=');
        if (scope && style) {
          this.data.upstream.outputStyles[scope.trim()] = style.trim();
        }
        break;
      }
      case 'keyword-domain': {
        // value format: "<keyword>=<domain>"
        const [keyword, domain] = value.split('=');
        if (keyword && domain) {
          const def = this.defineKeyword(keyword.trim(), domain.trim(), 'client-promoted');
          // Remember the first client that taught this definition
          const firstTeacher = Object.values(this.data.clients)
            .flatMap((client) => client.feedback)
            .filter((fb) => fb.subject === subject && fb.value === value)
            .sort((a, b) => a.createdAt - b.createdAt)[0];
          def.taughtBy = firstTeacher?.clientId;
        }
        break;
      }
      default:
        break;
    }

    // Mark matching client records as promoted
    for (const client of Object.values(this.data.clients)) {
      for (const fb of client.feedback) {
        if (fb.subject === subject && fb.value === value) fb.promoted = true;
      }
    }
    this.logProgress('feedback-promoted', `${subject} "${value}" moved upstream (applies to all clients)`);
    this.save();
  }

  /** Upstreamed platform preference for a domain, if any. */
  upstreamPlatformFor(domainId: string): string | undefined {
    return this.data.upstream.platformPreferences[domainId];
  }

  upstreamOutputStyleFor(scope: string): string | undefined {
    return this.data.upstream.outputStyles[scope];
  }

  // ==========================================================================
  // Transpile statistics
  // ==========================================================================

  noteTranspile(pair: string, strategy: string, success: boolean): void {
    const stats = (this.data.transpileStats[pair] ||= { uses: 0, successes: 0, strategy });
    stats.uses += 1;
    if (success) stats.successes += 1;
    stats.strategy = strategy;
    if (success) {
      this.logProgress('transpile-verified', `${pair} via ${strategy} (success rate ${stats.successes}/${stats.uses})`);
    }
    this.save();
  }

  successRate(pair: string): number | null {
    const stats = this.data.transpileStats[pair];
    if (!stats || stats.uses === 0) return null;
    return stats.successes / stats.uses;
  }

  // ==========================================================================
  // Progress goals
  // ==========================================================================

  defineGoal(title: string, notes?: string): Goal {
    const now = Date.now();
    const goal: Goal = {
      id: `goal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      title,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
      notes,
    };
    this.data.goals.push(goal);
    this.logProgress('goal-defined', `${title}`);
    this.save();
    return goal;
  }

  startGoal(goalId: string): void {
    const goal = this.data.goals.find((g) => g.id === goalId);
    if (goal) {
      goal.status = 'in_progress';
      goal.updatedAt = Date.now();
      this.logProgress('goal-started', goal.title);
      this.save();
    }
  }

  completeGoal(goalId: string, notes?: string): void {
    const goal = this.data.goals.find((g) => g.id === goalId);
    if (goal) {
      goal.status = 'done';
      goal.updatedAt = Date.now();
      if (notes) goal.notes = notes;
      this.logProgress('goal-done', `${goal.title}${notes ? ` — ${notes}` : ''}`);
      this.save();
    }
  }

  failGoal(goalId: string, notes?: string): void {
    const goal = this.data.goals.find((g) => g.id === goalId);
    if (goal) {
      goal.status = 'failed';
      goal.updatedAt = Date.now();
      if (notes) goal.notes = notes;
      this.logProgress('goal-failed', `${goal.title}${notes ? ` — ${notes}` : ''}`);
      this.save();
    }
  }

  goalByTitle(title: string): Goal | undefined {
    return this.data.goals.find((g) => g.title === title);
  }

  logProgress(kind: ProgressEntry['kind'], detail: string): void {
    this.data.progressLog.push({ at: Date.now(), kind, detail });
    // Keep the log bounded
    if (this.data.progressLog.length > 2000) {
      this.data.progressLog = this.data.progressLog.slice(-1000);
    }
  }

  /** A snapshot for introspection (state file contents minus live handles). */
  snapshot(): PersistentStateData {
    return JSON.parse(JSON.stringify(this.data));
  }
}

let sharedState: PersistentState | null = null;

/** Shared default state (one file per machine, at ~/.universal-transpiler/state.json). */
export function getSharedState(): PersistentState {
  if (!sharedState) {
    sharedState = new PersistentState();
    sharedState.load();
  }
  return sharedState;
}
