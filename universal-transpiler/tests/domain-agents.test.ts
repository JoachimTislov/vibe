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
import type { JudgmentModel } from '../src/engine/judgment';
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
    // The generic fallback serves every other domain
    expect(engine.agents.forDomain('web-backend')?.id).toBe('generic:generic');
  });

  it('registers the three flow agents plus the fallback', () => {
    const ids = engine.agents.all().map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(['agent:food-tracking', 'agent:recipes', 'generic:generic'])
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

describe('generic fallback agent', () => {
  it('executes non-domain source through the engine routing', async () => {
    const result = await engine.dispatch('console.log("hello from the generic agent");\n', {
      language: 'javascript',
    });
    expect(result.agent).toBe('generic:generic');
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
