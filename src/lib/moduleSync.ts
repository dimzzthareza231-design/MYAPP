// Sinkron data modul (billing, farmasi, dossier RME, lab, ...) yang disimpan komponen di localStorage ke server,
// supaya semua PC melihat data yang sama. Dipasang di Storage.setItem karena ~80 komponen menulis localStorage langsung.
// shortcut: per kunci, simpanan terakhir menang; modul yang butuh kontrol konflik perlu API sendiri.
const SYNCED_KEY = /^(hospital_|simrs_|klinik_|bpjs_|myitaru_igd_)/;
const VERSIONS_KEY = 'hospital_sync_versions';
const CLINICAL_VERSIONS_KEY = 'hospital_clinical_record_versions';
const CLINICAL_COLLECTION_VERSIONS_KEY = 'hospital_clinical_collection_versions';
const CLINICAL_DEFERRED_KEY = 'hospital_clinical_record_deferred';
const CLINICAL_INITIALIZED_KEY = 'hospital_clinical_sync_initialized';
const CLINICAL_KEYS: Record<string, string> = {
  hospital_finance_billings: 'billings',
  hospital_pharmacy_prescriptions: 'prescriptions',
  simrs_lab_orders: 'lab-orders',
  simrs_rad_orders: 'radiology-orders',
  hospital_emergency_triage: 'emergency-visits'
};
// Sudah punya API sendiri, data per pengguna, atau preferensi tampilan.
const EXCLUDED = new Set([
  VERSIONS_KEY, CLINICAL_VERSIONS_KEY, CLINICAL_COLLECTION_VERSIONS_KEY, CLINICAL_DEFERRED_KEY, CLINICAL_INITIALIZED_KEY, 'hospital_pasien', 'hospital_kunjungan', 'hospital_dokter', 'hospital_perawat', 'hospital_settings',
  'hospital_poli_master', 'simrs_theme', 'hospital_theme', 'simrs_registration_draft'
]);
const MAX_BYTES = 900_000;

export const isSyncedKey = (key: string) =>
  SYNCED_KEY.test(key) &&
  !EXCLUDED.has(key) &&
  !key.startsWith('hospital_module_conflict_') &&
  !/^bpjs_|^simrs_bpjs_/i.test(key) &&
  !(key.startsWith('hospital_pharmacy_') && key !== 'hospital_pharmacy_prescriptions') &&
  !/_config$/i.test(key);
const clinicalCollectionForKey = (key: string) => CLINICAL_KEYS[key];

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Set<string>();
const conflicted = new Set<string>();
const conflictServerValues = new Map<string, string | null>();
const retryCounts = new Map<string, number>();
const clinicalConflicted = new Set<string>();
let active = false;
let installed = false;
let pollTimer: ReturnType<typeof setInterval> | undefined;

const url = (key: string) => `/api/v1/module-data/${encodeURIComponent(key)}`;
const conflictDraftKey = (key: string) => `hospital_module_conflict_${key}`;

function emitModuleConflict(key: string, draftKey?: string, draftPreserved = false) {
  window.dispatchEvent(new CustomEvent('module-data-conflict', { detail: { key, draftKey, draftPreserved } }));
}

async function reloadModuleAfterConflict(key: string): Promise<void> {
  const response = await fetch(url(key), { credentials: 'same-origin' });
  if (!response.ok && response.status !== 404) throw new Error(`Conflict refresh failed (HTTP ${response.status}).`);
  const remote = response.ok
    ? await response.json() as { data: string; version?: string; updatedAt?: string }
    : null;
  const remoteValue = remote?.data ?? null;
  const draftKey = conflictDraftKey(key);
  const currentLocalValue = localStorage.getItem(key);
  let draftPreserved = false;
  try {
    if (currentLocalValue !== remoteValue) {
      originalSetItem.call(localStorage, draftKey, currentLocalValue === null
        ? JSON.stringify({ deleteRequested: true })
        : currentLocalValue);
      draftPreserved = true;
    }
  } catch (error) {
    console.error(`[ModuleSync] Could not preserve conflicting local data for ${key}.`, error);
    throw error;
  }
  if (remoteValue === null) originalRemoveItem.call(localStorage, key);
  else originalSetItem.call(localStorage, key, remoteValue);
  const versions = readVersions();
  if (remote?.version || remote?.updatedAt) versions[key] = remote.version || remote.updatedAt!;
  else delete versions[key];
  writeVersions(versions);
  conflictServerValues.set(key, remoteValue);
  conflicted.add(key);
  emitModuleConflict(key, draftPreserved ? draftKey : undefined, draftPreserved);
}

function readVersions(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VERSIONS_KEY) || '{}'); } catch { return {}; }
}
function writeVersions(versions: Record<string, string>) {
  originalSetItem.call(localStorage, VERSIONS_KEY, JSON.stringify(versions));
}

type ClinicalVersions = Record<string, Record<string, string>>;
type ClinicalCollectionVersions = Record<string, string>;
type DeferredClinicalRecords = Record<string, Record<string, string>>;
type ClinicalRecord = { id: string | number; [key: string]: unknown };

function readClinicalVersions(): ClinicalVersions {
  try { return JSON.parse(localStorage.getItem(CLINICAL_VERSIONS_KEY) || '{}'); } catch { return {}; }
}

function writeClinicalVersions(versions: ClinicalVersions) {
  originalSetItem.call(localStorage, CLINICAL_VERSIONS_KEY, JSON.stringify(versions));
}

function readClinicalCollectionVersions(): ClinicalCollectionVersions {
  try { return JSON.parse(localStorage.getItem(CLINICAL_COLLECTION_VERSIONS_KEY) || '{}'); } catch { return {}; }
}

function writeClinicalCollectionVersions(versions: ClinicalCollectionVersions) {
  originalSetItem.call(localStorage, CLINICAL_COLLECTION_VERSIONS_KEY, JSON.stringify(versions));
}

function readDeferredClinicalRecords(): DeferredClinicalRecords {
  try { return JSON.parse(localStorage.getItem(CLINICAL_DEFERRED_KEY) || '{}'); } catch { return {}; }
}

function writeDeferredClinicalRecords(records: DeferredClinicalRecords) {
  originalSetItem.call(localStorage, CLINICAL_DEFERRED_KEY, JSON.stringify(records));
}

function readInitializedClinicalCollections(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CLINICAL_INITIALIZED_KEY) || '{}'); } catch { return {}; }
}

function writeInitializedClinicalCollections(collections: Record<string, boolean>) {
  originalSetItem.call(localStorage, CLINICAL_INITIALIZED_KEY, JSON.stringify(collections));
}

async function clinicalRecordFingerprint(record: ClinicalRecord): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseClinicalRecords(key: string, raw: string | null): ClinicalRecord[] | null {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const records = parsed.filter((record): record is ClinicalRecord =>
      record !== null && typeof record === 'object' && !Array.isArray(record) &&
      (typeof record.id === 'string' || typeof record.id === 'number')
    );
    if (records.length !== parsed.length) return null;
    return records;
  } catch (error) {
    console.warn(`[ModuleSync] ${key} berisi JSON tidak valid.`, error);
    return null;
  }
}

function clinicalUrl(collection: string, id?: string | number) {
  return `/api/v1/clinical-records/${collection}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`;
}

async function fetchClinicalCollection(collection: string, knownVersion?: string) {
  const records: Array<{ id: string; data: ClinicalRecord; version: string }> = [];
  const deletedIds: string[] = [];
  let collectionVersion: string | undefined;
  let page = 1;
  let hasMore = true;
  do {
    const response = await fetch(`${clinicalUrl(collection)}?page=${page}&limit=100`, {
      credentials: 'same-origin',
      headers: page === 1 && knownVersion ? { 'If-None-Match': `"${knownVersion}"` } : undefined
    });
    if (page === 1 && response.status === 304) {
      return { notModified: true, records: [], version: knownVersion };
    }
    if (!response.ok) return response;
    const result = await response.json() as {
      data?: Array<{ id: string; data: ClinicalRecord; version: string }>;
      totalPages?: number | null;
      hasMore?: boolean;
      collectionVersion?: string;
      deletedIds?: string[];
    };
    if (page === 1) collectionVersion = result.collectionVersion;
    for (const record of result.data || []) {
      if (typeof record.data.deletedAt === 'string') deletedIds.push(record.id);
      else records.push(record);
    }
    deletedIds.push(...(result.deletedIds || []));
    hasMore = typeof result.totalPages === 'number'
      ? page < result.totalPages
      : Boolean(result.hasMore);
    page += 1;
  } while (hasMore);
  return { notModified: false, records, deletedIds, version: collectionVersion };
}

async function pushClinicalRecords(key: string): Promise<void> {
  if (clinicalConflicted.has(key)) return;
  let retryableFailure = false;
  const collection = clinicalCollectionForKey(key);
  if (!collection) return;
  const raw = localStorage.getItem(key);
  const records = parseClinicalRecords(key, raw);
  if (!records) {
    console.warn(`[ModuleSync] ${key} bukan daftar record dengan ID; perubahan tidak disimpan.`);
    return;
  }

  const versions = readClinicalVersions();
  const collectionVersions = versions[collection] || {};
  versions[collection] = collectionVersions;
  const deferred = readDeferredClinicalRecords();
  const deferredCollection = deferred[collection] || {};
  deferred[collection] = deferredCollection;
  const currentIds = new Set(records.map((record) => String(record.id)));
  for (const record of records) {
    const id = String(record.id);
    const version = collectionVersions[id];
    if (!version && deferredCollection[id] === await clinicalRecordFingerprint(record)) continue;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (version) headers['If-Match'] = `"${version}"`;
    else headers['If-None-Match'] = '*';
    const response = await fetch(clinicalUrl(collection, id), {
      method: 'PUT',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ data: record })
    });
    if (response.status === 412) {
      const conflict = await response.json() as { version?: string };
      if (conflict.version) collectionVersions[id] = conflict.version;
      versions[collection] = collectionVersions;
      writeClinicalVersions(versions);
      clinicalConflicted.add(key);
      window.dispatchEvent(new CustomEvent('module-data-conflict', { detail: { key, id } }));
      console.warn(`[ModuleSync] ${key}/${id} berubah di server; perubahan lokal belum disimpan.`);
      return;
    }
    if (!response.ok) {
      console.warn(`[ModuleSync] ${key}/${id} gagal disimpan (HTTP ${response.status}).`);
      if (response.status === 429 || response.status >= 500) {
        retryableFailure = true;
        scheduleRetry(key);
      }
      continue;
    }
    const result = await response.json() as { version: string; data?: ClinicalRecord };
    collectionVersions[id] = result.version;
    if (result.data && JSON.stringify(result.data) !== JSON.stringify(record)) {
      const currentRecords = parseClinicalRecords(key, localStorage.getItem(key));
      if (currentRecords) {
        const currentRecord = currentRecords.find((item) => String(item.id) === id);
        if (currentRecord && JSON.stringify(currentRecord) === JSON.stringify(record)) {
          originalSetItem.call(localStorage, key, JSON.stringify(currentRecords.map((item) =>
            String(item.id) === id ? result.data! : item
          )));
          window.dispatchEvent(new Event('simrs-interline-sync'));
        }
      }
    }
    delete deferredCollection[id];
    writeClinicalVersions(versions);
    writeDeferredClinicalRecords(deferred);
  }

  for (const [id, version] of Object.entries(collectionVersions)) {
    if (currentIds.has(id)) continue;
    const response = await fetch(clinicalUrl(collection, id), {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'If-Match': `"${version}"` }
    });
    if (response.ok || response.status === 404) {
      delete collectionVersions[id];
      writeClinicalVersions(versions);
    }
    else if (response.status === 412) {
      const conflict = await response.json() as { version?: string };
      if (conflict.version) collectionVersions[id] = conflict.version;
      writeClinicalVersions(versions);
      clinicalConflicted.add(key);
      window.dispatchEvent(new CustomEvent('module-data-conflict', { detail: { key, id } }));
      console.warn(`[ModuleSync] ${key}/${id} berubah di server; penghapusan lokal belum diterapkan.`);
      break;
    } else {
      console.warn(`[ModuleSync] ${key}/${id} gagal dihapus (HTTP ${response.status}).`);
    }
  }
  for (const id of Object.keys(deferredCollection)) {
    if (!currentIds.has(id)) delete deferredCollection[id];
  }
  versions[collection] = collectionVersions;
  writeClinicalVersions(versions);
  writeDeferredClinicalRecords(deferred);
  if (!retryableFailure) retryCounts.delete(key);
}

async function push(key: string): Promise<void> {
  timers.delete(key);
  if (clinicalCollectionForKey(key)) {
    try {
      await pushClinicalRecords(key);
    } finally {
      pending.delete(key);
    }
    return;
  }
  const value = localStorage.getItem(key);
  try {
    if (value !== null && new Blob([value]).size > MAX_BYTES) {
      console.warn(`[ModuleSync] ${key} melebihi 900 KB; hanya tersimpan di browser ini.`);
      window.dispatchEvent(new CustomEvent('module-data-sync-error', {
        detail: { key, message: 'Data melebihi batas ukuran sinkronisasi; perubahan hanya ada di browser ini.' }
      }));
      return;
    }
    const versions = readVersions();
    const version = versions[key];
    const condition: Record<string, string> = version
      ? { 'If-Match': `"${version}"` }
      : { 'If-None-Match': '*' };
    const response = await fetch(url(key), value === null
      ? { method: 'DELETE', credentials: 'same-origin', headers: condition }
      : { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...condition }, body: JSON.stringify({ data: value }) });
    if (response.status === 412) {
      try {
        await reloadModuleAfterConflict(key);
      } catch (error) {
        const currentLocalValue = localStorage.getItem(key);
        try {
          originalSetItem.call(localStorage, conflictDraftKey(key), currentLocalValue ?? JSON.stringify({ deleteRequested: true }));
        } catch (preserveError) {
          console.error(`[ModuleSync] Could not preserve conflicting local data for ${key}.`, preserveError);
        }
        conflictServerValues.set(key, currentLocalValue);
        conflicted.add(key);
        console.warn(`[ModuleSync] ${key} berubah di server; refresh gagal dan perubahan lokal tetap diblokir.`, error);
        emitModuleConflict(key, conflictDraftKey(key), true);
      }
      console.warn(`[ModuleSync] ${key} berubah di server; perubahan lokal belum disimpan.`);
      return;
    }
    if (!response.ok) {
      console.warn(`[ModuleSync] ${key} gagal disimpan ke server (HTTP ${response.status}).`);
      window.dispatchEvent(new CustomEvent('module-data-sync-error', {
        detail: { key, message: `Gagal menyinkronkan data modul (HTTP ${response.status}).` }
      }));
      if (response.status === 429 || response.status >= 500) scheduleRetry(key);
      return;
    }
    const body = await response.json() as { version?: string; updatedAt?: string };
    if (value === null || !body.version) delete versions[key];
    else versions[key] = body.version;
    writeVersions(versions);
    retryCounts.delete(key);
  } finally {
    pending.delete(key);
  }
}

function schedule(key: string) {
  pending.add(key);
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => void push(key).catch((error) => {
    console.warn('[ModuleSync]', error);
    window.dispatchEvent(new CustomEvent('module-data-sync-error', {
      detail: { key, message: 'Gagal menyinkronkan data modul karena koneksi atau server bermasalah.' }
    }));
  }), 1500));
}

function scheduleRetry(key: string) {
  if (!active) return;
  const attempt = (retryCounts.get(key) || 0) + 1;
  retryCounts.set(key, attempt);
  clearTimeout(timers.get(key));
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5));
  timers.set(key, setTimeout(() => {
    if (!active) return;
    pending.add(key);
    void push(key).catch((error) => {
      console.warn('[ModuleSync]', error);
      window.dispatchEvent(new CustomEvent('module-data-sync-error', {
        detail: { key, message: 'Gagal menyinkronkan data modul karena koneksi atau server bermasalah.' }
      }));
      scheduleRetry(key);
    });
  }, delay));
}

function install() {
  if (installed) return;
  installed = true;
  Storage.prototype.setItem = function setItem(this: Storage, key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (active && this === localStorage && isSyncedKey(key)) {
      if (conflicted.has(key)) {
        try {
          originalSetItem.call(localStorage, conflictDraftKey(key), value);
          const serverValue = conflictServerValues.get(key);
          if (serverValue === null) originalRemoveItem.call(localStorage, key);
          else if (serverValue !== undefined) originalSetItem.call(localStorage, key, serverValue);
        } catch (error) {
          console.error(`[ModuleSync] Could not preserve the new conflicting edit for ${key}.`, error);
        }
        emitModuleConflict(key, conflictDraftKey(key), true);
        return;
      }
      conflicted.delete(key);
      schedule(key);
    }
  };
  Storage.prototype.removeItem = function removeItem(this: Storage, key: string) {
    originalRemoveItem.call(this, key);
    if (active && this === localStorage && isSyncedKey(key)) {
      if (conflicted.has(key)) {
        try {
          originalSetItem.call(localStorage, conflictDraftKey(key), JSON.stringify({ deleteRequested: true }));
          const serverValue = conflictServerValues.get(key);
          if (serverValue === null) originalRemoveItem.call(localStorage, key);
          else if (serverValue !== undefined) originalSetItem.call(localStorage, key, serverValue);
        } catch (error) {
          console.error(`[ModuleSync] Could not preserve the conflicting deletion for ${key}.`, error);
        }
        emitModuleConflict(key, conflictDraftKey(key), true);
        return;
      }
      conflicted.delete(key);
      schedule(key);
    }
  };
}

export async function pullModuleData(): Promise<void> {
  let clinicalUpdated = false;
  const clinicalVersions = readClinicalVersions();
  const clinicalCollectionVersions = readClinicalCollectionVersions();
  const deferred = readDeferredClinicalRecords();
  const initialized = readInitializedClinicalCollections();
  for (const [key, collection] of Object.entries(CLINICAL_KEYS)) {
    if (pending.has(key) || clinicalConflicted.has(key)) continue;
    const result = await fetchClinicalCollection(collection, clinicalCollectionVersions[collection]);
    if (result instanceof Response) {
      if (result.status !== 401 && result.status !== 403) {
        console.warn(`[ModuleSync] Gagal membaca ${collection} (HTTP ${result.status}).`);
      }
      continue;
    }
    if (result.notModified) continue;
    if (result.version) clinicalCollectionVersions[collection] = result.version;
    const records = result.records;
    const deletedIds = new Set(result.deletedIds);
    const existing = localStorage.getItem(key);
    const localRecords = parseClinicalRecords(key, existing);
    if (!localRecords) {
      console.warn(`[ModuleSync] ${key} tidak dapat dipakai sebagai daftar record.`);
      continue;
    }
    const firstPull = !initialized[collection];
    if (firstPull && records.length === 0 && existing !== null) {
      const deferredCollection = deferred[collection] || (deferred[collection] = {});
      for (const record of localRecords) {
        const id = String(record.id);
        if (!(id in deferredCollection)) deferredCollection[id] = await clinicalRecordFingerprint(record);
      }
      initialized[collection] = true;
      writeDeferredClinicalRecords(deferred);
      writeInitializedClinicalCollections(initialized);
      console.warn(`[ModuleSync] ${key} punya data lokal lama; tidak diunggah otomatis.`);
      continue;
    }
    const nextVersions = Object.fromEntries(records.map(({ id, version }) => [id, version]));
    const remoteIds = new Set(Object.keys(nextVersions));
    const deferredCollection = deferred[collection] || (deferred[collection] = {});
    const localById = new Map(localRecords
      .filter((record) => !deletedIds.has(String(record.id)))
      .map((record) => [String(record.id), record]));
    const nextRecords = records.map(({ data }) => data);
    let hasPendingLocalRecord = false;
    for (const [id, record] of localById) {
      if (remoteIds.has(id)) {
        delete deferredCollection[id];
      } else {
        if (firstPull && !(id in deferredCollection)) deferredCollection[id] = await clinicalRecordFingerprint(record);
        else if (!(id in deferredCollection)) hasPendingLocalRecord = true;
        nextRecords.push(record);
      }
    }
    initialized[collection] = true;
    const isChanged = existing !== JSON.stringify(nextRecords);
    if (isChanged) {
      originalSetItem.call(localStorage, key, JSON.stringify(nextRecords));
      clinicalUpdated = true;
    }
    clinicalVersions[collection] = nextVersions;
    if (hasPendingLocalRecord) schedule(key);
  }
  writeClinicalVersions(clinicalVersions);
  writeClinicalCollectionVersions(clinicalCollectionVersions);
  writeDeferredClinicalRecords(deferred);
  writeInitializedClinicalCollections(initialized);

  const response = await fetch('/api/v1/module-data', { credentials: 'same-origin' });
  if (!response.ok) return;
  const { index = {} } = await response.json() as { index?: Record<string, string> };
  const versions = readVersions();
  const changed = Object.entries(index).filter(([key, version]) => isSyncedKey(key) && !clinicalCollectionForKey(key) && versions[key] !== version && !pending.has(key) && !conflicted.has(key));
  // Satu request per 20 kunci (bukan satu per kunci): login di browser baru turun dari ~5 detik.
  const batches = Array.from({ length: Math.ceil(changed.length / 20) }, (_, i) => changed.slice(i * 20, i * 20 + 20).map(([key]) => key));
  await Promise.all(batches.map(async (keys) => {
    const batch = await fetch(`/api/v1/module-data?keys=${keys.map(encodeURIComponent).join(',')}`, { credentials: 'same-origin' });
    if (!batch.ok) return;
    const { records = {} } = await batch.json() as { records?: Record<string, { data: string; updatedAt: string; version?: string }> };
    for (const [key, record] of Object.entries(records)) {
      originalSetItem.call(localStorage, key, record.data);
      versions[key] = record.version || record.updatedAt;
    }
  }));
  for (const key of Object.keys(localStorage)) {
    if (!isSyncedKey(key) || clinicalCollectionForKey(key) || key in index || pending.has(key) || conflicted.has(key)) continue;
    if (versions[key]) {
      // Pernah tersinkron lalu dihapus di PC lain.
      originalRemoveItem.call(localStorage, key);
      delete versions[key];
    } else {
      // Data lama yang hanya ada di browser ini: unggah sekali.
      schedule(key);
    }
  }
  writeVersions(versions);
  if (changed.length) window.dispatchEvent(new Event('module-data-synced'));
  if (clinicalUpdated) {
    window.dispatchEvent(new Event('module-data-synced'));
    window.dispatchEvent(new CustomEvent('simrs-interline-sync', { detail: { action: 'CLINICAL_RECORDS_SYNCED' } }));
  }
}

export async function startModuleSync(): Promise<void> {
  install();
  active = true;
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!document.hidden) void pullModuleData().catch((error) => console.warn('[ModuleSync]', error));
  }, 30_000);
  await pullModuleData().catch((error) => console.warn('[ModuleSync]', error));
}

/** Kirim perubahan yang belum terkirim lalu berhenti; panggil sebelum cache browser dihapus saat logout. */
export async function stopModuleSync(flush: boolean): Promise<void> {
  clearInterval(pollTimer);
  const keys = [...pending];
  for (const key of keys) clearTimeout(timers.get(key));
  if (flush) await Promise.all(keys.map((key) => push(key).catch(() => undefined)));
  pending.clear();
  conflicted.clear();
  conflictServerValues.clear();
  retryCounts.clear();
  clinicalConflicted.clear();
  active = false;
}
