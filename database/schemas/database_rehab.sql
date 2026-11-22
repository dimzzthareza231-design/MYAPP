-- 1. rehab_jenis_terapi
CREATE TABLE rehab_jenis_terapi (
    id_jenis VARCHAR(50) PRIMARY KEY,
    kode_jenis VARCHAR(20) UNIQUE NOT NULL,
    nama_jenis VARCHAR(150) NOT NULL,
    kategori ENUM('Fisioterapi', 'Okupasi Terapi', 'Terapi Wicara', 'Akupunktur', 'Rehabilitasi Jantung', 'Rehabilitasi Neurologi'),
    tarif_dasar DECIMAL(15,2),
    durasi_menit INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. rehab_assessment
CREATE TABLE rehab_assessment (
    id_assessment VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50) NOT NULL,
    tanggal_assessment DATETIME NOT NULL,
    jenis_terapi VARCHAR(50),
    keluhan_utama TEXT,
    riwayat_sakit TEXT,
    pemeriksaan_fisik TEXT,
    pengukuran JSON,
    diagnosis_fungsi VARCHAR(255),
    goal_terapi TEXT,
    rencana_terapi TEXT,
    therapist VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. rehab_care_plan
CREATE TABLE rehab_care_plan (
    id_care_plan VARCHAR(50) PRIMARY KEY,
    id_assessment VARCHAR(50) NOT NULL,
    goal_jangka_pendek TEXT,
    goal_jangka_panjang TEXT,
    intervensi JSON,
    jumlah_sesi_rencana INT,
    tanggal_mulai DATE,
    tanggal_target_selesai DATE,
    status ENUM('Active', 'Completed', 'On-Hold') DEFAULT 'Active',
    therapist VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. rehab_session
CREATE TABLE rehab_session (
    id_session VARCHAR(50) PRIMARY KEY,
    id_care_plan VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    tanggal_session DATETIME NOT NULL,
    sesi_ke INT,
    durasi_menit INT,
    modalitas JSON,
    exercise JSON,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    tanda_vital_pre JSON,
    tanda_vital_post JSON,
    nyeri_pre INT,
    nyeri_post INT,
    therapist VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. rehab_outcome_measurement
CREATE TABLE rehab_outcome_measurement (
    id_outcome VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    tanggal_ukur DATE NOT NULL,
    instrumen ENUM('Barthel Index', 'FIM', '6MWT', 'TUG', 'Berg Balance', 'VAS', 'ROM', 'Manual Muscle Test'),
    skor DECIMAL(10,2),
    interpretasi TEXT,
    perubahan_dari_sebelum DECIMAL(10,2),
    diukur_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. rehab_alat
CREATE TABLE rehab_alat (
    id_alat VARCHAR(50) PRIMARY KEY,
    kode_alat VARCHAR(20) UNIQUE NOT NULL,
    nama_alat VARCHAR(150) NOT NULL,
    kategori ENUM('Electrotherapy', 'Ultrasound', 'Exercise Equipment', 'Assistive Device', 'Lain-lain'),
    kondisi ENUM('Baik', 'Rusak', 'Maintenance') DEFAULT 'Baik',
    lokasi VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. rehab_home_program
CREATE TABLE rehab_home_program (
    id_program VARCHAR(50) PRIMARY KEY,
    id_care_plan VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    tanggal_diberikan DATE NOT NULL,
    exercise_list JSON,
    durasi_program_minggu INT,
    instruksi_khusus TEXT,
    follow_up_date DATE,
    diberikan_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. rehab_progress_note
CREATE TABLE rehab_progress_note (
    id_note VARCHAR(50) PRIMARY KEY,
    id_care_plan VARCHAR(50) NOT NULL,
    tanggal DATETIME NOT NULL,
    subjectif TEXT,
    objektif TEXT,
    assessment TEXT,
    plan TEXT,
    therapist VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
