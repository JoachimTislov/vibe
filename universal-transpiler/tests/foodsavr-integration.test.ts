/**
 * Universal Transpiler - FoodSavr -> ShoppingList service integration tests
 *
 * Verifies the bridge from the foodSavr domain workflow to the real
 * shopping-list backend (sibling project's shopping.v1 gRPC service):
 * - AddItemRequest payload generation from a workflow result
 * - priority mapping from waste-alert urgency
 * - due_at derivation (referenceDate + daysUntilExpiry)
 * - proto shape validation against the real shopping.proto (the integration
 *   breaks loudly if the proto contract changes)
 * - idempotency_key stability (same inputs -> same keys)
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {
  createDemoSpec,
  createDatedDemoSpec,
  FoodTrackingWorkflow,
  type WorkflowResult,
} from '../src/domains/foodsavr';
import {
  addDays,
  computeIdempotencyKey,
  generateShoppingListServicePayloads,
  parseProtoSource,
  priorityForAlert,
  validatePayloadsAgainstProto,
  type AddItemRequestPayload,
} from '../src/domains/foodsavr-integration';

// The real service definition in the sibling project — the single source of
// truth this integration must stay compatible with.
const PROTO_PATH = path.resolve(
  __dirname,
  '../../shopping-list/proto/shopping/v1/shopping.proto'
);
const protoText = fs.readFileSync(PROTO_PATH, 'utf8');

const datedResult = new FoodTrackingWorkflow(createDatedDemoSpec()).run('2026-09-29');
const legacyResult = new FoodTrackingWorkflow(createDemoSpec()).run();

const payloadFor = (payloads: AddItemRequestPayload[], name: string): AddItemRequestPayload => {
  const found = payloads.find((p) => p.name === name);
  expect(found).toBeDefined();
  return found!;
};

// ============================================================================
// Proto parsing (validation harness proven against the real file)
// ============================================================================

describe('shopping.proto parsing', () => {
  it('parses AddItemRequest with its exact field names, types and numbers', () => {
    const proto = parseProtoSource(protoText);
    const fields = proto.messages['AddItemRequest'];
    expect(fields).toBeDefined();

    const byName = Object.fromEntries(fields!.map((f) => [f.name, f]));
    expect(byName['list_id']).toEqual({ name: 'list_id', type: 'int64', number: 1, repeated: false });
    expect(byName['name']).toEqual({ name: 'name', type: 'string', number: 2, repeated: false });
    expect(byName['quantity']).toEqual({ name: 'quantity', type: 'double', number: 3, repeated: false });
    expect(byName['unit'].type).toBe('string');
    expect(byName['category'].type).toBe('string');
    expect(byName['note'].type).toBe('string');
    expect(byName['priority']).toEqual({ name: 'priority', type: 'Priority', number: 8, repeated: false });
    expect(byName['due_at']).toEqual({ name: 'due_at', type: 'string', number: 12, repeated: false });
    expect(byName['merge_duplicate'].type).toBe('bool');
    expect(byName['idempotency_key']).toEqual({ name: 'idempotency_key', type: 'string', number: 14, repeated: false });
    expect(fields).toHaveLength(14);
  });

  it('parses the Priority enum with all its values', () => {
    const proto = parseProtoSource(protoText);
    expect(proto.enums['Priority']).toEqual([
      'PRIORITY_UNSPECIFIED',
      'PRIORITY_LOW',
      'PRIORITY_NORMAL',
      'PRIORITY_HIGH',
      'PRIORITY_URGENT',
    ]);
    // Item carries the same fields we map onto AddItemRequest
    const itemFields = proto.messages['Item'].map((f) => f.name);
    for (const shared of ['name', 'quantity', 'unit', 'category', 'note', 'priority', 'due_at']) {
      expect(itemFields).toContain(shared);
    }
  });
});

// ============================================================================
// Payload generation from the demo workflow
// ============================================================================

describe('AddItemRequest payload generation', () => {
  const payloads = generateShoppingListServicePayloads(datedResult, {
    listId: 42,
    referenceDate: '2026-09-29',
  });

  it('maps every to-buy item to a payload with proto field names', () => {
    expect(payloads).toHaveLength(2); // Milk (5) and Bananas (1); Pasta has nothing to buy
    const milk = payloadFor(payloads, 'Milk');
    expect(milk.list_id).toBe(42);
    expect(milk.name).toBe('Milk');
    expect(milk.quantity).toBe(5);
    expect(milk.unit).toBe('pcs');
    expect(milk.category).toBe('dairy');
    expect(milk.merge_duplicate).toBe(true);
    expect(milk.idempotency_key).toMatch(/^foodsavr-[0-9a-f]{8}$/);
    expect(milk.note).toContain('need 7');
    expect(milk.note).toContain('2 usable in stock');

    const bananas = payloadFor(payloads, 'Bananas');
    expect(bananas.quantity).toBe(1);
    expect(bananas.category).toBe('produce');
  });

  it('skips zero-quantity entries by default and includes them on demand', () => {
    expect(payloads.some((p) => p.name === 'Pasta')).toBe(false);

    const all = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
      includeZeroQuantity: true,
    });
    expect(all).toHaveLength(3);
    const pasta = payloadFor(all, 'Pasta');
    expect(pasta.quantity).toBe(0);
    expect(pasta.priority).toBe('PRIORITY_NORMAL'); // no waste alert
  });

  it('supports per-category unit overrides and a custom default unit', () => {
    const payloads = generateShoppingListServicePayloads(datedResult, {
      listId: 1,
      referenceDate: '2026-09-29',
      unitByCategory: { dairy: 'l' },
      defaultUnit: 'pieces',
    });
    expect(payloadFor(payloads, 'Milk').unit).toBe('l');
    expect(payloadFor(payloads, 'Bananas').unit).toBe('pieces');
  });

  it('produces the same payloads from the legacy day-offset demo spec', () => {
    const legacy = generateShoppingListServicePayloads(legacyResult, {
      listId: 42,
      referenceDate: '2026-09-29',
    });
    const dated = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
    });
    expect(legacy).toEqual(dated);
  });
});

// ============================================================================
// Priority mapping from waste-alert urgency
// ============================================================================

describe('priority mapping from waste alerts', () => {
  it('gives waste-alerted items HIGH priority in the demo scenario', () => {
    const payloads = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
    });
    // Milk expires in 3 days, Bananas in 2: both under a waste alert
    expect(payloadFor(payloads, 'Milk').priority).toBe('PRIORITY_HIGH');
    expect(payloadFor(payloads, 'Bananas').priority).toBe('PRIORITY_HIGH');
  });

  it('maps alert urgency to the full priority range', () => {
    expect(priorityForAlert(undefined)).toBe('PRIORITY_NORMAL');
    expect(priorityForAlert(7)).toBe('PRIORITY_HIGH');
    expect(priorityForAlert(1)).toBe('PRIORITY_HIGH');
    expect(priorityForAlert(0)).toBe('PRIORITY_URGENT');
    expect(priorityForAlert(-1)).toBe('PRIORITY_URGENT');
  });

  it('flags an item expiring today as URGENT end to end', () => {
    const result: WorkflowResult = {
      shoppingList: [{ product: 'Yogurt', category: 'dairy', toBuy: 2, usableStock: 2, needed: 4 }],
      wasteAlerts: [
        { product: 'Yogurt', quantity: 2, daysUntilExpiry: 0, message: 'Use 2 x Yogurt today' },
      ],
      inventory: [],
    };
    const payloads = generateShoppingListServicePayloads(result, {
      listId: 7,
      referenceDate: '2026-09-29',
    });
    expect(payloads).toHaveLength(1);
    expect(payloads[0].priority).toBe('PRIORITY_URGENT');
    expect(payloads[0].due_at).toBe('2026-09-29');
    expect(payloads[0].note).toContain('Use 2 x Yogurt today');
  });
});

// ============================================================================
// due_at derivation (referenceDate + daysUntilExpiry)
// ============================================================================

describe('due_at derivation', () => {
  it('derives due_at from the reference date plus days until expiry', () => {
    const payloads = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
    });
    expect(payloadFor(payloads, 'Milk').due_at).toBe('2026-10-02');   // +3 days
    expect(payloadFor(payloads, 'Bananas').due_at).toBe('2026-10-01'); // +2 days
  });

  it('adds days across month and year boundaries with pure UTC arithmetic', () => {
    expect(addDays('2026-09-29', 2)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-09-29', 0)).toBe('2026-09-29');
  });

  it('omits due_at without a reference date but keeps the alert priority', () => {
    const payloads = generateShoppingListServicePayloads(legacyResult, { listId: 42 });
    const milk = payloadFor(payloads, 'Milk');
    expect(milk.due_at).toBeUndefined();
    expect(milk.priority).toBe('PRIORITY_HIGH');
    expect('due_at' in JSON.parse(JSON.stringify(milk))).toBe(false);
  });
});

// ============================================================================
// Proto shape validation (breaks loudly when the contract changes)
// ============================================================================

describe('proto shape validation', () => {
  it('emits payloads whose keys are exactly proto AddItemRequest fields', () => {
    const payloads = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
      includeZeroQuantity: true,
    });
    const protoFields = new Set(parseProtoSource(protoText).messages['AddItemRequest'].map((f) => f.name));
    for (const payload of payloads) {
      for (const key of Object.keys(payload)) {
        expect(protoFields.has(key)).toBe(true);
      }
    }
  });

  it('validates generated payloads against the real proto source', () => {
    const payloads = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
      includeZeroQuantity: true,
    });
    const validation = validatePayloadsAgainstProto(payloads, protoText);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('round-trips through JSON with only proto-defined fields and valid types', () => {
    const payloads = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
      includeZeroQuantity: true,
    });
    // JSON serialization is exactly what a gateway would forward to the
    // service: the wire form must stay shape-compatible after the trip.
    const roundTripped = JSON.parse(JSON.stringify(payloads)) as Record<string, unknown>[];
    const validation = validatePayloadsAgainstProto(roundTripped as unknown as AddItemRequestPayload[], protoText);
    expect(validation.ok).toBe(true);

    const protoFields = new Set(parseProtoSource(protoText).messages['AddItemRequest'].map((f) => f.name));
    for (const item of roundTripped) {
      for (const key of Object.keys(item)) {
        expect(protoFields.has(key)).toBe(true);
      }
    }
  });

  it('rejects payloads that violate the proto contract', () => {
    const good = generateShoppingListServicePayloads(datedResult, {
      listId: 42,
      referenceDate: '2026-09-29',
    })[0];

    // A field the proto does not define
    const extraField = { ...good, expires_in_days: 3 } as unknown as AddItemRequestPayload;
    expect(validatePayloadsAgainstProto([extraField], protoText).ok).toBe(false);

    // A proto field with the wrong JavaScript type (double quantity as string)
    const badQuantity = { ...good, quantity: '5' } as unknown as AddItemRequestPayload;
    expect(validatePayloadsAgainstProto([badQuantity], protoText).ok).toBe(false);

    // A priority outside the parsed Priority enum
    const badPriority = { ...good, priority: 'PRIORITY_EXTREME' } as unknown as AddItemRequestPayload;
    expect(validatePayloadsAgainstProto([badPriority], protoText).ok).toBe(false);
  });
});

// ============================================================================
// Idempotency key stability
// ============================================================================

describe('idempotency key stability', () => {
  it('produces identical keys for the same workflow result and options', () => {
    const options = { listId: 42, referenceDate: '2026-09-29' };
    const a = generateShoppingListServicePayloads(datedResult, options);
    const b = generateShoppingListServicePayloads(datedResult, options);
    expect(a.map((p) => p.idempotency_key)).toEqual(b.map((p) => p.idempotency_key));
  });

  it('produces identical keys when the whole workflow is re-run from the spec', () => {
    const fresh = new FoodTrackingWorkflow(createDatedDemoSpec()).run('2026-09-29');
    const a = generateShoppingListServicePayloads(datedResult, { listId: 42, referenceDate: '2026-09-29' });
    const b = generateShoppingListServicePayloads(fresh, { listId: 42, referenceDate: '2026-09-29' });
    expect(a).toEqual(b);
  });

  it('changes keys when the list, quantity, unit, category or due date changes', () => {
    const base = {
      list_id: 42,
      name: 'Milk',
      quantity: 5,
      unit: 'pcs',
      category: 'dairy',
      due_at: '2026-10-02',
    };
    const key = computeIdempotencyKey(base);
    expect(key).toBe(computeIdempotencyKey(base));
    expect(key).toMatch(/^foodsavr-[0-9a-f]{8}$/);
    expect(computeIdempotencyKey({ ...base, list_id: 43 })).not.toBe(key);
    expect(computeIdempotencyKey({ ...base, quantity: 4 })).not.toBe(key);
    expect(computeIdempotencyKey({ ...base, unit: 'l' })).not.toBe(key);
    expect(computeIdempotencyKey({ ...base, category: undefined })).not.toBe(key);
    expect(computeIdempotencyKey({ ...base, due_at: undefined })).not.toBe(key);
  });

  it('is case-insensitive on product and category so name casing cannot fork keys', () => {
    expect(
      computeIdempotencyKey({ list_id: 1, name: 'Milk', quantity: 5, unit: 'pcs', category: 'dairy' })
    ).toBe(
      computeIdempotencyKey({ list_id: 1, name: 'milk', quantity: 5, unit: 'pcs', category: 'Dairy' })
    );
  });
});
