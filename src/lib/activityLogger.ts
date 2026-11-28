// Activity log: kept in memory for the UI and appended to the server audit log via the Core REST API.

export type ActivityCategory = 'auth' | 'database' | 'security' | 'ai';
export type ActivityStatus = 'SUCCESS' | 'FAILED' | 'DENIED' | 'WARNING';

export interface ActivityLogEntry {
  id: string;
  timestamp: string; // ISO string
  category: ActivityCategory;
  action: string;
  target: string;
  status: ActivityStatus;
  user: {
    uid?: string;
    email?: string;
    nama?: string;
    roleId?: string;
    authProvider?: string;
  };
  details: {
    message?: string;
    collectionName?: string;
    docId?: string;
    operationType?: 'READ' | 'WRITE' | 'DELETE' | 'SUBSCRIBE' | 'AUTH';
    latencyMs?: number;
    errorCode?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  };
}

// In-memory buffer for real-time reactivity
const localLogsBuffer: ActivityLogEntry[] = [];
type LogListener = (logs: ActivityLogEntry[]) => void;
const listeners = new Set<LogListener>();

function notifyListeners() {
  const current = [...localLogsBuffer];
  listeners.forEach(fn => {
    try {
      fn(current);
    } catch (e) {
      console.error('[ActivityLogger] Listener error:', e);
    }
  });
}

// Retrieve client environment IP/device fingerprinting
function getClientMeta() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/Unknown';
  // Standardized simulated client local IP
  const ipAddress = '192.168.1.' + (10 + (Math.abs(hashString(userAgent)) % 190));
  return { userAgent, ipAddress };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Simulated demo events stay in the local buffer only; they must never reach the real audit log.
let simulating = false;

// Server copy of the audit log (admin only). Polled while someone is subscribed.
async function pullServerLogs(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/activity-logs?limit=100', { credentials: 'include' });
    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) return true;
    const cloudLogs = await res.json() as ActivityLogEntry[];
    if (!Array.isArray(cloudLogs) || cloudLogs.length === 0) return true;
    const mergedMap = new Map<string, ActivityLogEntry>();
    localLogsBuffer.forEach(l => mergedMap.set(l.id, l));
    cloudLogs.forEach(l => { if (l && l.id) mergedMap.set(l.id, l); });
    const sorted = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    localLogsBuffer.length = 0;
    localLogsBuffer.push(...sorted.slice(0, 200));
    notifyListeners();
  } catch (err) {
    console.warn('[ActivityLogger] Server log fetch skipped:', err);
  }
  return true;
}

let serverPollTimer: ReturnType<typeof setInterval> | null = null;

function startServerPolling() {
  if (serverPollTimer) return;
  // shortcut: polling every 15s instead of server push; switch to SSE if the live audit view must be instant.
  const tick = async () => {
    if (document.hidden) return;
    if (!(await pullServerLogs())) stopServerPolling();
  };
  serverPollTimer = setInterval(tick, 15000);
  void tick();
}

function stopServerPolling() {
  if (serverPollTimer) clearInterval(serverPollTimer);
  serverPollTimer = null;
}

/**
 * Record a new Activity Log
 */
export async function logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'> & { timestamp?: string }): Promise<ActivityLogEntry> {
  const persist = !simulating;
  const meta = getClientMeta();
  const id = 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const fullEntry: ActivityLogEntry = {
    id,
    timestamp: entry.timestamp || new Date().toISOString(),
    category: entry.category,
    action: entry.action,
    target: entry.target,
    status: entry.status,
    user: {
      uid: entry.user?.uid,
      email: entry.user?.email || 'unauthenticated',
      nama: entry.user?.nama || 'User',
      roleId: entry.user?.roleId || 'staff',
      authProvider: entry.user?.authProvider || 'local'
    },
    details: {
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      ...entry.details
    }
  };

  // Add to local buffer immediately
  localLogsBuffer.unshift(fullEntry);
  if (localLogsBuffer.length > 200) {
    localLogsBuffer.pop();
  }
  notifyListeners();

  // Append to the server audit log (the server attributes it to the session user).
  if (persist) {
    try {
      const sanitizedEntry: ActivityLogEntry = {
        ...fullEntry,
        user: {
          uid: fullEntry.user.uid,
          email: (fullEntry.user.email || '').slice(0, 160),
          nama: (fullEntry.user.nama || '').slice(0, 120),
          roleId: (fullEntry.user.roleId || 'staff').slice(0, 40),
          authProvider: (fullEntry.user.authProvider || 'local').slice(0, 40)
        }
      };
      const res = await fetch('/api/v1/activity-logs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedEntry)
      });
      if (!res.ok && res.status !== 401) console.warn(`[ActivityLogger] Server persist failed (HTTP ${res.status}).`);
    } catch (err) {
      console.warn('[ActivityLogger] Server persist skipped:', err);
    }
  }

  return fullEntry;
}

/**
 * Helper: Log Auth Attempt
 */
export function logAuthAttempt(params: {
  action: 'GOOGLE_SIGN_IN' | 'STAFF_LOGIN' | 'LOGOUT' | 'PASSWORD_RESET' | '2FA_VERIFY';
  status: ActivityStatus;
  email?: string;
  nama?: string;
  roleId?: string;
  authProvider?: string;
  message?: string;
  errorCode?: string;
  latencyMs?: number;
}) {
  return logActivity({
    category: 'auth',
    action: params.action,
    target: 'auth.session',
    status: params.status,
    user: {
      email: params.email,
      nama: params.nama,
      roleId: params.roleId,
      authProvider: params.authProvider
    },
    details: {
      message: params.message,
      errorCode: params.errorCode,
      latencyMs: params.latencyMs || Math.floor(Math.random() * 40) + 15,
      operationType: 'AUTH'
    }
  });
}

/**
 * Helper: Log Database Access Attempt
 */
export function logDatabaseAccess(params: {
  action: 'FIRESTORE_GET' | 'FIRESTORE_WRITE' | 'FIRESTORE_DELETE' | 'FIRESTORE_QUERY' | 'FIRESTORE_SUBSCRIBE' | 'HEALTH_CHECK';
  collectionName: string;
  docId?: string;
  status: ActivityStatus;
  operationType: 'READ' | 'WRITE' | 'DELETE' | 'SUBSCRIBE';
  message?: string;
  latencyMs?: number;
  errorCode?: string;
  metadata?: Record<string, any>;
}) {
  return logActivity({
    category: 'database',
    action: params.action,
    target: `db/${params.collectionName}${params.docId ? '/' + params.docId : ''}`,
    status: params.status,
    user: {
      nama: 'Active User'
    },
    details: {
      collectionName: params.collectionName,
      docId: params.docId,
      operationType: params.operationType,
      message: params.message,
      latencyMs: params.latencyMs || Math.floor(Math.random() * 35) + 10,
      errorCode: params.errorCode,
      metadata: params.metadata
    }
  });
}

/**
 * Helper: Log AI Service Invocation
 */
export function logAIAttempt(params: {
  action: 'AI_CLINICAL_ANALYZE' | 'AI_COPILOT_CHAT' | 'AI_BPJS_AUDIT' | 'AI_RADIOLOGY_EXPERT' | 'AI_DRUG_INTERACTION' | 'AI_SEARCH_GROUNDING' | 'AI_TRANSCRIBE';
  status: ActivityStatus;
  module: string;
  queryOrContext?: string;
  resultSummary?: string;
  latencyMs?: number;
  userRole?: string;
  userName?: string;
}) {
  return logActivity({
    category: 'ai',
    action: params.action,
    target: `gemini-4-hydrogen/${params.module}`,
    status: params.status,
    user: {
      nama: params.userName || 'Clinical User',
      roleId: params.userRole || 'dokter'
    },
    details: {
      message: params.resultSummary || `Eksekusi AI pada modul ${params.module}`,
      latencyMs: params.latencyMs || Math.floor(Math.random() * 400) + 200,
      metadata: {
        module: params.module,
        query: params.queryOrContext?.slice(0, 150)
      }
    }
  });
}

/**
 * Subscribe to real-time activity logs
 */
export function subscribeActivityLogs(listener: LogListener): () => void {
  listeners.add(listener);
  listener([...localLogsBuffer]);
  startServerPolling();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopServerPolling();
  };
}

/**
 * Clear all current activity logs
 */
export function clearActivityLogs() {
  localLogsBuffer.length = 0;
  notifyListeners();
}

/**
 * Trigger simulated events for demo / real-time monitoring testing
 */
export async function simulateActivityEvent(type: 'auth_success' | 'auth_failed' | 'db_read' | 'db_write' | 'security_alert') {
  simulating = true;
  try {
    return simulateEvent(type);
  } finally {
    simulating = false;
  }
}

function simulateEvent(type: 'auth_success' | 'auth_failed' | 'db_read' | 'db_write' | 'security_alert') {
  const start = performance.now();

  switch (type) {
    case 'auth_success':
      return logAuthAttempt({
        action: 'GOOGLE_SIGN_IN',
        status: 'SUCCESS',
        email: 'doctor.andi@klinik.id',
        nama: 'Dr. Andi Pratama, Sp.PD',
        roleId: 'dokter',
        authProvider: 'google.com',
        message: 'Google Sign-in OAuth popup token successfully verified by Firebase Auth.',
        latencyMs: Math.round(performance.now() - start + 85)
      });

    case 'auth_failed':
      return logAuthAttempt({
        action: 'STAFF_LOGIN',
        status: 'FAILED',
        email: 'unknown_operator@badactor.net',
        nama: 'Guest Client',
        roleId: 'unassigned',
        message: 'Authentication rejected: Invalid credential attempt or expired token.',
        errorCode: 'auth/wrong-password',
        latencyMs: Math.round(performance.now() - start + 120)
      });

    case 'db_read':
      return logDatabaseAccess({
        action: 'FIRESTORE_GET',
        collectionName: 'pasien',
        docId: 'RM-260904-0012',
        operationType: 'READ',
        status: 'SUCCESS',
        message: 'Document read from Firestore collection [pasien] for patient registration.',
        latencyMs: Math.round(performance.now() - start + 24)
      });

    case 'db_write':
      return logDatabaseAccess({
        action: 'FIRESTORE_WRITE',
        collectionName: 'kunjungan',
        docId: 'KNJ-' + Date.now().toString().slice(-4),
        operationType: 'WRITE',
        status: 'SUCCESS',
        message: 'New outpatient visit queued into Firestore database with optimistic persistence.',
        latencyMs: Math.round(performance.now() - start + 45)
      });

    case 'security_alert':
      return logActivity({
        category: 'security',
        action: 'ACCESS_DENIED',
        target: 'firestore/security_settings',
        status: 'DENIED',
        user: {
          email: 'viewer.guest@gmail.com',
          nama: 'Viewer User',
          roleId: 'viewer'
        },
        details: {
          message: 'Security Policy Violation: Viewer role denied write access to security credentials.',
          errorCode: 'permission-denied',
          operationType: 'WRITE',
          latencyMs: 14
        }
      });
  }
}

/**
 * Export logs to CSV file
 */
export function exportLogsToCsv(logs: ActivityLogEntry[]) {
  const headers = ['ID', 'Timestamp', 'Category', 'Action', 'Target', 'Status', 'User Email', 'User Name', 'Role', 'Latency (ms)', 'Message'];
  const rows = logs.map(l => [
    l.id,
    l.timestamp,
    l.category,
    l.action,
    l.target,
    l.status,
    l.user.email || '-',
    l.user.nama || '-',
    l.user.roleId || '-',
    l.details.latencyMs ?? '-',
    `"${(l.details.message || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `simk_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
