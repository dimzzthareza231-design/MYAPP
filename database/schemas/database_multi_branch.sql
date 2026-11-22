-- 1. branch_facility
CREATE TABLE branch_facility (
    id_facility VARCHAR(50) PRIMARY KEY,
    kode_facility VARCHAR(20) UNIQUE NOT NULL,
    nama_facility VARCHAR(100) NOT NULL,
    alamat TEXT,
    kota VARCHAR(50),
    provinsi VARCHAR(50),
    telepon VARCHAR(20),
    email VARCHAR(100),
    kepala_cabang_id VARCHAR(50),
    tipe ENUM('Pusat', 'Cabang', 'Klinik', 'Puskesmas') NOT NULL,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. branch_config
CREATE TABLE branch_config (
    id_config VARCHAR(50) PRIMARY KEY,
    id_facility VARCHAR(50) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    config_type ENUM('String', 'Number', 'Boolean', 'JSON') NOT NULL,
    deskripsi TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (id_facility, config_key)
);

-- 3. branch_user_assignment
CREATE TABLE branch_user_assignment (
    id_assignment VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    id_facility VARCHAR(50) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. branch_patient_registry
CREATE TABLE branch_patient_registry (
    id_registry VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_facility VARCHAR(50) NOT NULL,
    no_rm_cabang VARCHAR(20) NOT NULL,
    tanggal_daftar DATE NOT NULL,
    status ENUM('Active', 'Transferred', 'Inactive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (id_pasien, id_facility),
    UNIQUE KEY (id_facility, no_rm_cabang)
);

-- 5. branch_transfer
CREATE TABLE branch_transfer (
    id_transfer VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    facility_asal VARCHAR(50) NOT NULL,
    facility_tujuan VARCHAR(50) NOT NULL,
    tanggal_transfer DATETIME NOT NULL,
    alasan TEXT,
    diagnosis VARCHAR(255),
    dokter_pengirim VARCHAR(50),
    dokter_penerima VARCHAR(50),
    status ENUM('Requested', 'Accepted', 'In Transit', 'Completed', 'Rejected') DEFAULT 'Requested',
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. branch_inventory
CREATE TABLE branch_inventory (
    id_inventory VARCHAR(50) PRIMARY KEY,
    id_facility VARCHAR(50) NOT NULL,
    id_item VARCHAR(50) NOT NULL,
    jumlah_stok INT DEFAULT 0,
    minimum_stock INT DEFAULT 0,
    maximum_stock INT DEFAULT 0,
    last_updated DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (id_facility, id_item)
);

-- 7. branch_consolidated_report
CREATE TABLE branch_consolidated_report (
    id_report VARCHAR(50) PRIMARY KEY,
    jenis_report ENUM('Kunjungan', 'Pendapatan', 'Stok', 'SDM', 'Quality') NOT NULL,
    periode VARCHAR(20) NOT NULL,
    facility_ids JSON,
    data JSON,
    generated_at DATETIME NOT NULL,
    generated_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
