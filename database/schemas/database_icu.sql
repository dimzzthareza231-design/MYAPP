-- 1. icu_ruangan
CREATE TABLE icu_ruangan (
    id_ruangan VARCHAR(50) PRIMARY KEY,
    kode_ruangan VARCHAR(20) UNIQUE NOT NULL,
    nama_ruangan VARCHAR(100) NOT NULL,
    jenis ENUM('ICU', 'HCU', 'NICU', 'PICU', 'CCU', 'NICHE'),
    kapasitas_bed INT,
    fasilitas JSON,
    status ENUM('Aktif', 'Nonaktif') DEFAULT 'Aktif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. icu_bed
CREATE TABLE icu_bed (
    id_bed VARCHAR(50) PRIMARY KEY,
    id_ruangan VARCHAR(50) NOT NULL,
    nomor_bed VARCHAR(20),
    status_bed ENUM('Available', 'Occupied', 'Maintenance', 'Cleaning') DEFAULT 'Available',
    id_pasien VARCHAR(50),
    id_kunjungan VARCHAR(50),
    tanggal_masuk DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. icu_admission
CREATE TABLE icu_admission (
    id_admission VARCHAR(50) PRIMARY KEY,
    id_bed VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50) NOT NULL,
    tanggal_masuk DATETIME NOT NULL,
    tanggal_keluar DATETIME,
    diagnosis_masuk VARCHAR(255),
    kode_icd10 VARCHAR(20),
    alasan_rawat_icu TEXT,
    dokter_penanggung_jawab VARCHAR(50),
    status ENUM('Admitted', 'Discharged', 'Transferred', 'Died') DEFAULT 'Admitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. icu_vital_signs_hourly
CREATE TABLE icu_vital_signs_hourly (
    id_vital VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    waktu_catat DATETIME NOT NULL,
    td_sistolik INT,
    td_diastolik INT,
    map DECIMAL(5,2) GENERATED ALWAYS AS ((td_sistolik + 2 * td_diastolik) / 3) STORED,
    nadi INT,
    respirasi INT,
    suhu DECIMAL(4,1),
    spo2 INT,
    cvp DECIMAL(5,2),
    pap DECIMAL(5,2),
    co DECIMAL(5,2),
    gcs_eye INT,
    gcs_verbal INT,
    gcs_motor INT,
    gcs_total INT GENERATED ALWAYS AS (gcs_eye + gcs_verbal + gcs_motor) STORED,
    pupil_kiri VARCHAR(20),
    pupil_kanan VARCHAR(20),
    output_urine_ml INT,
    input_cairan_ml INT,
    catatan TEXT,
    dicatat_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. icu_scoring
CREATE TABLE icu_scoring (
    id_scoring VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    jenis_score ENUM('APACHE-II', 'SOFA', 'SIRS', 'qSOFA', 'GCS', 'RASS', 'CAM-ICU', 'Braden', 'Waterlow'),
    tanggal_score DATETIME NOT NULL,
    nilai_total DECIMAL(5,2),
    breakdown JSON,
    interpretasi TEXT,
    risiko VARCHAR(100),
    dicatat_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. icu_ventilator
CREATE TABLE icu_ventilator (
    id_ventilator VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    tanggal_mulai DATETIME NOT NULL,
    tanggal_berhenti DATETIME,
    mode_ventilasi ENUM('CMV', 'SIMV', 'PSV', 'CPAP', 'BiPAP', 'High-Flow', 'Spontaneous'),
    fiO2 DECIMAL(5,2),
    peep DECIMAL(5,2),
    tidal_volume INT,
    respiratory_rate INT,
    pressure_support DECIMAL(5,2),
    patient_trigger BOOLEAN,
    hasil_agd JSON,
    komplikasi TEXT,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. icu_fluid_balance
CREATE TABLE icu_fluid_balance (
    id_balance VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    input_oral_ml INT DEFAULT 0,
    input_iv_ml INT DEFAULT 0,
    input_darah_ml INT DEFAULT 0,
    total_input_ml INT GENERATED ALWAYS AS (input_oral_ml + input_iv_ml + input_darah_ml) STORED,
    output_urine_ml INT DEFAULT 0,
    output_drain_ml INT DEFAULT 0,
    output_muntah_ml INT DEFAULT 0,
    output_diare_ml INT DEFAULT 0,
    total_output_ml INT GENERATED ALWAYS AS (output_urine_ml + output_drain_ml + output_muntah_ml + output_diare_ml) STORED,
    balance_ml INT GENERATED ALWAYS AS (total_input_ml - total_output_ml) STORED,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. icu_nursing_care_plan
CREATE TABLE icu_nursing_care_plan (
    id_care_plan VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    diagnosis_keperawatan VARCHAR(255) NOT NULL,
    tujuan TEXT,
    intervensi TEXT,
    implementasi TEXT,
    evaluasi TEXT,
    tanggal_mulai DATETIME NOT NULL,
    tanggal_selesai DATETIME,
    status ENUM('Active', 'Resolved') DEFAULT 'Active',
    perawat_penanggung_jawab VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. icu_medication_continuous
CREATE TABLE icu_medication_continuous (
    id_med VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    nama_obat VARCHAR(150) NOT NULL,
    dosis VARCHAR(50),
    konsentrasi VARCHAR(50),
    rate_ml_per_jam DECIMAL(6,2),
    tanggal_mulai DATETIME NOT NULL,
    tanggal_berhenti DATETIME,
    sisa_volume_ml DECIMAL(8,2),
    status ENUM('Running', 'Stopped', 'Completed') DEFAULT 'Running',
    diberikan_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. icu_family_update
CREATE TABLE icu_family_update (
    id_update VARCHAR(50) PRIMARY KEY,
    id_admission VARCHAR(50) NOT NULL,
    tanggal_update DATETIME NOT NULL,
    kondisi_pasien TEXT,
    rencana_terapi TEXT,
    prognosis TEXT,
    nama_keluarga VARCHAR(100),
    hubungan VARCHAR(50),
    disampaikan_oleh VARCHAR(50),
    persetujuan_didapat BOOLEAN DEFAULT FALSE,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
