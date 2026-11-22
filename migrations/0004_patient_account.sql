-- Akun pasien: tautan keluarga (wali -> tanggungan, diverifikasi OTP ke nomor terdaftar tanggungan),
-- penilaian layanan, dan pengaduan pasien. Skema dokumen generik (id, payload, updated_at) seperti
-- entitas lain; kolom terstruktur diturunkan dari payload sebagai generated column untuk indeks.
CREATE TABLE IF NOT EXISTS "patient_family_links" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL,
  guardian_rm TEXT GENERATED ALWAYS AS (json_extract(payload, '$.guardian_rm')) VIRTUAL,
  dependent_rm TEXT GENERATED ALWAYS AS (json_extract(payload, '$.dependent_rm')) VIRTUAL,
  status TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS "idx_patient_family_links_updated_at" ON "patient_family_links" (updated_at);
CREATE INDEX IF NOT EXISTS "idx_patient_family_links_guardian" ON "patient_family_links" (guardian_rm, status);
CREATE INDEX IF NOT EXISTS "idx_patient_family_links_dependent" ON "patient_family_links" (dependent_rm, status);

CREATE TABLE IF NOT EXISTS "patient_feedback" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL,
  patient_rm TEXT GENERATED ALWAYS AS (json_extract(payload, '$.patient_rm')) VIRTUAL,
  appointment_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.appointment_id')) VIRTUAL,
  rating INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.rating')) VIRTUAL,
  kategori TEXT GENERATED ALWAYS AS (json_extract(payload, '$.kategori')) VIRTUAL,
  created_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.created_at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS "idx_patient_feedback_updated_at" ON "patient_feedback" (updated_at);
CREATE INDEX IF NOT EXISTS "idx_patient_feedback_patient_rm" ON "patient_feedback" (patient_rm);
CREATE INDEX IF NOT EXISTS "idx_patient_feedback_appointment" ON "patient_feedback" (appointment_id);

CREATE TABLE IF NOT EXISTS "patient_complaints" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL,
  ticket_no TEXT GENERATED ALWAYS AS (json_extract(payload, '$.ticket_no')) VIRTUAL,
  patient_rm TEXT GENERATED ALWAYS AS (json_extract(payload, '$.patient_rm')) VIRTUAL,
  kategori TEXT GENERATED ALWAYS AS (json_extract(payload, '$.kategori')) VIRTUAL,
  status TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL,
  created_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.created_at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS "idx_patient_complaints_updated_at" ON "patient_complaints" (updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_patient_complaints_ticket" ON "patient_complaints" (ticket_no);
CREATE INDEX IF NOT EXISTS "idx_patient_complaints_patient_rm" ON "patient_complaints" (patient_rm);
CREATE INDEX IF NOT EXISTS "idx_patient_complaints_status" ON "patient_complaints" (status);
