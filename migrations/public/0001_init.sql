-- D1 database: myitaru-public

-- Patient portal sessions (patientSessions). Raw 'pat_<40 hex>' token goes to the client only; DB keeps SHA-256 hex.
CREATE TABLE portal_session (
    token_hash  TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
    no_rm       TEXT NOT NULL,
    auth_method TEXT NOT NULL CHECK (auth_method IN ('rm_dob', 'google')),
    email       TEXT,
    verified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Google account -> No. RM link (googlePatientLinks). Email stored lower-cased.
CREATE TABLE portal_google_link (
    email      TEXT PRIMARY KEY CHECK (email = lower(email)),
    no_rm      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Device push registrations (fcmTokensByRm). Token kept in plaintext: it is a delivery
-- address the server must send to FCM, not a login credential.
CREATE TABLE portal_fcm_token (
    token                TEXT PRIMARY KEY CHECK (length(token) <= 512),
    no_rm                TEXT NOT NULL,
    mode                 TEXT NOT NULL DEFAULT 'realtime_sse_fallback'
                         CHECK (mode IN ('fcm_web_push', 'realtime_sse_fallback')),
    platform             TEXT NOT NULL DEFAULT 'web'
                         CHECK (platform IN ('web', 'pwa', 'android', 'ios')),
    queue_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (queue_alerts_enabled IN (0, 1)),
    lab_alerts_enabled   INTEGER NOT NULL DEFAULT 1 CHECK (lab_alerts_enabled IN (0, 1)),
    active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_portal_fcm_token_rm ON portal_fcm_token (no_rm);

-- Patient notification inbox (notificationsByRm). id format 'notif_<ms>_<6 hex>'.
CREATE TABLE portal_notification (
    id            TEXT PRIMARY KEY,
    no_rm         TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('queue_call', 'lab_ready', 'system')),
    title         TEXT NOT NULL CHECK (length(title) <= 160),
    body          TEXT NOT NULL CHECK (length(body) <= 500),
    poli          TEXT,
    nomor_antrian TEXT,
    lab_order_id  TEXT,
    channel       TEXT NOT NULL
                  CHECK (channel IN ('fcm_push', 'fcm_foreground', 'sse_realtime', 'firestore_realtime')),
    is_read       INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_portal_notification_rm_created ON portal_notification (no_rm, created_at DESC);

-- Online bookings per doctor, added to the public quota display (doctorServedBoost).
CREATE TABLE portal_doctor_booking_count (
    dokter_id TEXT PRIMARY KEY,
    booked    INTEGER NOT NULL DEFAULT 0 CHECK (booked >= 0)
);
