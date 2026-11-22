-- 1. crm_patient_segment
CREATE TABLE crm_patient_segment (
    id_segment VARCHAR(50) PRIMARY KEY,
    nama_segment VARCHAR(100) NOT NULL,
    kriteria JSON,
    warna VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. crm_campaign
CREATE TABLE crm_campaign (
    id_campaign VARCHAR(50) PRIMARY KEY,
    nama_campaign VARCHAR(150) NOT NULL,
    jenis ENUM('Follow-Up', 'Reminder', 'Promo', 'Edukasi', 'Survey', 'Greeting'),
    target_segment JSON,
    channel ENUM('WhatsApp', 'SMS', 'Email', 'Phone', 'Letter'),
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    konten_pesan TEXT,
    status ENUM('Draft', 'Active', 'Completed') DEFAULT 'Draft',
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. crm_message_log
CREATE TABLE crm_message_log (
    id_log VARCHAR(50) PRIMARY KEY,
    id_campaign VARCHAR(50),
    id_pasien VARCHAR(50) NOT NULL,
    channel VARCHAR(20),
    nomor_tujuan VARCHAR(50),
    pesan TEXT,
    status ENUM('Sent', 'Delivered', 'Read', 'Failed', 'Bounced') DEFAULT 'Sent',
    tanggal_kirim DATETIME NOT NULL,
    tanggal_baca DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. crm_appointment_reminder
CREATE TABLE crm_appointment_reminder (
    id_reminder VARCHAR(50) PRIMARY KEY,
    id_kunjungan VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    tanggal_janji DATETIME NOT NULL,
    reminder_1_sent BOOLEAN DEFAULT FALSE,
    reminder_1_time DATETIME,
    reminder_2_sent BOOLEAN DEFAULT FALSE,
    reminder_2_time DATETIME,
    konfirmasi ENUM('Pending', 'Confirmed', 'Cancelled', 'Rescheduled', 'No-Response') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. crm_follow_up
CREATE TABLE crm_follow_up (
    id_followup VARCHAR(50) PRIMARY KEY,
    id_kunjungan VARCHAR(50) NOT NULL,
    id_pasien VARCHAR(50) NOT NULL,
    jenis_followup ENUM('Post-Op', 'Post-Discharge', 'Chronic Care', 'Medication Adherence'),
    tanggal_rencana DATE NOT NULL,
    tanggal_aktual DATETIME,
    hasil TEXT,
    status ENUM('Planned', 'Completed', 'Cancelled') DEFAULT 'Planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. crm_satisfaction_survey
CREATE TABLE crm_satisfaction_survey (
    id_survey VARCHAR(50) PRIMARY KEY,
    id_kunjungan VARCHAR(50),
    id_pasien VARCHAR(50) NOT NULL,
    jenis_survey ENUM('Post-Visit', 'Inpatient', 'Emergency', 'Overall'),
    tanggal_survey DATETIME NOT NULL,
    rating_overall INT CHECK (rating_overall BETWEEN 1 AND 5),
    rating_dokter INT,
    rating_perawat INT,
    rating_fasilitas INT,
    rating_pelayanan INT,
    komentar TEXT,
    status ENUM('Pending', 'Completed') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. crm_complaint
CREATE TABLE crm_complaint (
    id_complaint VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50),
    id_kunjungan VARCHAR(50),
    tanggal_keluhan DATETIME NOT NULL,
    kategori ENUM('Pelayanan Medis', 'Administrasi', 'Fasilitas', 'Komunikasi', 'Waktu Tunggu', 'Lain-lain'),
    channel_masuk ENUM('Langsung', 'Telepon', 'Email', 'WhatsApp', 'Media Sosial', 'Kotak Saran'),
    deskripsi TEXT NOT NULL,
    prioritas ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Low',
    status ENUM('Received', 'In Progress', 'Resolved', 'Closed') DEFAULT 'Received',
    assigned_to VARCHAR(50),
    tanggal_resolved DATETIME,
    resolusi TEXT,
    kepuasan_pasien INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. crm_loyalty_program
CREATE TABLE crm_loyalty_program (
    id_loyalty VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL UNIQUE,
    total_poin INT DEFAULT 0,
    tier ENUM('Silver', 'Gold', 'Platinum', 'Diamond') DEFAULT 'Silver',
    tanggal_join DATE NOT NULL,
    tanggal_upgrade DATE,
    benefits JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. crm_loyalty_transaction
CREATE TABLE crm_loyalty_transaction (
    id_transaction VARCHAR(50) PRIMARY KEY,
    id_loyalty VARCHAR(50) NOT NULL,
    jenis ENUM('Earn', 'Redeem', 'Expire'),
    poin INT NOT NULL,
    keterangan TEXT,
    tanggal DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. crm_greeting
CREATE TABLE crm_greeting (
    id_greeting VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    jenis ENUM('Birthday', 'Anniversary', 'Holiday', 'Get Well'),
    tanggal_kirim DATE NOT NULL,
    pesan TEXT,
    status ENUM('Scheduled', 'Sent', 'Failed') DEFAULT 'Scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
