-- 1. monitor_health_check
CREATE TABLE monitor_health_check (
    id_check VARCHAR(50) PRIMARY KEY,
    nama_service VARCHAR(100) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    interval_detik INT NOT NULL,
    timeout_detik INT NOT NULL,
    status ENUM('Healthy', 'Degraded', 'Down') NOT NULL,
    last_check_at DATETIME NOT NULL,
    response_time_ms INT,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. monitor_performance_log
CREATE TABLE monitor_performance_log (
    id_log VARCHAR(50) PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    response_time_ms INT NOT NULL,
    status_code INT NOT NULL,
    memory_usage_mb DECIMAL(10,2),
    cpu_usage_percent DECIMAL(5,2),
    timestamp DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. monitor_error_log
CREATE TABLE monitor_error_log (
    id_error VARCHAR(50) PRIMARY KEY,
    level ENUM('Debug', 'Info', 'Warning', 'Error', 'Critical', 'Fatal') NOT NULL,
    message TEXT NOT NULL,
    stack_trace TEXT,
    file VARCHAR(255),
    line INT,
    user_id VARCHAR(50),
    request_url VARCHAR(255),
    request_method VARCHAR(10),
    request_payload JSON,
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    timestamp DATETIME NOT NULL,
    resolved_at DATETIME,
    resolved_by VARCHAR(50),
    status ENUM('Open', 'Investigating', 'Resolved', 'Won''t Fix') DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. monitor_audit_log
CREATE TABLE monitor_audit_log (
    id_audit VARCHAR(50) PRIMARY KEY,
    id_user VARCHAR(50) NOT NULL,
    action ENUM('Create', 'Read', 'Update', 'Delete', 'Login', 'Logout', 'Export', 'Import', 'Approve', 'Reject', 'Print') NOT NULL,
    module VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_value JSON,
    new_value JSON,
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    timestamp DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. monitor_alert_rule
CREATE TABLE monitor_alert_rule (
    id_rule VARCHAR(50) PRIMARY KEY,
    nama_rule VARCHAR(255) NOT NULL,
    kondisi JSON NOT NULL,
    severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
    channel ENUM('Email', 'SMS', 'WhatsApp', 'Slack', 'PagerDuty') NOT NULL,
    recipient JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. monitor_alert_log
CREATE TABLE monitor_alert_log (
    id_alert VARCHAR(50) PRIMARY KEY,
    id_rule VARCHAR(50) NOT NULL,
    triggered_at DATETIME NOT NULL,
    message TEXT NOT NULL,
    severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
    status ENUM('Triggered', 'Acknowledged', 'Resolved') DEFAULT 'Triggered',
    acknowledged_at DATETIME,
    acknowledged_by VARCHAR(50),
    resolved_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. monitor_slow_query
CREATE TABLE monitor_slow_query (
    id_query VARCHAR(50) PRIMARY KEY,
    query_text TEXT NOT NULL,
    duration_ms INT NOT NULL,
    rows_examined INT,
    rows_returned INT,
    database_name VARCHAR(100),
    timestamp DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
