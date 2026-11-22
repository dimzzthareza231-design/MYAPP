-- MYITARU D1 schema: one document table per persistence entity (mirrors MySQLAdapter tables).
CREATE TABLE IF NOT EXISTS "patients" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_patients_updated_at" ON "patients" (updated_at);

CREATE TABLE IF NOT EXISTS "registrations" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_registrations_updated_at" ON "registrations" (updated_at);

CREATE TABLE IF NOT EXISTS "queues" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_queues_updated_at" ON "queues" (updated_at);

CREATE TABLE IF NOT EXISTS "emr_soap" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_emr_soap_updated_at" ON "emr_soap" (updated_at);

CREATE TABLE IF NOT EXISTS "prescriptions" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_prescriptions_updated_at" ON "prescriptions" (updated_at);

CREATE TABLE IF NOT EXISTS "billings" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_billings_updated_at" ON "billings" (updated_at);

CREATE TABLE IF NOT EXISTS "qr_tokens" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_qr_tokens_updated_at" ON "qr_tokens" (updated_at);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_updated_at" ON "audit_logs" (updated_at);

CREATE TABLE IF NOT EXISTS "beds" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_beds_updated_at" ON "beds" (updated_at);

CREATE TABLE IF NOT EXISTS "inventory" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_inventory_updated_at" ON "inventory" (updated_at);

CREATE TABLE IF NOT EXISTS "documents" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_documents_updated_at" ON "documents" (updated_at);

CREATE TABLE IF NOT EXISTS "bookings" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_bookings_updated_at" ON "bookings" (updated_at);

CREATE TABLE IF NOT EXISTS "system_data" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_system_data_updated_at" ON "system_data" (updated_at);

CREATE TABLE IF NOT EXISTS "local_auth_users" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_local_auth_users_updated_at" ON "local_auth_users" (updated_at);

CREATE TABLE IF NOT EXISTS "local_auth_sessions" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_local_auth_sessions_updated_at" ON "local_auth_sessions" (updated_at);

