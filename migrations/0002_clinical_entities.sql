CREATE TABLE IF NOT EXISTS "lab_orders" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_lab_orders_updated_at" ON "lab_orders" (updated_at);

CREATE TABLE IF NOT EXISTS "radiology_orders" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_radiology_orders_updated_at" ON "radiology_orders" (updated_at);

CREATE TABLE IF NOT EXISTS "emergency_visits" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_emergency_visits_updated_at" ON "emergency_visits" (updated_at);
