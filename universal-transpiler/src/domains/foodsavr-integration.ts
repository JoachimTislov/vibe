/**
 * Universal Transpiler - FoodSavr -> ShoppingList service integration
 *
 * Connects the foodSavr domain workflow (src/domains/foodsavr.ts) to the
 * real shopping-list backend defined by the sibling project's gRPC service
 * (shopping-list/proto/shopping/v1/shopping.proto, package shopping.v1).
 *
 * The integration layer converts a FoodTrackingWorkflow result into
 * AddItemRequest-shaped plain objects. It has NO gRPC dependency: the
 * payloads are shape-compatible with the proto messages, so the real
 * service can consume them once serialized (JSON or binary after
 * protobuf encoding).
 *
 * Field mapping (foodsavr -> shopping.v1.AddItemRequest):
 *   shoppingList[].product  -> name
 *   shoppingList[].toBuy    -> quantity (integer unit count as double)
 *   (fixed / per-category)  -> unit (default "pcs", options.unitByCategory)
 *   shoppingList[].category -> category
 *   shoppingList[].needed / usableStock -> note (human-readable context)
 *   wasteAlerts (match by product, case-insensitive)
 *                           -> priority (PRIORITY_URGENT when the batch is
 *                              expiring today or later, PRIORITY_HIGH when a
 *                              waste alert applies, PRIORITY_NORMAL otherwise)
 *                           -> due_at (options.referenceDate + daysUntilExpiry,
 *                              ISO calendar date; omitted without referenceDate)
 *   options.listId          -> list_id
 *   (derived)              -> idempotency_key (deterministic hash of the
 *                              payload identity: same inputs -> same key)
 *   (constant)             -> merge_duplicate (true: restocking should merge
 *                              with an existing list entry, not duplicate it)
 *
 * Deliberately NOT mapped (no source data in a foodsavr workflow result):
 *   preferred_store, estimated_unit_price, barcode, image_url.
 * AddItemRequest has no status field in the proto (status lives on Item and
 * is assigned by the service), so no status is emitted.
 *
 * The module also ships a small plain-text proto parser
 * (parseProtoSource/validatePayloadsAgainstProto) so callers and tests can
 * assert the emitted shapes against the real shopping.proto and break loudly
 * if the contract changes.
 */

import { dayNumber, type WorkflowResult } from './foodsavr';

// ============================================================================
// Proto model (plain-text parsing, no protobuf dependency)
// ============================================================================

/** A single field of a parsed proto message. */
export interface ProtoField {
  name: string;
  /** Proto type as written in the .proto file ("int64", "string", "Priority"...). */
  type: string;
  number: number;
  repeated: boolean;
}

/** Everything a plain-text proto parse extracts for this integration. */
export interface ParsedProto {
  /** message name -> fields (in declaration order) */
  messages: Record<string, ProtoField[]>;
  /** enum name -> value names in declaration order */
  enums: Record<string, string[]>;
}

/**
 * Parse the subset of proto3 syntax this integration needs: messages
 * (with their fields), enums (with their value names) and comments.
 * Single-level messages only — shopping.proto has no nested messages.
 */
export function parseProtoSource(text: string): ParsedProto {
  // Strip line comments (block comments are not used in shopping.proto)
  const stripped = text.replace(/\/\/[^\n]*/g, '');

  const messages: Record<string, ProtoField[]> = {};
  const enums: Record<string, string[]> = {};

  const enumRe = /enum\s+(\w+)\s*\{([^}]*)\}/g;
  let enumMatch: RegExpExecArray | null;
  while ((enumMatch = enumRe.exec(stripped)) !== null) {
    const values: string[] = [];
    const valueRe = /([A-Za-z_]\w*)\s*=\s*(-?\d+)/g;
    let valueMatch: RegExpExecArray | null;
    while ((valueMatch = valueRe.exec(enumMatch[2])) !== null) {
      values.push(valueMatch[1]);
    }
    enums[enumMatch[1]] = values;
  }

  const messageRe = /message\s+(\w+)\s*\{([^}]*)\}/g;
  let messageMatch: RegExpExecArray | null;
  while ((messageMatch = messageRe.exec(stripped)) !== null) {
    const fields: ProtoField[] = [];
    const fieldRe = /(repeated\s+)?([A-Za-z_][\w.]*)\s+([A-Za-z_]\w*)\s*=\s*(\d+)/g;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRe.exec(messageMatch[2])) !== null) {
      fields.push({
        repeated: fieldMatch[1] !== undefined,
        type: fieldMatch[2],
        name: fieldMatch[3],
        number: Number(fieldMatch[4]),
      });
    }
    messages[messageMatch[1]] = fields;
  }

  return { messages, enums };
}

// ============================================================================
// Payload types (proto-shaped plain objects)
// ============================================================================

/** shopping.v1.Priority enum values, as proto3 JSON renders them. */
export type PriorityValue =
  | 'PRIORITY_UNSPECIFIED'
  | 'PRIORITY_LOW'
  | 'PRIORITY_NORMAL'
  | 'PRIORITY_HIGH'
  | 'PRIORITY_URGENT';

/** An object shaped exactly like shopping.v1.AddItemRequest (proto field names). */
export interface AddItemRequestPayload {
  list_id: number;
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  note: string;
  priority: PriorityValue;
  due_at?: string;
  merge_duplicate: boolean;
  idempotency_key: string;
}

/** Options for converting a workflow result to service payloads. */
export interface ShoppingListServiceOptions {
  /** Target shopping list (shopping.v1.AddItemRequest.list_id); default 0. */
  listId?: number;
  /**
   * Reference "today" (ISO calendar date, e.g. "2026-09-29") used to turn
   * waste-alert day offsets into absolute due dates. When absent, no due_at
   * is emitted (priority still reflects the alert).
   */
  referenceDate?: string;
  /** Per-category unit override, e.g. { dairy: "l" }; category name lowercased. */
  unitByCategory?: Record<string, string>;
  /** Unit for categories without an override; default "pcs". */
  defaultUnit?: string;
  /**
   * Include shopping-list entries with nothing to buy (toBuy = 0).
   * Default false: a shopping app should not receive zero-quantity items.
   */
  includeZeroQuantity?: boolean;
}

// ============================================================================
// Mapping helpers
// ============================================================================

/** The default unit for foodsavr's integer unit counts. */
export const DEFAULT_UNIT = 'pcs';

/**
 * Days-until-expiry -> proto Priority:
 * - expiring today (0) or already negative -> PRIORITY_URGENT
 * - any other waste alert (expiring within the horizon) -> PRIORITY_HIGH
 * - no waste alert -> PRIORITY_NORMAL
 */
export function priorityForAlert(daysUntilExpiry: number | undefined): PriorityValue {
  if (daysUntilExpiry === undefined) return 'PRIORITY_NORMAL';
  if (daysUntilExpiry <= 0) return 'PRIORITY_URGENT';
  return 'PRIORITY_HIGH';
}

/**
 * referenceDate + days as an ISO 8601 calendar date ("2026-09-29" + 3 ->
 * "2026-10-02"). Pure UTC day arithmetic on the calendar date.
 */
export function addDays(referenceDate: string, days: number): string {
  const ms = (dayNumber(referenceDate) + days) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** FNV-1a 32-bit hash as fixed-width hex; deterministic across runs/machines. */
function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic idempotency key for one AddItem operation: same list, item
 * identity, quantity, unit, category and due date always produce the same
 * key, so retrying or replaying a workflow run never duplicates items.
 */
export function computeIdempotencyKey(payload: {
  list_id: number;
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  due_at?: string;
}): string {
  const canonical = [
    payload.list_id,
    payload.name.toLowerCase(),
    payload.quantity,
    payload.unit,
    payload.category?.toLowerCase() ?? '',
    payload.due_at ?? '',
  ].join('|');
  return `foodsavr-${stableHash(canonical)}`;
}

// ============================================================================
// Payload generation
// ============================================================================

/**
 * Convert a FoodTrackingWorkflow result into shopping.v1.AddItemRequest-shaped
 * plain objects (JSON/proto-compatible; no gRPC dependency).
 *
 * Ordering is deterministic: payloads follow the workflow result's
 * shoppingList order (already sorted by product name).
 */
export function generateShoppingListServicePayloads(
  workflowResult: WorkflowResult,
  options?: ShoppingListServiceOptions
): AddItemRequestPayload[] {
  const listId = options?.listId ?? 0;
  const defaultUnit = options?.defaultUnit ?? DEFAULT_UNIT;
  const includeZero = options?.includeZeroQuantity ?? false;

  // Waste alerts by lowercase product; a product has at most one alert in
  // the current workflow, but keep the soonest if several ever appear.
  const alertsByProduct = new Map<string, { quantity: number; daysUntilExpiry: number; message: string }>();
  for (const alert of workflowResult.wasteAlerts) {
    const key = alert.product.toLowerCase();
    const existing = alertsByProduct.get(key);
    if (existing === undefined || alert.daysUntilExpiry < existing.daysUntilExpiry) {
      alertsByProduct.set(key, {
        quantity: alert.quantity,
        daysUntilExpiry: alert.daysUntilExpiry,
        message: alert.message,
      });
    }
  }

  const payloads: AddItemRequestPayload[] = [];
  for (const item of workflowResult.shoppingList) {
    if (!includeZero && item.toBuy <= 0) continue;

    const alert = alertsByProduct.get(item.product.toLowerCase());
    const unit = (item.category !== undefined && options?.unitByCategory?.[item.category.toLowerCase()]) || defaultUnit;
    const dueAt =
      alert !== undefined && options?.referenceDate !== undefined
        ? addDays(options.referenceDate, alert.daysUntilExpiry)
        : undefined;

    let note = `foodsavr: need ${item.needed}, ${item.usableStock} usable in stock`;
    if (alert !== undefined) {
      note += `; ${alert.message}`;
    }

    const base = {
      list_id: listId,
      name: item.product,
      quantity: item.toBuy,
      unit,
      category: item.category,
      due_at: dueAt,
    };

    payloads.push({
      ...base,
      note,
      priority: priorityForAlert(alert?.daysUntilExpiry),
      merge_duplicate: true,
      idempotency_key: computeIdempotencyKey(base),
    });
  }

  return payloads;
}

// ============================================================================
// Proto shape validation
// ============================================================================

/** Result of validating generated payloads against a parsed proto. */
export interface ProtoValidation {
  ok: boolean;
  errors: string[];
}

const PROTO_SCALAR_TYPES: Record<string, string> = {
  double: 'number',
  float: 'number',
  int32: 'number',
  int64: 'number',
  uint32: 'number',
  uint64: 'number',
  sint32: 'number',
  sint64: 'number',
  fixed32: 'number',
  fixed64: 'number',
  sfixed32: 'number',
  sfixed64: 'number',
  string: 'string',
  bytes: 'string',
  bool: 'boolean',
};

/**
 * Validate AddItemRequest-shaped payloads against the real proto source:
 * every payload key must be an AddItemRequest field, and every value must
 * have the JavaScript type the proto type implies (enums must carry one of
 * the enum's value names). Returns all errors so a proto change breaks
 * loudly and completely, not on the first mismatch.
 */
export function validatePayloadsAgainstProto(
  payloads: AddItemRequestPayload[],
  protoText: string
): ProtoValidation {
  const errors: string[] = [];
  const proto = parseProtoSource(protoText);
  const requestFields = proto.messages['AddItemRequest'];

  if (requestFields === undefined) {
    return { ok: false, errors: ['proto does not define message AddItemRequest'] };
  }
  const fieldByName = new Map(requestFields.map((f) => [f.name, f]));

  payloads.forEach((payload, index) => {
    for (const key of Object.keys(payload)) {
      const field = fieldByName.get(key);
      if (field === undefined) {
        errors.push(`payload[${index}]: "${key}" is not an AddItemRequest field`);
        continue;
      }
      const value = (payload as unknown as Record<string, unknown>)[key];
      if (value === undefined) continue;

      const expected = PROTO_SCALAR_TYPES[field.type];
      if (expected !== undefined) {
        if (typeof value !== expected) {
          errors.push(
            `payload[${index}].${key}: proto type ${field.type} expects ` +
              `${expected}, got ${typeof value}`
          );
        }
      } else {
        // Named type: either a parsed enum (check value names) or a nested
        // message (not used by AddItemRequest scalar fields we emit).
        const enumValues = proto.enums[field.type];
        if (enumValues !== undefined && !enumValues.includes(String(value))) {
          errors.push(
            `payload[${index}].${key}: "${String(value)}" is not a ` +
              `${field.type} value (${enumValues.join(', ')})`
          );
        }
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
