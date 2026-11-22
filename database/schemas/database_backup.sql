-- 1. backup_schedule
CREATE TABLE backup_schedule (
    id_schedule VARCHAR(50) PRIMARY KEY,
    nama_schedule VARCHAR(255) NOT NULL,
    jenis ENUM('Full', 'Incremental', 'Differential', 'Transaction Log') NOT NULL,
    frekuensi ENUM('Hourly', 'Daily', 'Weekly', 'Monthly') NOT NULL,
    target_database VARCHAR(100) NOT NULL,
    target_tables JSON,
    retention_days INT DEFAULT 30,
    compression BOOLEAN DEFAULT TRUE,
    encryption BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. backup_job
CREATE TABLE backup_job (
    id_job VARCHAR(50) PRIMARY KEY,
    id_schedule VARCHAR(50),
    jenis_backup VARCHAR(50) NOT NULL,
    tanggal_mulai DATETIME NOT NULL,
    tanggal_selesai DATETIME,
    durasi_detik INT,
    ukuran_data_mb DECIMAL(10,2),
    ukuran_backup_mb DECIMAL(10,2),
    lokasi_storage VARCHAR(255),
    file_path VARCHAR(255),
    status ENUM('Running', 'Completed', 'Failed', 'Cancelled') DEFAULT 'Running',
    error_message TEXT,
    checksum VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. backup_storage
CREATE TABLE backup_storage (
    id_storage VARCHAR(50) PRIMARY KEY,
    nama_storage VARCHAR(100) NOT NULL,
    jenis ENUM('Local', 'NAS', 'Cloud-S3', 'Cloud-GCS', 'Cloud-Azure', 'Offsite') NOT NULL,
    path VARCHAR(255) NOT NULL,
    kapasitas_gb DECIMAL(10,2) NOT NULL,
    terpakai_gb DECIMAL(10,2) NOT NULL,
    status ENUM('Active', 'Full', 'Offline') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. dr_plan
CREATE TABLE dr_plan (
    id_plan VARCHAR(50) PRIMARY KEY,
    nama_plan VARCHAR(255) NOT NULL,
    skenario ENUM('Server Failure', 'Data Corruption', 'Natural Disaster', 'Cyber Attack', 'Power Outage') NOT NULL,
    rto_minutes INT NOT NULL,
    rpo_minutes INT NOT NULL,
    prosedur TEXT NOT NULL,
    pic VARCHAR(50) NOT NULL,
    kontak_darurat JSON,
    last_tested DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. dr_drill
CREATE TABLE dr_drill (
    id_drill VARCHAR(50) PRIMARY KEY,
    id_plan VARCHAR(50) NOT NULL,
    tanggal_drill DATETIME NOT NULL,
    skenario VARCHAR(255),
    durasi_aktual_menit INT,
    rto_aktual_menit INT,
    rpo_aktual_menit INT,
    hasil ENUM('Success', 'Partial', 'Failed') NOT NULL,
    temuan TEXT,
    rekomendasi TEXT,
    peserta JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. dr_incident
CREATE TABLE dr_incident (
    id_incident VARCHAR(50) PRIMARY KEY,
    tanggal_kejadian DATETIME NOT NULL,
    jenis_kejadian VARCHAR(255) NOT NULL,
    dampak TEXT NOT NULL,
    tindakan TEXT,
    durasi_downtime_menit INT,
    data_loss_minutes INT,
    status ENUM('Open', 'Investigating', 'Resolved', 'Closed') DEFAULT 'Open',
    pic VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
