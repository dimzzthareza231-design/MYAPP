-- 1. cp_pathway
CREATE TABLE cp_pathway (
    id_pathway VARCHAR(50) PRIMARY KEY,
    kode_pathway VARCHAR(20) UNIQUE NOT NULL,
    nama_pathway VARCHAR(150) NOT NULL,
    diagnosis_utama VARCHAR(150),
    kode_icd10 VARCHAR(20),
    kategori ENUM('Medis', 'Bedah', 'Obstetri', 'Pediatri', 'Lain-lain'),
    expected_los_days INT,
    versi VARCHAR(10),
    status ENUM('Draft', 'Active', 'Archived') DEFAULT 'Draft',
    dibuat_oleh VARCHAR(50),
    tanggal_efektif DATE,
    tanggal_review DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. cp_pathway_day
CREATE TABLE cp_pathway_day (
    id_day VARCHAR(50) PRIMARY KEY,
    id_pathway VARCHAR(50) NOT NULL,
    hari_ke INT NOT NULL,
    kategori ENUM('Assessment', 'Diagnostic', 'Therapeutic', 'Medication', 'Nutrition', 'Activity', 'Education', 'Discharge Planning'),
    aktivitas TEXT,
    pic ENUM('Dokter', 'Perawat', 'Gizi', 'Farmasi', 'Lab', 'Radiologi', 'Rehab', 'Lain-lain'),
    expected_output TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. cp_patient_pathway
CREATE TABLE cp_patient_pathway (
    id_patient_pathway VARCHAR(50) PRIMARY KEY,
    id_pathway VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50) NOT NULL,
    tanggal_masuk DATE NOT NULL,
    tanggal_target_keluar DATE NOT NULL,
    tanggal_keluar_aktual DATE,
    hari_ke_saat_ini INT DEFAULT 1,
    status ENUM('On-Track', 'Variance', 'Completed', 'Discontinued') DEFAULT 'On-Track',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. cp_variance
CREATE TABLE cp_variance (
    id_variance VARCHAR(50) PRIMARY KEY,
    id_patient_pathway VARCHAR(50) NOT NULL,
    hari_ke INT NOT NULL,
    tanggal DATE NOT NULL,
    kategori_variance ENUM('Patient', 'Staff', 'System'),
    jenis_variance ENUM('Delay', 'Complication', 'Non-Compliance', 'System Issue', 'Lain-lain'),
    deskripsi TEXT,
    dampak TEXT,
    tindakan_koreksi TEXT,
    reported_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. cp_outcome
CREATE TABLE cp_outcome (
    id_outcome VARCHAR(50) PRIMARY KEY,
    id_patient_pathway VARCHAR(50) NOT NULL,
    los_aktual INT,
    los_target INT,
    complication BOOLEAN DEFAULT FALSE,
    readmission_30hari BOOLEAN DEFAULT FALSE,
    mortality BOOLEAN DEFAULT FALSE,
    patient_satisfaction INT,
    biaya_aktual DECIMAL(15,2),
    biaya_target DECIMAL(15,2),
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. cp_audit
CREATE TABLE cp_audit (
    id_audit VARCHAR(50) PRIMARY KEY,
    id_pathway VARCHAR(50) NOT NULL,
    periode VARCHAR(20),
    total_pasien INT,
    on_track_count INT,
    variance_count INT,
    average_los DECIMAL(5,2),
    compliance_rate DECIMAL(5,2),
    auditor_id VARCHAR(50),
    tanggal_audit DATE,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
