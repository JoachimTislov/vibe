/**
 * Universal Transpiler - Judgment Model Tests
 *
 * The Jev openness point: typed questions in, typed answers out.
 * - the heuristic default model: highest score, confidence from margin,
 *   probabilities from normalized scores
 * - the registry: named providers, unknown names fall back to the default
 * - the policy selects the provider by NAME (data, not code)
 * - a custom Jev-style model registers and is consulted without any
 *   change to decision logic
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  HeuristicJudgmentModel,
  JudgmentModelRegistry,
  type Judgment,
  type JudgmentModel,
  type JudgmentQuestion,
} from '../src/engine/judgment';
import { UniversalEngine } from '../src/engine/universal-engine';
import { DEFAULT_DECISION_POLICY } from '../src/engine/user-contract';

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-judgment-'));

describe('heuristic judgment model (the default)', () => {
  it('picks the highest-scoring option with margin-based confidence', async () => {
    const model = new HeuristicJudgmentModel();
    const judgment = await model.decide({
      kind: 'select-domain-agent',
      state: {},
      options: [
        { value: 'agent:a', label: 'A', score: 0.9 },
        { value: 'agent:b', label: 'B', score: 0.6 },
        { value: 'agent:c', label: 'C', score: 0.3 },
      ],
    });
    expect(judgment.choice).toBe('agent:a');
    expect(judgment.model).toBe('heuristic');
    expect(judgment.confidence).toBeGreaterThan(0.5);
    expect(judgment.scores!['agent:a']).toBe(0.9);
    const probs = Object.values(judgment.probabilities!);
    expect(probs.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 5);
  });

  it('is fully confident on a single dominant option', async () => {
    const model = new HeuristicJudgmentModel();
    const judgment = await model.decide({
      kind: 'promote-feedback',
      state: {},
      options: [{ value: 'yes', label: 'yes', score: 1 }],
    });
    expect(judgment.choice).toBe('yes');
    expect(judgment.confidence).toBe(1);
  });

  it('throws on an empty question (no options = no decision)', async () => {
    const model = new HeuristicJudgmentModel();
    await expect(
      model.decide({ kind: 'retry-or-escalate', state: {}, options: [] })
    ).rejects.toThrow('no options');
  });

  it('distributes uniform probability when all evidence is zero', async () => {
    const model = new HeuristicJudgmentModel();
    const judgment = await model.decide({
      kind: 'select-platform',
      state: {},
      options: [
        { value: 'node', label: 'node', score: 0 },
        { value: 'jvm', label: 'jvm', score: 0 },
      ],
    });
    expect(judgment.probabilities!['node']).toBeCloseTo(0.5, 5);
    expect(judgment.confidence).toBe(0.5);
  });
});

describe('judgment model registry (the open adapter point)', () => {
  it('always provides the default model', () => {
    const registry = new JudgmentModelRegistry();
    expect(registry.names()).toContain('heuristic');
    expect(registry.get('heuristic').name).toBe('heuristic');
    expect(registry.get().name).toBe('heuristic');
  });

  it('registers a custom model and resolves it by name', () => {
    const stub: JudgmentModel = {
      name: 'jev-stub',
      decide: (q) =>
        Promise.resolve({
          choice: q.options[q.options.length - 1].value,
          confidence: 0.42,
          model: 'jev-stub',
        }),
    };
    const registry = new JudgmentModelRegistry().register(stub);
    expect(registry.names()).toEqual(expect.arrayContaining(['heuristic', 'jev-stub']));
    expect(registry.get('jev-stub').name).toBe('jev-stub');
    // Unknown names never crash: they fall back to the default provider
    expect(registry.get('does-not-exist').name).toBe('heuristic');
  });

  it('the policy names the provider: judgmentModel is data with a heuristic default', () => {
    expect(DEFAULT_DECISION_POLICY.judgmentModel).toBe('heuristic');
  });
});

describe('judgment-governed decision sites', () => {
  it("select-platform: under 'system' policy the judgment model resolves the platform", async () => {
    // A Jev-style model that always picks wasm when it is an option
    const wasmPreferring: JudgmentModel = {
      name: 'wasm-first',
      decide: (q) => {
        const wasm = q.options.find((o) => o.value === 'wasm');
        return Promise.resolve({
          choice: wasm ? wasm.value : q.options[0].value,
          confidence: 0.9,
          model: 'wasm-first',
        });
      },
    };
    const engine = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-platform-')), 's.json'),
      judgmentModel: wasmPreferring,
      decisionPolicy: { platformResolution: 'system', judgmentModel: 'wasm-first' },
    });

    const report = await engine.analyze(
      'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("hi") }\n',
      { language: 'go' }
    );
    expect(report.analysis.platform).toBe('wasm');
  });

  it('select-platform: default policy never consults a model (declared > inference)', async () => {
    const engine = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-platform-default-')), 's.json'),
    });
    const report = await engine.analyze(
      'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("hi") }\n',
      { language: 'go' }
    );
    expect(report.analysis.platform).toBe('native');
  });

  it("promote-feedback: 'agent-decides' holds single-client feedback and promotes corroborated feedback", async () => {
    const engine = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-promote-')), 's.json'),
      decisionPolicy: { promotionThreshold: 'agent-decides' },
    });

    engine.feedback('alice', 'platform-preference', 'web-backend=native');
    engine.feedback('bob', 'platform-preference', 'web-backend=native');
    engine.feedback('carol', 'platform-preference', 'web-backend=docker');

    engine.defineGoal('promote-pending-feedback');
    const { advanced } = await engine.autoAdvance();
    expect(advanced).toContain('promote-pending-feedback');

    // Corroborated (2 clients) moved upstream; single-client stayed local
    expect(engine.state.data.upstream.platformPreferences['web-backend']).toBe('native');
    const carol = engine.clients()['carol'];
    expect(carol.feedback.find((f) => f.value.includes('docker'))?.promoted).toBeFalsy();
  });

  it("promote-feedback: a custom model may promote single-client feedback under 'agent-decides'", async () => {
    const trusting: JudgmentModel = {
      name: 'trusting',
      decide: <T extends string>(q: JudgmentQuestion<T>) =>
        Promise.resolve<Judgment<T>>({
          choice: 'promote' as T,
          confidence: 0.7,
          model: 'trusting',
        }),
    };
    const engine = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-promote-trust-')), 's.json'),
      judgmentModel: trusting,
      decisionPolicy: { promotionThreshold: 'agent-decides', judgmentModel: 'trusting' },
    });

    engine.feedback('solo', 'output-style', 'go=explicit-types');
    engine.defineGoal('promote-pending-feedback');
    await engine.autoAdvance();

    expect(engine.state.data.upstream.outputStyles['go']).toBe('explicit-types');
    expect(engine.clients()['solo'].feedback[0].promoted).toBe(true);
  });
});

describe('engine.judge: the policy selects the provider', () => {
  let engine: UniversalEngine;
  const seen: string[] = [];

  const jevLike: JudgmentModel = {
    name: 'jev-like',
    decide: (q) => {
      seen.push(q.kind);
      return Promise.resolve({
        choice: q.options[0].value,
        scores: Object.fromEntries(q.options.map((o) => [o.value, o.score])),
        confidence: 0.9,
        rationale: 'jev-like: first option by contract',
        model: 'jev-like',
      });
    },
  };

  it('consults the registered provider when the policy names it', async () => {
    engine = new UniversalEngine({
      statePath: path.join(stateDir, 'scoped.json'),
      judgmentModel: jevLike,
    });
    engine.setupScope({
      scopeId: 'jev-scope',
      domains: ['food-tracking'],
      decisionPolicy: { judgmentModel: 'jev-like' },
    });

    const judgment: Judgment<string> = await engine.judge(
      {
        kind: 'select-domain-agent',
        state: { domain: 'food-tracking' },
        options: [
          { value: 'agent:food-tracking', label: 'food', score: 0.8 },
          { value: 'generic:generic', label: 'generic', score: 0.1 },
        ],
      },
      'jev-scope'
    );
    expect(judgment.model).toBe('jev-like');
    expect(judgment.choice).toBe('agent:food-tracking');
    expect(seen).toContain('select-domain-agent');
  });

  it('falls back to the heuristic default outside the scope', async () => {
    const judgment = await engine.judge({
      kind: 'select-platform',
      state: {},
      options: [{ value: 'native', label: 'native', score: 1 }],
    });
    expect(judgment.model).toBe('heuristic');
  });

  it('unknown provider names fall back to the default model, never crash', async () => {
    const other = new UniversalEngine({
      statePath: path.join(stateDir, 'unknown-provider.json'),
    });
    other.setupScope({
      scopeId: 'ghost-scope',
      decisionPolicy: { judgmentModel: 'ghost' },
    });
    const judgment = await other.judge(
      {
        kind: 'select-platform',
        state: {},
        options: [{ value: 'node', label: 'node', score: 1 }],
      },
      'ghost-scope'
    );
    expect(judgment.model).toBe('heuristic');
    expect(judgment.choice).toBe('node');
  });
});
