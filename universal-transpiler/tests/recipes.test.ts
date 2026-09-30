/**
 * Universal Transpiler - Recipe Domain Tests
 *
 * The second concrete autonomous workflow domain, demonstrating 5GL-style
 * domain composition: recipes compose into meal plans (RecipePlanner), the
 * meal plan composes into a complete foodSavr FoodWorkflowSpec
 * (composeIntoFoodSpec), the composed spec runs through the EXISTING
 * FoodTrackingWorkflow unchanged, and the workflow result feeds the
 * shopping.v1.AddItemRequest payload bridge.
 *
 * Verifies:
 * - servings-scaled recipe expansion (2 servings doubles quantities)
 * - the composed spec produces a correct shopping list through the
 *   unmodified FoodTrackingWorkflow (needed minus usable pantry stock)
 * - the full pipeline recipes -> spec -> workflow ->
 *   generateShoppingListServicePayloads yields valid, deterministic
 *   AddItemRequest payloads (validated against the real shopping.proto)
 * - codegen: generateWorkflowCode(composedSpec, 'javascript') runs through
 *   the engine (node) and reproduces the reference shopping list
 * - domain detection: recipe-like sources resolve to the recipes domain
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import {
  FoodTrackingWorkflow,
  generateWorkflowCode,
  type FoodWorkflowSpec,
} from '../src/domains/foodsavr';
import {
  computeIdempotencyKey,
  generateShoppingListServicePayloads,
  validatePayloadsAgainstProto,
  type AddItemRequestPayload,
} from '../src/domains/foodsavr-integration';
import {
  composeIntoFoodSpec,
  createRecipeDemo,
  createRecipeDemoSpec,
  planMeals,
  RecipePlanner,
  scaleQuantity,
  type Recipe,
  type RecipeSchedule,
} from '../src/domains/recipes';
import { analyzeDomain } from '../src/domains/domain-analyzer';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-recipes-state-'));
  engine = new UniversalEngine({
    timeoutMs: 300_000,
    statePath: path.join(stateDir, 'state.json'),
  });
});

// The real service definition in the sibling project — the single source of
// truth the emitted payloads must stay compatible with.
const PROTO_PATH = path.resolve(
  __dirname,
  '../../shopping-list/proto/shopping/v1/shopping.proto'
);
const protoText = fs.readFileSync(PROTO_PATH, 'utf8');

// ============================================================================
// Recipe expansion: servings-scaled meal plans
// ============================================================================

describe('recipe planner scaling', () => {
  const recipe = (servings: number): Recipe => ({
    id: 'omelette',
    name: 'Omelette',
    servings,
    ingredients: [
      { product: 'Eggs', quantity: 3, unit: 'pcs' },
      { product: 'Milk', quantity: 0.5, unit: 'l' },
      { product: 'Cheese', quantity: 1, unit: 'pcs' },
    ],
  });

  it('doubles every ingredient when the meal serves twice the recipe base', () => {
    const meals = planMeals([recipe(2)], [
      { date: '2026-09-29', recipeId: 'omelette', servings: 4 },
    ]);
    expect(meals).toHaveLength(1);
    expect(meals[0].ingredients).toEqual([
      { product: 'cheese', quantity: 2 },
      { product: 'eggs', quantity: 6 },
      { product: 'milk', quantity: 1 },
    ]);
  });

  it('defaults meal servings to the recipe base servings (scale 1, untouched quantities)', () => {
    const meals = new RecipePlanner([recipe(4)]).plan([
      { date: '2026-10-01', recipeId: 'omelette' },
    ]);
    expect(meals[0].ingredients).toEqual([
      { product: 'cheese', quantity: 1 },
      { product: 'eggs', quantity: 3 },
      { product: 'milk', quantity: 0.5 },
    ]);
    expect(meals[0].name).toBe('Omelette'); // meal name defaults to recipe name
  });

  it('scales fractionally and rounds to 6 decimals (no float noise)', () => {
    expect(scaleQuantity(1, 1 / 3)).toBe(0.333333);
    const meals = planMeals([recipe(3)], [
      { date: '2026-10-01', recipeId: 'omelette', servings: 1 },
    ]);
    const eggs = meals[0].ingredients.find((i) => i.product === 'eggs')!;
    const milk = meals[0].ingredients.find((i) => i.product === 'milk')!;
    expect(eggs.quantity).toBe(1);
    expect(milk.quantity).toBe(0.166667); // 0.5 / 3, rounded clean
  });

  it('aggregates repeated products within one meal and lowercases names', () => {
    const repeated: Recipe = {
      id: 'stew',
      name: 'Stew',
      servings: 2,
      ingredients: [
        { product: 'Carrots', quantity: 2, unit: 'pcs' },
        { product: 'carrots', quantity: 1, unit: 'pcs' },
      ],
    };
    const meals = planMeals([repeated], [{ date: '2026-10-01', recipeId: 'stew' }]);
    expect(meals[0].ingredients).toEqual([{ product: 'carrots', quantity: 3 }]);
  });

  it('rejects unknown recipe ids, invalid dates and non-positive servings', () => {
    expect(() => planMeals([recipe(2)], [{ date: '2026-10-01', recipeId: 'nope' }])).toThrow(
      /unknown recipe id/
    );
    expect(() => planMeals([recipe(2)], [{ date: '10/01/2026', recipeId: 'omelette' }])).toThrow(
      /ISO 8601/
    );
    expect(() => planMeals([recipe(2)], [{ date: '2026-10-01', recipeId: 'omelette', servings: 0 }])).toThrow(
      /positive servings/
    );
    expect(() => new RecipePlanner([recipe(0)])).toThrow(/positive servings/);
    expect(() => new RecipePlanner([recipe(2), recipe(2)])).toThrow(/Duplicate recipe id/);
  });
});

// ============================================================================
// Composition: recipes + schedule + pantry -> a complete FoodWorkflowSpec
// ============================================================================

describe('composeIntoFoodSpec', () => {
  const demo = createRecipeDemo();

  it('builds a complete spec: inventory, scaled mealPlan, covering horizon, default rules', () => {
    const spec = composeIntoFoodSpec(demo.recipes, demo.schedule, demo.inventory, {
      referenceDate: demo.referenceDate,
    });

    expect(spec.domain).toBe('food-tracking');
    expect(spec.collections).toEqual(demo.inventory); // inventory passes through
    expect(spec.referenceDate).toBe('2026-09-29');
    expect(spec.horizonDays).toBe(7); // 2026-09-29 .. 2026-10-05 inclusive
    expect(spec.rules).toEqual({ countExpiredStock: false, countExpiringSoonStock: true });
    expect(spec.consumptionPlan).toBeUndefined(); // consumption derives from the mealPlan

    // One PlannedMeal per scheduled meal, quantities scaled by servings
    expect(spec.mealPlan).toHaveLength(7);
    const smoothie = spec.mealPlan!.find((m) => m.date === '2026-10-01')!; // 4 of 2 servings: 2x
    expect(smoothie.name).toBe('Banana Smoothie');
    expect(smoothie.ingredients).toEqual([
      { product: 'bananas', quantity: 4 },
      { product: 'yogurt', quantity: 2 },
    ]);
    const bigPancakes = spec.mealPlan!.find((m) => m.date === '2026-10-03')!; // 8 of 4: 2x
    expect(bigPancakes.ingredients).toEqual([
      { product: 'bananas', quantity: 2 },
      { product: 'eggs', quantity: 4 },
      { product: 'flour', quantity: 4 },
      { product: 'milk', quantity: 2 },
    ]);
  });

  it('defaults the reference date to the earliest scheduled meal', () => {
    const spec = composeIntoFoodSpec(demo.recipes, demo.schedule, demo.inventory);
    expect(spec.referenceDate).toBe('2026-09-29');
    expect(spec.horizonDays).toBe(7);
  });

  it('honors explicit horizonDays and rules options', () => {
    const spec = composeIntoFoodSpec(demo.recipes, demo.schedule, demo.inventory, {
      referenceDate: demo.referenceDate,
      horizonDays: 10,
      rules: { countExpiredStock: true, countExpiringSoonStock: false, minimumReserve: 1 },
    });
    expect(spec.horizonDays).toBe(10);
    expect(spec.rules).toEqual({
      countExpiredStock: true,
      countExpiringSoonStock: false,
      minimumReserve: 1,
    });
  });

  it('shrinks the horizon to the schedule span still ahead of a custom reference date', () => {
    const spec = composeIntoFoodSpec(demo.recipes, demo.schedule, demo.inventory, {
      referenceDate: '2026-10-01',
    });
    expect(spec.referenceDate).toBe('2026-10-01');
    expect(spec.horizonDays).toBe(5); // 2026-10-01 .. 2026-10-05 inclusive
  });
});

// ============================================================================
// The composed spec runs through the EXISTING FoodTrackingWorkflow unchanged
// ============================================================================

describe('composed spec through the foodSavr workflow', () => {
  const spec: FoodWorkflowSpec = createRecipeDemoSpec();
  const result = new FoodTrackingWorkflow(spec).run();

  const byName = Object.fromEntries(result.shoppingList.map((i) => [i.product, i]));

  it('produces a correct shopping list: planned ingredients minus usable pantry stock', () => {
    // Weekly planned totals (servings-scaled): flour 6, milk 3, eggs 14,
    // bananas 9, yogurt 3, pasta 4, parmesan 4.
    // Usable stock: flour 4, milk 2 (one batch expired), eggs 6, bananas 6,
    // yogurt 2, pasta 4, parmesan 0 (not in the pantry at all).
    expect(result.shoppingList).toHaveLength(7);
    expect(byName['Flour'].toBuy).toBe(2);
    expect(byName['Milk'].toBuy).toBe(1);
    expect(byName['Eggs'].toBuy).toBe(8);
    expect(byName['Bananas'].toBuy).toBe(3);
    expect(byName['Yogurt'].toBuy).toBe(1);
    expect(byName['Pasta'].toBuy).toBe(0); // pantry covers the whole week
    expect(byName['parmesan'].toBuy).toBe(4); // never stocked: buy the full need
  });

  it('reports needed and usable stock per item with foodsavr semantics', () => {
    expect(byName['Eggs'].needed).toBe(14);
    expect(byName['Eggs'].usableStock).toBe(6);
    expect(byName['Milk'].needed).toBe(3);
    expect(byName['Milk'].usableStock).toBe(2); // the 09-28 batch is expired
    expect(byName['parmesan'].usableStock).toBe(0);
    expect(byName['parmesan'].category).toBeUndefined();
  });

  it('flags expiring pantry items as waste alerts, soonest first', () => {
    expect(result.wasteAlerts.map((a) => [a.product, a.quantity, a.daysUntilExpiry])).toEqual([
      ['Bananas', 6, 2],
      ['Milk', 2, 3],
      ['Yogurt', 2, 4],
      ['Eggs', 6, 6],
    ]);
  });

  it('reports inventory statuses computed from the absolute dates', () => {
    const inv = Object.fromEntries(result.inventory.map((i) => [i.product, i]));
    expect(inv['Milk'].status).toBe('expired'); // one batch past on 2026-09-28
    expect(inv['Bananas'].status).toBe('expiringSoon');
    expect(inv['Eggs'].status).toBe('expiringSoon');
    expect(inv['Flour'].status).toBe('fresh'); // staples never expire
    expect(result.inventory).toHaveLength(6); // parmesan is not in inventory
  });

  it('is stable: recomposing and re-running yields the identical result', () => {
    const fresh = new FoodTrackingWorkflow(createRecipeDemoSpec()).run();
    expect(fresh).toEqual(result);
  });
});

// ============================================================================
// Full pipeline: recipes -> spec -> workflow -> shopping.v1 payloads
// ============================================================================

describe('full pipeline to shopping-list service payloads', () => {
  const spec = createRecipeDemoSpec();
  const result = new FoodTrackingWorkflow(spec).run();
  const options = { listId: 42, referenceDate: spec.referenceDate! };
  const payloads = generateShoppingListServicePayloads(result, options);

  const payloadFor = (name: string): AddItemRequestPayload => {
    const found = payloads.find((p) => p.name === name);
    expect(found).toBeDefined();
    return found!;
  };

  it('yields proto-valid AddItemRequest payloads for every to-buy ingredient', () => {
    expect(payloads).toHaveLength(6); // pasta has nothing to buy
    const validation = validatePayloadsAgainstProto(payloads, protoText);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('maps quantities, units, categories, priorities and due dates correctly', () => {
    const bananas = payloadFor('Bananas');
    expect(bananas.list_id).toBe(42);
    expect(bananas.quantity).toBe(3);
    expect(bananas.unit).toBe('pcs');
    expect(bananas.category).toBe('produce');
    expect(bananas.priority).toBe('PRIORITY_HIGH'); // waste alert: +2 days
    expect(bananas.due_at).toBe('2026-10-01');
    expect(bananas.merge_duplicate).toBe(true);

    expect(payloadFor('Eggs').quantity).toBe(8);
    expect(payloadFor('Eggs').due_at).toBe('2026-10-05');
    expect(payloadFor('Milk').quantity).toBe(1);
    expect(payloadFor('Milk').due_at).toBe('2026-10-02');
    expect(payloadFor('Yogurt').quantity).toBe(1);
    expect(payloadFor('Flour').quantity).toBe(2);
    expect(payloadFor('Flour').priority).toBe('PRIORITY_NORMAL'); // no waste alert
    expect(payloadFor('Flour').due_at).toBeUndefined();
    expect(payloadFor('parmesan').quantity).toBe(4);
    expect(payloadFor('parmesan').category).toBeUndefined();
    expect(payloadFor('parmesan').priority).toBe('PRIORITY_NORMAL');
    expect(payloads.some((p) => p.name === 'Pasta')).toBe(false); // zero-quantity skipped
  });

  it('produces deterministic idempotency keys across full pipeline replays', () => {
    const replay = generateShoppingListServicePayloads(
      new FoodTrackingWorkflow(createRecipeDemoSpec()).run(),
      options
    );
    expect(replay).toEqual(payloads); // payload-for-payload identical
    expect(payloads.map((p) => p.idempotency_key)).toEqual(replay.map((p) => p.idempotency_key));
    for (const payload of payloads) {
      expect(payload.idempotency_key).toMatch(/^foodsavr-[0-9a-f]{8}$/);
    }
    // Keys are unique per item and match the documented hash of the payload
    // identity, so replays merge instead of duplicating list entries.
    expect(new Set(payloads.map((p) => p.idempotency_key)).size).toBe(payloads.length);
    const bananas = payloadFor('Bananas');
    expect(bananas.idempotency_key).toBe(
      computeIdempotencyKey({
        list_id: bananas.list_id,
        name: bananas.name,
        quantity: bananas.quantity,
        unit: bananas.unit,
        category: bananas.category,
        due_at: bananas.due_at,
      })
    );
  });
});

// ============================================================================
// Codegen: the composed spec compiles and reproduces the reference output
// ============================================================================

describe('workflow codegen from the composed spec', () => {
  const spec = createRecipeDemoSpec();
  const reference = new FoodTrackingWorkflow(spec).run();

  it('embeds the composed meal plan and reference date in generated code', () => {
    const code = generateWorkflowCode(spec, 'javascript');
    expect(code).toContain('foodSavr domain');
    expect(code).toContain('"referenceDate":"2026-09-29"');
    expect(code).toContain('"horizonDays":7');
    expect(code).toContain('"quantityPerDay":2'); // eggs: 14 planned / 7 days
  });

  it('compiles to JavaScript and reproduces the reference shopping list', async () => {
    const code = generateWorkflowCode(spec, 'javascript');
    const report = await engine.run(code, { language: 'javascript' });
    expect(report.result.ok).toBe(true);

    const parsed = JSON.parse(report.result.stdout);
    expect(parsed.shoppingList).toEqual(reference.shoppingList);
    expect(parsed.wasteAlerts.map((a: any) => [a.product, a.quantity, a.daysUntilExpiry])).toEqual(
      reference.wasteAlerts.map((a) => [a.product, a.quantity, a.daysUntilExpiry])
    );
    expect(parsed.inventory).toEqual(reference.inventory);
  }, 120_000);

  it('is deterministic: the same composed spec generates identical code', () => {
    expect(generateWorkflowCode(spec, 'javascript')).toBe(generateWorkflowCode(spec, 'javascript'));
  });
});

// ============================================================================
// Domain detection
// ============================================================================

describe('recipes domain detection', () => {
  it('resolves recipe-like sources to the recipes domain', () => {
    const result = analyzeDomain({
      source:
        "const recipe = { name: 'Fluffy Pancakes', servings: 4, " +
        "ingredients: ['flour', 'milk', 'eggs'] }; " +
        "bake(recipe); prepare the dish; cuisine: 'american'; " +
        'meal schedule for the week ahead;',
    });
    expect(result.domain.id).toBe('recipes');
    expect(result.domain.defaultPlatform).toBe('native');
    expect(result.domain.defaultOutputMode).toBe('run');
    expect(result.platform).toBe('native');
    expect(result.outputMode).toBe('run');
    expect(result.matchedKeywords).toContain('servings');
    expect(result.matchedKeywords).toContain('ingredients');
    expect(result.matchedKeywords).toContain('meal schedule');
  });

  it('still resolves pantry/expiration sources to food-tracking (shared "recipe" keyword does not steal them)', () => {
    const result = analyzeDomain({
      source:
        'const pantry = trackFood(); const expiry = checkExpiration(); ' +
        'generateShoppingList(pantry, mealPlan); reduceFoodWaste();',
    });
    expect(result.domain.id).toBe('food-tracking');
  });

  it('does not claim unrelated sources', () => {
    const result = analyzeDomain({
      source: 'function render() { return <div onClick={handle}/>; }',
    });
    expect(result.domain.id).not.toBe('recipes');
  });
});
