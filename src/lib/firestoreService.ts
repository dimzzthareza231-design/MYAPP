import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  writeBatch
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import { Pasien, Kunjungan, MasterDokter, MasterPerawat } from '../types';
import { logDatabaseAccess } from './activityLogger';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 1. Connection Validation as mandated by Firebase Skill
export async function testConnection(): Promise<boolean> {
  if (!isFirebaseConfigured || !db) {
    setCloudStatus({ isConnected: false });
    return false;
  }
  const start = performance.now();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    const latency = Math.round(performance.now() - start);
    setCloudStatus({ isConnected: true, lastSync: new Date() });
    logDatabaseAccess({
      action: 'HEALTH_CHECK',
      collectionName: 'test',
      docId: 'connection',
      operationType: 'READ',
      status: 'SUCCESS',
      latencyMs: latency,
      message: 'Cloud Firestore database connection verified.'
    });
    return true;
  } catch (error: any) {
    const latency = Math.round(performance.now() - start);
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firestore] Client is offline. Using local cache.');
      setCloudStatus({ isConnected: false });
      logDatabaseAccess({
        action: 'HEALTH_CHECK',
        collectionName: 'test',
        docId: 'connection',
        operationType: 'READ',
        status: 'WARNING',
        latencyMs: latency,
        message: 'Client is offline. Operating in offline cached mode.'
      });
      return false;
    }
    // Any other response (including document not found) confirms server connectivity
    setCloudStatus({ isConnected: true, lastSync: new Date() });
    logDatabaseAccess({
      action: 'HEALTH_CHECK',
      collectionName: 'test',
      docId: 'connection',
      operationType: 'READ',
      status: 'SUCCESS',
      latencyMs: latency,
      message: 'Cloud Firestore database server reachable.'
    });
    return true;
  }
}

// Auto-run connection check
if (typeof window !== 'undefined') {
  setTimeout(() => {
    testConnection().catch(() => {});
  }, 1000);
}

// 2. Cloud Status Management
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

// 3. Generic System Data Cloud Persistence (system_data/{key})
// Replaces physical localStorage completely for all module datasets!
const writeDebounceTimers = new Map<string, any>();
const storageMode = import.meta.env.VITE_STORAGE_MODE || 'firebase';
if (!['mysql', 'firebase', 'hybrid', 'memory', 'd1', 'firestore'].includes(storageMode)) {
  throw new Error(`Unsupported VITE_STORAGE_MODE: ${storageMode}.`);
}
const isCoreApp = import.meta.env.VITE_APP_TARGET !== 'public';
export const usesServerPersistence = isCoreApp && storageMode !== 'firebase';
const useServerPersistence = usesServerPersistence;

async function callCoreApi<T>(path: string, method: 'GET' | 'POST' | 'PATCH', data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Storage-Mode': storageMode
    },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || payload?.code || `Core API request failed (${response.status}).`);
  }
  return payload as T;
}

function mapApiPatient(value: any): Pasien {
  return {
    id: value.id,
    no_rm: value.no_rm || '',
    nik: value.nik || '',
    nama: value.nama || '',
    tanggal_lahir: value.tanggal_lahir || '',
    tgl_lahir: value.tanggal_lahir || '',
    jenis_kelamin: value.jenis_kelamin || 'L',
    alamat: value.alamat || '',
    telepon: value.no_hp || '',
    no_hp: value.no_hp || '',
    golongan_darah: value.golongan_darah || '',
    penjamin: value.penjamin || 'Umum',
    status: value.status || 'Aktif',
    alergi: value.alergi || [],
    keluhan_utama: value.keluhan_utama || '',
    diagnosa_primer: value.diagnosa_primer || ''
  };
}

async function callSystemDataApi(key: string, method: 'GET' | 'PUT', data?: string): Promise<any> {
  const response = await fetch(`/api/v1/system-data/${encodeURIComponent(key)}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'PUT'
      ? { 'Content-Type': 'application/json', 'X-Storage-Mode': storageMode }
      : { 'X-Storage-Mode': storageMode },
    body: method === 'PUT' ? JSON.stringify({ data }) : undefined
  });
  if (response.status === 404 && method === 'GET') return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.code || `System data request failed with status ${response.status}.`);
  }
  return body;
}

export async function saveSystemDataCloud(key: string, data: any): Promise<void> {
  if (!key) return;
  if (useServerPersistence) {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > 900000) {
      throw new Error('System data payload exceeds the 900 KB limit.');
    }
    await callSystemDataApi(key, 'PUT', serialized);
    setCloudStatus({ lastSync: new Date(), syncedKeysCount: currentCloudStatus.syncedKeysCount + 1 });
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;

  setCloudStatus({ isSyncing: true, pendingWrites: currentCloudStatus.pendingWrites + 1 });

  // Debounce writes to prevent Firestore write rate thrashing
  if (writeDebounceTimers.has(key)) {
    clearTimeout(writeDebounceTimers.get(key));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      writeDebounceTimers.delete(key);
      const path = `system_data/${key}`;
      try {
        const serialized = typeof data === 'string' ? data : JSON.stringify(data);
        const payload = {
          key: String(key).slice(0, 128),
          data: serialized.slice(0, 900000),
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'system_data', key), payload, { merge: true });
        setCloudStatus({
          isSyncing: false,
          pendingWrites: Math.max(0, currentCloudStatus.pendingWrites - 1),
          lastSync: new Date(),
          syncedKeysCount: currentCloudStatus.syncedKeysCount + 1
        });
        resolve();
      } catch (err) {
        setCloudStatus({
          isSyncing: false,
          pendingWrites: Math.max(0, currentCloudStatus.pendingWrites - 1)
        });
        try {
          handleFirestoreError(err, OperationType.WRITE, path);
        } catch (wrappedErr) {
          reject(wrappedErr);
        }
      }
    }, 400);

    writeDebounceTimers.set(key, timer);
  });
}

export async function getSystemDataCloud(key: string): Promise<any | null> {
  if (!key) return null;
  if (useServerPersistence) {
    const record = await callSystemDataApi(key, 'GET');
    if (!record || typeof record.data !== 'string') return null;
    try {
      return JSON.parse(record.data);
    } catch {
      return record.data;
    }
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return null;
  const path = `system_data/${key}`;
  try {
    const snap = await getDoc(doc(db, 'system_data', key));
    if (snap.exists()) {
      const val = snap.data()?.data;
      if (!val) return null;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeSystemData(key: string, onData: (data: any) => void): () => void {
  if (!key || !auth?.currentUser) return () => {};
  if (useServerPersistence) {
    let active = true;
    const poll = async () => {
      try {
        const value = await getSystemDataCloud(key);
        if (active && value !== null) onData(value);
      } catch (error) {
        console.warn('[Persistence] System data refresh failed:', error);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }
  if (!isFirebaseConfigured || !db) return () => {};
  const path = `system_data/${key}`;
  try {
    return onSnapshot(doc(db, 'system_data', key), (snap) => {
      if (snap.exists()) {
        const val = snap.data()?.data;
        if (val !== undefined && val !== null) {
          try {
            onData(JSON.parse(val));
          } catch {
            onData(val);
          }
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

// 4. Clinical Collections (Pasien, Kunjungan, Dokter, Perawat, Settings)

// PASIEN
export async function savePasienCloud(p: Pasien): Promise<Pasien | null> {
  if (useServerPersistence) {
    const result = await callCoreApi<{ data: any }>('/api/v1/patients', 'POST', {
      nik: p.nik,
      nama: p.nama,
      tanggal_lahir: p.tanggal_lahir || p.tgl_lahir || '',
      jenis_kelamin: p.jenis_kelamin,
      alamat: p.alamat || '',
      no_hp: p.no_hp || p.telepon || '',
      golongan_darah: p.golongan_darah || '',
      penjamin: p.penjamin || 'Umum',
      alergi: Array.isArray(p.alergi) ? p.alergi : []
    });
    setCloudStatus({ lastSync: new Date() });
    return mapApiPatient(result.data);
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return null;
  const path = `pasien/${p.id}`;
  try {
    await setDoc(doc(db, 'pasien', String(p.id)), {
      ...p,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    setCloudStatus({ lastSync: new Date() });
    return p;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updatePasienCloud(id: string, updates: Partial<Pasien>): Promise<Pasien | null> {
  if (useServerPersistence) {
    const result = await callCoreApi<{ data: any }>(`/api/v1/patients/${encodeURIComponent(id)}`, 'PATCH', updates);
    setCloudStatus({ lastSync: new Date() });
    return mapApiPatient(result.data);
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return null;
  const path = `pasien/${id}`;
  try {
    await updateDoc(doc(db, 'pasien', String(id)), {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    setCloudStatus({ lastSync: new Date() });
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function batchSeedPasienCloud(patients: Pasien[]): Promise<void> {
  if (useServerPersistence) {
    throw new Error('Bulk patient seeding is disabled for server persistence; patients must be registered through the patient API.');
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  try {
    const chunks: Pasien[][] = [];
    for (let i = 0; i < patients.length; i += 100) {
      chunks.push(patients.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(p => {
        const ref = doc(db, 'pasien', String(p.id));
        batch.set(ref, { ...p, updatedAt: new Date().toISOString() }, { merge: true });
      });
      await batch.commit();
    }
    console.info(`[Firestore] Successfully seeded ${patients.length} patients to cloud Firestore.`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'pasien');
  }
}

// KUNJUNGAN
export async function saveKunjunganCloud(k: Kunjungan): Promise<Kunjungan | null> {
  if (useServerPersistence) {
    const result = await callCoreApi<{ data: any }>('/api/v1/appointments', 'POST', {
      pasien_id: k.pasien_id,
      poli: k.poli_id,
      dokter: k.dokter_id,
      tanggal: k.tanggal,
      tipe: k.tipe
    });
    setCloudStatus({ lastSync: new Date() });
    return {
      ...k,
      id: result.data.id,
      pasien_id: result.data.pasien_id,
      tanggal: result.data.tanggal,
      poli_id: result.data.poli,
      dokter_id: result.data.dokter,
      status: result.data.status === 'Dibatalkan' ? 'Batal' : result.data.status,
      nomor_antrian: result.data.nomor_antrian
    };
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return null;
  const path = `kunjungan/${k.id}`;
  try {
    await setDoc(doc(db, 'kunjungan', String(k.id)), {
      ...k,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    setCloudStatus({ lastSync: new Date() });
    return k;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateKunjunganCloud(id: string, updates: Partial<Kunjungan>): Promise<void> {
  if (useServerPersistence) {
    await callCoreApi<{ data: unknown }>(`/api/v1/appointments/${encodeURIComponent(id)}`, 'PATCH', {
      status: updates.status
    });
    setCloudStatus({ lastSync: new Date() });
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  const path = `kunjungan/${id}`;
  try {
    await updateDoc(doc(db, 'kunjungan', String(id)), {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    setCloudStatus({ lastSync: new Date() });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function batchSeedKunjunganCloud(visits: Kunjungan[]): Promise<void> {
  if (useServerPersistence) {
    throw new Error('Bulk appointment seeding is disabled for server persistence; appointments must be created through the appointment API.');
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  try {
    const chunks: Kunjungan[][] = [];
    for (let i = 0; i < visits.length; i += 100) {
      chunks.push(visits.slice(i, i + 100));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(k => {
        const ref = doc(db, 'kunjungan', String(k.id));
        batch.set(ref, { ...k, updatedAt: new Date().toISOString() }, { merge: true });
      });
      await batch.commit();
    }
    console.info(`[Firestore] Successfully seeded ${visits.length} visits to cloud Firestore.`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'kunjungan');
  }
}

// DOKTER
export async function saveDokterCloud(d: MasterDokter): Promise<void> {
  if (useServerPersistence) {
    const current = await getSystemDataCloud('hospital_dokter');
    const doctors = Array.isArray(current) ? current as MasterDokter[] : [];
    await saveSystemDataCloud('hospital_dokter', [d, ...doctors.filter((item) => item.id !== d.id)]);
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  const path = `dokter/${d.id}`;
  try {
    await setDoc(doc(db, 'dokter', String(d.id)), {
      ...d,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    setCloudStatus({ lastSync: new Date() });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function batchSeedDokterCloud(doctors: MasterDokter[]): Promise<void> {
  if (useServerPersistence) {
    await saveSystemDataCloud('hospital_dokter', doctors);
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  try {
    const batch = writeBatch(db);
    doctors.forEach(d => {
      const ref = doc(db, 'dokter', String(d.id));
      batch.set(ref, { ...d, updatedAt: new Date().toISOString() }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'dokter');
  }
}

// PERAWAT
export async function savePerawatCloud(n: MasterPerawat): Promise<void> {
  if (useServerPersistence) {
    const current = await getSystemDataCloud('hospital_perawat');
    const nurses = Array.isArray(current) ? current as MasterPerawat[] : [];
    await saveSystemDataCloud('hospital_perawat', [n, ...nurses.filter((item) => item.id !== n.id)]);
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  const path = `perawat/${n.id}`;
  try {
    await setDoc(doc(db, 'perawat', String(n.id)), {
      ...n,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    setCloudStatus({ lastSync: new Date() });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function batchSeedPerawatCloud(nurses: MasterPerawat[]): Promise<void> {
  if (useServerPersistence) {
    await saveSystemDataCloud('hospital_perawat', nurses);
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  try {
    const batch = writeBatch(db);
    nurses.forEach(n => {
      const ref = doc(db, 'perawat', String(n.id));
      batch.set(ref, { ...n, updatedAt: new Date().toISOString() }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'perawat');
  }
}

// HOSPITAL SETTINGS
export async function saveHospitalSettingsCloud(settings: any): Promise<void> {
  if (useServerPersistence) {
    await saveSystemDataCloud('hospital_settings', settings);
    return;
  }
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  const path = 'hospital_settings/main';
  try {
    await setDoc(doc(db, 'hospital_settings', 'main'), {
      ...settings,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    setCloudStatus({ lastSync: new Date() });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
