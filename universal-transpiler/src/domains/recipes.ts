/**
 * Universal Transpiler - Recipe Domain
 *
 * The second concrete autonomous workflow domain, demonstrating 5GL-style
 * domain composition on top of the foodSavr domain:
 *
 *   recipes  ->  meal plan  ->  FoodWorkflowSpec  ->  FoodTrackingWorkflow
 *           ->  shopping list  ->  shopping.v1.AddItemRequest payloads
 *
 * The recipe domain owns culinary entities (recipes with per-serving
 * ingredient quantities, a meal schedule mapping recipes to calendar dates);
 * it does NOT re-implement inventory tracking or shopping-list logic. It
 * composes THROUGH the foodsavr domain's public API:
 *
 * - RecipePlanner expands a schedule into a foodsavr-compatible mealPlan:
 *   each scheduled meal becomes one PlannedMeal whose ingredient quantities
 *   are scaled by the servings ratio (meal servings / recipe base servings).
 * - composeIntoFoodSpec builds a COMPLETE FoodWorkflowSpec (collections from
 *   the given pantry inventory, the derived mealPlan, a horizon covering the
 *   schedule, default rules) that runs through the EXISTING
 *   FoodTrackingWorkflow and generateWorkflowCode() unchanged.
 *
 * Scaling semantics: quantities are defined per recipe base servings and
 * scale linearly with the scheduled servings (2 servings of a 1-serving
 * recipe doubles every ingredient). Scaled quantities are rounded to 6
 * decimal places so fractional servings never produce float noise like
 * 0.30000000000000004 downstream. Repeated products inside one meal are
 * summed into a single MealIngredient.
 */

import {
  daysBetween,
  type FoodCollection,
  type FoodWorkflowSpec,
  type MealIngredient,
  type PlannedMeal,
  type ShoppingListRules,
} from './foodsavr';

// ============================================================================
// Recipe entities
// ============================================================================

/** One ingredient of a recipe, defined for the recipe's base servings. */
export interface RecipeIngredient {
  /** Product name; lowercased when planned (foodsavr lookup convention) */
  product: string;
  /** Units of the product the base recipe consumes */
  quantity: number;
  /** Human-readable unit (g, l, pcs...) — informational in composition */
  unit: string;
}

/** A cooking recipe: a named set of ingredients for a base number of servings. */
export interface Recipe {
  id: string;
  name: string;
  /** The servings the ingredient quantities are defined for */
  servings: number;
  ingredients: RecipeIngredient[];
  steps?: string[];
  tags?: string[];
}

/** One scheduled meal: which recipe on which date, for how many servings. */
export interface ScheduledMeal {
  /** ISO 8601 calendar date the meal is planned for (e.g. "2026-09-29") */
  date: string;
  /** The recipe to cook (must exist in the planner's recipe set) */
  recipeId: string;
  /** Servings to prepare; defaults to the recipe's base servings */
  servings?: number;
  /** Optional human-readable meal name; defaults to the recipe name */
  name?: string;
}

/** A meal schedule: which recipe to cook on which date. */
export type RecipeSchedule = ScheduledMeal[];

// ============================================================================
// Scaling helpers
// ============================================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(date: string, what: string): void {
  if (!ISO_DATE_RE.test(date)) {
    throw new Error(`${what} must be an ISO 8601 calendar date (YYYY-MM-DD), got ${JSON.stringify(date)}`);
  }
}

/**
 * Scale a quantity by the servings ratio, rounded to 6 decimals so
 * fractional servings stay clean downstream. Scale 1 returns the original
 * quantity untouched.
 */
export function scaleQuantity(quantity: number, scale: number): number {
  if (scale === 1) return quantity;
  return Math.round(quantity * scale * 1e6) / 1e6;
}

// ============================================================================
// RecipePlanner: schedule -> foodsavr mealPlan
// ============================================================================

/**
 * Expands a recipe schedule into a foodsavr-compatible mealPlan: one
 * PlannedMeal per scheduled meal, ingredient quantities scaled by
 * (meal servings / recipe base servings), repeated products summed.
 */
export class RecipePlanner {
  readonly recipes: Recipe[];
  private readonly byId: Map<string, Recipe>;

  constructor(recipes: Recipe[]) {
    this.byId = new Map();
    for (const recipe of recipes) {
      if (recipe.servings <= 0) {
        throw new Error(`Recipe "${recipe.id}" must have positive servings, got ${recipe.servings}`);
      }
      if (this.byId.has(recipe.id)) {
        throw new Error(`Duplicate recipe id: ${JSON.stringify(recipe.id)}`);
      }
      this.byId.set(recipe.id, recipe);
    }
    this.recipes = recipes;
  }

  /** The foodsavr-compatible mealPlan for a schedule, in schedule order. */
  plan(schedule: RecipeSchedule): PlannedMeal[] {
    return schedule.map((meal) => {
      assertIsoDate(meal.date, `ScheduledMeal.date for recipe ${JSON.stringify(meal.recipeId)}`);
      const recipe = this.byId.get(meal.recipeId);
      if (recipe === undefined) {
        throw new Error(`ScheduledMeal references unknown recipe id: ${JSON.stringify(meal.recipeId)}`);
      }
      const servings = meal.servings ?? recipe.servings;
      if (servings <= 0) {
        throw new Error(
          `ScheduledMeal for recipe ${JSON.stringify(meal.recipeId)} must have positive servings, got ${servings}`
        );
      }
      const scale = servings / recipe.servings;

      // Aggregate repeated products within the meal (lowercase foodsavr keys)
      const quantities = new Map<string, number>();
      for (const ingredient of recipe.ingredients) {
        const key = ingredient.product.toLowerCase();
        quantities.set(key, (quantities.get(key) ?? 0) + scaleQuantity(ingredient.quantity, scale));
      }
      const ingredients: MealIngredient[] = [...quantities.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([product, quantity]) => ({ product, quantity }));

      return {
        date: meal.date,
        name: meal.name ?? recipe.name,
        ingredients,
      };
    });
  }
}

/** Functional form of RecipePlanner.plan for one-off use. */
export function planMeals(recipes: Recipe[], schedule: RecipeSchedule): PlannedMeal[] {
  return new RecipePlanner(recipes).plan(schedule);
}

// ============================================================================
// Composition: recipes + schedule + inventory -> complete FoodWorkflowSpec
// ============================================================================

export interface RecipeComposeOptions {
  /**
   * Reference "today" for the composed spec (ISO calendar date). Defaults to
   * the earliest scheduled meal date, so expiration statuses and the
   * consumption window start at the beginning of the plan.
   */
  referenceDate?: string;
  /** Explicit horizon; defaults to one covering the whole schedule. */
  horizonDays?: number;
  /** Shopping-list rules; defaults to foodsavr's defaults. */
  rules?: ShoppingListRules;
}

/** Default horizon when a schedule is empty and none was requested. */
const DEFAULT_HORIZON_DAYS = 7;

/**
 * Compose recipes, a meal schedule and a pantry inventory into a COMPLETE
 * FoodWorkflowSpec that runs through the existing FoodTrackingWorkflow and
 * generateWorkflowCode() unchanged:
 *
 * - collections: the given inventory, passed through
 * - mealPlan: the schedule expanded by RecipePlanner (servings-scaled)
 * - referenceDate: options.referenceDate or the earliest scheduled meal
 * - horizonDays: options.horizonDays or (latest meal - referenceDate + 1),
 *   clamped to at least 1 — the horizon always covers the schedule
 * - rules: options.rules or foodsavr's defaults (expired stock excluded,
 *   expiring-soon stock counted as usable)
 */
export function composeIntoFoodSpec(
  recipes: Recipe[],
  schedule: RecipeSchedule,
  inventory: FoodCollection[],
  options?: RecipeComposeOptions
): FoodWorkflowSpec {
  const mealPlan = planMeals(recipes, schedule);
  if (mealPlan.length > 0) {
    // Validate every scheduled date even though plan() already did: keeps
    // the min/max below from comparing malformed strings silently.
    for (const meal of mealPlan) assertIsoDate(meal.date, 'mealPlan date');
  }

  const referenceDate = options?.referenceDate ?? (mealPlan.length > 0 ? earliestDate(mealPlan) : undefined);

  let horizonDays = options?.horizonDays;
  if (horizonDays === undefined) {
    horizonDays =
      mealPlan.length === 0 || referenceDate === undefined
        ? DEFAULT_HORIZON_DAYS
        : daysBetween(referenceDate, latestDate(mealPlan)) + 1;
    horizonDays = Math.max(1, horizonDays);
  }
  if (horizonDays <= 0) {
    throw new Error(`horizonDays must be positive, got ${horizonDays}`);
  }

  return {
    domain: 'food-tracking',
    collections: inventory,
    referenceDate,
    mealPlan,
    horizonDays,
    rules: options?.rules ?? { countExpiredStock: false, countExpiringSoonStock: true },
  };
}

function earliestDate(meals: PlannedMeal[]): string {
  return meals.reduce((min, m) => (m.date < min ? m.date : min), meals[0].date);
}

function latestDate(meals: PlannedMeal[]): string {
  return meals.reduce((max, m) => (m.date > max ? m.date : max), meals[0].date);
}

// ============================================================================
// Demo scenario
// ============================================================================

/** Everything the recipe demo needs to compose a full foodsavr spec. */
export interface RecipeDemo {
  recipes: Recipe[];
  schedule: RecipeSchedule;
  /** Pantry inventory (foodsavr collections, absolute expiration dates) */
  inventory: FoodCollection[];
  /** The "today" the demo is anchored to */
  referenceDate: string;
}

/**
 * The recipe demo scenario: three recipes, a one-week schedule (including
 * double-scaled meals), and a small pantry with expiring items — one batch
 * already past, several expiring within the week, and parmesan missing
 * entirely so the workflow must plan buying it from scratch.
 */
export function createRecipeDemo(): RecipeDemo {
  const recipes: Recipe[] = [
    {
      id: 'pancakes',
      name: 'Fluffy Pancakes',
      servings: 4,
      ingredients: [
        { product: 'Flour', quantity: 2, unit: 'cups' },
        { product: 'Milk', quantity: 1, unit: 'l' },
        { product: 'Eggs', quantity: 2, unit: 'pcs' },
        { product: 'Bananas', quantity: 1, unit: 'pcs' },
      ],
      steps: [
        'Mix flour, milk and eggs into a batter',
        'Slice bananas into the batter',
        'Fry in a hot pan until golden',
      ],
      tags: ['breakfast', 'sweet'],
    },
    {
      id: 'carbonara',
      name: 'Pasta Carbonara',
      servings: 2,
      ingredients: [
        { product: 'Pasta', quantity: 1, unit: 'pcs' },
        { product: 'Eggs', quantity: 2, unit: 'pcs' },
        { product: 'Parmesan', quantity: 1, unit: 'pcs' },
      ],
      steps: ['Boil the pasta', 'Whisk eggs and parmesan', 'Toss off the heat'],
      tags: ['dinner', 'italian'],
    },
    {
      id: 'smoothie',
      name: 'Banana Smoothie',
      servings: 2,
      ingredients: [
        { product: 'Yogurt', quantity: 1, unit: 'cups' },
        { product: 'Bananas', quantity: 2, unit: 'pcs' },
      ],
      steps: ['Blend everything until smooth'],
      tags: ['breakfast'],
    },
  ];

  // One week of meals, anchored at Tuesday 2026-09-29. Some meals are
  // scaled (smoothie for 4 = 2x, pancakes for 8 = 2x, carbonara for 4 = 2x).
  const schedule: RecipeSchedule = [
    { date: '2026-09-29', recipeId: 'pancakes', servings: 4 },
    { date: '2026-09-30', recipeId: 'carbonara', servings: 2 },
    { date: '2026-10-01', recipeId: 'smoothie', servings: 4 },
    { date: '2026-10-02', recipeId: 'carbonara', servings: 2 },
    { date: '2026-10-03', recipeId: 'pancakes', servings: 8 },
    { date: '2026-10-04', recipeId: 'smoothie', servings: 2 },
    { date: '2026-10-05', recipeId: 'carbonara', servings: 4 },
  ];

  const inventory: FoodCollection[] = [
    {
      id: 'pantry',
      name: 'Pantry',
      products: [
        {
          id: 'f1',
          name: 'Flour',
          category: 'dry goods',
          nonExpiringQuantity: 4,
          expiries: [],
        },
        {
          id: 'm1',
          name: 'Milk',
          category: 'dairy',
          nonExpiringQuantity: 0,
          expiries: [
            { quantity: 2, expirationDate: '2026-10-02' }, // +3 days: expiring soon
            { quantity: 1, expirationDate: '2026-09-28' }, // -1 day: already expired
          ],
        },
        {
          id: 'e1',
          name: 'Eggs',
          category: 'dairy',
          nonExpiringQuantity: 0,
          expiries: [{ quantity: 6, expirationDate: '2026-10-05' }], // +6 days
        },
        {
          id: 'b1',
          name: 'Bananas',
          category: 'produce',
          nonExpiringQuantity: 0,
          expiries: [{ quantity: 6, expirationDate: '2026-10-01' }], // +2 days
        },
        {
          id: 'y1',
          name: 'Yogurt',
          category: 'dairy',
          nonExpiringQuantity: 0,
          expiries: [{ quantity: 2, expirationDate: '2026-10-03' }], // +4 days
        },
        {
          id: 'p1',
          name: 'Pasta',
          category: 'dry goods',
          nonExpiringQuantity: 4,
          expiries: [],
        },
        // No parmesan at all: the workflow must plan buying it from scratch
      ],
    },
  ];

  return { recipes, schedule, inventory, referenceDate: '2026-09-29' };
}

/** The demo scenario composed into a ready-to-run FoodWorkflowSpec. */
export function createRecipeDemoSpec(): FoodWorkflowSpec {
  const demo = createRecipeDemo();
  return composeIntoFoodSpec(demo.recipes, demo.schedule, demo.inventory, {
    referenceDate: demo.referenceDate,
  });
}
