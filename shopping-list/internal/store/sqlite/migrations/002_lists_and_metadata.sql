CREATE TABLE shopping_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#367447',
  is_default INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO shopping_lists(name,is_default,created_at,updated_at)
VALUES('Groceries',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

ALTER TABLE items ADD COLUMN list_id INTEGER NOT NULL DEFAULT 1 REFERENCES shopping_lists(id);
ALTER TABLE items ADD COLUMN normalized_name TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 4);
ALTER TABLE items ADD COLUMN status INTEGER NOT NULL DEFAULT 1 CHECK(status BETWEEN 1 AND 3);
ALTER TABLE items ADD COLUMN estimated_unit_price_minor INTEGER NOT NULL DEFAULT 0 CHECK(estimated_unit_price_minor >= 0);
ALTER TABLE items ADD COLUMN currency TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN barcode TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN due_at TEXT;
ALTER TABLE items ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN archived_at TEXT;
ALTER TABLE items ADD COLUMN idempotency_key TEXT;

UPDATE items SET
  normalized_name=lower(trim(name)),
  status=CASE WHEN completed=1 THEN 2 ELSE 1 END,
  updated_at=created_at;

CREATE UNIQUE INDEX items_idempotency ON items(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX items_list_status_position ON items(list_id,status,position,created_at);
CREATE INDEX items_normalized_name ON items(normalized_name);

ALTER TABLE purchases ADD COLUMN item_id INTEGER REFERENCES items(id);
ALTER TABLE purchases ADD COLUMN list_id INTEGER NOT NULL DEFAULT 1 REFERENCES shopping_lists(id);
ALTER TABLE purchases ADD COLUMN unit TEXT NOT NULL DEFAULT '';
ALTER TABLE purchases ADD COLUMN unit_price_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN currency TEXT NOT NULL DEFAULT '';

CREATE TABLE pantry_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity >= 0),
  unit TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  low_stock_at REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(normalized_name,unit)
);

CREATE TABLE recurring_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT '',
  interval_days INTEGER NOT NULL CHECK(interval_days > 0),
  next_due_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE offer_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL,
  store TEXT NOT NULL,
  price_text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  valid_until TEXT,
  observed_at TEXT NOT NULL,
  UNIQUE(normalized_name,store,source_url)
);

