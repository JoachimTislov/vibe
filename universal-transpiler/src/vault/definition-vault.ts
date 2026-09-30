/**
 * Universal Transpiler - Definition Vault
 *
 * The transpiler reframed: a register (vault) of keyword definitions,
 * scoped by domain. Every keyword the system ever encounters — built-in,
 * learned from repeated encounters, taught by clients, promoted from
 * feedback, or declared in DSL documents — lives here as a first-class
 * record with provenance, confidence and semantics.
 *
 * Everything else consumes the vault:
 *   - domain analysis scores sources by looking keywords up in it
 *   - the persistent learning loop writes encounters into it
 *   - client feedback teaches it (keyword-domain), promotion publishes
 *     definitions from a single client's namespace to every client
 *   - DSL documents register their domain vocabulary into it
 *
 * Storage is the persistent state file: the vault IS the durable memory,
 * so definitions survive restarts by construction.
 */

import { PersistentState } from '../engine/persistent-state';
import type { KeywordSource } from '../engine/persistent-state';

// ============================================================================
// Vault record types
// ============================================================================

/** What kind of thing a keyword denotes in its domain. */
export type KeywordKind =
  | 'construct'      // a language/framework construct (println, goroutine, defer)
  | 'entity'         // a domain entity (product, recipe, collection)
  | 'action'         // a domain operation (track, transpile, build)
  | 'platform-hint'  // signals a target platform (wasm_bindgen -> wasm)
  | 'style'          // an output-style marker (explicit-types)
  | 'term';          // general domain vocabulary

/** A single vault record: one keyword, one domain. */
export interface VaultRecord {
  /** The keyword, normalized (lowercased) */
  keyword: string;
  /** The domain the keyword is defined IN (domain-scoped register) */
  domain: string;
  kind: KeywordKind;
  /** Human-readable semantics: what the keyword means in this domain */
  semantics?: string;
  /** Optional concrete hint the consumers act on (e.g. a platform) */
  hint?: string;
  confidence: number;
  source: KeywordSource;
  firstSeen: number;
  lastSeen: number;
  /** How many times the keyword has been observed in sources */
  occurrences: number;
  /** Who taught it (clientId), when client-sourced */
  taughtBy?: string;
}

export interface VaultStats {
  totalDefinitions: number;
  pendingCandidates: number;
  byDomain: Record<string, number>;
  bySource: Record<KeywordSource, number>;
  byKind: Record<KeywordKind, number>;
}

export interface VaultQuery {
  domain?: string;
  kind?: KeywordKind;
  source?: KeywordSource;
  /** Only definitions with confidence >= min */
  minConfidence?: number;
  /** Text match on keyword or semantics (case-insensitive substring) */
  text?: string;
}

// ============================================================================
// The vault
// ============================================================================

export class DefinitionVault {
  constructor(private readonly state: PersistentState) {}

  // ==========================================================================
  // Reads
  // ==========================================================================

  /** Look up a keyword across all domains (every domain that defines it). */
  lookup(keyword: string): VaultRecord[] {
    const key = keyword.toLowerCase();
    const records: VaultRecord[] = [];
    for (const def of Object.values(this.state.data.keywords)) {
      if (def.keyword === key) records.push(this.toRecord(def));
    }

    // Client-taught keywords that have not been promoted are not global
    // definitions yet — they live in feedback records. Surface them too,
    // marked with their owner.
    for (const profile of Object.values(this.state.data.clients)) {
      for (const fb of profile.feedback) {
        if (fb.subject === 'keyword-domain' && !fb.promoted) {
          const [kw, dom] = fb.value.split('=');
          if (kw && dom && kw.trim().toLowerCase() === key) {
            records.push({
              keyword: key,
              domain: dom.trim(),
              kind: 'term',
              confidence: 0.6,
              source: 'learned',
              firstSeen: fb.createdAt,
              lastSeen: fb.createdAt,
              occurrences: 1,
              taughtBy: profile.id,
            });
          }
        }
      }
    }
    return records;
  }

  /** Look up a keyword in one specific domain. */
  lookupInDomain(keyword: string, domain: string): VaultRecord | undefined {
    const def = this.state.data.keywords[PersistentState.keywordKey(keyword, domain)];
    return def ? this.toRecord(def) : undefined;
  }

  /** All definitions in a domain. */
  forDomain(domain: string, query: Omit<VaultQuery, 'domain'> = {}): VaultRecord[] {
    return this.search({ ...query, domain });
  }

  /** Query the vault. */
  search(query: VaultQuery = {}): VaultRecord[] {
    let records = Object.values(this.state.data.keywords).map((d) => this.toRecord(d));

    if (query.domain) records = records.filter((r) => r.domain === query.domain);
    if (query.kind) records = records.filter((r) => r.kind === query.kind);
    if (query.source) records = records.filter((r) => r.source === query.source);
    if (query.minConfidence !== undefined) {
      records = records.filter((r) => r.confidence >= (query.minConfidence as number));
    }
    if (query.text) {
      const needle = query.text.toLowerCase();
      records = records.filter(
        (r) => r.keyword.includes(needle) || (r.semantics ?? '').toLowerCase().includes(needle)
      );
    }
    return records.sort((a, b) => b.occurrences - a.occurrences || a.keyword.localeCompare(b.keyword));
  }

  /** A keyword->domain scoring map for the domain analyzer (same shape the
   *  engine already passes to analyzeDomain). */
  scoringMap(): Record<string, { domain: string; confidence: number }> {
    const map: Record<string, { domain: string; confidence: number }> = {};
    for (const def of Object.values(this.state.data.keywords)) {
      if (def.source !== 'builtin') {
        map[def.keyword] = { domain: def.domain, confidence: def.confidence };
      }
    }
    return map;
  }

  /** Unconfirmed candidates awaiting repeated encounters. */
  candidates(): { keyword: string; observations: Record<string, number> }[] {
    return Object.entries(this.state.data.candidates).map(([keyword, observations]) => ({
      keyword,
      observations,
    }));
  }

  stats(): VaultStats {
    const byDomain: Record<string, number> = {};
    const bySource: Record<KeywordSource, number> = {
      builtin: 0, learned: 0, 'client-promoted': 0,
    };
    const byKind: Record<KeywordKind, number> = {
      construct: 0, entity: 0, action: 0, 'platform-hint': 0, style: 0, term: 0,
    };

    for (const def of Object.values(this.state.data.keywords)) {
      byDomain[def.domain] = (byDomain[def.domain] || 0) + 1;
      bySource[def.source] = (bySource[def.source] || 0) + 1;
      const kind = (def.kind as KeywordKind) ?? this.inferKind(def.keyword, def.domain);
      byKind[kind] = (byKind[kind] || 0) + 1;
    }

    return {
      totalDefinitions: Object.keys(this.state.data.keywords).length,
      pendingCandidates: Object.keys(this.state.data.candidates).length,
      byDomain,
      bySource,
      byKind,
    };
  }

  // ==========================================================================
  // Writes (all persist immediately)
  // ==========================================================================

  /**
   * Define a keyword in a domain. Persists immediately — the
   * persist-on-encounter contract.
   */
  define(
    keyword: string,
    domain: string,
    options: {
      kind?: KeywordKind;
      semantics?: string;
      hint?: string;
      confidence?: number;
      source?: KeywordSource;
      taughtBy?: string;
    } = {}
  ): VaultRecord {
    // Persist the enrichment on the state record itself — the vault is a
    // durable register, nothing enrichment-shaped stays in memory only.
    const def = this.state.defineKeyword(
      keyword,
      domain,
      options.source ?? (options.taughtBy ? 'client-promoted' : 'learned'),
      options.confidence ?? 0.8
    );
    def.kind = options.kind;
    def.semantics = options.semantics;
    def.hint = options.hint;
    def.taughtBy = options.taughtBy;
    this.state.save();
    return this.toRecord(def);
  }

  /**
   * Record that a keyword appeared in a source. Bumps occurrences for
   * known definitions; unknown keywords start their candidate lifecycle
   * via the state's learning loop (the engine already calls
   * learnFromSource per encounter — this method is for explicit,
   * single-keyword encounters such as DSL vocabulary).
   */
  recordEncounter(keyword: string, domain?: string): VaultRecord | undefined {
    const key = keyword.toLowerCase();
    if (domain) {
      // Domain-scoped encounter: the exact (keyword, domain) record
      const existing = this.state.data.keywords[PersistentState.keywordKey(key, domain)];
      if (existing) {
        existing.occurrences += 1;
        existing.lastSeen = Date.now();
        this.state.save();
        return this.toRecord(existing);
      }
      // Defined in another domain? Encounters are domain-scoped; defining
      // it here is an explicit act.
      const other = this.lookup(key);
      if (other.length > 0) {
        this.state.logProgress(
          'keyword-candidate',
          `"${key}" defined in ${other.map((r) => r.domain).join(', ')}; new domain ${domain} requires an explicit define`
        );
        return undefined;
      }
      return undefined;
    }
    // Domain-agnostic encounter: bump every record for the keyword
    const records = this.lookup(key);
    if (records.length === 0) return undefined;
    for (const def of Object.values(this.state.data.keywords)) {
      if (def.keyword === key) {
        def.occurrences += 1;
        def.lastSeen = Date.now();
      }
    }
    this.state.save();
    return records[0];
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  private toRecord(def: {
    keyword: string;
    domain: string;
    confidence: number;
    source: KeywordSource;
    firstSeen: number;
    lastSeen: number;
    occurrences: number;
    kind?: string;
    semantics?: string;
    hint?: string;
    taughtBy?: string;
  }): VaultRecord {
    return {
      keyword: def.keyword,
      domain: def.domain,
      kind: (def.kind as KeywordKind) ?? this.inferKind(def.keyword, def.domain),
      semantics: def.semantics,
      hint: def.hint,
      confidence: def.confidence,
      source: def.source,
      firstSeen: def.firstSeen,
      lastSeen: def.lastSeen,
      occurrences: def.occurrences,
      taughtBy: def.taughtBy,
    };
  }

  /** Best-effort kind inference for definitions created by the learning loop. */
  private inferKind(keyword: string, domain: string): KeywordKind {
    const knownPlatforms = ['wasm', 'jvm', 'node', 'browser', 'native', 'wasi', 'docker'];
    if (knownPlatforms.includes(domain)) return 'platform-hint';
    if (domain === 'food-tracking' || domain === 'recipes') {
      if (/(ing|cook|bake|prepare|plan|track|consume|buy|shop)/.test(keyword)) return 'action';
      if (/(product|recipe|collection|meal|list|pantry|entry)/.test(keyword)) return 'entity';
    }
    return 'term';
  }
}
