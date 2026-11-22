-- 1. portal_user_account
CREATE TABLE portal_user_account (
    id_account VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    profile_photo_url VARCHAR(255),
    preferred_language ENUM('ID', 'EN') DEFAULT 'ID',
    last_login DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. portal_appointment_booking
CREATE TABLE portal_appointment_booking (
    id_booking VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_poli VARCHAR(50) NOT NULL,
    id_dokter VARCHAR(50),
    tanggal_booking DATETIME NOT NULL,
    jam_pilihan TIME NOT NULL,
    keluhan TEXT,
    jenis_penjamin VARCHAR(100),
    status ENUM('Pending', 'Confirmed', 'Completed', 'Cancelled') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. portal_document_access
CREATE TABLE portal_document_access (
    id_access VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    jenis_dokumen ENUM('Rekam Medis', 'Hasil Lab', 'Hasil Radiologi', 'Resep', 'Surat Keterangan', 'Invoice') NOT NULL,
    id_referensi BIGINT,
    tanggal_akses DATETIME NOT NULL,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. portal_payment
CREATE TABLE portal_payment (
    id_payment VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    nomor_tagihan VARCHAR(100) NOT NULL,
    jumlah DECIMAL(15,2) NOT NULL,
    metode ENUM('VA', 'E-Wallet', 'Kartu Kredit', 'QRIS'),
    status ENUM('Pending', 'Paid', 'Expired', 'Failed') DEFAULT 'Pending',
    transaction_id VARCHAR(100),
    paid_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. portal_health_journal
CREATE TABLE portal_health_journal (
    id_journal VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    gejala TEXT,
    tanda_vital JSON,
    obat_diminum JSON,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. portal_education
CREATE TABLE portal_education (
    id_education VARCHAR(50) PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    konten TEXT NOT NULL,
    foto_url VARCHAR(255),
    video_url VARCHAR(255),
    view_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. portal_chat
CREATE TABLE portal_chat (
    id_chat VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    subjek VARCHAR(255) NOT NULL,
    status ENUM('Open', 'In Progress', 'Resolved', 'Closed') DEFAULT 'Open',
    assigned_to VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. portal_chat_message
CREATE TABLE portal_chat_message (
    id_message VARCHAR(50) PRIMARY KEY,
    id_chat VARCHAR(50) NOT NULL,
    sender_type ENUM('Patient', 'Staff') NOT NULL,
    message TEXT NOT NULL,
    attachment_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
