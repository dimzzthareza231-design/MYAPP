-- RME dossier documents (/api/v1/dossier/documents). Form content lives in data.
CREATE TABLE dossier_documents (
  id         TEXT PRIMARY KEY,
  no_rm      TEXT NOT NULL REFERENCES pasien(no_rm),
  doc_type   TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Lengkap','Draft','Menunggu TTD','Terverifikasi')),
  created_by TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_dossier_no_rm ON dossier_documents(no_rm, created_at);
