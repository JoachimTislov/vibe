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
  FoodTrackingWorkflow,
  generateWorkflowCode,
  productStatus,
  totalQuantity,
  freshQuantity,
  type FoodProduct,
} from '../src/domains/foodsavr';
import { analyzeDomain } from '../src/domains/domain-analyzer';

let engine: UniversalEngine;

beforeAll(() => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'univ-foodsavr-state-'));
  engine = new UniversalEngine({
    timeoutMs: 300_000,
    statePath: path.join(stateDir, 'state.json'),
  });
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
