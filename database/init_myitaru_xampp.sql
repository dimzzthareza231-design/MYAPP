-- MYITARU unified XAMPP schema. Schema-only import; demo INSERT data is intentionally excluded.

CREATE DATABASE IF NOT EXISTS db_myitaru CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE db_myitaru;

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;


-- Source schema: database_auth.sql

CREATE TABLE auth_user (
    id_user VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    id_pegawai VARCHAR(50),
    id_pasien VARCHAR(50),
    role ENUM('Super Admin', 'Admin', 'Dokter', 'Perawat', 'Staf Registrasi', 'Kasir', 'Farmasi', 'Lab', 'Radiologi', 'Manager', 'Auditor', 'Patient') NOT NULL,
    departemen VARCHAR(100),
    status ENUM('Active', 'Inactive', 'Suspended', 'Locked') DEFAULT 'Active',
    email_verified_at DATETIME,
    phone_verified_at DATETIME,
    last_login_at DATETIME,
    last_login_ip VARCHAR(50),
    failed_login_attempts INT DEFAULT 0,
    locked_until DATETIME,
    must_change_password BOOLEAN DEFAULT FALSE,
    password_changed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_role (
    id_role VARCHAR(50) PRIMARY KEY,
    kode_role VARCHAR(50) UNIQUE NOT NULL,
    nama_role VARCHAR(100) NOT NULL,
    deskripsi TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_permission (
    id_permission VARCHAR(50) PRIMARY KEY,
    kode_permission VARCHAR(100) UNIQUE NOT NULL,
    nama_permission VARCHAR(150) NOT NULL,
    modul VARCHAR(50) NOT NULL,
    aksi ENUM('Create', 'Read', 'Update', 'Delete', 'Export', 'Import', 'Approve', 'Reject') NOT NULL,
    deskripsi TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_role_permission (
    id_mapping VARCHAR(50) PRIMARY KEY,
    id_role VARCHAR(50) NOT NULL,
    id_permission VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_role_permission (id_role, id_permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_user_role (
    id_assignment VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    id_role VARCHAR(50) NOT NULL,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    assigned_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_session (
    id_session VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSON,
    ip_address VARCHAR(50),
    location VARCHAR(150),
    started_at DATETIME NOT NULL,
    last_activity_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    is_current BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_2fa (
    id_2fa VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    method ENUM('SMS', 'Email', 'Authenticator App', 'Backup Code') NOT NULL,
    secret_key VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    verified_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_otp (
    id_otp VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose ENUM('Login', 'Reset Password', 'Verify Email', 'Verify Phone', '2FA') NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_password_history (
    id_history VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_login_log (
    id_log VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50),
    username_attempted VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    user_agent VARCHAR(255),
    location VARCHAR(150),
    status ENUM('Success', 'Failed-Wrong Password', 'Failed-User Not Found', 'Failed-Account Locked', 'Failed-2FA Failed', 'Logout') NOT NULL,
    failure_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Source schema: database_rme.sql

CREATE TABLE rme_problem_list (
    id_problem VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    kode_snomed VARCHAR(50),
    kode_icd10 VARCHAR(20),
    nama_problem VARCHAR(255) NOT NULL,
    kategori ENUM('Diagnosis', 'Symptom', 'Finding', 'Complaint', 'Functional Limitation'),
    status ENUM('Active', 'Inactive', 'Resolved', 'Controlled'),
    tanggal_onset DATE,
    tanggal_resolved DATE,
    severity ENUM('Mild', 'Moderate', 'Severe'),
    catatan TEXT,
    confirmed_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_allergy_list (
    id_allergy VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    jenis_allergen ENUM('Drug', 'Food', 'Environment', 'Other'),
    nama_allergen VARCHAR(255) NOT NULL,
    kode_allergen VARCHAR(50),
    reaksi JSON,
    tanggal_diketahui DATE,
    catatan TEXT,
    status ENUM('Active', 'Resolved'),
    verified_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_medication_history (
    id_medication VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    kode_obat VARCHAR(50),
    nama_obat VARCHAR(255) NOT NULL,
    dosis VARCHAR(100),
    frekuensi VARCHAR(100),
    rute ENUM('Oral', 'IV', 'IM', 'SC', 'Topikal', 'Inhalasi', 'Lainnya'),
    tanggal_mulai DATETIME,
    tanggal_berakhir DATETIME,
    status ENUM('Active', 'Completed', 'Cancelled', 'On-Hold'),
    alasan_stop TEXT,
    prescribed_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_immunization (
    id_immunization VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    kode_vaksin VARCHAR(50),
    nomor_batch VARCHAR(100),
    tanggal_pemberian DATETIME,
    rute_pemberian VARCHAR(50),
    lokasi_injeksi VARCHAR(100),
    dosis VARCHAR(50),
    urutan_ke INT,
    tanggal_jadwal_berikutnya DATE,
    efek_samping TEXT,
    diberikan_oleh VARCHAR(50),
    manufacturer VARCHAR(255),
    expiry_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_vital_signs (
    id_vital VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    tanggal_catat DATETIME,
    tekanan_darah_sistolik INT,
    tekanan_darah_diastolik INT,
    nadi INT,
    suhu_celsius DECIMAL(4,1),
    respirasi_rate INT,
    spo2 INT,
    tingkat_nyeri INT,
    tinggi_badan_cm DECIMAL(5,1),
    berat_badan_kg DECIMAL(5,1),
    lingkar_kepala_cm DECIMAL(5,1),
    bmi DECIMAL(5,1),
    kesadaran ENUM('Compos Mentis', 'Somnolen', 'Sopor', 'Koma'),
    catatan TEXT,
    dicatat_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_family_history (
    id_family VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    hubungan_keluarga ENUM('Ayah', 'Ibu', 'Saudara Kandung', 'Anak', 'Kakek-Nenek', 'Paman-Bibi'),
    nama_keluarga VARCHAR(150),
    kondisi_kesehatan VARCHAR(255),
    kode_icd10 VARCHAR(20),
    usia_diagnosis INT,
    status_hidup ENUM('Hidup', 'Meninggal'),
    usia_meninggal INT,
    penyebab_meninggal VARCHAR(255),
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_social_history (
    id_social VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    merokok ENUM('Tidak', 'Pernah', 'Aktif'),
    jumlah_rokok_per_hari INT,
    tahun_mulai_merokok INT,
    tahun_berhenti_merokok INT,
    alkohol ENUM('Tidak', 'Sosial', 'Rutin'),
    frekuensi_alkohol VARCHAR(100),
    obat_terlarang ENUM('Tidak', 'Pernah', 'Aktif'),
    aktivitas_fisik VARCHAR(150),
    pekerjaan VARCHAR(150),
    paparan_bahaya_kerja TEXT,
    status_perkawinan VARCHAR(50),
    orientasi_seksual VARCHAR(50),
    pendidikan VARCHAR(100),
    agama VARCHAR(50),
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_growth_chart (
    id_growth VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    tanggal_ukur DATE,
    usia_bulan DECIMAL(5,1),
    berat_badan_kg DECIMAL(5,1),
    tinggi_badan_cm DECIMAL(5,1),
    lingkar_kepala_cm DECIMAL(5,1),
    bb_per_u_zscore DECIMAL(5,2),
    tb_per_u_zscore DECIMAL(5,2),
    bb_per_tb_zscore DECIMAL(5,2),
    status_gizi ENUM('Gizi Buruk', 'Gizi Kurang', 'Gizi Baik', 'Gizi Lebih', 'Obesitas'),
    pengukuran_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_chronic_care_plan (
    id_care_plan VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    diagnosis_kronis VARCHAR(255),
    kode_icd10 VARCHAR(20),
    tanggal_mulai DATE,
    target_terapi TEXT,
    parameter_monitoring JSON,
    jadwal_kontrol VARCHAR(100),
    edukasi_pasien TEXT,
    status ENUM('Active', 'Inactive'),
    dokter_penanggung_jawab VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_advance_directive (
    id_directive VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    jenis_directive ENUM('DNR', 'DNI', 'Full Code', 'Living Will', 'Health Care Proxy'),
    isi_directive TEXT,
    tanggal_dibuat DATE,
    tanggal_berlaku DATE,
    tanggal_kadaluarsa DATE,
    nama_penandatangan VARCHAR(150),
    saksi_1 VARCHAR(150),
    saksi_2 VARCHAR(150),
    file_dokumen_url VARCHAR(255),
    status ENUM('Active', 'Revoked', 'Expired'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_release_of_information (
    id_release VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    pemohon VARCHAR(150),
    jenis_pemohon ENUM('Asuransi', 'Perusahaan', 'Pengadilan', 'Pasien Sendiri', 'Keluarga', 'Dokter Rujukan', 'Lain-lain'),
    tujuan_permintaan TEXT,
    data_yang_diminta JSON,
    alasan TEXT,
    persetujuan_pasien BOOLEAN,
    tanda_tangan_pasien VARCHAR(255),
    tanggal_permintaan DATE,
    tanggal_dipenuhi DATE,
    status ENUM('Pending', 'Approved', 'Completed', 'Rejected'),
    diproses_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_patient_summary (
    id_summary VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    ringkasan_medik TEXT,
    active_problems_count INT,
    active_medications_count INT,
    allergies_count INT,
    last_visit_date DATE,
    primary_care_physician VARCHAR(50),
    insurance_info JSON,
    emergency_contact JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_timeline_event (
    id_event VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    event_type ENUM('Registration', 'Consultation', 'Lab-Order', 'Lab-Result', 'Radiology-Order', 'Radiology-Result', 'Prescription', 'Procedure', 'Surgery', 'Admission', 'Discharge', 'Emergency', 'Immunization', 'Vital-Sign', 'Note'),
    event_title VARCHAR(255),
    event_description TEXT,
    event_date DATETIME,
    related_table VARCHAR(100),
    related_id VARCHAR(50),
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rme_document_attachment (
    id_document VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    id_kunjungan VARCHAR(50),
    jenis_dokumen ENUM('Surat Rujukan', 'Hasil Lab', 'Hasil Radiologi', 'Surat Keterangan', 'Resume Medis', 'Informed Consent', 'Lain-lain'),
    judul VARCHAR(255),
    file_url VARCHAR(255),
    mime_type VARCHAR(50),
    file_size_kb INT,
    deskripsi TEXT,
    diupload_oleh VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Source schema: database_sdm.sql

CREATE TABLE sdm_departemen (
    id_departemen VARCHAR(50) PRIMARY KEY,
    kode_departemen VARCHAR(20) UNIQUE NOT NULL,
    nama_departemen VARCHAR(150) NOT NULL,
    kepala_departemen_id VARCHAR(50),
    parent_departemen_id VARCHAR(50),
    jenis ENUM('Medis', 'Keperawatan', 'Penunjang', 'Administratif', 'Manajemen'),
    lokasi VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sdm_jabatan (
    id_jabatan VARCHAR(50) PRIMARY KEY,
    kode_jabatan VARCHAR(20) UNIQUE NOT NULL,
    nama_jabatan VARCHAR(150) NOT NULL,
    level ENUM('Staff', 'Supervisor', 'Manager', 'Head', 'Director'),
    min_pendidikan VARCHAR(100),
    min_sertifikasi VARCHAR(255),
    deskripsi_tugas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Source schema: database_inventory.sql

CREATE TABLE inv_gudang (
    id_gudang VARCHAR(50) PRIMARY KEY,
    kode_gudang VARCHAR(20) UNIQUE NOT NULL,
    nama_gudang VARCHAR(150) NOT NULL,
    lokasi VARCHAR(150),
    jenis ENUM('Gudang Utama', 'Gudang Farmasi', 'Gudang Alkes', 'Gudang BHP', 'Gudang Linen', 'Gudang OK', 'Depo Poli', 'Depo Rawat Inap'),
    penanggung_jawab_id VARCHAR(50),
    kapasitas VARCHAR(100),
    status ENUM('Aktif', 'Nonaktif') DEFAULT 'Aktif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_kategori_item (
    id_kategori VARCHAR(50) PRIMARY KEY,
    kode_kategori VARCHAR(20) UNIQUE NOT NULL,
    nama_kategori VARCHAR(100) NOT NULL,
    jenis ENUM('Obat', 'Alkes', 'BHP', 'Linen', 'ATK', 'Alat Tulis', 'Lain-lain'),
    parent_kategori_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_master_item (
    id_item VARCHAR(50) PRIMARY KEY,
    kode_item VARCHAR(50) UNIQUE NOT NULL,
    nama_item VARCHAR(255) NOT NULL,
    barcode VARCHAR(100) UNIQUE,
    id_kategori VARCHAR(50),
    satuan VARCHAR(50),
    merek VARCHAR(100),
    produsen VARCHAR(150),
    negara_asal VARCHAR(100),
    berat_kg DECIMAL(10,2),
    dimensi JSON,
    harga_perolehan DECIMAL(15,2),
    harga_jual DECIMAL(15,2),
    minimum_stock INT,
    maximum_stock INT,
    reorder_point INT,
    requires_batch BOOLEAN DEFAULT TRUE,
    requires_expiry BOOLEAN DEFAULT TRUE,
    is_narkotika BOOLEAN DEFAULT FALSE,
    is_psikotropika BOOLEAN DEFAULT FALSE,
    is_obat_berbahaya BOOLEAN DEFAULT FALSE,
    requires_prescription BOOLEAN DEFAULT FALSE,
    storage_condition ENUM('Room Temperature', 'Cold 2-8°C', 'Frozen', 'Protected from Light'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_batch (
    id_batch VARCHAR(50) PRIMARY KEY,
    id_item VARCHAR(50) NOT NULL,
    nomor_batch VARCHAR(100) NOT NULL,
    tanggal_produksi DATE,
    tanggal_kadaluarsa DATE,
    nomor_registrasi_bpom VARCHAR(100),
    harga_perolehan_batch DECIMAL(15,2),
    jumlah_awal INT,
    jumlah_sisa INT,
    status ENUM('Aktif', 'Expired', 'Recalled', 'Destroyed') DEFAULT 'Aktif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_stock (
    id_stock VARCHAR(50) PRIMARY KEY,
    id_item VARCHAR(50) NOT NULL,
    id_gudang VARCHAR(50) NOT NULL,
    id_batch VARCHAR(50),
    jumlah_stok INT DEFAULT 0,
    jumlah_reserved INT DEFAULT 0,
    jumlah_available INT GENERATED ALWAYS AS (jumlah_stok - jumlah_reserved) STORED,
    lokasi_rak VARCHAR(50),
    last_counted_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_stock (id_item, id_gudang, id_batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_supplier (
    id_supplier VARCHAR(50) PRIMARY KEY,
    kode_supplier VARCHAR(50) UNIQUE NOT NULL,
    nama_supplier VARCHAR(150) NOT NULL,
    jenis ENUM('Distributor Obat', 'Distributor Alkes', 'Distributor BHP', 'Produsen', 'Lain-lain'),
    alamat TEXT,
    kota VARCHAR(100),
    telepon VARCHAR(50),
    email VARCHAR(100),
    contact_person VARCHAR(100),
    npwp VARCHAR(50),
    no_izin_edar VARCHAR(100),
    rating DECIMAL(3,2),
    status_kerjasama ENUM('Aktif', 'Tidak Aktif', 'Blacklist') DEFAULT 'Aktif',
    tanggal_mulai_kerjasama DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_purchase_request (
    id_pr VARCHAR(50) PRIMARY KEY,
    nomor_pr VARCHAR(50) UNIQUE NOT NULL,
    id_departemen VARCHAR(50),
    requested_by VARCHAR(50),
    tanggal_request DATE NOT NULL,
    items JSON,
    alasan TEXT,
    status ENUM('Draft', 'Submitted', 'Approved', 'Rejected', 'PO-Created') DEFAULT 'Draft',
    approved_by VARCHAR(50),
    tanggal_approval DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_purchase_order (
    id_po VARCHAR(50) PRIMARY KEY,
    nomor_po VARCHAR(50) UNIQUE NOT NULL,
    id_pr VARCHAR(50),
    id_supplier VARCHAR(50) NOT NULL,
    tanggal_po DATE NOT NULL,
    tanggal_kirim_estimasi DATE,
    items JSON,
    subtotal DECIMAL(15,2),
    ppn DECIMAL(15,2),
    total DECIMAL(15,2),
    status ENUM('Draft', 'Sent', 'Partial-Received', 'Received', 'Cancelled') DEFAULT 'Draft',
    received_by VARCHAR(50),
    tanggal_receive DATETIME,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_receive_note (
    id_receive VARCHAR(50) PRIMARY KEY,
    id_po VARCHAR(50) NOT NULL,
    nomor_receive VARCHAR(50) UNIQUE NOT NULL,
    tanggal_receive DATETIME NOT NULL,
    items JSON,
    received_by VARCHAR(50),
    inspected_by VARCHAR(50),
    status ENUM('Accepted', 'Partial', 'Rejected') DEFAULT 'Accepted',
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_stock_movement (
    id_movement VARCHAR(50) PRIMARY KEY,
    id_item VARCHAR(50) NOT NULL,
    id_gudang_asal VARCHAR(50),
    id_gudang_tujuan VARCHAR(50),
    id_batch VARCHAR(50),
    jenis_movement ENUM('Purchase-Receive', 'Sales-Dispense', 'Transfer', 'Adjustment', 'Return', 'Expired', 'Damaged', 'Recall', 'Stock-Opname'),
    jumlah INT NOT NULL,
    referensi VARCHAR(100),
    catatan TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_stock_opname (
    id_opname VARCHAR(50) PRIMARY KEY,
    id_gudang VARCHAR(50) NOT NULL,
    tanggal_opname DATE NOT NULL,
    status ENUM('Planned', 'In-Progress', 'Completed') DEFAULT 'Planned',
    items_counted JSON,
    selisih_total DECIMAL(15,2),
    approved_by VARCHAR(50),
    catatan_opname TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_drug_recall (
    id_recall VARCHAR(50) PRIMARY KEY,
    id_item VARCHAR(50) NOT NULL,
    id_batch VARCHAR(50) NOT NULL,
    nomor_recall VARCHAR(100),
    alasan_recall TEXT,
    tingkat_risiko ENUM('Class I-Kritis', 'Class II-Serius', 'Class III-Minor'),
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    jumlah_tertarik INT,
    status ENUM('Active', 'Completed') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_item_usage_report (
    id_report VARCHAR(50) PRIMARY KEY,
    id_item VARCHAR(50) NOT NULL,
    periode VARCHAR(20) NOT NULL,
    total_penggunaan INT DEFAULT 0,
    total_nilai DECIMAL(15,2) DEFAULT 0,
    rata_rata_per_hari DECIMAL(10,2) DEFAULT 0,
    top_consumer VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inv_alert (
    id_alert VARCHAR(50) PRIMARY KEY,
    id_item VARCHAR(50) NOT NULL,
    id_gudang VARCHAR(50),
    jenis_alert ENUM('Low-Stock', 'Out-of-Stock', 'Over-Stock', 'Near-Expiry', 'Expired', 'Recall'),
    severity ENUM('Low', 'Medium', 'High', 'Critical'),
    pesan TEXT,
    status ENUM('Active', 'Acknowledged', 'Resolved') DEFAULT 'Active',
    resolved_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Source schema: database_portal.sql

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_document_access (
    id_access VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    jenis_dokumen ENUM('Rekam Medis', 'Hasil Lab', 'Hasil Radiologi', 'Resep', 'Surat Keterangan', 'Invoice') NOT NULL,
    id_referensi BIGINT,
    tanggal_akses DATETIME NOT NULL,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_health_journal (
    id_journal VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    gejala TEXT,
    tanda_vital JSON,
    obat_diminum JSON,
    catatan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_education (
    id_education VARCHAR(50) PRIMARY KEY,
    judul VARCHAR(255) NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    konten TEXT NOT NULL,
    foto_url VARCHAR(255),
    video_url VARCHAR(255),
    view_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_chat (
    id_chat VARCHAR(50) PRIMARY KEY,
    id_account VARCHAR(50) NOT NULL,
    subjek VARCHAR(255) NOT NULL,
    status ENUM('Open', 'In Progress', 'Resolved', 'Closed') DEFAULT 'Open',
    assigned_to VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE portal_chat_message (
    id_message VARCHAR(50) PRIMARY KEY,
    id_chat VARCHAR(50) NOT NULL,
    sender_type ENUM('Patient', 'Staff') NOT NULL,
    message TEXT NOT NULL,
    attachment_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Source schema: database_satusehat.sql

CREATE TABLE satusehat_config (
    id_config VARCHAR(50) PRIMARY KEY,
    environment ENUM('Production', 'Staging') DEFAULT 'Staging',
    base_url VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    organization_id VARCHAR(100),
    location_id VARCHAR(100),
    token_endpoint VARCHAR(255),
    fhir_endpoint VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    last_sync DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_patient_mapping (
    id_mapping VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    satusehat_patient_id VARCHAR(100),
    nik VARCHAR(20) NOT NULL,
    sync_status ENUM('Not-Synced', 'Synced', 'Failed', 'Updated') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_encounter (
    id_encounter VARCHAR(50) PRIMARY KEY,
    id_kunjungan VARCHAR(50) NOT NULL,
    satusehat_encounter_id VARCHAR(100),
    satusehat_patient_id VARCHAR(100),
    encounter_class ENUM('ambulatory', 'emergency', 'inpatient', 'virtual') NOT NULL,
    status ENUM('planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled') NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME,
    location_id VARCHAR(100),
    service_type VARCHAR(100),
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_condition (
    id_condition VARCHAR(50) PRIMARY KEY,
    id_encounter VARCHAR(50) NOT NULL,
    satusehat_condition_id VARCHAR(100),
    code_system ENUM('ICD-10', 'SNOMED-CT') NOT NULL,
    code_value VARCHAR(50) NOT NULL,
    display_name VARCHAR(255),
    clinical_status ENUM('active', 'recurrence', 'relapse', 'inactive', 'remission', 'resolved'),
    verification_status ENUM('unconfirmed', 'provisional', 'differential', 'confirmed', 'refuted'),
    onset_date DATE,
    recorded_date DATETIME,
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_observation (
    id_observation VARCHAR(50) PRIMARY KEY,
    id_encounter VARCHAR(50) NOT NULL,
    satusehat_observation_id VARCHAR(100),
    category ENUM('vital-signs', 'laboratory', 'imaging', 'social-history') NOT NULL,
    code_loinc VARCHAR(50),
    code_display VARCHAR(255),
    value_quantity DECIMAL(10,2),
    value_unit VARCHAR(50),
    value_string TEXT,
    effective_datetime DATETIME,
    status ENUM('registered', 'preliminary', 'final', 'amended', 'cancelled'),
    interpretation TEXT,
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_medication_statement (
    id_medication VARCHAR(50) PRIMARY KEY,
    id_encounter VARCHAR(50) NOT NULL,
    satusehat_medication_id VARCHAR(100),
    kode_kfa VARCHAR(50),
    nama_obat VARCHAR(255),
    dosis VARCHAR(100),
    rute VARCHAR(100),
    frekuensi VARCHAR(100),
    period_start DATETIME,
    period_end DATETIME,
    status ENUM('active', 'completed', 'stopped', 'on-hold'),
    prescribed_by VARCHAR(50),
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_immunization (
    id_immunization VARCHAR(50) PRIMARY KEY,
    id_pasien VARCHAR(50) NOT NULL,
    satusehat_immunization_id VARCHAR(100),
    vaccine_code VARCHAR(50),
    vaccine_name VARCHAR(255),
    occurrence_datetime DATETIME,
    dose_number INT,
    lot_number VARCHAR(100),
    manufacturer VARCHAR(255),
    expiration_date DATE,
    site VARCHAR(100),
    route VARCHAR(100),
    status ENUM('completed', 'entered-in-error', 'not-done'),
    reported_origin ENUM('Provider', 'Patient', 'Registry'),
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_practitioner_mapping (
    id_mapping VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    satusehat_practitioner_id VARCHAR(100),
    str_number VARCHAR(100),
    sip_number VARCHAR(100),
    specialization VARCHAR(100),
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_organization_mapping (
    id_mapping VARCHAR(50) PRIMARY KEY,
    nama_unit VARCHAR(255),
    satusehat_location_id VARCHAR(100),
    unit_type ENUM('Poli', 'IGD', 'Rawat Inap', 'Lab', 'Radiologi', 'Farmasi', 'OK'),
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE satusehat_sync_log (
    id_log VARCHAR(50) PRIMARY KEY,
    resource_type ENUM('Patient', 'Encounter', 'Condition', 'Observation', 'Medication', 'Immunization') NOT NULL,
    resource_id VARCHAR(50),
    action ENUM('Create', 'Update', 'Read', 'Delete'),
    satusehat_id VARCHAR(100),
    request_payload JSON,
    response_payload JSON,
    http_status INT,
    success BOOLEAN,
    error_message TEXT,
    duration_ms INT,
    triggered_by VARCHAR(50),
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    retry_count INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Application persistence records used by the server adapters.

CREATE TABLE IF NOT EXISTS `patients` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `registrations` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `queues` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `emr_soap` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prescriptions` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billings` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `beds` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_data` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qr_tokens` (
  `id` VARCHAR(128) NOT NULL,
  `payload` JSON NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qr_tokens_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sync_outbox` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entity` VARCHAR(40) NOT NULL,
  `record_id` VARCHAR(128) NOT NULL,
  `operation` ENUM('upsert', 'delete') NOT NULL,
  `payload` JSON NULL,
  `status` ENUM('pending', 'synced') NOT NULL DEFAULT 'pending',
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_error` VARCHAR(1000) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `synced_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sync_outbox_pending` (`status`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
