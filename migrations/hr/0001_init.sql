-- D1 database: myitaru-hr (employee portal / HR)

CREATE TABLE employee (
  id                TEXT PRIMARY KEY,                       -- 'emp-<division>' / 'emp-<ts>'
  nip               TEXT NOT NULL UNIQUE,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  division_id       TEXT NOT NULL,                          -- HOSPITAL_DIVISIONS id (catalog lives in code)
  role_title        TEXT NOT NULL,
  portal_role       TEXT NOT NULL CHECK (portal_role IN ('ADMIN_TI','PIMPINAN','KLINIS','KEPERAWATAN','PENUNJANG','STAF_UMUM')),
  is_clinical       INTEGER NOT NULL DEFAULT 0 CHECK (is_clinical IN (0,1)),
  is_admin_capable  INTEGER NOT NULL DEFAULT 0 CHECK (is_admin_capable IN (0,1)),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  str_number        TEXT,
  str_expiry        TEXT,
  sip_number        TEXT,
  sip_expiry        TEXT,
  unit_location     TEXT NOT NULL,
  shift_pattern     TEXT NOT NULL,
  last_hris_sync    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employee_division ON employee(division_id);

CREATE TABLE auth_otp (
  id           TEXT PRIMARY KEY,                            -- 'mfa-xxxxxxxx'
  employee_id  TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  otp_hash     TEXT NOT NULL,
  auth_type    TEXT NOT NULL CHECK (auth_type IN ('nip','google')),
  device_info  TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auth_session (
  session_token_hash  TEXT PRIMARY KEY,                     -- sha256 of 'emp_<hex>' bearer token
  employee_id         TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                        -- may differ from employee.name (Google SSO)
  email               TEXT NOT NULL,
  auth_type           TEXT NOT NULL CHECK (auth_type IN ('nip','google')),
  mfa_verified        INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified IN (0,1)),
  device_fingerprint  TEXT NOT NULL,
  abac                TEXT NOT NULL DEFAULT '{"onDuty":true,"unitMatch":true,"careRelationship":true,"breakGlassActive":false,"breakGlassReason":""}' CHECK (json_valid(abac)),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sdm_roster (
  id           TEXT PRIMARY KEY,                            -- 'sh-<n>'
  employee_id  TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  shift_type   TEXT NOT NULL CHECK (shift_type IN ('Pagi (07:00-14:00)','Siang (14:00-21:00)','Malam (21:00-07:00)','Reguler (08:00-16:00)','Libur')),
  hours        REAL NOT NULL,
  unit         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Terjadwal' CHECK (status IN ('Terjadwal','Sedang Bertugas','Selesai','Tukar Pending')),
  UNIQUE (employee_id, date)
);

CREATE TABLE sdm_shift_swap (
  id                       TEXT PRIMARY KEY,                -- 'swp-<ts>'
  requester_id             TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  division_id              TEXT NOT NULL,
  from_date                TEXT NOT NULL,
  from_shift               TEXT NOT NULL,
  target_colleague         TEXT NOT NULL,                   -- free-text name in code
  to_date                  TEXT NOT NULL,
  to_shift                 TEXT NOT NULL,
  reason                   TEXT NOT NULL,
  weekly_hours_after_swap  REAL NOT NULL,
  conflict_warning         TEXT,
  status                   TEXT NOT NULL DEFAULT 'Menunggu Atasan Unit' CHECK (status IN ('Menunggu Atasan Unit','Disetujui','Ditolak')),
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_shift_swap_division ON sdm_shift_swap(division_id);
CREATE INDEX idx_shift_swap_requester ON sdm_shift_swap(requester_id);

CREATE TABLE sdm_kehadiran (
  id                  TEXT PRIMARY KEY,                     -- 'att-<ts>-<n>' / 'att-off-<ts>-<n>'
  employee_id         TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  division_id         TEXT NOT NULL,
  recorded_at         TEXT NOT NULL DEFAULT (datetime('now')), -- offline sync uses device capturedAt
  type                TEXT NOT NULL CHECK (type IN ('MASUK','PULANG','LEMBUR','KOREKSI')),
  method              TEXT NOT NULL CHECK (method IN ('Geofencing + Biometrik','Offline Sync (Idempoten)','Koreksi Manual')),
  distance_meters     INTEGER NOT NULL,
  within_geofence     INTEGER NOT NULL CHECK (within_geofence IN (0,1)),
  biometric_verified  INTEGER NOT NULL CHECK (biometric_verified IN (0,1)),
  note                TEXT,
  idempotency_key     TEXT UNIQUE                           -- offline replay dedupe
);
CREATE INDEX idx_kehadiran_employee ON sdm_kehadiran(employee_id);
CREATE INDEX idx_kehadiran_division ON sdm_kehadiran(division_id);

CREATE TABLE sdm_cuti (
  id               TEXT PRIMARY KEY,                        -- 'lv-<ts>'
  employee_id      TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('Cuti Tahunan','Cuti Sakit','Izin Pelatihan / Seminar','Izin Khusus')),
  start_date       TEXT NOT NULL,
  end_date         TEXT NOT NULL,
  days             INTEGER NOT NULL CHECK (days > 0),
  substitute       TEXT NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Menunggu Atasan Unit' CHECK (status IN ('Menunggu Atasan Unit','Menunggu Verifikasi SDM','Disetujui Final','Ditolak')),
  unit_approved_by TEXT REFERENCES employee(id),
  sdm_approved_by  TEXT REFERENCES employee(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_date >= start_date)
);

CREATE TABLE sdm_reimbursement (
  id           TEXT PRIMARY KEY,                            -- 'rmb-<ts>'
  employee_id  TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('Diklat / SKP','Perjalanan Dinas','Kesehatan Pegawai','Operasional Unit')),
  amount       INTEGER NOT NULL CHECK (amount > 0),         -- IDR
  date         TEXT NOT NULL DEFAULT (date('now')),
  status       TEXT NOT NULL DEFAULT 'Diajukan' CHECK (status IN ('Diajukan','Diverifikasi Keuangan','Dibayarkan'))
);

CREATE TABLE sdm_training (
  id     TEXT PRIMARY KEY,                                  -- 'trn-<n>'
  code   TEXT NOT NULL UNIQUE,
  type   TEXT NOT NULL,
  title  TEXT NOT NULL,
  unit   TEXT NOT NULL,
  skp    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sdm_training_record (
  employee_id  TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  training_id  TEXT NOT NULL REFERENCES sdm_training(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (employee_id, training_id)
);

CREATE TABLE helpdesk_ticket (
  id                 TEXT PRIMARY KEY,                      -- 'tkt-<ts>'
  ticket_no          TEXT NOT NULL UNIQUE,
  requester_name     TEXT NOT NULL,
  requester_contact  TEXT NOT NULL,                         -- NIP or external contact (landing page)
  division_name      TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN ('TI / SIMK & MFA','HR & Absensi / Payroll','Instalasi Aplikasi Mobile','Sarana / Medis')),
  priority           TEXT NOT NULL CHECK (priority IN ('P1 - Kritis (15 Menit)','P2 - Tinggi (1 Jam)','P3 - Normal (4 Jam)')),
  subject            TEXT NOT NULL,
  description        TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('Portal Karyawan','Landing Page App')),
  status             TEXT NOT NULL DEFAULT 'Terbuka' CHECK (status IN ('Terbuka','Ditangani ITIL L1/L2','Selesai')),
  assigned_team      TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE division_task_status (
  division_id  TEXT NOT NULL,
  task_id      TEXT NOT NULL,                               -- '<division>-task-<n>'
  status       TEXT NOT NULL,
  PRIMARY KEY (division_id, task_id)
);
