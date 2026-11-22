-- 1. api_client
CREATE TABLE api_client (
    id_client VARCHAR(50) PRIMARY KEY,
    nama_client VARCHAR(100) NOT NULL,
    deskripsi TEXT,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    api_secret VARCHAR(255) NOT NULL,
    owner_email VARCHAR(100) NOT NULL,
    status ENUM('Active', 'Inactive', 'Revoked') NOT NULL DEFAULT 'Active',
    rate_limit_per_minute INT DEFAULT 60,
    rate_limit_per_day INT DEFAULT 10000,
    ip_whitelist JSON,
    expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. api_endpoint
CREATE TABLE api_endpoint (
    id_endpoint VARCHAR(50) PRIMARY KEY,
    path VARCHAR(255) NOT NULL,
    method ENUM('GET', 'POST', 'PUT', 'DELETE', 'PATCH') NOT NULL,
    versi VARCHAR(20) DEFAULT 'v1',
    deskripsi TEXT,
    kategori VARCHAR(100),
    requires_auth BOOLEAN DEFAULT TRUE,
    requires_permission VARCHAR(100),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. api_request_log
CREATE TABLE api_request_log (
    id_log VARCHAR(50) PRIMARY KEY,
    id_client VARCHAR(50),
    id_endpoint VARCHAR(50),
    request_url VARCHAR(255) NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    request_headers JSON,
    request_body JSON,
    response_status INT NOT NULL,
    response_body JSON,
    response_time_ms INT NOT NULL,
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    timestamp DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. api_rate_limit_log
CREATE TABLE api_rate_limit_log (
    id_log VARCHAR(50) PRIMARY KEY,
    id_client VARCHAR(50) NOT NULL,
    timestamp DATETIME NOT NULL,
    requests_count INT NOT NULL,
    limit_exceeded BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. api_webhook
CREATE TABLE api_webhook (
    id_webhook VARCHAR(50) PRIMARY KEY,
    id_client VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    callback_url VARCHAR(255) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. api_webhook_delivery
CREATE TABLE api_webhook_delivery (
    id_delivery VARCHAR(50) PRIMARY KEY,
    id_webhook VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSON NOT NULL,
    response_status INT,
    response_body TEXT,
    delivered_at DATETIME,
    retry_count INT DEFAULT 0,
    status ENUM('Pending', 'Delivered', 'Failed') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. api_documentation
CREATE TABLE api_documentation (
    id_doc VARCHAR(50) PRIMARY KEY,
    id_endpoint VARCHAR(50) NOT NULL,
    judul VARCHAR(255) NOT NULL,
    deskripsi TEXT,
    request_example JSON,
    response_example JSON,
    error_codes JSON,
    changelog TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
