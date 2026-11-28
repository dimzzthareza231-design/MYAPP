-- myitaru-core: core schema (Cloudflare D1)

-- Staff accounts (local auth). role_id = ids in src/data/roles.ts.
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nama                 TEXT NOT NULL,
  role_id              TEXT NOT NULL CHECK (role_id IN (
                         'viewer','super_admin','admin','direksi','dokter','perawat','bidan',
                         'apoteker','kasir','pendaftaran','rekam_medis','laboran','radiografer',
                         'manajemen_mutu','rehab_medik','gizi','it_support')),
  aktif                INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0,1)),
  password_hash        TEXT,             -- NULL for SSO-only accounts
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  mfa_secret_enc       TEXT,             -- TOTP secret, app-encrypted (must be recoverable, so not hashed)
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Login sessions and pending MFA challenges (mfa_verified = 0).
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified IN (0,1)),
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Patients (Firestore pasien + /api/v1/patients).
CREATE TABLE pasien (
  id         TEXT PRIMARY KEY,
  no_rm      TEXT NOT NULL UNIQUE,
  nik        TEXT NOT NULL DEFAULT '',
  nama       TEXT NOT NULL,
  penjamin   TEXT,
  status     TEXT,
  data       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_pasien_nik ON pasien(nik) WHERE nik <> '';
CREATE INDEX idx_pasien_nama ON pasien(nama COLLATE NOCASE);

CREATE TABLE dokter (
  id         TEXT PRIMARY KEY,
  nama       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE perawat (
  id         TEXT PRIMARY KEY,
  nama       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Visits / queue (Firestore kunjungan + /api/v1/appointments).
CREATE TABLE kunjungan (
  id            TEXT PRIMARY KEY,
  pasien_id     TEXT NOT NULL REFERENCES pasien(id),
  dokter_id     TEXT REFERENCES dokter(id),
  tanggal       TEXT NOT NULL,           -- YYYY-MM-DD
  status        TEXT NOT NULL DEFAULT 'Menunggu',
  nomor_antrian TEXT,
  data          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kunjungan_pasien ON kunjungan(pasien_id, tanggal);
CREATE INDEX idx_kunjungan_tanggal ON kunjungan(tanggal, status);

-- Module datasets + hospital settings (key 'hospital_settings').
-- Compare-and-swap: UPDATE ... SET value=?, version=version+1 WHERE key=? AND version=?; 0 rows = 412.
CREATE TABLE system_data (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  version    INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE beds (
  id     TEXT PRIMARY KEY,
  kelas  TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Tersedia' CHECK (status IN ('Tersedia','Terisi','Dibersihkan','Perbaikan')),
  no_rm  TEXT REFERENCES pasien(no_rm),
  data   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_beds_no_rm ON beds(no_rm);

CREATE TABLE inventory (
  id           TEXT PRIMARY KEY,
  kode         TEXT NOT NULL UNIQUE,
  nama         TEXT NOT NULL,
  kategori     TEXT NOT NULL,
  stok         INTEGER NOT NULL DEFAULT 0 CHECK (stok >= 0),
  stok_minimum INTEGER NOT NULL DEFAULT 0,
  data         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Patient push tokens. uid = patient sign-in uid (not a staff user).
-- token is plain: it must be sent to FCM to deliver.
CREATE TABLE fcm_tokens (
  id           TEXT PRIMARY KEY,
  uid          TEXT NOT NULL,
  no_rm        TEXT NOT NULL REFERENCES pasien(no_rm) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  queue_alerts INTEGER NOT NULL DEFAULT 1 CHECK (queue_alerts IN (0,1)),
  lab_alerts   INTEGER NOT NULL DEFAULT 1 CHECK (lab_alerts IN (0,1)),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  data         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (uid, no_rm)
);
CREATE INDEX idx_fcm_no_rm ON fcm_tokens(no_rm) WHERE active = 1;

CREATE TABLE patient_notifications (
  id            TEXT PRIMARY KEY,
  recipient_uid TEXT NOT NULL,
  no_rm         TEXT NOT NULL REFERENCES pasien(no_rm) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('queue_call','lab_ready','system')),
  read          INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0,1)),
  data          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notif_recipient ON patient_notifications(recipient_uid, created_at);

-- Append-only audit trail (client activity_logs + /api/v1/audit). No FK: rows outlive users.
CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id    TEXT,
  actor      TEXT NOT NULL,
  role       TEXT,
  category   TEXT CHECK (category IN ('auth','database','security','ai')),
  action     TEXT NOT NULL,
  module     TEXT,
  status     TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILED','DENIED','WARNING')),
  data       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_module ON audit_log(module, created_at);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
