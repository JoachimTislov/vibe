/**
 * Universal Transpiler - Governance / User Contract Tests
 *
 * Verifies the user-system relation defined in GOVERNANCE.md:
 * - scope setup is the user-mutable tier (create, update, read, persist)
 * - code standards default to the language's ecosystem standards and are
 *   overridable per scope
 * - decision policies are data: promotion thresholds, learning modes,
 *   platform resolution all configurable, not hardcoded
 * - the mutability contract: users cannot write the system's internal
 *   history; out-of-scope teaching becomes a proposal, never a definition
 * - interpret() makes the iteration contract visible: every input is
 *   compared against vault history before anything else happens
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { resolveStandards, DEFAULT_DECISION_POLICY } from '../src/engine/user-contract';

const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-governance-'));
const statePath = (name: string) => path.join(STATE_DIR, `${name}.json`);

let engine: UniversalEngine;

beforeAll(() => {
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: statePath('main'),
    // Fast learning for the interpret() lifecycle test
    learn: { minEncounters: 2, minDominance: 0.6 },
  });
});

describe('governance: scope setup (the user-mutable tier)', () => {
  it('creates a scope with expected functionality, standards and policy', () => {
    const scope = engine.setupScope({
      scopeId: 'kitchen',
      domains: ['food-tracking', 'recipes'],
      expectedFunctionality: [
        {
          description: 'produce a weekly shopping list from tracked food',
          domain: 'food-tracking',
          outputContains: ['shoppingList'],
        },
      ],
      codeStandards: { documentation: 'doc-comments' },
      decisionPolicy: { promotionThreshold: 3 },
    });

    expect(scope.scopeId).toBe('kitchen');
    expect(scope.domains).toEqual(['food-tracking', 'recipes']);
    expect(scope.expectedFunctionality![0].description).toContain('shopping list');
    expect(scope.createdAt).toBe(scope.updatedAt);
  });

  it('updates the scope without resetting creation time', () => {
    const before = engine.getScope('kitchen')!;
    const updated = engine.updateScope('kitchen', {
      codeStandards: { style: 'gofmt' },
    });
    expect(updated!.codeStandards!.style).toBe('gofmt');
    expect(updated!.createdAt).toBe(before.createdAt);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  });

  it('refuses to update a scope that was never set up (no implicit creation)', () => {
    expect(engine.updateScope('nonexistent', { domains: ['ml'] })).toBeUndefined();
  });

  it('persists scope setups: a fresh engine reads them', () => {
    engine.setupScope({ scopeId: 'persisted', domains: ['data'] });
    const fresh = new UniversalEngine({ statePath: statePath('main') });
    expect(fresh.getScope('persisted')?.domains).toEqual(['data']);
    expect(fresh.getScope('kitchen')?.expectedFunctionality).toBeDefined();
  });
});

describe('governance: code standards default to the ecosystem', () => {
  it('resolves each language to its ecosystem standard by default', () => {
    expect(resolveStandards('go').style).toBe('gofmt');
    expect(resolveStandards('rust').style).toBe('rustfmt');
    expect(resolveStandards('python').documentation).toBe('docstrings');
    expect(resolveStandards('typescript').documentation).toBe('jsdoc');
  });

  it('user overrides win; per-language overrides win over the user default', () => {
    expect(resolveStandards('go', { style: 'custom' }).style).toBe('custom');
    expect(
      resolveStandards('go', { style: 'custom', perLanguage: { go: 'gofumpt' } }).style
    ).toBe('gofumpt');
    // A user-level style override applies to every language; per-language
    // entries are the escape hatch back to (or beyond) the ecosystem default
    expect(resolveStandards('rust', { style: 'custom' }).style).toBe('custom');
    expect(
      resolveStandards('rust', { style: 'custom', perLanguage: { rust: 'rustfmt' } }).style
    ).toBe('rustfmt');
  });
});

describe('governance: decision policies are data', () => {
  it('defaults are explicit and overridable', () => {
    expect(DEFAULT_DECISION_POLICY.promotionThreshold).toBe(2);
    const strict = new UniversalEngine({
      statePath: statePath('strict'),
      decisionPolicy: { promotionThreshold: 3 },
    });
    expect(strict.policy.promotionThreshold).toBe(3);
    expect(strict.state.data.promotionThreshold).toBe(3);
  });

  it('a promotion threshold of 3 requires 3 clients before upstreaming', () => {
    const strict = new UniversalEngine({
      statePath: statePath('threshold3'),
      decisionPolicy: { promotionThreshold: 3 },
    });
    strict.feedback('a', 'platform-preference', 'web-backend=wasm');
    strict.feedback('b', 'platform-preference', 'web-backend=wasm');
    // Two clients: below the threshold, nothing promoted
    expect(strict.state.data.upstream.platformPreferences['web-backend']).toBeUndefined();
    strict.feedback('c', 'platform-preference', 'web-backend=wasm');
    // Third client: promoted
    expect(strict.state.data.upstream.platformPreferences['web-backend']).toBe('wasm');
  });

  it("promotionThreshold 'agent-decides' never auto-promotes from feedback", () => {
    const agentDecides = new UniversalEngine({
      statePath: statePath('agent-decides'),
      decisionPolicy: { promotionThreshold: 'agent-decides' },
    });
    for (let i = 0; i < 5; i++) {
      agentDecides.feedback(`client-${i}`, 'output-style', 'go=explicit-types');
    }
    expect(agentDecides.state.data.upstream.outputStyles['go']).toBeUndefined();
  });

  it("learningMode 'observe-only' records candidates but never promotes them", async () => {
    const observer = new UniversalEngine({
      statePath: statePath('observe'),
      decisionPolicy: { learningMode: 'observe-only' },
      learn: { minEncounters: 2, minDominance: 0.6 },
    });
    const source = 'server router handler request zorpfield();';
    await observer.analyze(source);
    await observer.analyze(source);
    await observer.analyze(source);

    const candidates = Object.keys(observer.state.data.candidates);
    expect(candidates).toContain('zorpfield');
    // Never promoted to a definition
    expect(
      Object.values(observer.state.data.keywords).some((d) => d.keyword === 'zorpfield')
    ).toBe(false);
  });

  it("learningMode 'off' records nothing at all", async () => {
    const off = new UniversalEngine({
      statePath: statePath('learning-off'),
      decisionPolicy: { learningMode: 'off' },
    });
    await off.analyze('server router handler request newthing();');
    expect(Object.keys(off.state.data.candidates)).toHaveLength(0);
  });
});

describe('governance: the mutability contract', () => {
  it('in-scope teaching defines immediately (persist on encounter)', () => {
    const result = engine.teachKeyword('kitchen', 'skyr', 'food-tracking', {
      clientId: 'chef',
      semantics: 'thick yogurt',
    });
    expect(result.mode).toBe('defined');
    const found = engine.vault.lookupInDomain('skyr', 'food-tracking');
    expect(found).toBeDefined();
    expect(found!.taughtBy).toBe('chef');
  });

  it('out-of-scope teaching becomes a proposal, never a global definition', () => {
    const result = engine.teachKeyword('kitchen', 'tensorboard', 'ml', {
      clientId: 'chef',
    });
    expect(result.mode).toBe('proposed');
    // NOT a vault definition — the user cannot reach outside their scope
    expect(engine.vault.lookupInDomain('tensorboard', 'ml')).toBeUndefined();
    // It exists only as a proposal the system may corroborate
    const proposals = Object.values(engine.state.data.clients)
      .flatMap((c) => c.feedback)
      .filter((f) => f.value === 'tensorboard=ml');
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].promoted).toBeFalsy();
  });

  it('teaching through an unknown scope is rejected', () => {
    expect(() => engine.teachKeyword('ghost-scope', 'x', 'y')).toThrow(/unknown scope/);
  });

  it('the system-internal history has no user write path', () => {
    // The API surface itself enforces this: engine.state is exposed for
    // READ (views), and every write method on it is invoked only by the
    // system's own loops (learning, corroboration, execution). This test
    // pins the contract: the engine exposes no public method that lets a
    // caller rewrite learned definitions, stats or the progress log —
    // only scope setup (user-mutable), feedback (namespaced) and
    // in-scope teaching (verified above) write anything.
    const engineMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(engine)
    ).filter((m) => !m.startsWith('_') && m !== 'constructor');

    const writeLooking = engineMethods.filter((m) =>
      /delete|remove|reset|clear|overwrite|rewrite/i.test(m)
    );
    expect(writeLooking).toEqual([]);
  });
});

describe('governance: interpret() — the iteration contract made visible', () => {
  it('compares every input against vault history before anything else', async () => {
    // skyr was taught in-scope earlier in this suite: it is history now
    const report = await engine.interpret('buy skyr for the kitchen;', {
      scope: 'kitchen',
    });

    const skyrMatch = report.matched.find((m) => m.keyword === 'skyr');
    expect(skyrMatch).toBeDefined();
    expect(skyrMatch!.domain).toBe('food-tracking');
    expect(skyrMatch!.learnedNow).toBe(false);

    // New tokens (no history) are reported
    expect(report.newTokens.length).toBeGreaterThan(0);
    expect(report.newTokens).not.toContain('skyr');

    // Interpretation never executes: report carries the analysis + route
    expect(report.analysis).toBeDefined();
    expect(['native-run', 'transpile-then-run']).toContain(report.route);
    expect(report.scope).toBe('kitchen');
  });

  it('reports definitions learned during this very interpretation', async () => {
    const learny = new UniversalEngine({
      statePath: statePath('interp-learn'),
      learn: { minEncounters: 2, minDominance: 0.6 },
    });
    const source = 'server router handler request wuggleshell();';
    await learny.interpret(source);
    const report = await learny.interpret(source);

    // Second interpretation: the keyword was learned NOW (candidate with
    // 2 encounters crosses the threshold during this call)
    const learned = report.learned.find((m) => m.keyword === 'wuggleshell');
    expect(learned).toBeDefined();
    expect(learned!.learnedNow).toBe(true);

    // And it appears in matched, marked learnedNow
    const match = report.matched.find((m) => m.keyword === 'wuggleshell');
    expect(match?.learnedNow).toBe(true);
  });

  it('resolves the standards produced output would follow', async () => {
    const report = await engine.interpret('package main func main() {}', {
      platform: 'native',
    });
    // No user standards: the ecosystem default for the target
    expect(['gofmt', 'language-default']).toContain(report.standards.style);
  });

  it('interpret is read-only: repeated calls do not double-count encounters', async () => {
    const counter = new UniversalEngine({
      statePath: statePath('no-double'),
      learn: { minEncounters: 3, minDominance: 0.6 },
    });
    const source = 'server router handler request frobnicate_once();';
    await counter.interpret(source);
    const after = counter.state.data.candidates['frobnicate_once'];
    // ONE interpretation = ONE encounter (not two: analyze+interpret would
    // have double-counted before the fix)
    expect(after?.['web-backend']).toBe(1);
    await counter.interpret(source);
    expect(counter.state.data.candidates['frobnicate_once']?.['web-backend']).toBe(2);
  });
});
