// Sinkron data modul (billing, farmasi, dossier RME, lab, ...) yang disimpan komponen di localStorage ke server,
// supaya semua PC melihat data yang sama. Dipasang di Storage.setItem karena ~80 komponen menulis localStorage langsung.
// Tiap kunci disimpan sebagai satu baris system-data (/api/v1/system-data/:key) dengan compare-and-swap { value, version }.
// shortcut: billing/resep/lab/radiologi/IGD tersinkron per kunci utuh (bukan per record); pindah ke API record bila konflik antar-PC sering.
const SYNCED_KEY = /^(hospital_|simrs_|klinik_|bpjs_|myitaru_igd_)/;
const VERSIONS_KEY = 'hospital_sync_versions';
// Sudah punya API sendiri, data per pengguna, atau preferensi tampilan.
const EXCLUDED = new Set([
  VERSIONS_KEY, 'hospital_pasien', 'hospital_kunjungan', 'hospital_dokter', 'hospital_perawat', 'hospital_settings',
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

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Set<string>();
const conflicted = new Set<string>();
const conflictServerValues = new Map<string, string | null>();
const retryCounts = new Map<string, number>();
let active = false;
let installed = false;
let pollTimer: ReturnType<typeof setInterval> | undefined;

const url = (key: string) => `/api/v1/system-data/${encodeURIComponent(key)}`;
const conflictDraftKey = (key: string) => `hospital_module_conflict_${key}`;

type SystemDataRow = { key: string; value: unknown; version: number };

// localStorage holds strings; the server row holds that string as its value. null = deleted.
const toLocal = (value: unknown): string | null =>
  value === null || value === undefined ? null : typeof value === 'string' ? value : JSON.stringify(value);

function emitModuleConflict(key: string, draftKey?: string, draftPreserved = false) {
  window.dispatchEvent(new CustomEvent('module-data-conflict', { detail: { key, draftKey, draftPreserved } }));
}

// 409: another PC saved first. Keep the local edit as a draft, load the server copy, block further writes to the key.
function applyConflict(key: string, remoteValue: string | null, remoteVersion: number) {
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
  }
  if (remoteValue === null) originalRemoveItem.call(localStorage, key);
  else originalSetItem.call(localStorage, key, remoteValue);
  const versions = readVersions();
  versions[key] = remoteVersion;
  writeVersions(versions);
  conflictServerValues.set(key, remoteValue);
  conflicted.add(key);
  emitModuleConflict(key, draftPreserved ? draftKey : undefined, draftPreserved);
}

function readVersions(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(VERSIONS_KEY) || '{}'); } catch { return {}; }
}
function writeVersions(versions: Record<string, number>) {
  originalSetItem.call(localStorage, VERSIONS_KEY, JSON.stringify(versions));
}

async function push(key: string): Promise<void> {
  timers.delete(key);
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
    // shortcut: the API has no DELETE for system-data, so a removed key is stored as value null.
    const response = await fetch(url(key), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, version: versions[key] ?? 0 })
    });
    if (response.status === 409) {
      const conflict = await response.json().catch(() => null) as { value?: unknown; version?: number } | null;
      applyConflict(key, toLocal(conflict?.value), Number(conflict?.version ?? 0));
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
    const body = await response.json() as { version?: number };
    if (typeof body.version === 'number') versions[key] = body.version;
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
      schedule(key);
    }
  };
}

export async function pullModuleData(): Promise<void> {
  // shortcut: pulls every system-data row on each poll; add a ?since/index endpoint if payloads grow large.
  const response = await fetch('/api/v1/system-data', { credentials: 'include' });
  if (!response.ok) return;
  const rows = await response.json() as SystemDataRow[];
  if (!Array.isArray(rows)) return;
  const versions = readVersions();
  const remoteKeys = new Set<string>();
  let changed = false;
  for (const row of rows) {
    if (!row || !isSyncedKey(row.key)) continue;
    const value = toLocal(row.value);
    if (value !== null) remoteKeys.add(row.key);
    if (versions[row.key] === row.version || pending.has(row.key) || conflicted.has(row.key)) continue;
    if (value === null) originalRemoveItem.call(localStorage, row.key);
    else originalSetItem.call(localStorage, row.key, value);
    versions[row.key] = row.version;
    changed = true;
  }
  for (const key of Object.keys(localStorage)) {
    if (!isSyncedKey(key) || remoteKeys.has(key) || pending.has(key) || conflicted.has(key)) continue;
    if (versions[key] === undefined) {
      // Data lama yang hanya ada di browser ini: unggah sekali.
      schedule(key);
    }
  }
  writeVersions(versions);
  if (changed) window.dispatchEvent(new Event('module-data-synced'));
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
  active = false;
}
