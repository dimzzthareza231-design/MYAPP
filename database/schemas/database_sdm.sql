-- 1. sdm_departemen
CREATE TABLE sdm_departemen (
    id_departemen VARCHAR(50) PRIMARY KEY,
    kode_departemen VARCHAR(20) UNIQUE NOT NULL,
    nama_departemen VARCHAR(150) NOT NULL,
    kepala_departemen_id VARCHAR(50),
    parent_departemen_id VARCHAR(50),
    jenis ENUM('Medis', 'Keperawatan', 'Penunjang', 'Administratif', 'Manajemen'),
    lokasi VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. sdm_jabatan
CREATE TABLE sdm_jabatan (
    id_jabatan VARCHAR(50) PRIMARY KEY,
    kode_jabatan VARCHAR(20) UNIQUE NOT NULL,
    nama_jabatan VARCHAR(150) NOT NULL,
    level ENUM('Staff', 'Supervisor', 'Manager', 'Head', 'Director'),
    min_pendidikan VARCHAR(100),
    min_sertifikasi VARCHAR(255),
    deskripsi_tugas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. sdm_kredensial
CREATE TABLE sdm_kredensial (
    id_kredensial VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    jenis_kredensial ENUM('STR', 'SIP', 'Sertifikat Sp', 'Sertifikat Profesi', 'Surat Izin Praktik', 'ACLS', 'ATLS', 'PPGD', 'Lain-lain'),
    nomor_kredensial VARCHAR(100),
    tanggal_terbit DATE,
    tanggal_kadaluarsa DATE,
    file_url VARCHAR(255),
    status ENUM('Valid', 'Expired', 'In-Process', 'Revoked'),
    issued_by VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. sdm_jadwal_shift
CREATE TABLE sdm_jadwal_shift (
    id_shift VARCHAR(50) PRIMARY KEY,
    kode_shift VARCHAR(20) UNIQUE NOT NULL,
    nama_shift VARCHAR(50) NOT NULL,
    jam_mulai TIME,
    jam_selesai TIME,
    durasi_jam DECIMAL(5,2),
    jenis ENUM('Regular', 'On-Call', 'Lembur'),
    is_overnight BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. sdm_roster
CREATE TABLE sdm_roster (
    id_roster VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    id_shift VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    id_departemen VARCHAR(50),
    id_unit VARCHAR(50),
    status ENUM('Scheduled', 'Completed', 'Absent', 'Leave', 'Sick', 'On-Call'),
    catatan TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. sdm_kehadiran
CREATE TABLE sdm_kehadiran (
    id_kehadiran VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    jam_masuk TIME,
    jam_keluar TIME,
    metode_absen ENUM('Fingerprint', 'Facial Recognition', 'RFID', 'Manual', 'Mobile-GPS'),
    lokasi_absen VARCHAR(150),
    status ENUM('Hadir', 'Telat', 'Izin', 'Sakit', 'Cuti', 'Alpha'),
    jam_telat_menit INT DEFAULT 0,
    lembur_jam DECIMAL(5,2) DEFAULT 0,
    foto_selfie VARCHAR(255),
    gps_latitude DECIMAL(10,8),
    gps_longitude DECIMAL(11,8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. sdm_cuti
CREATE TABLE sdm_cuti (
    id_cuti VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    jenis_cuti ENUM('Tahunan', 'Sakit', 'Melahirkan', 'Besar', 'Khusus', 'Tanpa Bayaran'),
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE NOT NULL,
    jumlah_hari INT,
    alasan TEXT,
    file_pendukung VARCHAR(255),
    status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    approved_by VARCHAR(50),
    tanggal_approval DATETIME,
    catatan_approval TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. sdm_training
CREATE TABLE sdm_training (
    id_training VARCHAR(50) PRIMARY KEY,
    kode_training VARCHAR(20) UNIQUE NOT NULL,
    nama_training VARCHAR(200) NOT NULL,
    kategori ENUM('Clinical', 'Non-Clinical', 'Compliance', 'Safety', 'Leadership'),
    durasi_jam INT,
    wajib_diikuti BOOLEAN DEFAULT FALSE,
    skor_minimum_lulus INT,
    deskripsi TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. sdm_training_record
CREATE TABLE sdm_training_record (
    id_record VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    id_training VARCHAR(50) NOT NULL,
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    status ENUM('Scheduled', 'In-Progress', 'Completed', 'Failed'),
    skor INT,
    sertifikat_url VARCHAR(255),
    trainer VARCHAR(150),
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. sdm_performance_review
CREATE TABLE sdm_performance_review (
    id_review VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    periode VARCHAR(20),
    reviewer_id VARCHAR(50),
    tanggal_review DATE,
    kpi_score DECIMAL(5,2),
    competency_score DECIMAL(5,2),
    attendance_score DECIMAL(5,2),
    training_score DECIMAL(5,2),
    overall_score DECIMAL(5,2),
    strengths TEXT,
    areas_for_improvement TEXT,
    goals_next_period TEXT,
    status ENUM('Draft', 'Submitted', 'Acknowledged') DEFAULT 'Draft',
    tanda_tangan_user VARCHAR(255),
    tanda_tangan_reviewer VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. sdm_on_call
CREATE TABLE sdm_on_call (
    id_oncall VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    tanggal_mulai DATETIME NOT NULL,
    tanggal_selesai DATETIME NOT NULL,
    departemen VARCHAR(100),
    kontak_darurat VARCHAR(50),
    status ENUM('Scheduled', 'Active', 'Completed', 'Cancelled'),
    kompensasi DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. sdm_lembur
CREATE TABLE sdm_lembur (
    id_lembur VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    jam_mulai TIME,
    jam_selesai TIME,
    durasi_jam DECIMAL(5,2),
    alasan TEXT,
    status ENUM('Pending', 'Approved', 'Rejected', 'Completed') DEFAULT 'Pending',
    approved_by VARCHAR(50),
    kompensasi DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
