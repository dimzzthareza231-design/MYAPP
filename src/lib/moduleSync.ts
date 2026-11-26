// Sinkron data modul (billing, farmasi, dossier RME, lab, ...) yang disimpan komponen di localStorage ke server,
// supaya semua PC melihat data yang sama. Dipasang di Storage.setItem karena ~80 komponen menulis localStorage langsung.
// shortcut: per kunci, simpanan terakhir menang; modul yang butuh kontrol konflik perlu API sendiri.
const SYNCED_KEY = /^(hospital_|simrs_|klinik_|bpjs_|myitaru_igd_)/;
const VERSIONS_KEY = 'hospital_sync_versions';
// Sudah punya API sendiri, data per pengguna, atau preferensi tampilan.
const EXCLUDED = new Set([
  VERSIONS_KEY, 'hospital_pasien', 'hospital_kunjungan', 'hospital_dokter', 'hospital_perawat', 'hospital_settings',
  'hospital_poli_master', 'simrs_theme', 'hospital_theme', 'simrs_registration_draft'
]);
const MAX_BYTES = 900_000;

export const isSyncedKey = (key: string) => SYNCED_KEY.test(key) && !EXCLUDED.has(key);

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Set<string>();
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

async function push(key: string): Promise<void> {
  timers.delete(key);
  const value = localStorage.getItem(key);
  try {
    if (value !== null && new Blob([value]).size > MAX_BYTES) {
      console.warn(`[ModuleSync] ${key} melebihi 900 KB; hanya tersimpan di browser ini.`);
      return;
    }
    const response = await fetch(url(key), value === null
      ? { method: 'DELETE', credentials: 'same-origin' }
      : { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: value }) });
    if (!response.ok) {
      console.warn(`[ModuleSync] ${key} gagal disimpan ke server (HTTP ${response.status}).`);
      return;
    }
    const body = await response.json() as { updatedAt?: string };
    const versions = readVersions();
    if (value === null || !body.updatedAt) delete versions[key];
    else versions[key] = body.updatedAt;
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
    if (active && this === localStorage && isSyncedKey(key)) schedule(key);
  };
  Storage.prototype.removeItem = function removeItem(this: Storage, key: string) {
    originalRemoveItem.call(this, key);
    if (active && this === localStorage && isSyncedKey(key)) schedule(key);
  };
}

export async function pullModuleData(): Promise<void> {
  const response = await fetch('/api/v1/module-data', { credentials: 'same-origin' });
  if (!response.ok) return;
  const { index = {} } = await response.json() as { index?: Record<string, string> };
  const versions = readVersions();
  const changed = Object.entries(index).filter(([key, updatedAt]) => isSyncedKey(key) && versions[key] !== updatedAt && !pending.has(key));
  // Satu request per 20 kunci (bukan satu per kunci): login di browser baru turun dari ~5 detik.
  const batches = Array.from({ length: Math.ceil(changed.length / 20) }, (_, i) => changed.slice(i * 20, i * 20 + 20).map(([key]) => key));
  await Promise.all(batches.map(async (keys) => {
    const batch = await fetch(`/api/v1/module-data?keys=${keys.map(encodeURIComponent).join(',')}`, { credentials: 'same-origin' });
    if (!batch.ok) return;
    const { records = {} } = await batch.json() as { records?: Record<string, { data: string; updatedAt: string }> };
    for (const [key, record] of Object.entries(records)) {
      originalSetItem.call(localStorage, key, record.data);
      versions[key] = record.updatedAt;
    }
  }));
  for (const key of Object.keys(localStorage)) {
    if (!isSyncedKey(key) || key in index || pending.has(key)) continue;
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
  active = false;
}
