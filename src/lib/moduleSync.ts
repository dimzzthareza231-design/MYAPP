// Sinkron data modul (billing, farmasi, dossier RME, lab, ...) yang disimpan komponen di localStorage ke server,
// supaya semua PC melihat data yang sama. Dipasang di Storage.setItem karena ~80 komponen menulis localStorage langsung.
// shortcut: per kunci, simpanan terakhir menang; modul yang butuh kontrol konflik perlu API sendiri.
const SYNCED_KEY = /^(hospital_|simrs_|klinik_|bpjs_|myitaru_igd_)/;
const VERSIONS_KEY = 'hospital_sync_versions';
const CLINICAL_VERSIONS_KEY = 'hospital_clinical_record_versions';
const CLINICAL_KEYS: Record<string, string> = {
  hospital_finance_billings: 'billings',
  hospital_pharmacy_prescriptions: 'prescriptions',
  simrs_lab_orders: 'lab-orders',
  simrs_rad_orders: 'radiology-orders',
  hospital_emergency_triage: 'emergency-visits'
};
// Sudah punya API sendiri, data per pengguna, atau preferensi tampilan.
const EXCLUDED = new Set([
  VERSIONS_KEY, CLINICAL_VERSIONS_KEY, 'hospital_pasien', 'hospital_kunjungan', 'hospital_dokter', 'hospital_perawat', 'hospital_settings',
  'hospital_poli_master', 'simrs_theme', 'hospital_theme', 'simrs_registration_draft'
]);
const MAX_BYTES = 900_000;

export const isSyncedKey = (key: string) => SYNCED_KEY.test(key) && !EXCLUDED.has(key);
const clinicalCollectionForKey = (key: string) => CLINICAL_KEYS[key];

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Set<string>();
const conflicted = new Set<string>();
const clinicalConflicted = new Set<string>();
let active = false;
let installed = false;
let pollTimer: ReturnType<typeof setInterval> | undefined;

const url = (key: string) => `/api/v1/module-data/${encodeURIComponent(key)}`;

function readVersions(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VERSIONS_KEY) || '{}'); } catch { return {}; }
}
function writeVersions(versions: Record<string, string>) {
  originalSetItem.call(localStorage, VERSIONS_KEY, JSON.stringify(versions));
}

type ClinicalVersions = Record<string, Record<string, string>>;
type ClinicalRecord = { id: string | number; [key: string]: unknown };

function readClinicalVersions(): ClinicalVersions {
  try { return JSON.parse(localStorage.getItem(CLINICAL_VERSIONS_KEY) || '{}'); } catch { return {}; }
}

function writeClinicalVersions(versions: ClinicalVersions) {
  originalSetItem.call(localStorage, CLINICAL_VERSIONS_KEY, JSON.stringify(versions));
}

function clinicalUrl(collection: string, id?: string | number) {
  return `/api/v1/clinical-records/${collection}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`;
}

async function fetchClinicalCollection(collection: string) {
  const records: Array<{ id: string; data: ClinicalRecord; version: string }> = [];
  let page = 1;
  let hasMore = true;
  do {
    const response = await fetch(`${clinicalUrl(collection)}?page=${page}&limit=100`, { credentials: 'same-origin' });
    if (!response.ok) return response;
    const result = await response.json() as {
      data?: Array<{ id: string; data: ClinicalRecord; version: string }>;
      totalPages?: number | null;
      hasMore?: boolean;
    };
    records.push(...(result.data || []));
    hasMore = typeof result.totalPages === 'number'
      ? page < result.totalPages
      : Boolean(result.hasMore);
    page += 1;
  } while (hasMore);
  return records;
}

async function pushClinicalRecords(key: string): Promise<void> {
  if (clinicalConflicted.has(key)) return;
  const collection = clinicalCollectionForKey(key);
  if (!collection) return;
  const raw = localStorage.getItem(key);
  let records: ClinicalRecord[] = [];
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn(`[ModuleSync] ${key} bukan daftar record; perubahan tidak disimpan.`);
        return;
      }
      const validRecords = parsed.filter((record): record is ClinicalRecord =>
        record !== null && typeof record === 'object' && !Array.isArray(record) &&
        (typeof record.id === 'string' || typeof record.id === 'number')
      );
      if (validRecords.length !== parsed.length) {
        console.warn(`[ModuleSync] ${key} memiliki record tanpa ID; perubahan tidak disimpan.`);
        return;
      }
      records = validRecords;
    } catch (error) {
      console.warn(`[ModuleSync] ${key} berisi JSON tidak valid.`, error);
      return;
    }
  }

  const versions = readClinicalVersions();
  const collectionVersions = versions[collection] || {};
  versions[collection] = collectionVersions;
  const currentIds = new Set(records.map((record) => String(record.id)));
  for (const record of records) {
    const id = String(record.id);
    const version = collectionVersions[id];
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
      continue;
    }
    const result = await response.json() as { version: string };
    collectionVersions[id] = result.version;
    writeClinicalVersions(versions);
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
  versions[collection] = collectionVersions;
  writeClinicalVersions(versions);
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
      const conflict = await response.json() as { version?: string | null };
      if (conflict.version) {
        versions[key] = conflict.version;
        writeVersions(versions);
        } else {
          delete versions[key];
          writeVersions(versions);
      }
        conflicted.add(key);
      window.dispatchEvent(new CustomEvent('module-data-conflict', { detail: { key } }));
      console.warn(`[ModuleSync] ${key} berubah di server; perubahan lokal belum disimpan.`);
      return;
    }
    if (!response.ok) {
      console.warn(`[ModuleSync] ${key} gagal disimpan ke server (HTTP ${response.status}).`);
      return;
    }
    const body = await response.json() as { version?: string; updatedAt?: string };
    if (value === null || !body.version) delete versions[key];
    else versions[key] = body.version;
    writeVersions(versions);
  } finally {
    pending.delete(key);
  }
}

function schedule(key: string) {
  pending.add(key);
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => void push(key).catch((error) => console.warn('[ModuleSync]', error)), 1500));
}

function install() {
  if (installed) return;
  installed = true;
  Storage.prototype.setItem = function setItem(this: Storage, key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (active && this === localStorage && isSyncedKey(key)) {
      conflicted.delete(key);
      schedule(key);
    }
  };
  Storage.prototype.removeItem = function removeItem(this: Storage, key: string) {
    originalRemoveItem.call(this, key);
    if (active && this === localStorage && isSyncedKey(key)) {
      conflicted.delete(key);
      schedule(key);
    }
  };
}

export async function pullModuleData(): Promise<void> {
  let clinicalUpdated = false;
  const clinicalVersions = readClinicalVersions();
  for (const [key, collection] of Object.entries(CLINICAL_KEYS)) {
    if (pending.has(key) || clinicalConflicted.has(key)) continue;
    const result = await fetchClinicalCollection(collection);
    if (!Array.isArray(result)) {
      if (result.status !== 401 && result.status !== 403) {
        console.warn(`[ModuleSync] Gagal membaca ${collection} (HTTP ${result.status}).`);
      }
      continue;
    }
    const existing = localStorage.getItem(key);
    if (result.length === 0 && existing !== null) {
      schedule(key);
      continue;
    }
    const nextRecords = result.map(({ data }) => data);
    const nextVersions = Object.fromEntries(result.map(({ id, version }) => [id, version]));
    const isChanged = existing !== JSON.stringify(nextRecords);
    if (isChanged) {
      originalSetItem.call(localStorage, key, JSON.stringify(nextRecords));
      clinicalUpdated = true;
    }
    clinicalVersions[collection] = nextVersions;
  }
  writeClinicalVersions(clinicalVersions);

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
  clinicalConflicted.clear();
  active = false;
}
