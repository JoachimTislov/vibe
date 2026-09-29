CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT '',
  preferred_store TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,
  store TEXT NOT NULL DEFAULT '',
  quantity REAL NOT NULL,
  bought_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS purchases_name_date ON purchases(item_name, bought_at DESC);

