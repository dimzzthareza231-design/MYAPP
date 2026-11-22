-- 1. rme_problem_list
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
);

-- 2. rme_allergy_list
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
);

-- 3. rme_medication_history
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
);

-- 4. rme_immunization
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
);

-- 5. rme_vital_signs
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
);

-- 6. rme_family_history
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
);

-- 7. rme_social_history
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
);

-- 8. rme_growth_chart
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
);

-- 9. rme_chronic_care_plan
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
);

-- 10. rme_advance_directive
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
);

-- 11. rme_release_of_information
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
);

-- 12. rme_patient_summary
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
);

-- 13. rme_timeline_event
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
);

-- 14. rme_document_attachment
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
);
