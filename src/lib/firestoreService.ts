// Data layer for the core app. Despite the file name this no longer talks to Firestore:
// every read/write goes to the Core REST API (/api/v1/*) using the staff session cookie.
import { Pasien, Kunjungan, MasterDokter, MasterPerawat } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any) {
    super(message);
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers
    });
  } catch (err) {
    setCloudStatus({ isConnected: false });
    throw err;
  }
  const body: any = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error || `HTTP ${res.status}`, res.status, body);
  }
  setCloudStatus({ isConnected: true, lastSync: new Date() });
  return body as T;
}

// 1. Cloud Status Management
export interface CloudStatus {
  isConnected: boolean;
  isSyncing: boolean;
  pendingWrites: number;
  lastSync: Date | null;
  syncedKeysCount: number;
}

let currentCloudStatus: CloudStatus = {
  isConnected: true,
  isSyncing: false,
  pendingWrites: 0,
  lastSync: null,
  syncedKeysCount: 0
};

type StatusListener = (status: CloudStatus) => void;
const statusListeners = new Set<StatusListener>();

export function subscribeCloudStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(currentCloudStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function setCloudStatus(patch: Partial<CloudStatus>) {
  currentCloudStatus = { ...currentCloudStatus, ...patch };
  statusListeners.forEach(l => {
    try { l(currentCloudStatus); } catch (e) {}
  });
}

// Polling helper used instead of realtime listeners.
// shortcut: polling every 15s instead of server push; switch to SSE/WebSocket if staff need sub-second updates.
export const POLL_INTERVAL_MS = 15000;

export function startPolling(tick: () => Promise<void> | void): () => void {
  let stopped = false;
  const run = () => {
    if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
    Promise.resolve(tick()).catch(err => console.warn('[Sync] poll failed:', err));
  };
  run();
  const timer = setInterval(run, POLL_INTERVAL_MS);
  const onVisible = () => { if (!document.hidden) run(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// 2. System data (key/value with compare-and-swap versions)
export class SystemDataConflictError extends Error {
  constructor(public key: string, public latestValue: any, public latestVersion: number) {
    super(`Data "${key}" telah diubah pengguna lain. Data terbaru sudah dimuat; silakan ulangi perubahan.`);
  }
}

const systemDataVersions = new Map<string, number>();
const systemDataListeners = new Map<string, Set<(data: any) => void>>();

function notifySystemData(key: string, value: any) {
  systemDataListeners.get(key)?.forEach(fn => {
    try { fn(value); } catch (e) {}
  });
}

const writeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function saveSystemDataCloud(key: string, data: any): Promise<void> {
  if (!key) return;

  setCloudStatus({ isSyncing: true, pendingWrites: currentCloudStatus.pendingWrites + 1 });

  if (writeDebounceTimers.has(key)) {
    clearTimeout(writeDebounceTimers.get(key));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      writeDebounceTimers.delete(key);
      const done = () => setCloudStatus({
        isSyncing: false,
        pendingWrites: Math.max(0, currentCloudStatus.pendingWrites - 1)
      });
      try {
        const result = await apiFetch<{ version: number }>(`/api/v1/system-data/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify({ value: data, version: systemDataVersions.get(key) ?? 0 })
        });
        systemDataVersions.set(key, result.version);
        done();
        setCloudStatus({ syncedKeysCount: currentCloudStatus.syncedKeysCount + 1 });
        resolve();
      } catch (err) {
        done();
        if (err instanceof ApiError && err.status === 409) {
          // Someone else saved first: adopt the latest server copy and tell the caller.
          const latestValue = err.body?.value ?? null;
          const latestVersion = Number(err.body?.version ?? 0);
          systemDataVersions.set(key, latestVersion);
          notifySystemData(key, latestValue);
          window.dispatchEvent(new CustomEvent('module-data-conflict', { detail: { key } }));
          reject(new SystemDataConflictError(key, latestValue, latestVersion));
          return;
        }
        reject(err);
      }
    }, 400);

    writeDebounceTimers.set(key, timer);
  });
}

export async function getSystemDataCloud(key: string): Promise<any | null> {
  if (!key) return null;
  try {
    const row = await apiFetch<{ value: any; version: number }>(`/api/v1/system-data/${encodeURIComponent(key)}`);
    systemDataVersions.set(key, row.version);
    return row.value ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      systemDataVersions.delete(key);
      return null;
    }
    throw err;
  }
}

export function subscribeSystemData(key: string, onData: (data: any) => void): () => void {
  if (!key) return () => {};
  if (!systemDataListeners.has(key)) systemDataListeners.set(key, new Set());
  systemDataListeners.get(key)!.add(onData);
  let lastVersion: number | undefined;
  const stopPolling = startPolling(async () => {
    const value = await getSystemDataCloud(key);
    const version = systemDataVersions.get(key);
    if (value !== null && version !== lastVersion) {
      lastVersion = version;
      onData(value);
    }
  });
  return () => {
    stopPolling();
    systemDataListeners.get(key)?.delete(onData);
  };
}

// 3. Clinical records (pasien, kunjungan, dokter, perawat)
export type RecordCollection = 'pasien' | 'kunjungan' | 'dokter' | 'perawat';

const recordUrl = (col: RecordCollection, id?: string) =>
  `/api/v1/records/${col}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`;

export async function fetchRecords<T>(col: RecordCollection, since?: string): Promise<T[]> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return apiFetch<T[]>(`${recordUrl(col)}${qs}`);
}

async function putRecord(col: RecordCollection, record: { id: string | number }): Promise<void> {
  await apiFetch(recordUrl(col, String(record.id)), { method: 'PUT', body: JSON.stringify(record) });
}

// PUT replaces the whole record, so partial updates read the current server copy first.
// shortcut: read-merge-write is not atomic (concurrent field edits can be lost); add PATCH on the server if that matters.
async function mergeRecord(col: RecordCollection, id: string, updates: Record<string, any>): Promise<void> {
  const current = await apiFetch<Record<string, any>>(recordUrl(col, id));
  await putRecord(col, { ...current, ...updates, id });
}

async function putAll(col: RecordCollection, records: { id: string | number }[]): Promise<void> {
  for (const r of records) await putRecord(col, r);
}

// PASIEN
export async function savePasienCloud(p: Pasien): Promise<void> {
  await putRecord('pasien', p);
}

export async function updatePasienCloud(id: string, updates: Partial<Pasien>): Promise<void> {
  await mergeRecord('pasien', id, updates);
}

export async function batchSeedPasienCloud(patients: Pasien[]): Promise<void> {
  await putAll('pasien', patients);
}

// KUNJUNGAN
export async function saveKunjunganCloud(k: Kunjungan): Promise<void> {
  await putRecord('kunjungan', k);
}

export async function updateKunjunganCloud(id: string, updates: Partial<Kunjungan>): Promise<void> {
  await mergeRecord('kunjungan', id, updates);
}

export async function batchSeedKunjunganCloud(visits: Kunjungan[]): Promise<void> {
  await putAll('kunjungan', visits);
}

// DOKTER
export async function saveDokterCloud(d: MasterDokter): Promise<void> {
  await putRecord('dokter', d);
}

export async function batchSeedDokterCloud(doctors: MasterDokter[]): Promise<void> {
  await putAll('dokter', doctors);
}

// PERAWAT
export async function savePerawatCloud(n: MasterPerawat): Promise<void> {
  await putRecord('perawat', n);
}

export async function batchSeedPerawatCloud(nurses: MasterPerawat[]): Promise<void> {
  await putAll('perawat', nurses);
}

// HOSPITAL SETTINGS (system_data key "hospital_settings", admin write)
export async function saveHospitalSettingsCloud(settings: any): Promise<void> {
  await saveSystemDataCloud('hospital_settings', settings);
}
