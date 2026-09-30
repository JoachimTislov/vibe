/**
 * Universal Transpiler - Workflow DSL (5GL layer) Tests
 *
 * The text form of the high-level language definitions: a document parses
 * into the same FoodWorkflowSpec the reference implementation, the codegen
 * and the shopping-list integration consume. Round-trips through specToDsl.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import { DslSyntaxError, parseWorkflowDsl, specToDsl } from '../src/domains/workflow-dsl';
import { FoodTrackingWorkflow, generateWorkflowCode } from '../src/domains/foodsavr';
import { generateShoppingListServicePayloads } from '../src/domains/foodsavr-integration';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-dsl-state-'));
  engine = new UniversalEngine({
    timeoutMs: 120_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

const DOCUMENT = `# Weekly grocery plan for the household
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

describe('workflow DSL parsing', () => {
  it('parses a document into a complete FoodWorkflowSpec', () => {
    const doc = parseWorkflowDsl(DOCUMENT);
    expect(doc.domain).toBe('food-tracking');
    expect(doc.title).toBe('Weekly groceries');
    expect(doc.warnings).toEqual([]);

    const spec = doc.spec;
    expect(spec.referenceDate).toBe('2026-10-01');
    expect(spec.horizonDays).toBe(7);
    expect(spec.rules.countExpiredStock).toBe(false);
    expect(spec.rules.countExpiringSoonStock).toBe(true);

    // Collections and products
    expect(spec.collections).toHaveLength(1);
    const pantry = spec.collections[0];
    expect(pantry.name).toBe('Pantry');
    expect(pantry.products.map((p) => p.name)).toEqual(['Milk', 'Pasta', 'Bananas']);

    const milk = pantry.products[0];
    expect(milk.category).toBe('dairy');
    expect(milk.expiries).toEqual([
      { quantity: 2, expirationDate: '2026-10-04' },
      { quantity: 1, expirationDate: '2026-09-28' },
    ]);
    expect(milk.nonExpiringQuantity).toBe(0);

    const pasta = pantry.products[1];
    expect(pasta.nonExpiringQuantity).toBe(4);
    expect(pasta.expiries).toEqual([]);

    // Consumption plan
    expect(spec.consumptionPlan).toEqual([
      { product: 'Milk', quantityPerDay: 1 },
      { product: 'Pasta', quantityPerDay: 0.5 },
      { product: 'Bananas', quantityPerDay: 1 },
    ]);
  });

  it('parses meal plans with ingredients', () => {
    const doc = parseWorkflowDsl(`
workflow food-tracking "Meals" {
    reference-date 2026-10-01
    horizon 2 days

    collection pantry "Pantry" {
        product Eggs (protein): 2 expiring 2026-10-05
    }

    meal 2026-10-01 "Carbonara" needs Pasta x2, Eggs x3
    meal 2026-10-02 "Omelette" needs Eggs x2
}
`);
    expect(doc.spec.mealPlan).toEqual([
      {
        date: '2026-10-01',
        name: 'Carbonara',
        ingredients: [
          { product: 'Pasta', quantity: 2 },
          { product: 'Eggs', quantity: 3 },
        ],
      },
      {
        date: '2026-10-02',
        name: 'Omelette',
        ingredients: [{ product: 'Eggs', quantity: 2 }],
      },
    ]);
  });

  it('rejects syntax errors with line numbers', () => {
    const cases: { source: string; message: string }[] = [
      { source: 'bogus statement', message: 'unexpected statement at top level' },
      { source: 'workflow unknown-domain "x" {', message: 'unknown workflow domain' },
      {
        source: 'workflow food-tracking "x" {\n    horizon seven days\n}',
        message: 'invalid quantity "seven"',
      },
      {
        source: 'workflow food-tracking "x" {\n    reference-date 2026/10/01\n}',
        message: 'invalid ISO date',
      },
      {
        source: 'workflow food-tracking "x" {\n    collection p "P" {\n        product Milk\n    }\n}',
        message: 'product line needs a ":"',
      },
      {
        source: 'workflow food-tracking "x" {\n    meal 2026-10-01 "M" needs Eggs\n}',
        message: 'expected "<product> x<quantity>"',
      },
      {
        source: 'workflow food-tracking "x" {\n    product Milk (dairy): 1 expiring 2026-10-04\n}',
        message: 'unexpected statement in workflow',
      },
    ];

    for (const { source, message } of cases) {
      let caught: unknown = null;
      try {
        parseWorkflowDsl(source);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DslSyntaxError);
      expect((caught as DslSyntaxError).message).toContain(message);
      expect((caught as DslSyntaxError).line).toBeGreaterThan(0);
    }
  });

  it('requires a reference date when absolute dates or meals are used', () => {
    expect(() =>
      parseWorkflowDsl('workflow food-tracking "x" {\n    collection p "P" {\n        product Milk: 1 expiring 2026-10-04\n    }\n}')
    ).toThrow(/reference-date is required/);
  });
});

describe('DSL -> workflow -> integration (the full 5GL chain)', () => {
  it('produces the correct shopping list from a DSL document', () => {
    const doc = parseWorkflowDsl(DOCUMENT);
    const result = new FoodTrackingWorkflow(doc.spec).run();
    const byName = Object.fromEntries(result.shoppingList.map((i) => [i.product, i]));

    // Milk: need 7; usable 2 (one batch expired, excluded by the rules)
    expect(byName['Milk'].toBuy).toBe(5);
    // Pasta: need 3.5; usable 4 staples
    expect(byName['Pasta'].toBuy).toBe(0);
    // Bananas: need 7; usable 6
    expect(byName['Bananas'].toBuy).toBe(1);

    // Waste alerts from the DSL expiry dates
    const milkAlert = result.wasteAlerts.find((a) => a.product === 'Milk');
    expect(milkAlert).toBeDefined();
    expect(milkAlert!.quantity).toBe(2);
  });

  it('feeds the shopping-list service payloads from the DSL document', () => {
    const doc = parseWorkflowDsl(DOCUMENT);
    const result = new FoodTrackingWorkflow(doc.spec).run();
    const payloads = generateShoppingListServicePayloads(result, {
      listId: 42,
      referenceDate: doc.spec.referenceDate,
    });
    expect(payloads.length).toBeGreaterThan(0);
    // Idempotency keys are deterministic per document
    const again = generateShoppingListServicePayloads(result, {
      listId: 42,
      referenceDate: doc.spec.referenceDate,
    });
    expect(again.map((p) => p.idempotency_key)).toEqual(
      payloads.map((p) => p.idempotency_key)
    );
  });

  it('compiles the DSL workflow to runnable JavaScript with the same output', async () => {
    const doc = parseWorkflowDsl(DOCUMENT);
    const reference = new FoodTrackingWorkflow(doc.spec).run();

    const code = generateWorkflowCode(doc.spec, 'javascript');
    const run = await engine.run(code, { language: 'javascript' });
    expect(run.result.ok).toBe(true);

    const parsed = JSON.parse(run.result.stdout);
    const byName = Object.fromEntries(parsed.shoppingList.map((i: any) => [i.product, i]));
    expect(byName['Milk'].toBuy).toBe(5);
    expect(byName['Pasta'].toBuy).toBe(0);
    expect(byName['Bananas'].toBuy).toBe(1);
    expect(parsed.wasteAlerts.length).toBe(reference.wasteAlerts.length);
  }, 120_000);

  it('round-trips: spec -> DSL -> spec preserves the workflow output', () => {
    const doc = parseWorkflowDsl(DOCUMENT);
    const dsl = specToDsl(doc.spec, doc.title);
    const reparsed = parseWorkflowDsl(dsl);

    const original = new FoodTrackingWorkflow(doc.spec).run();
    const roundTripped = new FoodTrackingWorkflow(reparsed.spec).run();

    expect(roundTripped.shoppingList).toEqual(original.shoppingList);
    expect(roundTripped.wasteAlerts).toEqual(original.wasteAlerts);
  });

  it('is deterministic', () => {
    const a = parseWorkflowDsl(DOCUMENT);
    const b = parseWorkflowDsl(DOCUMENT);
    expect(specToDsl(a.spec, a.title)).toBe(specToDsl(b.spec, b.title));
  });
});
