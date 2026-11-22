-- Pembayaran online tagihan pasien (Xendit / PayPal).
-- Tabel dokumen yang sama dengan entitas persistensi lain (id, payload, updated_at) agar D1Adapter
-- tetap generik; kolom terstruktur diturunkan dari payload sebagai generated column sehingga bisa
-- diindeks/dikueri (bill_id, patient_rm, provider, channel, amount, currency, status, provider_ref,
-- expires_at, paid_at, created_at). Payload juga memuat raw webhook terakhir (raw_webhook).
CREATE TABLE IF NOT EXISTS "payments" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL,
  bill_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.bill_id')) VIRTUAL,
  patient_rm TEXT GENERATED ALWAYS AS (json_extract(payload, '$.patient_rm')) VIRTUAL,
  provider TEXT GENERATED ALWAYS AS (json_extract(payload, '$.provider')) VIRTUAL,
  channel TEXT GENERATED ALWAYS AS (json_extract(payload, '$.channel')) VIRTUAL,
  amount NUMERIC GENERATED ALWAYS AS (json_extract(payload, '$.amount')) VIRTUAL,
  currency TEXT GENERATED ALWAYS AS (json_extract(payload, '$.currency')) VIRTUAL,
  status TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) VIRTUAL,
  provider_ref TEXT GENERATED ALWAYS AS (json_extract(payload, '$.provider_ref')) VIRTUAL,
  idempotency_key TEXT GENERATED ALWAYS AS (json_extract(payload, '$.idempotency_key')) VIRTUAL,
  expires_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.expires_at')) VIRTUAL,
  paid_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.paid_at')) VIRTUAL,
  created_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.created_at')) VIRTUAL
);
CREATE INDEX IF NOT EXISTS "idx_payments_updated_at" ON "payments" (updated_at);
CREATE INDEX IF NOT EXISTS "idx_payments_bill_id" ON "payments" (bill_id);
CREATE INDEX IF NOT EXISTS "idx_payments_patient_rm" ON "payments" (patient_rm);
CREATE INDEX IF NOT EXISTS "idx_payments_provider_ref" ON "payments" (provider, provider_ref);
CREATE INDEX IF NOT EXISTS "idx_payments_idempotency_key" ON "payments" (idempotency_key);
