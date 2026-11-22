-- 1. telemed_jenis_konsul
CREATE TABLE telemed_jenis_konsul (
    id_jenis VARCHAR(50) PRIMARY KEY,
    nama_jenis VARCHAR(150) NOT NULL,
    durasi_menit INT NOT NULL,
    tarif DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. telemed_janji_temu
CREATE TABLE telemed_janji_temu (
    id_janji VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_dokter VARCHAR(50) NOT NULL,
    id_jenis VARCHAR(50) NOT NULL,
    tanggal_janji DATETIME NOT NULL,
    durasi_menit INT,
    status ENUM('Scheduled', 'In Progress', 'Completed', 'Cancelled', 'No-Show') DEFAULT 'Scheduled',
    catatan_pasien TEXT,
    link_video VARCHAR(255),
    room_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. telemed_session
CREATE TABLE telemed_session (
    id_session VARCHAR(50) PRIMARY KEY,
    id_janji VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_dokter VARCHAR(50) NOT NULL,
    tanggal_mulai DATETIME NOT NULL,
    tanggal_selesai DATETIME,
    durasi_aktual_menit INT,
    jenis_sesi ENUM('Video', 'Voice', 'Chat') DEFAULT 'Video',
    recording_url VARCHAR(255),
    chat_transcript JSON,
    status ENUM('Active', 'Ended', 'Failed') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. telemed_chat_message
CREATE TABLE telemed_chat_message (
    id_message VARCHAR(50) PRIMARY KEY,
    id_session VARCHAR(50) NOT NULL,
    sender_id VARCHAR(50) NOT NULL,
    sender_type ENUM('Patient', 'Doctor', 'System') NOT NULL,
    message_type ENUM('Text', 'Image', 'File', 'Sticker') DEFAULT 'Text',
    content TEXT NOT NULL,
    file_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. telemed_prescription
CREATE TABLE telemed_prescription (
    id_prescription VARCHAR(50) PRIMARY KEY,
    id_session VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_dokter VARCHAR(50) NOT NULL,
    tanggal_resep DATETIME NOT NULL,
    items JSON NOT NULL,
    diagnosis VARCHAR(255),
    kode_icd10 VARCHAR(20),
    catatan_tambahan TEXT,
    status ENUM('Draft', 'Signed', 'Dispensed', 'Cancelled') DEFAULT 'Draft',
    tanda_tangan_digital VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. telemed_remote_monitoring
CREATE TABLE telemed_remote_monitoring (
    id_monitoring VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    device_type ENUM('Blood Pressure', 'Glucose', 'Heart Rate', 'SpO2', 'Weight', 'Temperature', 'Wearable') NOT NULL,
    device_id VARCHAR(100),
    reading_value DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20),
    recorded_at DATETIME NOT NULL,
    notes TEXT,
    alert_triggered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. telemed_medical_record
CREATE TABLE telemed_medical_record (
    id_record VARCHAR(50) PRIMARY KEY,
    id_session VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_dokter VARCHAR(50) NOT NULL,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    diagnosis VARCHAR(255),
    kode_icd10 VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. telemed_payment
CREATE TABLE telemed_payment (
    id_payment VARCHAR(50) PRIMARY KEY,
    id_janji VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    jumlah DECIMAL(15,2) NOT NULL,
    metode_bayar ENUM('Transfer Bank', 'Kartu Kredit', 'E-Wallet', 'Virtual Account'),
    status ENUM('Pending', 'Paid', 'Refunded', 'Failed') DEFAULT 'Pending',
    transaction_id VARCHAR(100),
    paid_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. telemed_rating
CREATE TABLE telemed_rating (
    id_rating VARCHAR(50) PRIMARY KEY,
    id_session VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    id_dokter VARCHAR(50) NOT NULL,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    komentar TEXT,
    tanggal_rating DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
