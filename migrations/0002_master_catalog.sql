-- Master data layanan yang dikelola petugas (dipakai katalog publik dan validasi booking).
CREATE TABLE IF NOT EXISTS "doctors" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_doctors_updated_at" ON "doctors" (updated_at);

CREATE TABLE IF NOT EXISTS "poliklinik" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_poliklinik_updated_at" ON "poliklinik" (updated_at);
