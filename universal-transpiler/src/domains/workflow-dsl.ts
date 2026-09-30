/**
 * Universal Transpiler - Workflow DSL (5GL layer)
 *
 * A text form for the high-level language definitions: whole workflow
 * domains declared as documents, parsed into the same spec objects the
 * reference implementations and codegen consume. Any domain that wants a
 * text form registers a parser here; today: food-tracking.
 *
 * Example document:
 *
 *   workflow food-tracking "Weekly groceries" {
 *       reference-date 2026-10-01
 *       horizon 7 days
 *
 *       collection pantry "Pantry" {
 *           product Milk (dairy): 2 expiring 2026-10-04, 1 expired 2026-09-28
 *           product Pasta (dry goods): 4 non-expiring
 *           product Bananas (produce): 6 expiring 2026-10-03
 *       }
 *
 *       consume Milk at 1 per day
 *       consume Pasta at 0.5 per day
 *       consume Bananas at 1 per day
 *
 *       meal 2026-10-02 "Carbonara" needs Pasta x2, Milk x1
 *   }
 *
 *   rules {
 *       exclude expired stock
 *       count expiring-soon stock
 *   }
 *
 * Parsing is line-based with brace blocks; `#` starts a comment. Errors
 * carry line numbers.
 */

import type {
  FoodCollection,
  FoodProduct,
  FoodWorkflowSpec,
  PlannedMeal,
  ConsumptionPlanEntry,
} from './foodsavr';

// ============================================================================
// Types
// ============================================================================

export interface ParsedWorkflowDocument {
  /** The domain the workflow belongs to (must be a registered domain) */
  domain: string;
  /** Human-readable title from the document */
  title: string;
  /** The composed spec, ready for the domain's reference implementation */
  spec: FoodWorkflowSpec;
  /** Parse warnings (non-fatal surprises) */
  warnings: string[];
}

export class DslSyntaxError extends Error {
  constructor(
    message: string,
    public readonly line: number
  ) {
    super(`DSL syntax error (line ${line}): ${message}`);
    this.name = 'DslSyntaxError';
  }
}

// ============================================================================
// Parser
// ============================================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tokenize one logical line: quoted strings, braces, and words. */
function tokenize(line: string, lineNumber: number): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === ':' || ch === ',') {
      tokens.push(ch);
      i++;
      continue;
    }
    if (ch === '"') {
      const end = line.indexOf('"', i + 1);
      if (end === -1) throw new DslSyntaxError('unterminated string', lineNumber);
      tokens.push(line.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const rest = line.slice(i);
    const match = rest.match(/^[^\s{}":,]+/);
    if (!match) throw new DslSyntaxError(`unexpected character "${ch}"`, lineNumber);
    tokens.push(match[0]);
    i += match[0].length;
  }
  return tokens;
}

const unquote = (token: string): string => token.replace(/^"|"$/g, '');

interface RawProductLine {
  lineNumber: number;
  name: string;
  category?: string;
  batches: { quantity: number; mode: 'expiring' | 'expired' | 'non-expiring'; date?: string }[];
}

/**
 * Parse a workflow document into a FoodWorkflowSpec. The grammar covers
 * exactly the food-tracking domain today; unknown domains are rejected
 * with a clear error.
 */
export function parseWorkflowDsl(source: string): ParsedWorkflowDocument {
  const warnings: string[] = [];
  const lines = source.split('\n');

  // --- state ---
  let domain = '';
  let title = '';
  let referenceDate: string | undefined;
  let horizonDays = 7;
  const collections: FoodCollection[] = [];
  const consumption: ConsumptionPlanEntry[] = [];
  const meals: PlannedMeal[] = [];
  const rules: FoodWorkflowSpec['rules'] = {};

  // Parser context
  type Block = 'none' | 'workflow' | 'collection' | 'rules';
  let block: Block = 'none';
  let currentCollection: FoodCollection | null = null;
  let currentProducts: RawProductLine[] = [];
  let collectionId = '';
  let collectionName = '';
  let sawWorkflowBlock = false;

  const parseQuantity = (token: string, lineNumber: number): number => {
    const value = Number(token);
    if (!Number.isFinite(value) || value < 0) {
      throw new DslSyntaxError(`invalid quantity "${token}"`, lineNumber);
    }
    return value;
  };

  const parseDate = (token: string, lineNumber: number): string => {
    if (!ISO_DATE.test(token)) {
      throw new DslSyntaxError(`invalid ISO date "${token}" (expected YYYY-MM-DD)`, lineNumber);
    }
    return token;
  };

  const finishCollection = (): void => {
    if (!currentCollection) return;
    for (const raw of currentProducts) {
      const expiries = [];
      let nonExpiring = 0;
      for (const batch of raw.batches) {
        if (batch.mode === 'non-expiring') {
          nonExpiring += batch.quantity;
        } else {
          expiries.push({
            quantity: batch.quantity,
            expirationDate: batch.date!,
          });
        }
      }
      const product: FoodProduct = {
        id: `${currentCollection.id}-${raw.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: raw.name,
        category: raw.category,
        expiries,
        nonExpiringQuantity: nonExpiring,
      };
      currentCollection.products.push(product);
    }
    currentCollection = null;
    currentProducts = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const lineNumber = lineIndex + 1;
    const stripped = rawLine.replace(/#.*$/, '').trim();
    if (stripped === '') continue;

    const tokens = tokenize(stripped, lineNumber);
    const [first, ...rest] = tokens;

    // ---- top level ----
    if (block === 'none') {
      if (first === 'workflow') {
        if (tokens.length < 2 || tokens[1] === '{') {
          throw new DslSyntaxError('expected: workflow <domain> "<title>" {', lineNumber);
        }
        domain = tokens[1];
        if (tokens[2] && tokens[2].startsWith('"')) {
          title = unquote(tokens[2]);
        }
        if (domain !== 'food-tracking') {
          throw new DslSyntaxError(
            `unknown workflow domain "${domain}" (supported: food-tracking)`,
            lineNumber
          );
        }
        block = 'workflow';
        sawWorkflowBlock = true;
        continue;
      }
      if (first === 'rules') {
        block = 'rules';
        continue;
      }
      throw new DslSyntaxError(
        `unexpected statement at top level: "${first}" (expected workflow or rules)`,
        lineNumber
      );
    }

    // ---- rules block ----
    if (block === 'rules') {
      if (first === '}') {
        block = 'none';
        continue;
      }
      const text = tokens.join(' ');
      if (/^exclude expired/.test(text)) rules.countExpiredStock = false;
      else if (/^count expired|^include expired/.test(text)) rules.countExpiredStock = true;
      else if (/^count expiring-soon|^include expiring-soon/.test(text)) rules.countExpiringSoonStock = true;
      else if (/^exclude expiring-soon/.test(text)) rules.countExpiringSoonStock = false;
      else if (first === 'reserve') rules.minimumReserve = parseQuantity(rest[0], lineNumber);
      else warnings.push(`line ${lineNumber}: unrecognized rule "${text}" (ignored)`);
      continue;
    }

    // ---- collection block ----
    if (block === 'collection') {
      if (first === '}') {
        const finished = currentCollection;
        finishCollection();
        collections.push(
          finished ?? { id: collectionId, name: collectionName, products: [] }
        );
        block = 'workflow';
        continue;
      }
      if (first !== 'product') {
        throw new DslSyntaxError(`expected "product ..." or "}" inside a collection`, lineNumber);
      }
      // product Name (category): 2 expiring DATE, 1 expired DATE, 4 non-expiring
      const colonIndex = tokens.indexOf(':');
      if (colonIndex === -1) {
        throw new DslSyntaxError('product line needs a ":" before the quantity batches', lineNumber);
      }
      let name = '';
      let category: string | undefined;
      const head = tokens.slice(1, colonIndex);
      const parenIdx = head.findIndex((t) => t.startsWith('('));
      if (parenIdx >= 0) {
        name = head.slice(0, parenIdx).join(' ');
        // The category may span several tokens when it contains spaces:
        // (dry goods) tokenizes as "(dry", "goods)"
        const closeIdx = head.findIndex((t, idx) => idx >= parenIdx && t.endsWith(')'));
        if (closeIdx === -1) {
          throw new DslSyntaxError('unbalanced parentheses in product category', lineNumber);
        }
        const inner = head.slice(parenIdx, closeIdx + 1).join(' ');
        category = inner.slice(1, -1);
        if (closeIdx !== parenIdx && head.slice(parenIdx + 1, closeIdx).some((t) => t.includes('('))) {
          throw new DslSyntaxError('nested parentheses are not supported in categories', lineNumber);
        }
      } else {
        name = head.join(' ');
      }
      if (!name) throw new DslSyntaxError('product needs a name', lineNumber);

      // Batches: comma-separated in the token stream
      const batchTokens = tokens.slice(colonIndex + 1);
      const batches: RawProductLine['batches'] = [];
      let i = 0;
      while (i < batchTokens.length) {
        if (batchTokens[i] === ',') {
          i++;
          continue;
        }
        const quantity = parseQuantity(batchTokens[i], lineNumber);
        const mode = batchTokens[i + 1];
        if (mode === 'non-expiring') {
          batches.push({ quantity, mode: 'non-expiring' });
          i += 2;
        } else if (mode === 'expiring' || mode === 'expired') {
          const date = parseDate(batchTokens[i + 2], lineNumber);
          batches.push({ quantity, mode, date });
          i += 3;
        } else {
          throw new DslSyntaxError(
            `expected "expiring <date>", "expired <date>" or "non-expiring" after quantity ${quantity}`,
            lineNumber
          );
        }
      }
      if (batches.length === 0) {
        throw new DslSyntaxError('product needs at least one quantity batch', lineNumber);
      }
      currentProducts.push({ lineNumber, name, category, batches });
      continue;
    }

    // ---- workflow block ----
    if (block === 'workflow') {
      if (first === '}') {
        block = 'none';
        continue;
      }
      if (first === 'reference-date') {
        referenceDate = parseDate(rest[0], lineNumber);
        continue;
      }
      if (first === 'horizon') {
        const value = parseQuantity(rest[0], lineNumber);
        if (rest[1] !== 'days') {
          throw new DslSyntaxError('expected: horizon <n> days', lineNumber);
        }
        horizonDays = value;
        continue;
      }
      if (first === 'collection') {
        collectionId = rest[0];
        collectionName = rest[1]?.startsWith('"') ? unquote(rest[1]) : rest[0];
        currentCollection = { id: collectionId, name: collectionName, products: [] };
        currentProducts = [];
        block = 'collection';
        continue;
      }
      if (first === 'consume') {
        // consume Product at <rate> per day
        const atIdx = rest.indexOf('at');
        if (atIdx === -1) throw new DslSyntaxError('expected: consume <product> at <rate> per day', lineNumber);
        const product = rest.slice(0, atIdx).join(' ');
        const rate = parseQuantity(rest[atIdx + 1], lineNumber);
        consumption.push({ product, quantityPerDay: rate });
        continue;
      }
      if (first === 'meal') {
        // meal <date> "<name>" needs <product> x<qty>, <product> x<qty>
        const date = parseDate(rest[0], lineNumber);
        let name: string | undefined;
        let needsIdx = rest.findIndex((t) => t === 'needs');
        if (needsIdx === -1) {
          throw new DslSyntaxError('meal needs a "needs" clause with ingredients', lineNumber);
        }
        if (rest[1]?.startsWith('"')) {
          name = unquote(rest[1]);
          needsIdx = rest.findIndex((t, idx) => idx >= 2 && t === 'needs');
        }
        const ingredientTokens = rest.slice((needsIdx >= 0 ? needsIdx : 1) + 1);
        const ingredients: PlannedMeal['ingredients'] = [];
        let i = 0;
        while (i < ingredientTokens.length) {
          if (ingredientTokens[i] === ',') {
            i++;
            continue;
          }
          const productToken = ingredientTokens[i];
          const qtyToken = ingredientTokens[i + 1];
          if (!productToken || !qtyToken?.startsWith('x')) {
            throw new DslSyntaxError(
              `expected "<product> x<quantity>" in meal ingredients (got "${productToken ?? ''} ${qtyToken ?? ''}")`,
              lineNumber
            );
          }
          ingredients.push({
            product: productToken,
            quantity: parseQuantity(qtyToken.slice(1), lineNumber),
          });
          i += 2;
        }
        if (ingredients.length === 0) {
          throw new DslSyntaxError('meal needs at least one ingredient', lineNumber);
        }
        meals.push({ date, name, ingredients });
        continue;
      }
      if (first === 'rules') {
        // inline rules block inside the workflow
        block = 'rules';
        continue;
      }
      throw new DslSyntaxError(
        `unexpected statement in workflow: "${first}" (allowed: reference-date, horizon, collection, consume, meal, rules)`,
        lineNumber
      );
    }
  }

  if (!sawWorkflowBlock) {
    throw new DslSyntaxError('document contains no workflow block', lines.length);
  }
  if (block !== 'none') {
    throw new DslSyntaxError(`unclosed "${block}" block at end of document`, lines.length);
  }

  // Absolute dates or meals require a reference date for the domain semantics
  const hasAbsoluteDates = collections.some((c) =>
    c.products.some((p) => p.expiries.length > 0)
  );
  if ((hasAbsoluteDates || meals.length > 0) && !referenceDate) {
    throw new DslSyntaxError(
      'reference-date is required when products have expiry dates or meals are planned',
      lines.length
    );
  }

  const spec: FoodWorkflowSpec = {
    domain: 'food-tracking',
    collections,
    consumptionPlan: consumption.length > 0 ? consumption : undefined,
    mealPlan: meals.length > 0 ? meals : undefined,
    horizonDays,
    rules,
    referenceDate,
  };

  return { domain, title, spec, warnings };
}

/** Render a FoodWorkflowSpec back into DSL form (round-trippable). */
export function specToDsl(spec: FoodWorkflowSpec, title = 'Composed workflow'): string {
  const lines: string[] = [];
  lines.push(`workflow food-tracking "${title}" {`);
  if (spec.referenceDate) lines.push(`    reference-date ${spec.referenceDate}`);
  lines.push(`    horizon ${spec.horizonDays} days`);
  for (const collection of spec.collections) {
    lines.push('');
    lines.push(`    collection ${collection.id} "${collection.name}" {`);
    for (const product of collection.products) {
      const parts: string[] = [];
      if (product.nonExpiringQuantity > 0) {
        parts.push(`${product.nonExpiringQuantity} non-expiring`);
      }
      for (const entry of product.expiries) {
        const date = entry.expirationDate;
        if (!date) continue;
        const status = entryDaysHint(date, spec.referenceDate);
        parts.push(`${entry.quantity} ${status} ${date}`);
      }
      const category = product.category ? ` (${product.category})` : '';
      lines.push(`        product ${product.name}${category}: ${parts.join(', ')}`);
    }
    lines.push('    }');
  }
  for (const plan of spec.consumptionPlan ?? []) {
    lines.push(`    consume ${plan.product} at ${plan.quantityPerDay} per day`);
  }
  for (const meal of spec.mealPlan ?? []) {
    const needs = meal.ingredients.map((i) => `${i.product} x${i.quantity}`).join(', ');
    const name = meal.name ? ` "${meal.name}"` : '';
    lines.push(`    meal ${meal.date}${name} needs ${needs}`);
  }
  lines.push('}');
  lines.push('');
  lines.push('rules {');
  lines.push(spec.rules.countExpiredStock === false ? '    exclude expired stock' : '    count expired stock');
  lines.push(spec.rules.countExpiringSoonStock === false ? '    exclude expiring-soon stock' : '    count expiring-soon stock');
  if (spec.rules.minimumReserve) lines.push(`    reserve ${spec.rules.minimumReserve}`);
  lines.push('}');
  return lines.join('\n');
}

/** Whether an ISO date is before the reference date (=> "expired" wording). */
function entryDaysHint(isoDate: string, referenceDate?: string): 'expiring' | 'expired' {
  if (!referenceDate) return 'expiring';
  return isoDate < referenceDate ? 'expired' : 'expiring';
}
