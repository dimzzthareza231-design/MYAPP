-- MFA TOTP untuk autentikasi staf lokal dan penguncian percobaan login.
-- local_auth_mfa: satu baris per pengguna (id = id pengguna lokal). Payload berisi rahasia TOTP
--   terenkripsi AES-256-GCM (kunci HKDF dari SESSION_SECRET), langkah TOTP terakhir yang dipakai
--   (proteksi replay), dan hash HMAC kode pemulihan sekali pakai. Tidak ada rahasia dalam bentuk mentah.
-- local_auth_attempts: penghitung kegagalan kata sandi/MFA per akun+IP dan per akun
--   (id = HMAC kunci penghitung, bukan alamat IP mentah).
-- Format dokumen sama dengan 0001_init.sql agar cocok dengan D1Adapter/MySQLAdapter.
CREATE TABLE IF NOT EXISTS "local_auth_mfa" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_local_auth_mfa_updated_at" ON "local_auth_mfa" (updated_at);

CREATE TABLE IF NOT EXISTS "local_auth_attempts" (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_local_auth_attempts_updated_at" ON "local_auth_attempts" (updated_at);
