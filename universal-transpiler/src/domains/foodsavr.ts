/**
 * Universal Transpiler - FoodSavr Domain
 *
 * First concrete autonomous workflow domain, modeled on
 * https://github.com/JoachimTislov/foodsavr — "help people save food, time
 * and money" by tracking inventory and synchronizing it with meal planning.
 *
 * Domain model (mirrors foodsavr's lib/models):
 * - ExpiryEntry: a quantity expiring on a specific date. Expiries are
 *   absolute ISO 8601 calendar dates (expirationDate, e.g. "2026-10-05");
 *   days-until-expiry is COMPUTED at runtime against a reference "today"
 *   (the spec's referenceDate or an explicit now passed to the workflow).
 *   Legacy day-offsets are still accepted: when expirationDate is absent,
 *   daysUntilExpiry is used as-is (migration compatibility).
 * - Product: name, category, expiry entries + non-expiring quantity,
 *   with foodsavr's exact status semantics (on the computed
 *   days-until-expiry d):
 *     expired          d < 0
 *     expiringToday    d == 0
 *     expiringSoon     0 < d <= 6
 *     fresh            otherwise
 * - Collection: an inventory (pantry, fridge, freezer...)
 * - MealPlan: meals on specific dates with per-product ingredient
 *   requirements; foodsavr synchronizes stock with planned meals.
 *
 * Autonomous workflow:
 *   track food -> plan consumption -> generate shopping list
 *   (needed = consumption over the horizon - stock that will still be fresh,
 *    with waste alerts for items that should be used before they spoil).
 *   The consumption plan is either given explicitly (quantityPerDay) or
 *   derived from the meal plan (total planned quantity / horizon).
 *
 * The workflow is defined declaratively (a FoodWorkflowSpec) and compiled
 * to runnable code in any target language via generateWorkflowCode(), so
 * the same 5GL-style definition executes on node, go, or docker-backed
 * rust — deterministically. Generated programs embed the absolute dates
 * and the reference date and compute days-until-expiry at runtime, so the
 * same spec + reference date always yields identical output.
 */

// ============================================================================
// Absolute-date helpers (UTC day arithmetic, no external dependencies)
// ============================================================================

/** Anything that can represent "now": a Date or an ISO 8601 date string. */
export type NowInput = Date | string;

/**
 * Convert a date to a UTC day number (days since 1970-01-02... since
 * 1970-01-01, i.e. day 0). Works on ISO date strings ("2026-10-05",
 * optionally with a time component) and on Date objects (their UTC
 * calendar date). DST-proof: pure calendar arithmetic.
 */
export function dayNumber(date: NowInput): number {
  if (typeof date === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!match) {
      throw new Error(`Invalid ISO 8601 date string: ${JSON.stringify(date)}`);
    }
    return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
  }
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000
  );
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: NowInput, to: NowInput): number {
  return dayNumber(to) - dayNumber(from);
}

// ============================================================================
// Entities (foodsavr domain model)
// ============================================================================

export interface ExpiryEntry {
  quantity: number;
  /**
   * Absolute expiration date, ISO 8601 calendar date (e.g. "2026-10-05").
   * Preferred representation: days-until-expiry is computed from it against
   * the reference date at runtime.
   */
  expirationDate?: string;
  /**
   * Legacy day-offset representation: days from the reference date until
   * this batch expires (negative = already expired). Used only when
   * expirationDate is absent (backward compatibility).
   */
  daysUntilExpiry?: number;
}

export type ProductStatus = 'fresh' | 'expiringToday' | 'expiringSoon' | 'expired';

export interface FoodProduct {
  id: string;
  name: string;
  category?: string;
  /** Batches with an expiration date */
  expiries: ExpiryEntry[];
  /** Quantity without expiration (staples etc.) */
  nonExpiringQuantity: number;
  tags?: string[];
}

export interface FoodCollection {
  id: string;
  name: string;
  products: FoodProduct[];
}

/** A single ingredient requirement inside a planned meal. */
export interface MealIngredient {
  /** Product name (lowercased for lookup, like consumption plan entries) */
  product: string;
  /** Units of the product this meal consumes */
  quantity: number;
}

/** One planned meal on a specific date (foodsavr synchronizes meals with stock). */
export interface PlannedMeal {
  /** ISO 8601 calendar date the meal is planned for (e.g. "2026-09-30") */
  date: string;
  /** Optional human-readable meal name (breakfast, dinner...) */
  name?: string;
  ingredients: MealIngredient[];
}

/**
 * Effective days until an entry expires, relative to `now`:
 * - absolute mode: computed from expirationDate via UTC calendar arithmetic
 * - legacy mode: the stored day offset
 * - no date information at all: Infinity (never expires)
 */
export function entryDaysUntilExpiry(entry: ExpiryEntry, now?: NowInput): number {
  if (entry.expirationDate !== undefined) {
    if (now === undefined) {
      throw new Error(
        'ExpiryEntry.expirationDate needs a reference date: pass now to the ' +
          'workflow/helpers or set spec.referenceDate'
      );
    }
    return daysBetween(now, entry.expirationDate);
  }
  return entry.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
}

/** foodsavr's exact expiry-status semantics, computed against `now`. */
export function productStatus(product: FoodProduct, now?: NowInput): ProductStatus {
  const soonest = product.expiries
    .map((e) => entryDaysUntilExpiry(e, now))
    .reduce<number | null>((min, d) => (min === null || d < min ? d : min), null);

  if (soonest === null) return 'fresh';
  if (soonest < 0) return 'expired';
  if (soonest === 0) return 'expiringToday';
  if (soonest <= 6) return 'expiringSoon';
  return 'fresh';
}

export function totalQuantity(product: FoodProduct): number {
  return (
    product.nonExpiringQuantity +
    product.expiries.reduce((sum, e) => sum + e.quantity, 0)
  );
}

/** Quantity that is not yet expired (usable stock), as of `now`. */
export function freshQuantity(product: FoodProduct, now?: NowInput): number {
  return (
    product.nonExpiringQuantity +
    product.expiries
      .filter((e) => entryDaysUntilExpiry(e, now) >= 0)
      .reduce((sum, e) => sum + e.quantity, 0)
  );
}

/** Quantity that expires within `days` (inclusive), as of `now`. For waste alerts. */
export function expiringWithin(
  product: FoodProduct,
  days: number,
  now?: NowInput
): number {
  return product.expiries
    .filter((e) => {
      const d = entryDaysUntilExpiry(e, now);
      return d >= 0 && d <= days;
    })
    .reduce((sum, e) => sum + e.quantity, 0);
}

// ============================================================================
// Declarative workflow spec (5GL-style)
// ============================================================================

export interface ConsumptionPlanEntry {
  /** Product name (lowercased) this plan entry applies to */
  product: string;
  /** Units consumed per day (foodsavr's consumption-rate system) */
  quantityPerDay: number;
}

export interface ShoppingListRules {
  /** Count already-expired stock toward availability (default false) */
  countExpiredStock?: boolean;
  /** Count stock expiring within the horizon (default true) */
  countExpiringSoonStock?: boolean;
  /** Always keep at least this many units in stock */
  minimumReserve?: number;
}

export interface FoodWorkflowSpec {
  domain: 'food-tracking';
  collections: FoodCollection[];
  /**
   * Reference "today" (ISO 8601 calendar date, e.g. "2026-09-29") that all
   * absolute expiration dates and meal-plan dates are computed against.
   * Required whenever expirationDate or mealPlan is used with codegen, so
   * generated programs are deterministic.
   */
  referenceDate?: string;
  /** Explicit consumption rates; when absent, derived from mealPlan */
  consumptionPlan?: ConsumptionPlanEntry[];
  /** Planned meals the stock is synchronized with */
  mealPlan?: PlannedMeal[];
  /** How many days ahead the plan covers */
  horizonDays: number;
  rules: ShoppingListRules;
}

/**
 * Resolve the workflow's consumption plan: the explicit consumptionPlan
 * when given, otherwise one derived from the meal plan. Derived rate per
 * product = total planned quantity (meals inside the horizon window,
 * [referenceDate, referenceDate + horizonDays - 1], inclusive) divided by
 * the horizon. With no reference date, every planned meal counts.
 */
export function deriveConsumptionPlan(
  spec: FoodWorkflowSpec,
  now?: NowInput
): ConsumptionPlanEntry[] {
  if (spec.consumptionPlan && spec.consumptionPlan.length > 0) {
    return spec.consumptionPlan;
  }
  const ref = now ?? spec.referenceDate;
  const horizon = spec.horizonDays;
  const totals = new Map<string, number>();
  for (const meal of spec.mealPlan ?? []) {
    if (ref !== undefined) {
      const offset = daysBetween(ref, meal.date);
      if (offset < 0 || offset >= horizon) continue;
    }
    for (const ingredient of meal.ingredients) {
      const key = ingredient.product.toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + ingredient.quantity);
    }
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([product, total]) => ({ product, quantityPerDay: total / horizon }));
}

// ============================================================================
// Workflow results
// ============================================================================

export interface ShoppingListItem {
  product: string;
  category?: string;
  /** Units needed over the horizon minus usable stock */
  toBuy: number;
  /** Usable stock counted against the need */
  usableStock: number;
  /** Units needed by the consumption plan over the horizon */
  needed: number;
}

export interface WasteAlert {
  product: string;
  quantity: number;
  daysUntilExpiry: number;
  message: string;
}

export interface WorkflowResult {
  shoppingList: ShoppingListItem[];
  wasteAlerts: WasteAlert[];
  inventory: {
    product: string;
    quantity: number;
    freshQuantity: number;
    status: ProductStatus;
  }[];
}

// ============================================================================
// The autonomous workflow (reference implementation)
// ============================================================================

export class FoodTrackingWorkflow {
  readonly spec: FoodWorkflowSpec;

  constructor(spec: FoodWorkflowSpec) {
    this.spec = spec;
  }

  /** All products across collections, keyed by lowercase name (last wins). */
  private productsByName(): Map<string, FoodProduct> {
    const map = new Map<string, FoodProduct>();
    for (const collection of this.spec.collections) {
      for (const product of collection.products) {
        map.set(product.name.toLowerCase(), product);
      }
    }
    return map;
  }

  /** Usable stock for a product under the workflow rules, as of `now`. */
  private usableStock(product: FoodProduct, now?: NowInput): number {
    const rules = this.spec.rules;
    let usable = product.nonExpiringQuantity;
    for (const entry of product.expiries) {
      const days = entryDaysUntilExpiry(entry, now);
      const expired = days < 0;
      const expiringSoon = days >= 0 && days <= 6;
      if (expired && !rules.countExpiredStock) continue;
      if (expiringSoon && rules.countExpiringSoonStock === false) continue;
      usable += entry.quantity;
    }
    return usable;
  }

  /**
   * Run the workflow: track -> plan -> shopping list + waste alerts.
   * Everything is computed from the absolute dates + `now` (defaults to
   * spec.referenceDate; legacy day-offset specs need neither).
   * This is the reference implementation; generated code (any target
   * language) must produce the same output for the same spec.
   */
  run(now?: NowInput): WorkflowResult {
    const ref = now ?? this.spec.referenceDate;
    const products = this.productsByName();
    const horizon = this.spec.horizonDays;
    const reserve = this.spec.rules.minimumReserve ?? 0;

    const shoppingList: ShoppingListItem[] = [];
    const wasteAlerts: WasteAlert[] = [];
    const inventory: WorkflowResult['inventory'] = [];

    for (const product of products.values()) {
      inventory.push({
        product: product.name,
        quantity: totalQuantity(product),
        freshQuantity: freshQuantity(product, ref),
        status: productStatus(product, ref),
      });

      // Waste alerts: anything expiring within the horizon that the plan
      // won't consume in time should be used first.
      const expiringQty = expiringWithin(product, horizon, ref);
      if (expiringQty > 0) {
        const soonest = Math.min(
          ...product.expiries
            .map((e) => entryDaysUntilExpiry(e, ref))
            .filter((d) => d >= 0)
        );
        wasteAlerts.push({
          product: product.name,
          quantity: expiringQty,
          daysUntilExpiry: soonest,
          message:
            `Use ${expiringQty} x ${product.name} within ${soonest} day(s) ` +
            `before they spoil`,
        });
      }
    }

    for (const plan of deriveConsumptionPlan(this.spec, ref)) {
      const product = products.get(plan.product.toLowerCase());
      const needed = plan.quantityPerDay * horizon + reserve;
      const usable = product ? this.usableStock(product, ref) : 0;
      const toBuy = Math.max(0, needed - usable);

      shoppingList.push({
        product: product?.name ?? plan.product,
        category: product?.category,
        toBuy,
        usableStock: usable,
        needed,
      });
    }

    shoppingList.sort((a, b) => a.product.localeCompare(b.product));
    wasteAlerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    return { shoppingList, wasteAlerts, inventory };
  }
}

// ============================================================================
// Code generation: the same spec compiles to any target language
// ============================================================================

export type WorkflowTarget = 'javascript' | 'typescript' | 'go' | 'rust';

/**
 * Compile the declarative spec into a standalone program in the target
 * language. The program embeds the spec (absolute dates + reference date)
 * and reproduces the reference workflow output exactly by computing
 * days-until-expiry at runtime (deterministic codegen).
 */
export function generateWorkflowCode(
  spec: FoodWorkflowSpec,
  target: WorkflowTarget
): string {
  const normalized = normalizeForCodegen(spec);
  switch (target) {
    case 'typescript':
    case 'javascript':
      return generateJs(normalized);
    case 'go':
      return generateGo(normalized);
    case 'rust':
      return generateRust(normalized);
  }
}

/**
 * Prepare a spec for embedding: derive the consumption plan (so generated
 * programs never need meal-plan logic) and require a reference date when
 * absolute expiration dates are present (so the generated program is
 * deterministic instead of depending on the build machine's clock).
 */
type NormalizedSpec = FoodWorkflowSpec & { consumptionPlan: ConsumptionPlanEntry[] };

function normalizeForCodegen(spec: FoodWorkflowSpec): NormalizedSpec {
  const hasAbsoluteDates = spec.collections.some((c) =>
    c.products.some((p) => p.expiries.some((e) => e.expirationDate !== undefined))
  );
  if (hasAbsoluteDates && spec.referenceDate === undefined) {
    throw new Error(
      'generateWorkflowCode: specs using ExpiryEntry.expirationDate must set ' +
        'spec.referenceDate so the generated program is deterministic'
    );
  }
  return { ...spec, consumptionPlan: deriveConsumptionPlan(spec, spec.referenceDate) };
}

function specJson(spec: NormalizedSpec): string {
  return JSON.stringify(spec);
}

function generateJs(spec: NormalizedSpec): string {
  return `"use strict";
// Auto-generated food-tracking workflow (foodSavr domain)
const spec = ${specJson(spec)};

// Days until expiry, computed at runtime from the embedded absolute dates
function dayNumber(dateStr) {
  return Math.round(Date.parse(dateStr.slice(0, 10) + "T00:00:00Z") / 86400000);
}
function daysUntilExpiry(e) {
  if (e.expirationDate) return dayNumber(e.expirationDate) - dayNumber(spec.referenceDate);
  return e.daysUntilExpiry === undefined ? Infinity : e.daysUntilExpiry;
}

function totalQuantity(p) {
  return p.nonExpiringQuantity + p.expiries.reduce((s, e) => s + e.quantity, 0);
}
function freshQuantity(p) {
  return p.nonExpiringQuantity +
    p.expiries.filter((e) => daysUntilExpiry(e) >= 0).reduce((s, e) => s + e.quantity, 0);
}
function status(p) {
  if (p.expiries.length === 0) return "fresh";
  const soonest = Math.min(...p.expiries.map((e) => daysUntilExpiry(e)));
  if (soonest < 0) return "expired";
  if (soonest === 0) return "expiringToday";
  if (soonest <= 6) return "expiringSoon";
  return "fresh";
}
function usableStock(p) {
  let usable = p.nonExpiringQuantity;
  for (const e of p.expiries) {
    const days = daysUntilExpiry(e);
    const expired = days < 0;
    const expiringSoon = days >= 0 && days <= 6;
    if (expired && !spec.rules.countExpiredStock) continue;
    if (expiringSoon && spec.rules.countExpiringSoonStock === false) continue;
    usable += e.quantity;
  }
  return usable;
}

const products = new Map();
for (const c of spec.collections) {
  for (const p of c.products) products.set(p.name.toLowerCase(), p);
}

const inventory = [];
const wasteAlerts = [];
for (const p of products.values()) {
  inventory.push({
    product: p.name,
    quantity: totalQuantity(p),
    freshQuantity: freshQuantity(p),
    status: status(p),
  });
  const expiring = p.expiries.filter((e) => {
    const d = daysUntilExpiry(e);
    return d >= 0 && d <= spec.horizonDays;
  });
  const expiringQty = expiring.reduce((s, e) => s + e.quantity, 0);
  if (expiringQty > 0) {
    wasteAlerts.push({
      product: p.name,
      quantity: expiringQty,
      daysUntilExpiry: Math.min(...expiring.map((e) => daysUntilExpiry(e))),
      message: "Use " + expiringQty + " x " + p.name + " before they spoil",
    });
  }
}

const reserve = spec.rules.minimumReserve || 0;
const shoppingList = [];
for (const plan of spec.consumptionPlan) {
  const p = products.get(plan.product.toLowerCase());
  const needed = plan.quantityPerDay * spec.horizonDays + reserve;
  const usable = p ? usableStock(p) : 0;
  shoppingList.push({
    product: p ? p.name : plan.product,
    category: p ? p.category : undefined,
    toBuy: Math.max(0, needed - usable),
    usableStock: usable,
    needed,
  });
}
shoppingList.sort((a, b) => a.product.localeCompare(b.product));
wasteAlerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

console.log(JSON.stringify({ shoppingList, wasteAlerts, inventory }, null, 2));
`;
}

function generateGo(spec: NormalizedSpec): string {
  // Emit spec as JSON and parse at runtime to keep codegen deterministic
  return `package main

// Auto-generated food-tracking workflow (foodSavr domain)
import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

type ExpiryEntry struct {
	Quantity        int     \`json:"quantity"\`
	ExpirationDate  *string \`json:"expirationDate"\`
	DaysUntilExpiry *int    \`json:"daysUntilExpiry"\`
}

type Product struct {
	Name                string        \`json:"name"\`
	Category            string        \`json:"category"\`
	Expiries            []ExpiryEntry \`json:"expiries"\`
	NonExpiringQuantity int           \`json:"nonExpiringQuantity"\`
}

type Collection struct {
	Name     string    \`json:"name"\`
	Products []Product \`json:"products"\`
}

type PlanEntry struct {
	Product       string  \`json:"product"\`
	QuantityPerDay float64 \`json:"quantityPerDay"\`
}

type Rules struct {
	CountExpiredStock       bool \`json:"countExpiredStock"\`
	CountExpiringSoonStock  *bool \`json:"countExpiringSoonStock"\`
	MinimumReserve          int  \`json:"minimumReserve"\`
}

type Spec struct {
	Collections      []Collection \`json:"collections"\`
	ReferenceDate    *string      \`json:"referenceDate"\`
	ConsumptionPlan  []PlanEntry   \`json:"consumptionPlan"\`
	HorizonDays      int           \`json:"horizonDays"\`
	Rules            Rules         \`json:"rules"\`
}

type ShoppingItem struct {
	Product    string  \`json:"product"\`
	Category   string  \`json:"category"\`
	ToBuy      int     \`json:"toBuy"\`
	UsableStock int    \`json:"usableStock"\`
	Needed     float64 \`json:"needed"\`
}

type WasteAlert struct {
	Product        string \`json:"product"\`
	Quantity       int    \`json:"quantity"\`
	DaysUntilExpiry int   \`json:"daysUntilExpiry"\`
}

// dayNumber converts an ISO date to UTC days since the epoch
func dayNumber(dateStr string) int {
	t, err := time.Parse("2006-01-02", dateStr[0:10])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	return int(t.Unix() / 86400)
}

// effectiveDays: runtime days-until-expiry from the embedded absolute dates
func effectiveDays(e ExpiryEntry, referenceDate *string) int {
	if e.ExpirationDate != nil {
		return dayNumber(*e.ExpirationDate) - dayNumber(*referenceDate)
	}
	if e.DaysUntilExpiry != nil {
		return *e.DaysUntilExpiry
	}
	return 1 << 30
}

func totalQuantity(p Product) int {
	total := p.NonExpiringQuantity
	for _, e := range p.Expiries {
		total += e.Quantity
	}
	return total
}

func freshQuantity(p Product, referenceDate *string) int {
	total := p.NonExpiringQuantity
	for _, e := range p.Expiries {
		if effectiveDays(e, referenceDate) >= 0 {
			total += e.Quantity
		}
	}
	return total
}

func status(p Product, referenceDate *string) string {
	if len(p.Expiries) == 0 {
		return "fresh"
	}
	soonest := effectiveDays(p.Expiries[0], referenceDate)
	for _, e := range p.Expiries {
		if effectiveDays(e, referenceDate) < soonest {
			soonest = effectiveDays(e, referenceDate)
		}
	}
	if soonest < 0 {
		return "expired"
	}
	if soonest == 0 {
		return "expiringToday"
	}
	if soonest <= 6 {
		return "expiringSoon"
	}
	return "fresh"
}

func usableStock(p Product, spec Spec) int {
	usable := p.NonExpiringQuantity
	for _, e := range p.Expiries {
		days := effectiveDays(e, spec.ReferenceDate)
		expired := days < 0
		expiringSoon := days >= 0 && days <= 6
		if expired && !spec.Rules.CountExpiredStock {
			continue
		}
		if expiringSoon && spec.Rules.CountExpiringSoonStock != nil && !*spec.Rules.CountExpiringSoonStock {
			continue
		}
		usable += e.Quantity
	}
	return usable
}

func main() {
	raw := \`{"spec":${specJson(spec)}}\`
	var parsed struct {
		Spec Spec \`json:"spec"\`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	spec := parsed.Spec

	products := map[string]Product{}
	for _, c := range spec.Collections {
		for _, p := range c.Products {
			products[lower(p.Name)] = p
		}
	}

	type InvItem struct {
		Product       string \`json:"product"\`
		Quantity      int    \`json:"quantity"\`
		FreshQuantity int    \`json:"freshQuantity"\`
		Status        string \`json:"status"\`
	}
	inventory := []InvItem{}
	wasteAlerts := []WasteAlert{}
	for _, p := range products {
		inventory = append(inventory, InvItem{p.Name, totalQuantity(p), freshQuantity(p, spec.ReferenceDate), status(p, spec.ReferenceDate)})
		expiringQty := 0
		soonest := 1 << 30
		for _, e := range p.Expiries {
			days := effectiveDays(e, spec.ReferenceDate)
			if days >= 0 && days <= spec.HorizonDays {
				expiringQty += e.Quantity
				if days < soonest {
					soonest = days
				}
			}
		}
		if expiringQty > 0 {
			wasteAlerts = append(wasteAlerts, WasteAlert{p.Name, expiringQty, soonest})
		}
	}

	shoppingList := []ShoppingItem{}
	for _, plan := range spec.ConsumptionPlan {
		p, ok := products[lower(plan.Product)]
		needed := plan.QuantityPerDay*float64(spec.HorizonDays) + float64(spec.Rules.MinimumReserve)
		usable := 0
		if ok {
			usable = usableStock(p, spec)
		}
		toBuy := needed - float64(usable)
		if toBuy < 0 {
			toBuy = 0
		}
		item := ShoppingItem{Product: plan.Product, ToBuy: int(toBuy), UsableStock: usable, Needed: needed}
		if ok {
			item.Product = p.Name
			item.Category = p.Category
		}
		shoppingList = append(shoppingList, item)
	}

	sort.Slice(shoppingList, func(i, j int) bool { return shoppingList[i].Product < shoppingList[j].Product })
	sort.Slice(wasteAlerts, func(i, j int) bool { return wasteAlerts[i].DaysUntilExpiry < wasteAlerts[j].DaysUntilExpiry })

	out := map[string]interface{}{
		"shoppingList": shoppingList,
		"wasteAlerts":  wasteAlerts,
		"inventory":    inventory,
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(out)
}

func lower(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 32
		}
	}
	return string(b)
}
`;
}

/** Format a number as a Rust f64 literal (1 -> 1.0). */
function asRustFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function generateRust(spec: NormalizedSpec): string {
  // Direct struct-literal emission: no runtime JSON parsing needed
  const productLiterals = spec.collections
    .flatMap((col) => col.products)
    .map((p) => {
      const expiries = p.expiries.length
        ? p.expiries
            .map((e) => {
              const expiration = e.expirationDate
                ? `Some("${e.expirationDate}".to_string())`
                : 'None';
              const offset =
                e.daysUntilExpiry !== undefined ? `Some(${e.daysUntilExpiry})` : 'None';
              return `ExpiryEntry { quantity: ${e.quantity}, expiration_date: ${expiration}, days_until_expiry: ${offset} }`;
            })
            .join(', ')
        : '';
      return `    products.insert("${p.name.toLowerCase()}".to_string(), Product {
        name: "${p.name}".to_string(),
        category: "${p.category ?? ''}".to_string(),
        expiries: vec![${expiries}],
        non_expiring_quantity: ${p.nonExpiringQuantity},
    });`;
    })
    .join('\n');

  const referenceDay = spec.referenceDate
    ? `day_number("${spec.referenceDate}")`
    : '0';

  return `// Auto-generated food-tracking workflow (foodSavr domain)
use std::collections::HashMap;

struct ExpiryEntry {
    quantity: i32,
    expiration_date: Option<String>,
    days_until_expiry: Option<i32>,
}

struct Product {
    name: String,
    category: String,
    expiries: Vec<ExpiryEntry>,
    non_expiring_quantity: i32,
}

// Ordinal day number (days since 1970-01-01) from a "YYYY-MM-DD" string,
// via Howard Hinnant's days_from_civil algorithm — no external crates.
fn day_number(date: &str) -> i32 {
    let y: i32 = date[0..4].parse().expect("year");
    let m: i32 = date[5..7].parse().expect("month");
    let d: i32 = date[8..10].parse().expect("day");
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

// Days until expiry, computed at runtime from the embedded absolute dates
fn effective_days(e: &ExpiryEntry, reference_day: i32) -> i32 {
    match &e.expiration_date {
        Some(date) => day_number(date) - reference_day,
        None => e.days_until_expiry.unwrap_or(i32::MAX),
    }
}

fn total_quantity(p: &Product) -> i32 {
    p.non_expiring_quantity + p.expiries.iter().map(|e| e.quantity).sum::<i32>()
}

fn fresh_quantity(p: &Product, reference_day: i32) -> i32 {
    p.non_expiring_quantity
        + p.expiries.iter().filter(|e| effective_days(e, reference_day) >= 0).map(|e| e.quantity).sum::<i32>()
}

fn status(p: &Product, reference_day: i32) -> String {
    if p.expiries.is_empty() {
        return "fresh".to_string();
    }
    let soonest = p.expiries.iter().map(|e| effective_days(e, reference_day)).min().unwrap();
    if soonest < 0 {
        "expired".to_string()
    } else if soonest == 0 {
        "expiringToday".to_string()
    } else if soonest <= 6 {
        "expiringSoon".to_string()
    } else {
        "fresh".to_string()
    }
}

fn usable_stock(p: &Product, reference_day: i32, count_expired: bool, count_expiring_soon: bool) -> i32 {
    let mut usable = p.non_expiring_quantity;
    for e in &p.expiries {
        let days = effective_days(e, reference_day);
        let expired = days < 0;
        let expiring_soon = days >= 0 && days <= 6;
        if expired && !count_expired {
            continue;
        }
        if expiring_soon && !count_expiring_soon {
            continue;
        }
        usable += e.quantity;
    }
    usable
}

fn main() {
    let mut products: HashMap<String, Product> = HashMap::new();
${productLiterals}

    let reference_day: i32 = ${referenceDay};
    let horizon_days: i32 = ${spec.horizonDays};
    let count_expired: bool = ${spec.rules.countExpiredStock ?? false};
    let count_expiring_soon: bool = ${spec.rules.countExpiringSoonStock !== false};
    let reserve: i32 = ${spec.rules.minimumReserve ?? 0};

    let plan: Vec<(&str, f64)> = vec![
${spec.consumptionPlan.map((p) => `        ("${p.product}", ${asRustFloat(p.quantityPerDay)}),`).join('\n')}
    ];

    let mut inventory: Vec<(String, i32, i32, String)> = Vec::new();
    let mut waste_alerts: Vec<(String, i32, i32)> = Vec::new();
    for p in products.values() {
        inventory.push((p.name.clone(), total_quantity(p), fresh_quantity(p, reference_day), status(p, reference_day)));
        let mut expiring_qty = 0;
        let mut soonest = i32::MAX;
        for e in &p.expiries {
            let days = effective_days(e, reference_day);
            if days >= 0 && days <= horizon_days {
                expiring_qty += e.quantity;
                if days < soonest {
                    soonest = days;
                }
            }
        }
        if expiring_qty > 0 {
            waste_alerts.push((p.name.clone(), expiring_qty, soonest));
        }
    }
    waste_alerts.sort_by_key(|w| w.2);

    let mut shopping: Vec<(String, i32, i32, f64)> = Vec::new();
    for (name, per_day) in &plan {
        let key = name.to_lowercase();
        let needed = per_day * horizon_days as f64 + reserve as f64;
        let usable = products
            .get(&key)
            .map(|p| usable_stock(p, reference_day, count_expired, count_expiring_soon))
            .unwrap_or(0);
        let to_buy = ((needed - usable as f64).max(0.0)) as i32;
        let display = products.get(&key).map(|p| p.name.clone()).unwrap_or_else(|| name.to_string());
        shopping.push((display, to_buy, usable, needed));
    }
    shopping.sort_by(|a, b| a.0.cmp(&b.0));

    println!("shopping_list:");
    for (name, to_buy, usable, needed) in &shopping {
        println!("  product={} to_buy={} usable_stock={} needed={}", name, to_buy, usable, needed);
    }
    println!("waste_alerts:");
    for (name, qty, days) in &waste_alerts {
        println!("  product={} quantity={} days_until_expiry={}", name, qty, days);
    }
    println!("inventory:");
    for (name, qty, fresh, st) in &inventory {
        println!("  product={} quantity={} fresh={} status={}", name, qty, fresh, st);
    }
}
`;
}


// ============================================================================
// Domain registration data (consumed by the domain catalog)
// ============================================================================

export const FOODSAVR_DOMAIN_KEYWORDS = [
  'food', 'pantry', 'fridge', 'freezer', 'grocery', 'groceries',
  'shopping list', 'shoppinglist', 'expiration', 'expirationdate',
  'expiry', 'expiring', 'expired', 'spoil', 'foodwaste', 'meal',
  'mealplan', 'recipe', 'consumption', 'consumptionrate', 'stock',
  'inventory', 'barcode', 'openfoodfacts', 'foodsavr', 'shopping',
];

/** Build a demo spec from the foodsavr README scenario (legacy day-offsets). */
export function createDemoSpec(): FoodWorkflowSpec {
  return {
    domain: 'food-tracking',
    collections: [
      {
        id: 'pantry',
        name: 'Pantry',
        products: [
          {
            id: 'p1',
            name: 'Milk',
            category: 'dairy',
            nonExpiringQuantity: 0,
            expiries: [
              { quantity: 2, daysUntilExpiry: 3 },   // expiring soon: use first
              { quantity: 1, daysUntilExpiry: -1 },  // already expired
            ],
          },
          {
            id: 'p2',
            name: 'Pasta',
            category: 'dry goods',
            nonExpiringQuantity: 4,
            expiries: [],
          },
          {
            id: 'p3',
            name: 'Bananas',
            category: 'produce',
            nonExpiringQuantity: 0,
            expiries: [{ quantity: 6, daysUntilExpiry: 2 }],
          },
        ],
      },
    ],
    consumptionPlan: [
      { product: 'milk', quantityPerDay: 1 },
      { product: 'pasta', quantityPerDay: 0.5 },
      { product: 'bananas', quantityPerDay: 1 },
    ],
    horizonDays: 7,
    rules: { countExpiredStock: false, countExpiringSoonStock: true },
  };
}

/**
 * The same demo scenario with absolute dates. referenceDate 2026-09-29 makes
 * every day-offset in createDemoSpec() an explicit calendar date, so the
 * two specs produce identical workflow output.
 */
export function createDatedDemoSpec(): FoodWorkflowSpec {
  return {
    domain: 'food-tracking',
    referenceDate: '2026-09-29',
    collections: [
      {
        id: 'pantry',
        name: 'Pantry',
        products: [
          {
            id: 'p1',
            name: 'Milk',
            category: 'dairy',
            nonExpiringQuantity: 0,
            expiries: [
              { quantity: 2, expirationDate: '2026-10-02' },  // +3 days: expiring soon
              { quantity: 1, expirationDate: '2026-09-28' },  // -1 day: already expired
            ],
          },
          {
            id: 'p2',
            name: 'Pasta',
            category: 'dry goods',
            nonExpiringQuantity: 4,
            expiries: [],
          },
          {
            id: 'p3',
            name: 'Bananas',
            category: 'produce',
            nonExpiringQuantity: 0,
            expiries: [{ quantity: 6, expirationDate: '2026-10-01' }],  // +2 days
          },
        ],
      },
    ],
    consumptionPlan: [
      { product: 'milk', quantityPerDay: 1 },
      { product: 'pasta', quantityPerDay: 0.5 },
      { product: 'bananas', quantityPerDay: 1 },
    ],
    horizonDays: 7,
    rules: { countExpiredStock: false, countExpiringSoonStock: true },
  };
}

/**
 * The dated demo scenario with consumption derived from a 7-day meal plan
 * instead of an explicit consumptionPlan: one meal per day, each consuming
 * 1 milk, 0.5 pasta and 1 bananas — the same rates as the flat plan.
 */
export function createMealPlanDemoSpec(): FoodWorkflowSpec {
  const spec = createDatedDemoSpec();
  return {
    ...spec,
    consumptionPlan: undefined,
    mealPlan: Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 8, 29 + i));
      const iso = date.toISOString().slice(0, 10);
      return {
        date: iso,
        name: 'day plan',
        ingredients: [
          { product: 'milk', quantity: 1 },
          { product: 'pasta', quantity: 0.5 },
          { product: 'bananas', quantity: 1 },
        ],
      };
    }),
  };
}
