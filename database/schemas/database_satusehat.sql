-- 1. satusehat_config
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
);

-- 2. satusehat_patient_mapping
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
);

-- 3. satusehat_encounter
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
);

-- 4. satusehat_condition
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
);

-- 5. satusehat_observation
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
);

-- 6. satusehat_medication_statement
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
);

-- 7. satusehat_immunization
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
);

-- 8. satusehat_practitioner_mapping
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
);

-- 9. satusehat_organization_mapping
CREATE TABLE satusehat_organization_mapping (
    id_mapping VARCHAR(50) PRIMARY KEY,
    nama_unit VARCHAR(255),
    satusehat_location_id VARCHAR(100),
    unit_type ENUM('Poli', 'IGD', 'Rawat Inap', 'Lab', 'Radiologi', 'Farmasi', 'OK'),
    sync_status ENUM('Not-Synced', 'Synced', 'Failed') DEFAULT 'Not-Synced',
    last_sync_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. satusehat_sync_log
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
);
