/**
 * Universal Transpiler - Domain Agent Tests
 *
 * A designated agent per domain within the universal interpreter, routed
 * by a typed judgment decision:
 * - the registry resolves the designated agent for a domain
 * - dispatch(): DSL input -> food-tracking agent -> workflow result +
 *   shopping.v1 payloads; vocabulary persisted on encounter
 * - produce modes: generated code (go/rust/js), the DSL document
 * - recipes JSON -> recipes agent -> composed spec -> shopping list
 * - non-domain source -> generic fallback agent executes it
 * - a custom judgment model (Jev-style) reroutes dispatch per policy
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import type { Judgment, JudgmentModel, JudgmentQuestion } from '../src/engine/judgment';
import type { DomainAgentFlowResult } from '../src/agents/domain-agent';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-agents-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const FOOD_DSL = `# Household food plan
workflow food-tracking "Weekly groceries" {
    reference-date 2026-10-01
    horizon 7 days

    collection pantry "Pantry" {
        product Milk (dairy): 2 expiring 2026-10-04, 1 expired 2026-09-28
        product Pasta (dry goods): 4 non-expiring
        product Bananas (produce): 6 expiring 2026-10-03
    }

    consume Milk at 1 per day
    consume Pasta at 0.5 per day
    consume Bananas at 1 per day
}

rules {
    exclude expired stock
    count expiring-soon stock
}
`;

const RECIPES_JSON = JSON.stringify({
  recipes: [
    {
      id: 'pancakes',
      name: 'Fluffy Pancakes',
      servings: 4,
      ingredients: [
        { product: 'Flour', quantity: 2, unit: 'cups' },
        { product: 'Milk', quantity: 1, unit: 'l' },
      ],
    },
    {
      id: 'carbonara',
      name: 'Pasta Carbonara',
      servings: 2,
      ingredients: [
        { product: 'Pasta', quantity: 200, unit: 'g' },
        { product: 'Eggs', quantity: 2, unit: 'pcs' },
      ],
    },
  ],
  schedule: [
    { date: '2026-10-01', recipeId: 'pancakes', servings: 4 },
    { date: '2026-10-02', recipeId: 'carbonara', servings: 2 },
  ],
  inventory: [
    {
      id: 'fridge',
      name: 'Fridge',
      products: [
        { id: 'milk', name: 'Milk', category: 'dairy', expiries: [], nonExpiringQuantity: 0 },
      ],
    },
  ],
  options: { referenceDate: '2026-10-01' },
});

describe('agent registry', () => {
  it('resolves the designated agent per domain', () => {
    expect(engine.agents.forDomain('food-tracking')?.id).toBe('agent:food-tracking');
    expect(engine.agents.forDomain('recipes')?.id).toBe('agent:recipes');
    // Every execution domain in the catalog has a designated runtime agent
    expect(engine.agents.forDomain('web-backend')?.id).toBe('agent:web-backend');
    expect(engine.agents.forDomain('cli')?.id).toBe('agent:cli');
    expect(engine.agents.forDomain('web-frontend')?.id).toBe('agent:web-frontend');
    expect(engine.agents.forDomain('systems')?.id).toBe('agent:systems');
    expect(engine.agents.forDomain('data')?.id).toBe('agent:data');
    expect(engine.agents.forDomain('testing')?.id).toBe('agent:testing');
    // Unknown domains still resolve to the generic fallback
    expect(engine.agents.forDomain('does-not-exist')?.acceptsAll).toBe(true);
  });

  it('registers a designated agent for every catalog domain plus the fallback', () => {
    const ids = engine.agents.all().map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'agent:food-tracking',
        'agent:recipes',
        'agent:web-backend',
        'agent:web-frontend',
        'agent:cli',
        'agent:systems',
        'agent:data',
        'agent:game',
        'agent:ml',
        'agent:mobile',
        'agent:wasm',
        'agent:testing',
        'agent:script',
        'generic:generic',
      ])
    );
  });
});

describe('dispatch: the full flow through the universal interpreter', () => {
  it('routes a food-tracking DSL document to its designated agent and produces the shopping list', async () => {
    const result = await engine.dispatch(FOOD_DSL, { scope: undefined, clientId: 'test-client' });

    expect(result.agent).toBe('agent:food-tracking');
    expect(result.domain).toBe('food-tracking');
    expect(result.produced.kind).toBe('workflow-result');

    const payload = result.produced.payload as {
      workflowResult: { shoppingList: { product: string; toBuy: number }[] };
      servicePayloads: { name: string; priority: string }[];
    };
    const products = payload.workflowResult.shoppingList.map((i) => i.product);
    expect(products).toEqual(expect.arrayContaining(['Milk', 'Pasta', 'Bananas']));
    expect(payload.servicePayloads.length).toBeGreaterThan(0);
    // The agent-selection decision is traced with the deciding model
    expect(result.judgment?.model).toBe('heuristic');
    expect(result.judgment?.choice).toBe('agent:food-tracking');
  });

  it('persisted the vocabulary on encounter: a re-dispatch matches history', async () => {
    await engine.dispatch(FOOD_DSL, {});
    const again = await engine.dispatch(FOOD_DSL, {});
    const matchedKeywords = again.interpretation.matched.map((m) => m.keyword);
    expect(matchedKeywords).toEqual(
      expect.arrayContaining(['milk', 'pasta', 'bananas'])
    );
  });

  it('produces standalone generated code honoring the produce request', async () => {
    const result = await engine.dispatch(FOOD_DSL, { produce: 'code', codeTarget: 'go' });
    expect(result.produced.kind).toBe('generated-code');
    expect(result.produced.text).toContain('package main');
    expect(result.produced.text).toContain('func main()');

    const rust = await engine.dispatch(FOOD_DSL, { produce: 'code', codeTarget: 'rust' });
    expect(rust.produced.text).toContain('fn main()');
  });

  it('round-trips the input back to the 5GL DSL document', async () => {
    const result = await engine.dispatch(FOOD_DSL, { produce: 'dsl' });
    expect(result.produced.kind).toBe('dsl-document');
    expect(result.produced.text).toContain('workflow food-tracking');
  });

  it('applies the scope standards to the produced output', async () => {
    engine.setupScope({
      scopeId: 'kitchen-agents',
      domains: ['food-tracking'],
    });
    const result = await engine.dispatch(FOOD_DSL, { scope: 'kitchen-agents' });
    // Scope did not override standards: the target's ecosystem standard applies
    expect(result.standards.style).toBeDefined();
  });
});

describe('recipes agent: composition flow', () => {
  it('composes a recipes document into a full food-tracking workflow spec', async () => {
    const result: DomainAgentFlowResult = await engine.dispatch(RECIPES_JSON, {});
    expect(result.agent).toBe('agent:recipes');
    expect(result.domain).toBe('recipes');
    expect(result.produced.kind).toBe('workflow-result');

    const payload = result.produced.payload as {
      workflowResult: { shoppingList: { product: string }[] };
    };
    const products = payload.workflowResult.shoppingList.map((i) => i.product.toLowerCase());
    expect(products).toEqual(
      expect.arrayContaining(['flour', 'milk', 'pasta', 'eggs'])
    );
    // The composed meal plan drove the consumption plan
    expect(result.notes.join(' ')).toContain('composed');
  });
});

describe('runtime domain agents (execution domains)', () => {
  it('executes source through the engine routing under its designated agent', async () => {
    const result = await engine.dispatch('console.log("hello from the designated agent");\n', {
      language: 'javascript',
    });
    expect(result.agent).toBe('agent:script');
    expect(result.produced.kind).toBe('engine-run');
    expect((result.produced.payload as { ok: boolean }).ok).toBe(true);
    expect(result.produced.text).toContain('hello from the designated agent');
  });

  it('produces a deterministic web-backend scaffold per target language', async () => {
    const server = 'const router = require("express");\napp.listen(3000);\nres.send("ok");\n';
    const go = await engine.dispatch(server, { produce: 'scaffold', codeTarget: 'go' });
    expect(go.agent).toBe('agent:web-backend');
    expect(go.produced.kind).toBe('scaffold');
    expect(go.produced.text).toContain('net/http');
    expect(go.produced.text).toContain('package main');

    const rust = await engine.dispatch(server, { produce: 'scaffold', codeTarget: 'rust' });
    expect(rust.produced.text).toContain('TcpListener');

    const js = await engine.dispatch(server, { produce: 'scaffold', codeTarget: 'javascript' });
    expect(js.produced.text).toContain('http.createServer');
  });

  it('scaffold requests without a scaffold for the domain execute instead', async () => {
    // game domain has no scaffold generator: the agent executes the source
    const result = await engine.dispatch('println("game loop");\n', {
      domain: 'game',
      produce: 'scaffold',
      language: 'rust',
    });
    expect(result.agent).toBe('agent:game');
    expect(result.produced.kind).toBe('engine-run');
    expect(result.notes.join(' ')).toContain('no');
  });

  it('the cli scaffold runs and honors its target ecosystem standards', async () => {
    const result = await engine.dispatch('func main() { println!("hi") }\n', {
      domain: 'cli',
      produce: 'scaffold',
      codeTarget: 'go',
      language: 'rust',
    });
    expect(result.produced.kind).toBe('scaffold');
    expect(result.produced.text).toContain('flag.Parse');
    // go target -> go ecosystem standard by default
    expect(result.standards.style).toBe('gofmt');
  });

  it('the LLM produce tier generates code for domains without scaffolds', async () => {
    const mockLlm = {
      generate: async () => ({
        content: '```go\npackage main\n\nfunc main() { println("generated") }\n```',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    } as never as import('../src/core/universal-transpiler').LLMClient;
    const withLlm = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-llm-agent-')), 's.json'),
      llm: mockLlm,
    });

    const result = await withLlm.dispatch('// game loop update sprites\n', {
      domain: 'game',
      produce: 'code',
      codeTarget: 'go',
      language: 'javascript',
    });
    expect(result.agent).toBe('agent:game');
    expect(result.produced.kind).toBe('generated-code');
    expect((result.produced.payload as { strategy: string }).strategy).toBe('llm-generated');
    // markdown fences are stripped from the LLM answer
    expect(result.produced.text).toContain('package main');
    expect(result.produced.text).not.toContain('```');
    expect(result.standards.style).toBe('gofmt');
    expect(result.notes.join(' ')).toContain('LLM tier');
  });

  it('without an LLM, scaffoldless domains execute the source instead', async () => {
    const result = await engine.dispatch('// game loop update sprites\n', {
      domain: 'game',
      produce: 'code',
      codeTarget: 'go',
      language: 'javascript',
    });
    expect(result.produced.kind).toBe('engine-run');
    expect(result.notes.join(' ')).toContain('no LLM configured');
  });
});

describe('generic fallback agent', () => {
  it('runs when the judgment model explicitly routes to it (the safety net)', async () => {
    const toGeneric: JudgmentModel = {
      name: 'to-generic',
      decide: <T extends string>(q: JudgmentQuestion<T>) => {
        const generic = q.options.find((o) => o.value === 'generic:generic');
        return Promise.resolve<Judgment<T>>({
          choice: generic ? generic.value : q.options[0].value,
          confidence: 0.5,
          model: 'to-generic',
        });
      },
    };
    const routed = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-generic-')), 's.json'),
      judgmentModel: toGeneric,
      decisionPolicy: { judgmentModel: 'to-generic' },
    });
    const result = await routed.dispatch('console.log("hello from the generic agent");\n', {
      language: 'javascript',
    });
    expect(result.agent).toBe('generic:generic');
    expect(result.judgment?.model).toBe('to-generic');
    expect(result.produced.kind).toBe('engine-run');
    expect((result.produced.payload as { ok: boolean }).ok).toBe(true);
    expect(result.produced.text).toContain('hello from the generic agent');
  });
});

describe('judgment-model routing (the Jev openness point, end to end)', () => {
  it('a custom judgment model reroutes agent selection when the policy names it', async () => {
    const forced: JudgmentModel = {
      name: 'jev-route',
      decide: (question) => {
        // A Jev-style provider that always prefers the recipes agent
        const preferred = question.options.find((o) => o.value === 'agent:recipes');
        return Promise.resolve({
          choice: preferred ? preferred.value : question.options[0].value,
          confidence: 0.8,
          rationale: 'jev-route: policy-scoped preference',
          model: 'jev-route',
        });
      },
    };

    const routed = new UniversalEngine({
      statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'univ-jev-route-')), 's.json'),
      judgmentModel: forced,
    });
    routed.setupScope({
      scopeId: 'jev-domain',
      domains: ['food-tracking', 'recipes'],
      decisionPolicy: { judgmentModel: 'jev-route' },
    });

    // The DSL is food-tracking, but the scoped judgment model decides
    const result = await routed.dispatch(FOOD_DSL, { scope: 'jev-domain' });
    expect(result.judgment?.model).toBe('jev-route');
    expect(result.agent).toBe('agent:recipes');
    // The recipes agent still serves the domain: DSL parses as a
    // food-tracking document, so the flow executes it as source
    expect(['agent:recipes']).toContain(result.agent);
  });

  it('records the routing decision in the persistent progress log', async () => {
    await engine.dispatch(FOOD_DSL, {});
    const log = engine.progressLog(500);
    const entry = log.find((e) => e.kind === 'agent-dispatch');
    expect(entry).toBeDefined();
    expect(entry!.detail).toContain('agent:food-tracking');
    expect(entry!.detail).toContain('heuristic');
  });
});
