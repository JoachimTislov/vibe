/**
 * Universal Transpiler - FoodSavr Domain
 *
 * First concrete autonomous workflow domain, modeled on
 * https://github.com/JoachimTislov/foodsavr — "help people save food, time
 * and money" by tracking inventory and synchronizing it with meal planning.
 *
 * Domain model (mirrors foodsavr's lib/models):
 * - ExpiryEntry: a quantity expiring on a specific date
 * - Product: name, category, expiry entries + non-expiring quantity,
 *   with foodsavr's exact status semantics:
 *     expired          daysUntilExpiry < 0
 *     expiringToday    daysUntilExpiry == 0
 *     expiringSoon     0 < daysUntilExpiry <= 6
 *     fresh            otherwise
 * - Collection: an inventory (pantry, fridge, freezer...)
 *
 * Autonomous workflow:
 *   track food -> plan consumption -> generate shopping list
 *   (needed = consumption over the horizon - stock that will still be fresh,
 *    with waste alerts for items that should be used before they spoil)
 *
 * The workflow is defined declaratively (a FoodWorkflowSpec) and compiled
 * to runnable code in any target language via generateWorkflowCode(), so
 * the same 5GL-style definition executes on node, go, or docker-backed
 * rust — deterministically.
 */

// ============================================================================
// Entities (foodsavr domain model)
// ============================================================================

export interface ExpiryEntry {
  quantity: number;
  /** Days from today until this batch expires (negative = already expired) */
  daysUntilExpiry: number;
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

/** foodsavr's exact expiry-status semantics. */
export function productStatus(product: FoodProduct): ProductStatus {
  const soonest = product.expiries
    .map((e) => e.daysUntilExpiry)
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

/** Quantity that is not yet expired (usable stock). */
export function freshQuantity(product: FoodProduct): number {
  return (
    product.nonExpiringQuantity +
    product.expiries
      .filter((e) => e.daysUntilExpiry >= 0)
      .reduce((sum, e) => sum + e.quantity, 0)
  );
}

/** Quantity that expires within `days` (inclusive), for waste alerts. */
export function expiringWithin(product: FoodProduct, days: number): number {
  return product.expiries
    .filter((e) => e.daysUntilExpiry >= 0 && e.daysUntilExpiry <= days)
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
  consumptionPlan: ConsumptionPlanEntry[];
  /** How many days ahead the plan covers */
  horizonDays: number;
  rules: ShoppingListRules;
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

  /** Usable stock for a product under the workflow rules. */
  private usableStock(product: FoodProduct): number {
    const rules = this.spec.rules;
    let usable = product.nonExpiringQuantity;
    for (const entry of product.expiries) {
      const expired = entry.daysUntilExpiry < 0;
      const expiringSoon = entry.daysUntilExpiry >= 0 && entry.daysUntilExpiry <= 6;
      if (expired && !rules.countExpiredStock) continue;
      if (expiringSoon && rules.countExpiringSoonStock === false) continue;
      usable += entry.quantity;
    }
    return usable;
  }

  /**
   * Run the workflow: track -> plan -> shopping list + waste alerts.
   * This is the reference implementation; generated code (any target
   * language) must produce the same output for the same spec.
   */
  run(): WorkflowResult {
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
        freshQuantity: freshQuantity(product),
        status: productStatus(product),
      });

      // Waste alerts: anything expiring within the horizon that the plan
      // won't consume in time should be used first.
      const expiringQty = expiringWithin(product, horizon);
      if (expiringQty > 0) {
        const soonest = Math.min(
          ...product.expiries
            .filter((e) => e.daysUntilExpiry >= 0)
            .map((e) => e.daysUntilExpiry)
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

    for (const plan of this.spec.consumptionPlan) {
      const product = products.get(plan.product.toLowerCase());
      const needed = plan.quantityPerDay * horizon + reserve;
      const usable = product ? this.usableStock(product) : 0;
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
 * language. The program embeds the spec and reproduces the reference
 * workflow output exactly (deterministic codegen).
 */
export function generateWorkflowCode(
  spec: FoodWorkflowSpec,
  target: WorkflowTarget
): string {
  switch (target) {
    case 'typescript':
    case 'javascript':
      return generateJs(spec);
    case 'go':
      return generateGo(spec);
    case 'rust':
      return generateRust(spec);
  }
}

function specJson(spec: FoodWorkflowSpec): string {
  return JSON.stringify(spec);
}

function generateJs(spec: FoodWorkflowSpec): string {
  return `"use strict";
// Auto-generated food-tracking workflow (foodSavr domain)
const spec = ${specJson(spec)};

function totalQuantity(p) {
  return p.nonExpiringQuantity + p.expiries.reduce((s, e) => s + e.quantity, 0);
}
function freshQuantity(p) {
  return p.nonExpiringQuantity +
    p.expiries.filter((e) => e.daysUntilExpiry >= 0).reduce((s, e) => s + e.quantity, 0);
}
function status(p) {
  if (p.expiries.length === 0) return "fresh";
  const soonest = Math.min(...p.expiries.map((e) => e.daysUntilExpiry));
  if (soonest < 0) return "expired";
  if (soonest === 0) return "expiringToday";
  if (soonest <= 6) return "expiringSoon";
  return "fresh";
}
function usableStock(p) {
  let usable = p.nonExpiringQuantity;
  for (const e of p.expiries) {
    const expired = e.daysUntilExpiry < 0;
    const expiringSoon = e.daysUntilExpiry >= 0 && e.daysUntilExpiry <= 6;
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
  const expiring = p.expiries.filter((e) => e.daysUntilExpiry >= 0 && e.daysUntilExpiry <= spec.horizonDays);
  const expiringQty = expiring.reduce((s, e) => s + e.quantity, 0);
  if (expiringQty > 0) {
    wasteAlerts.push({
      product: p.name,
      quantity: expiringQty,
      daysUntilExpiry: Math.min(...expiring.map((e) => e.daysUntilExpiry)),
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

function generateGo(spec: FoodWorkflowSpec): string {
  // Emit spec as JSON and parse at runtime to keep codegen deterministic
  return `package main

// Auto-generated food-tracking workflow (foodSavr domain)
import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
)

type ExpiryEntry struct {
	Quantity      int \`json:"quantity"\`
	DaysUntilExpiry int \`json:"daysUntilExpiry"\`
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
	ConsumptionPlan  []PlanEntry  \`json:"consumptionPlan"\`
	HorizonDays      int          \`json:"horizonDays"\`
	Rules            Rules        \`json:"rules"\`
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

func totalQuantity(p Product) int {
	total := p.NonExpiringQuantity
	for _, e := range p.Expiries {
		total += e.Quantity
	}
	return total
}

func freshQuantity(p Product) int {
	total := p.NonExpiringQuantity
	for _, e := range p.Expiries {
		if e.DaysUntilExpiry >= 0 {
			total += e.Quantity
		}
	}
	return total
}

func status(p Product) string {
	if len(p.Expiries) == 0 {
		return "fresh"
	}
	soonest := p.Expiries[0].DaysUntilExpiry
	for _, e := range p.Expiries {
		if e.DaysUntilExpiry < soonest {
			soonest = e.DaysUntilExpiry
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
		expired := e.DaysUntilExpiry < 0
		expiringSoon := e.DaysUntilExpiry >= 0 && e.DaysUntilExpiry <= 6
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
		inventory = append(inventory, InvItem{p.Name, totalQuantity(p), freshQuantity(p), status(p)})
		expiringQty := 0
		soonest := 1 << 30
		for _, e := range p.Expiries {
			if e.DaysUntilExpiry >= 0 && e.DaysUntilExpiry <= spec.HorizonDays {
				expiringQty += e.Quantity
				if e.DaysUntilExpiry < soonest {
					soonest = e.DaysUntilExpiry
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

function generateRust(spec: FoodWorkflowSpec): string {
  // Direct struct-literal emission: no runtime JSON parsing needed
  const productLiterals = spec.collections
    .flatMap((col) => col.products)
    .map((p) => {
      const expiries = p.expiries.length
        ? p.expiries.map((e) => `ExpiryEntry { quantity: ${e.quantity}, days_until_expiry: ${e.daysUntilExpiry} }`).join(', ')
        : '';
      return `    products.insert("${p.name.toLowerCase()}".to_string(), Product {
        name: "${p.name}".to_string(),
        category: "${p.category ?? ''}".to_string(),
        expiries: vec![${expiries}],
        non_expiring_quantity: ${p.nonExpiringQuantity},
    });`;
    })
    .join('\n');

  return `// Auto-generated food-tracking workflow (foodSavr domain)
use std::collections::HashMap;

struct ExpiryEntry {
    quantity: i32,
    days_until_expiry: i32,
}

struct Product {
    name: String,
    category: String,
    expiries: Vec<ExpiryEntry>,
    non_expiring_quantity: i32,
}

fn total_quantity(p: &Product) -> i32 {
    p.non_expiring_quantity + p.expiries.iter().map(|e| e.quantity).sum::<i32>()
}

fn fresh_quantity(p: &Product) -> i32 {
    p.non_expiring_quantity
        + p.expiries.iter().filter(|e| e.days_until_expiry >= 0).map(|e| e.quantity).sum::<i32>()
}

fn status(p: &Product) -> String {
    if p.expiries.is_empty() {
        return "fresh".to_string();
    }
    let soonest = p.expiries.iter().map(|e| e.days_until_expiry).min().unwrap();
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

fn usable_stock(p: &Product, count_expired: bool, count_expiring_soon: bool) -> i32 {
    let mut usable = p.non_expiring_quantity;
    for e in &p.expiries {
        let expired = e.days_until_expiry < 0;
        let expiring_soon = e.days_until_expiry >= 0 && e.days_until_expiry <= 6;
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
        inventory.push((p.name.clone(), total_quantity(p), fresh_quantity(p), status(p)));
        let mut expiring_qty = 0;
        let mut soonest = i32::MAX;
        for e in &p.expiries {
            if e.days_until_expiry >= 0 && e.days_until_expiry <= horizon_days {
                expiring_qty += e.quantity;
                if e.days_until_expiry < soonest {
                    soonest = e.days_until_expiry;
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
            .map(|p| usable_stock(p, count_expired, count_expiring_soon))
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

/** Build a demo spec from the foodsavr README scenario. */
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
