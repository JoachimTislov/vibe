/**
 * Universal Transpiler - FoodSavr Domain Tests
 *
 * The first concrete autonomous workflow domain, modeled on
 * https://github.com/JoachimTislov/foodsavr: track food inventory ->
 * plan consumption -> generate a shopping list (+ waste alerts).
 *
 * Verifies:
 * - foodsavr's exact expiry-status semantics
 * - the reference workflow: expired stock excluded, expiring-soon counted,
 *   shopping list = need - usable stock
 * - deterministic codegen: the same declarative spec compiles to
 *   JavaScript, Go and Rust, and every target produces the same numbers
 *   (Rust executes through the docker fallback when rustc is absent)
 * - domain detection: food/grocery sources resolve to food-tracking
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UniversalEngine } from '../src/engine/universal-engine';
import {
  createDemoSpec,
  createDatedDemoSpec,
  createMealPlanDemoSpec,
  deriveConsumptionPlan,
  FoodTrackingWorkflow,
  generateWorkflowCode,
  productStatus,
  totalQuantity,
  freshQuantity,
  type FoodProduct,
} from '../src/domains/foodsavr';
import { analyzeDomain } from '../src/domains/domain-analyzer';

let engine: UniversalEngine;

beforeAll(async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-foodsavr-state-'));
  engine = new UniversalEngine({
    timeoutMs: 300_000,
    statePath: path.join(stateDir, 'state.json'),
  });
  // Toolchains only report availability after a probe; probe up front so the
  // go/docker-rust codegen tests below actually execute when present.
  await engine.toolchains.probeAll();
});

// ============================================================================
// Domain model (foodsavr semantics)
// ============================================================================

describe('foodsavr domain model', () => {
  const product = (expiries: { quantity: number; daysUntilExpiry: number }[]): FoodProduct => ({
    id: 'x',
    name: 'X',
    expiries,
    nonExpiringQuantity: 0,
  });

  it('follows foodsavr expiry status semantics exactly', () => {
    expect(productStatus(product([]))).toBe('fresh');
    expect(productStatus(product([{ quantity: 1, daysUntilExpiry: 30 }]))).toBe('fresh');
    expect(productStatus(product([{ quantity: 1, daysUntilExpiry: 6 }]))).toBe('expiringSoon');
    expect(productStatus(product([{ quantity: 1, daysUntilExpiry: 1 }]))).toBe('expiringSoon');
    expect(productStatus(product([{ quantity: 1, daysUntilExpiry: 0 }]))).toBe('expiringToday');
    expect(productStatus(product([{ quantity: 1, daysUntilExpiry: -1 }]))).toBe('expired');
  });

  it('computes total and fresh quantities', () => {
    const p: FoodProduct = {
      id: 'milk',
      name: 'Milk',
      nonExpiringQuantity: 2,
      expiries: [
        { quantity: 3, daysUntilExpiry: 5 },
        { quantity: 1, daysUntilExpiry: -2 },
      ],
    };
    expect(totalQuantity(p)).toBe(6);
    expect(freshQuantity(p)).toBe(5);
  });
});

// ============================================================================
// Absolute dates: statuses computed from a reference "today"
// ============================================================================

describe('foodsavr absolute-date expiry semantics', () => {
  const datedProduct = (): FoodProduct => ({
    id: 'yogurt',
    name: 'Yogurt',
    nonExpiringQuantity: 0,
    expiries: [{ quantity: 4, expirationDate: '2026-10-05' }],
  });

  it('crosses fresh -> expiringSoon -> expiringToday -> expired as today advances', () => {
    const p = datedProduct();
    expect(productStatus(p, '2026-09-28')).toBe('fresh');        // 7 days out
    expect(productStatus(p, '2026-09-29')).toBe('expiringSoon'); // 6 days out
    expect(productStatus(p, '2026-10-04')).toBe('expiringSoon'); // 1 day out
    expect(productStatus(p, '2026-10-05')).toBe('expiringToday');
    expect(productStatus(p, '2026-10-06')).toBe('expired');
  });

  it('accepts now as a Date object or an ISO string interchangeably', () => {
    const p = datedProduct();
    expect(productStatus(p, new Date('2026-10-05'))).toBe('expiringToday');
    expect(productStatus(p, new Date('2026-10-05T14:30:00Z'))).toBe('expiringToday');
    expect(productStatus(p, '2026-10-05')).toBe('expiringToday');
    expect(freshQuantity(p, '2026-10-05')).toBe(4);
    expect(freshQuantity(p, '2026-10-06')).toBe(0);
  });

  it('keeps legacy day-offset entries working without any reference date', () => {
    const p: FoodProduct = {
      id: 'legacy',
      name: 'Legacy',
      nonExpiringQuantity: 1,
      expiries: [{ quantity: 2, daysUntilExpiry: 3 }],
    };
    expect(productStatus(p)).toBe('expiringSoon');
    expect(freshQuantity(p)).toBe(3);
  });

  it('supports mixed entries: absolute dates and legacy day-offsets side by side', () => {
    const p: FoodProduct = {
      id: 'mixed',
      name: 'Mixed',
      nonExpiringQuantity: 0,
      expiries: [
        { quantity: 2, expirationDate: '2026-10-01' }, // +2 days from 2026-09-29
        { quantity: 5, daysUntilExpiry: 10 },
      ],
    };
    expect(productStatus(p, '2026-09-29')).toBe('expiringSoon');
    expect(freshQuantity(p, '2026-09-29')).toBe(7);
    expect(freshQuantity(p, '2026-10-02')).toBe(5); // absolute batch gone
  });

  it('recomputes the whole workflow as the reference date advances', () => {
    const spec = createDatedDemoSpec();

    // At the reference date itself: identical to the day-offset demo
    const day0 = new FoodTrackingWorkflow(spec).run('2026-09-29');
    const byName0 = Object.fromEntries(day0.shoppingList.map((i) => [i.product, i]));
    expect(byName0['Milk'].toBuy).toBe(5);
    expect(byName0['Milk'].usableStock).toBe(2);
    expect(byName0['Bananas'].toBuy).toBe(1);

    // Six days later both milk batches and the bananas have expired:
    // nothing usable -> buy the full need
    const day6 = new FoodTrackingWorkflow(spec).run('2026-10-05');
    const byName6 = Object.fromEntries(day6.shoppingList.map((i) => [i.product, i]));
    expect(byName6['Milk'].toBuy).toBe(7);
    expect(byName6['Milk'].usableStock).toBe(0);
    expect(byName6['Bananas'].toBuy).toBe(7);
    expect(byName6['Pasta'].toBuy).toBe(0); // staples never expire

    const milk6 = day6.inventory.find((i) => i.product === 'Milk');
    expect(milk6!.status).toBe('expired');
    expect(milk6!.freshQuantity).toBe(0);
    expect(day6.wasteAlerts).toHaveLength(0); // nothing left to save
  });

  it('throws when absolute dates are used without any reference date', () => {
    const spec = createDatedDemoSpec();
    delete spec.referenceDate;
    expect(() => new FoodTrackingWorkflow(spec).run()).toThrow(/reference date/);
  });
});

// ============================================================================
// The autonomous workflow (reference implementation)
// ============================================================================

describe('food-tracking workflow', () => {
  it('generates the correct shopping list from the demo scenario', () => {
    const result = new FoodTrackingWorkflow(createDemoSpec()).run();

    const byName = Object.fromEntries(result.shoppingList.map((i) => [i.product, i]));

    // Milk: need 7 (1/day over 7 days); usable = 2 (one batch expired)
    expect(byName['Milk'].toBuy).toBe(5);
    expect(byName['Milk'].usableStock).toBe(2);
    // Pasta: need 3.5 (0.5/day); usable = 4 staples -> nothing to buy
    expect(byName['Pasta'].toBuy).toBe(0);
    // Bananas: need 7; usable = 6
    expect(byName['Bananas'].toBuy).toBe(1);
  });

  it('flags stock that will spoil within the horizon as waste alerts', () => {
    const result = new FoodTrackingWorkflow(createDemoSpec()).run();
    const milk = result.wasteAlerts.find((a) => a.product === 'Milk');
    const bananas = result.wasteAlerts.find((a) => a.product === 'Bananas');

    expect(milk).toBeDefined();
    expect(milk!.quantity).toBe(2);
    expect(milk!.daysUntilExpiry).toBe(3);
    expect(bananas!.quantity).toBe(6);
    expect(bananas!.daysUntilExpiry).toBe(2);
  });

  it('can optionally count expiring-soon stock as unusable', () => {
    const spec = createDemoSpec();
    spec.rules.countExpiringSoonStock = false;
    const result = new FoodTrackingWorkflow(spec).run();
    const byName = Object.fromEntries(result.shoppingList.map((i) => [i.product, i]));

    // Milk usable drops to 0 (both batches excluded) -> buy the full need
    expect(byName['Milk'].toBuy).toBe(7);
    // Bananas usable drops to 0
    expect(byName['Bananas'].toBuy).toBe(7);
  });

  it('reports inventory status per product', () => {
    const result = new FoodTrackingWorkflow(createDemoSpec()).run();
    const milk = result.inventory.find((i) => i.product === 'Milk');
    expect(milk!.status).toBe('expired');
    expect(milk!.quantity).toBe(3);
    expect(milk!.freshQuantity).toBe(2);
  });
});

// ============================================================================
// Meal-plan-derived consumption (foodsavr synchronizes stock with meals)
// ============================================================================

describe('meal-plan-derived consumption', () => {
  it('derives consumption rates from a 7-day meal plan', () => {
    const spec = createMealPlanDemoSpec();
    // 7 meals x 1 milk over a 7-day horizon -> 1 per day
    expect(deriveConsumptionPlan(spec)).toEqual([
      { product: 'bananas', quantityPerDay: 1 },
      { product: 'milk', quantityPerDay: 1 },
      { product: 'pasta', quantityPerDay: 0.5 },
    ]);
  });

  it('produces the same shopping list as the equivalent flat consumption rate', () => {
    const flat = new FoodTrackingWorkflow(createDatedDemoSpec()).run();
    const fromMeals = new FoodTrackingWorkflow(createMealPlanDemoSpec()).run();

    expect(fromMeals.shoppingList).toEqual(flat.shoppingList);
    expect(fromMeals.wasteAlerts).toEqual(flat.wasteAlerts);
    expect(fromMeals.inventory).toEqual(flat.inventory);

    const byName = Object.fromEntries(fromMeals.shoppingList.map((i) => [i.product, i]));
    expect(byName['Milk'].toBuy).toBe(5);
    expect(byName['Pasta'].toBuy).toBe(0);
    expect(byName['Bananas'].toBuy).toBe(1);
  });

  it('ignores meals outside the horizon window (before the reference date or after it)', () => {
    const spec = createMealPlanDemoSpec();
    spec.mealPlan = [
      ...(spec.mealPlan ?? []),
      { date: '2026-09-28', ingredients: [{ product: 'milk', quantity: 99 }] }, // too early
      { date: '2026-10-06', ingredients: [{ product: 'milk', quantity: 99 }] }, // too late
    ];
    const result = new FoodTrackingWorkflow(spec).run();
    const byName = Object.fromEntries(result.shoppingList.map((i) => [i.product, i]));
    expect(byName['Milk'].needed).toBe(7); // the 99-unit meals don't count
  });

  it('prefers an explicit consumption plan over the meal plan', () => {
    const spec = createMealPlanDemoSpec();
    spec.consumptionPlan = [{ product: 'milk', quantityPerDay: 3 }];
    const result = new FoodTrackingWorkflow(spec).run();
    const byName = Object.fromEntries(result.shoppingList.map((i) => [i.product, i]));
    expect(byName['Milk'].needed).toBe(21); // 3/day wins, pasta/bananas not planned
    expect(result.shoppingList).toHaveLength(1);
  });
});

// ============================================================================
// Deterministic codegen: one spec, any target language
// ============================================================================

describe('workflow codegen across target languages', () => {
  const spec = createDemoSpec();
  const reference = new FoodTrackingWorkflow(spec).run();

  it('compiles to JavaScript and reproduces the reference output', async () => {
    const code = generateWorkflowCode(spec, 'javascript');
    expect(code).toContain('foodSavr domain');
    expect(code).toContain('"horizonDays":7');

    const report = await engine.run(code, { language: 'javascript' });
    expect(report.result.ok).toBe(true);

    const parsed = JSON.parse(report.result.stdout);
    const byName = Object.fromEntries(parsed.shoppingList.map((i: any) => [i.product, i]));
    expect(byName['Milk'].toBuy).toBe(5);
    expect(byName['Pasta'].toBuy).toBe(0);
    expect(byName['Bananas'].toBuy).toBe(1);
    expect(parsed.wasteAlerts.length).toBe(reference.wasteAlerts.length);
  }, 120_000);

  it('compiles to Go and reproduces the reference output', async () => {
    const go = engine.toolchains.get('go')!;
    if (!go.info.available) return console.warn('skipping: go unavailable');

    const code = generateWorkflowCode(spec, 'go');
    const report = await engine.run(code, { language: 'go', entryFile: 'main.go' });
    expect(report.result.ok).toBe(true);

    const parsed = JSON.parse(report.result.stdout);
    const byName = Object.fromEntries(parsed.shoppingList.map((i: any) => [i.product, i]));
    expect(byName['Milk'].toBuy).toBe(5);
    expect(byName['Pasta'].toBuy).toBe(0);
    expect(byName['Bananas'].toBuy).toBe(1);
  }, 180_000);

  it('compiles to Rust and reproduces the reference output (docker fallback when no rustc)', async () => {
    const rust = engine.toolchains.get('rust')!;
    if (!rust.info.available) return console.warn('skipping: rust unavailable (no rustc, no docker image)');

    const code = generateWorkflowCode(spec, 'rust');
    const report = await engine.run(code, { language: 'rust', entryFile: 'main.rs' });
    expect(report.result.ok).toBe(true);

    // Same numbers as the reference, parsed from the rust program's output
    const stdout = report.result.stdout;
    expect(stdout).toContain('product=Milk to_buy=5 usable_stock=2 needed=7');
    expect(stdout).toContain('product=Pasta to_buy=0 usable_stock=4 needed=3.5');
    expect(stdout).toContain('product=Bananas to_buy=1 usable_stock=6 needed=7');
    expect(stdout).toContain('product=Bananas quantity=6 days_until_expiry=2');
  }, 300_000);

  it('is deterministic: the same spec always generates identical code', () => {
    const a = generateWorkflowCode(spec, 'go');
    const b = generateWorkflowCode(spec, 'go');
    expect(a).toBe(b);
  });
});

// ============================================================================
// Codegen equivalence with absolute dates (runtime day computation)
// ============================================================================

describe('workflow codegen with absolute dates', () => {
  // Absolute dates + meal-plan-derived consumption: the hardest case — the
  // generated programs must embed the dates and reference date and compute
  // days-until-expiry at runtime.
  const spec = createMealPlanDemoSpec();
  const reference = new FoodTrackingWorkflow(spec).run();
  const refByName = Object.fromEntries(reference.shoppingList.map((i) => [i.product, i]));

  it('embeds the reference date and derives the same plan the reference uses', () => {
    const js = generateWorkflowCode(spec, 'javascript');
    expect(js).toContain('2026-09-29'); // embedded reference date
    expect(js).toContain('"quantityPerDay":1'); // derived meal-plan rate
    expect(js).toContain('daysUntilExpiry');
  });

  it('refuses to generate code from absolute dates without a reference date', () => {
    const undated = createDatedDemoSpec();
    delete undated.referenceDate;
    expect(() => generateWorkflowCode(undated, 'javascript')).toThrow(/referenceDate/);
  });

  it('compiles to JavaScript and reproduces the reference output', async () => {
    const code = generateWorkflowCode(spec, 'javascript');
    const report = await engine.run(code, { language: 'javascript' });
    expect(report.result.ok).toBe(true);

    const parsed = JSON.parse(report.result.stdout);
    const byName = Object.fromEntries(parsed.shoppingList.map((i: any) => [i.product, i]));
    expect(byName['Milk'].toBuy).toBe(refByName['Milk'].toBuy);
    expect(byName['Milk'].usableStock).toBe(refByName['Milk'].usableStock);
    expect(byName['Pasta'].toBuy).toBe(refByName['Pasta'].toBuy);
    expect(byName['Bananas'].toBuy).toBe(refByName['Bananas'].toBuy);
    expect(parsed.wasteAlerts.length).toBe(reference.wasteAlerts.length);
    const milk = parsed.inventory.find((i: any) => i.product === 'Milk');
    expect(milk.status).toBe('expired'); // one batch already past on 2026-09-28
  }, 120_000);

  it('compiles to Go and reproduces the reference output', async () => {
    const go = engine.toolchains.get('go')!;
    if (!go.info.available) return console.warn('skipping: go unavailable');

    const code = generateWorkflowCode(spec, 'go');
    const report = await engine.run(code, { language: 'go', entryFile: 'main.go' });
    expect(report.result.ok).toBe(true);

    const parsed = JSON.parse(report.result.stdout);
    const byName = Object.fromEntries(parsed.shoppingList.map((i: any) => [i.product, i]));
    expect(byName['Milk'].toBuy).toBe(refByName['Milk'].toBuy);
    expect(byName['Milk'].usableStock).toBe(refByName['Milk'].usableStock);
    expect(byName['Pasta'].toBuy).toBe(refByName['Pasta'].toBuy);
    expect(byName['Bananas'].toBuy).toBe(refByName['Bananas'].toBuy);
    const milk = parsed.inventory.find((i: any) => i.product === 'Milk');
    expect(milk.status).toBe('expired');
  }, 180_000);

  it('compiles to Rust and reproduces the reference output (docker fallback when no rustc)', async () => {
    const rust = engine.toolchains.get('rust')!;
    if (!rust.info.available) return console.warn('skipping: rust unavailable (no rustc, no docker image)');

    const code = generateWorkflowCode(spec, 'rust');
    const report = await engine.run(code, { language: 'rust', entryFile: 'main.rs' });
    expect(report.result.ok).toBe(true);

    // Same numbers as the reference, parsed from the rust program's output
    const stdout = report.result.stdout;
    expect(stdout).toContain('product=Milk to_buy=5 usable_stock=2 needed=7');
    expect(stdout).toContain('product=Pasta to_buy=0 usable_stock=4 needed=3.5');
    expect(stdout).toContain('product=Bananas to_buy=1 usable_stock=6 needed=7');
    expect(stdout).toContain('product=Milk quantity=2 days_until_expiry=3');
    expect(stdout).toContain('product=Milk quantity=3 fresh=2 status=expired');
  }, 300_000);

  it('stays deterministic with absolute dates and meal plans', () => {
    for (const target of ['javascript', 'go', 'rust'] as const) {
      expect(generateWorkflowCode(spec, target)).toBe(generateWorkflowCode(spec, target));
    }
  });
});

// ============================================================================
// Domain detection
// ============================================================================

describe('food-tracking domain detection', () => {
  it('resolves food/grocery sources to the food-tracking domain', () => {
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
    expect(result.domain.id).not.toBe('food-tracking');
  });
});
