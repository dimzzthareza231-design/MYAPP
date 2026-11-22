-- 1. auth_user
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
);

-- 2. auth_role
CREATE TABLE auth_role (
    id_role VARCHAR(50) PRIMARY KEY,
    kode_role VARCHAR(50) UNIQUE NOT NULL,
    nama_role VARCHAR(100) NOT NULL,
    deskripsi TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. auth_permission
CREATE TABLE auth_permission (
    id_permission VARCHAR(50) PRIMARY KEY,
    kode_permission VARCHAR(100) UNIQUE NOT NULL,
    nama_permission VARCHAR(150) NOT NULL,
    modul VARCHAR(50) NOT NULL,
    aksi ENUM('Create', 'Read', 'Update', 'Delete', 'Export', 'Import', 'Approve', 'Reject') NOT NULL,
    deskripsi TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. auth_role_permission
CREATE TABLE auth_role_permission (
    id_mapping VARCHAR(50) PRIMARY KEY,
    id_role VARCHAR(50) NOT NULL,
    id_permission VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_role_permission (id_role, id_permission)
);

-- 5. auth_user_role
CREATE TABLE auth_user_role (
    id_assignment VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    id_role VARCHAR(50) NOT NULL,
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    assigned_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. auth_session
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
);

-- 7. auth_2fa
CREATE TABLE auth_2fa (
    id_2fa VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    method ENUM('SMS', 'Email', 'Authenticator App', 'Backup Code') NOT NULL,
    secret_key VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    verified_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 8. auth_otp
CREATE TABLE auth_otp (
    id_otp VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose ENUM('Login', 'Reset Password', 'Verify Email', 'Verify Phone', '2FA') NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. auth_password_history
CREATE TABLE auth_password_history (
    id_history VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. auth_login_log
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
);
