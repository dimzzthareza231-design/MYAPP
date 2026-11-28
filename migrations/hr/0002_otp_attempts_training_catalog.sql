-- Wrong-OTP counter: a challenge is dead after 5 attempts.
ALTER TABLE auth_otp ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

-- Static training / SOP catalog (reference data, not personal data).
INSERT INTO sdm_training (id, code, type, title, unit, skp) VALUES
  ('trn-1', 'SOP-PPI-01',    'SOP Wajib',           'Kepatuhan Kebersihan Tangan 6 Langkah & 5 Momen WHO',            'Komite PPI',                2),
  ('trn-2', 'DIKLAT-BHD-26', 'Pelatihan Wajib',     'Bantuan Hidup Dasar (BHD) & Code Blue Response 2026',            'Instalasi Diklat',          4),
  ('trn-3', 'SEC-UUPDP-26',  'Pelatihan Kepatuhan', 'Pelindungan Data Pribadi Pasien (UU PDP & PMK 24/2022)',         'Hukum & SIMK/TI',           3),
  ('trn-4', 'SOP-SBAR-04',   'SOP Klinis',          'Komunikasi Efektif SBAR Saat Serah Terima Shift & Konsul DPJP', 'Komite Mutu & Keperawatan', 2);
