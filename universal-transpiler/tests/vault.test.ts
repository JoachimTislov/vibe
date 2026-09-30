/**
 * Universal Transpiler - Definition Vault Tests
 *
 * The transpiler as a register (vault) of keyword definitions scoped by
 * domain: lifecycle, persistence, domain scoping, feedback teaching,
 * DSL vocabulary ingestion, and the analyzer consuming vault records.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { DslSyntaxError } from '../src/domains/workflow-dsl';

const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-vault-state-'));
const STATE_PATH = path.join(STATE_DIR, 'state.json');

let engine: UniversalEngine;

beforeAll(() => {
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: STATE_PATH,
    // Fast learning for tests: candidates confirm after 2 encounters
    learn: { minEncounters: 2, minDominance: 0.6 },
  });
});

const DSL_DOCUMENT = `workflow food-tracking "Kitchen stock" {
    reference-date 2026-10-01
    horizon 7 days

    collection fridge "Fridge" {
        product Kefir (dairy): 2 expiring 2026-10-05
        product Halloumi (dairy): 1 non-expiring
    }

    consume Kefir at 1 per day

    meal 2026-10-03 "Halloumi grill" needs Halloumi x1
}
`;

describe('vault: definition lifecycle and persistence', () => {
  it('defines a keyword immediately with kind, semantics and provenance', () => {
    const record = engine.vault.define('kimchi', 'food-tracking', {
      kind: 'entity',
      semantics: 'fermented cabbage, fridge staple',
      confidence: 0.9,
      taughtBy: 'client-a',
    });

    expect(record.domain).toBe('food-tracking');
    expect(record.kind).toBe('entity');
    expect(record.semantics).toBe('fermented cabbage, fridge staple');
    expect(record.source).toBe('client-promoted');
    expect(record.taughtBy).toBe('client-a');
  });

  it('persists definitions: a fresh engine on the same state file reads them', () => {
    const second = new UniversalEngine({ statePath: STATE_PATH });
    const found = second.vault.lookupInDomain('kimchi', 'food-tracking');
    expect(found).toBeDefined();
    expect(found!.semantics).toBe('fermented cabbage, fridge staple');
    expect(found!.kind).toBe('entity');
  });

  it('records encounters: occurrences increase and persist', () => {
    const before = engine.vault.lookupInDomain('kimchi', 'food-tracking')!.occurrences;
    engine.vault.recordEncounter('kimchi', 'food-tracking');
    engine.vault.recordEncounter('kimchi', 'food-tracking');
    const after = engine.vault.lookupInDomain('kimchi', 'food-tracking')!.occurrences;
    expect(after).toBe(before + 2);
  });

  it('notes (not silently redefines) a keyword defined for a different domain', () => {
    // goroutine is cli-ish in the catalog sense; define it explicitly in
    // another domain and check the vault refuses to move it silently
    engine.vault.define('goroutine', 'systems', { kind: 'construct' });
    const record = engine.vault.recordEncounter('goroutine', 'web-backend');
    // Domain-scoped semantics: encountering it in an undefined domain
    // neither creates nor moves a definition — undefined + a logged note
    expect(record).toBeUndefined();
    const still = engine.vault.lookupInDomain('goroutine', 'systems');
    expect(still).toBeDefined();
    // A domain-agnostic encounter bumps the existing record
    const bumped = engine.vault.recordEncounter('goroutine');
    expect(bumped!.domain).toBe('systems');
  });
});

describe('vault: queries and stats', () => {
  it('looks up a keyword across every domain that defines it', () => {
    engine.vault.define('pipeline', 'ml', { kind: 'construct', semantics: 'training pipeline' });
    engine.vault.define('pipeline', 'data', { kind: 'construct', semantics: 'etl pipeline' });
    const records = engine.vault.lookup('pipeline');
    expect(records.map((r) => r.domain).sort()).toEqual(['data', 'ml']);
  });

  it('filters by domain, kind and text', () => {
    const entities = engine.vault.forDomain('food-tracking', { kind: 'entity' });
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.every((r) => r.domain === 'food-tracking' && r.kind === 'entity')).toBe(true);

    const text = engine.vault.search({ text: 'pipeline' });
    expect(text.length).toBe(2);
  });

  it('reports stats by domain, source and kind', () => {
    const stats = engine.vault.stats();
    expect(stats.totalDefinitions).toBeGreaterThan(0);
    expect(stats.byDomain['food-tracking']).toBeGreaterThan(0);
    expect(stats.bySource['client-promoted']).toBeGreaterThan(0);
    expect(stats.byKind['entity']).toBeGreaterThan(0);
  });

  it('infers kinds for legacy learned definitions', () => {
    // Learned keywords (from the learning loop) get kinds on read
    const records = engine.vault.search({ source: 'learned' });
    for (const record of records) {
      expect(['construct', 'entity', 'action', 'platform-hint', 'style', 'term']).toContain(record.kind);
    }
  });
});

describe('vault: the analyzer consumes vault records', () => {
  it('vault definitions steer domain analysis', async () => {
    // Before: a neutral source mentioning only the taught keyword
    engine.vault.define('sourdough', 'food-tracking', {
      kind: 'entity',
      confidence: 0.85,
    });

    const report = await engine.analyze('start sourdough tonight;');
    expect(report.analysis.matchedKeywords).toContain('sourdough (learned)');
  });

  it('client keyword-domain feedback teaches the vault (client-local until promoted)', async () => {
    engine.feedback('chef-client', 'keyword-domain', 'miso=paste', { approve: true });
    // Promoted: the vault now holds it as a global definition
    const found = engine.vault.lookupInDomain('miso', 'paste');
    expect(found).toBeDefined();
    expect(found!.source).toBe('client-promoted');
    expect(found!.taughtBy).toBe('chef-client');
  });
});

describe('vault: DSL documents enrich the register', () => {
  it('ingests product names, categories and meal names as entity definitions', () => {
    const created = engine.ingestDocumentVocabulary(DSL_DOCUMENT, { clientId: 'chef-client' });

    const names = created.map((c) => c.keyword);
    expect(names).toEqual(
      expect.arrayContaining(['Kefir', 'Halloumi', 'dairy', 'Halloumi grill'])
    );
    expect(created.every((c) => c.domain === 'food-tracking')).toBe(true);
    expect(created.every((c) => c.kind === 'entity')).toBe(true);

    // Semantics carried through
    const kefir = engine.vault.lookupInDomain('Kefir', 'food-tracking');
    expect(kefir!.semantics).toContain('Fridge');
  });

  it('ingested vocabulary steers future domain analysis', async () => {
    const report = await engine.analyze('remind me about the halloumi grill and kefir');
    expect(report.analysis.domain.id).toBe('food-tracking');
  });

  it('re-ingestion bumps occurrences instead of duplicating', () => {
    const before = engine.vault.lookupInDomain('Kefir', 'food-tracking')!.occurrences;
    engine.ingestDocumentVocabulary(DSL_DOCUMENT);
    const after = engine.vault.lookupInDomain('Kefir', 'food-tracking')!.occurrences;
    expect(after).toBe(before + 1);
    // Still exactly one Kefir record in the domain (keywords are stored
    // lowercased; the dairy record's semantics mention Kefir, so match the
    // keyword exactly)
    const records = engine.vault.forDomain('food-tracking').filter((r) => r.keyword === 'kefir');
    expect(records).toHaveLength(1);
  });

  it('rejects invalid documents with the DSL syntax error', () => {
    try {
      engine.ingestDocumentVocabulary('workflow broken {');
      throw new Error('expected DslSyntaxError');
    } catch (err) {
      expect(err).toBeInstanceOf(DslSyntaxError);
    }
  });
});

describe('vault: the register survives restart end to end', () => {
  it('carries definitions, candidates and stats across engine restarts', () => {
    const fresh = new UniversalEngine({ statePath: STATE_PATH });
    const kimchi = fresh.vault.lookupInDomain('kimchi', 'food-tracking');
    const stats = fresh.vault.stats();

    expect(kimchi).toBeDefined();
    expect(kimchi!.semantics).toBe('fermented cabbage, fridge staple');
    expect(stats.totalDefinitions).toBeGreaterThan(3);
    expect(fresh.vault.candidates().length).toBeGreaterThan(0);
  });
});
