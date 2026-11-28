-- SBAR shift handover from the employee portal (/api/gateway/sbar).
-- Holds patient data, so it lives in core, not in myitaru-hr.
-- created_by / karu_verified_by are hr.employee ids (other database, so no FK).
-- The patient is free text inside data.patientLabel (the portal does not link pasien yet).
CREATE TABLE sbar_handover (
  id                TEXT PRIMARY KEY,                       -- 'sbar-<uuid>'
  division_id       TEXT NOT NULL,                          -- HOSPITAL_DIVISIONS id of the sender
  created_by        TEXT NOT NULL,
  karu_verified     INTEGER NOT NULL DEFAULT 0 CHECK (karu_verified IN (0,1)),
  karu_verified_by  TEXT,
  data              TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)), -- unit, sessionType, fromShift, toShift, senderName, receiverName, patientLabel, situation, background, assessment, recommendation, karuName
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sbar_handover_created ON sbar_handover(created_at);
