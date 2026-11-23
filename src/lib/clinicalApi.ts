// Klien API rekam klinis inti (SOAP RME, e-resep, tagihan kasir).
// Mode "server": data dibaca/ditulis lewat /api/v1 dan tersimpan di D1/MySQL/Firebase.
// Mode "demo": hanya bila server berjalan dengan STORAGE_MODE=memory (atau VITE_STORAGE_MODE=memory);
// data contoh tetap memakai localStorage seperti sebelumnya.

export type ClinicalBackend = 'server' | 'demo';

const configuredMode: string = import.meta.env.VITE_STORAGE_MODE || 'firebase';
// Header X-Storage-Mode hanya dikirim bila mode penyimpanan dikonfigurasi eksplisit untuk server,
// sama seperti helper persistence lain (lihat src/lib/firestoreService.ts).
const sendsStorageModeHeader = configuredMode !== 'firebase';

const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Server tidak dapat dihubungi. Periksa koneksi lalu coba lagi.',
  UNAUTHENTICATED: 'Sesi tidak ditemukan. Silakan login ulang.',
  INVALID_SESSION: 'Sesi telah berakhir. Silakan login ulang.',
  FORBIDDEN: 'Peran Anda tidak memiliki akses ke data ini.',
  READ_ONLY: 'Akun Anda hanya memiliki akses baca.',
  MFA_REQUIRED: 'Verifikasi MFA diperlukan untuk mengakses data klinis.',
  PERSISTENCE_UNAVAILABLE: 'Penyimpanan data belum siap. Data belum tersimpan, silakan coba lagi.',
  STORAGE_MODE_MISMATCH: 'Konfigurasi mode penyimpanan aplikasi tidak sesuai dengan server.',
  VERSION_CONFLICT: 'Data telah diubah pengguna lain. Muat ulang data lalu ulangi perubahan.',
  CLINICAL_ROLE_REQUIRED: 'Hanya tenaga klinis (dokter, perawat, bidan) yang dapat menyimpan SOAP.',
  DPJP_SIGNATURE_REQUIRED: 'Finalisasi rekam medis hanya dapat dilakukan oleh DPJP.',
  SOAP_FINALIZED: 'Catatan SOAP sudah final dan tidak dapat diubah.',
  PRESCRIBER_ROLE_REQUIRED: 'Hanya dokter/bidan yang dapat menerbitkan e-resep.',
  PHARMACIST_ROLE_REQUIRED: 'Hanya apoteker yang dapat memproses resep.',
  PRESCRIPTION_COMPLETED: 'Resep sudah selesai diserahkan dan tidak dapat diubah.',
  PRESCRIPTION_IN_PHARMACY: 'Resep sedang diproses farmasi dan tidak dapat dikoreksi.',
  PRESCRIPTION_IDENTITY_IMMUTABLE: 'Identitas pasien, kunjungan, dan dokter penulis resep tidak boleh diubah.',
  BILLING_LOCKED: 'Tagihan sudah lunas/dibatalkan dan terkunci.',
  BILLING_SUBTOTAL_MISMATCH: 'Subtotal tagihan tidak sesuai dengan jumlah item.',
  BILLING_NOT_SETTLED: 'Tagihan belum dapat ditandai lunas karena masih ada sisa tagihan.',
  CREATE_NOT_ALLOWED: 'Data baru tidak dapat dibuat dari modul ini.'
};

export class ClinicalApiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 0, readonly field?: string) {
    super(message);
    this.name = 'ClinicalApiError';
  }
}

export function describeClinicalError(error: unknown): string {
  if (error instanceof ClinicalApiError) {
    return error.field && !ERROR_MESSAGES[error.code]
      ? `${error.message} (kolom: ${error.field})`
      : error.message;
  }
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
}

export async function clinicalRequest<T>(path: string, method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(sendsStorageModeHeader ? { 'X-Storage-Mode': configuredMode } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ClinicalApiError('NETWORK_ERROR', ERROR_MESSAGES.NETWORK_ERROR);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const code: string = payload?.code || `HTTP_${response.status}`;
    const message = ERROR_MESSAGES[code] || payload?.message || payload?.error ||
      (code === 'INVALID_FIELD' || code === 'MISSING_FIELD' || code === 'UNKNOWN_FIELD'
        ? 'Data yang dikirim tidak valid.'
        : `Permintaan gagal (${response.status}).`);
    throw new ClinicalApiError(code, message, response.status, payload?.field);
  }
  return payload as T;
}

let backendPromise: Promise<ClinicalBackend> | null = null;

/** Mode yang dapat ditentukan tanpa jaringan; null berarti perlu bertanya ke /api/v1/health. */
export function initialClinicalBackend(): ClinicalBackend | null {
  return configuredMode === 'memory' ? 'demo' : null;
}

export function resolveClinicalBackend(): Promise<ClinicalBackend> {
  const known = initialClinicalBackend();
  if (known) return Promise.resolve(known);
  backendPromise ||= fetch('/api/v1/health', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((body): ClinicalBackend => (body?.storage?.mode === 'memory' ? 'demo' : 'server'))
    .catch((): ClinicalBackend => {
      // Jangan simpan kegagalan; tanpa kepastian mode memory, data tidak boleh jatuh ke demo lokal.
      backendPromise = null;
      return 'server';
    });
  return backendPromise;
}

export const clinicalPaths = {
  soap: '/api/v1/dossier/soap',
  prescriberPrescriptions: '/api/v1/dossier/prescriptions',
  pharmacyPrescriptions: '/api/v1/inventory/prescriptions',
  billings: '/api/v1/billing/invoices',
  item: (base: string, id: string) => `${base}/${encodeURIComponent(id)}`
};

/**
 * Menyimpan hasil pemeriksaan poliklinik (SOAP + e-resep) ke server.
 * Di mode demo tidak melakukan apa pun karena alur interline lokal sudah menyimpannya ke localStorage.
 */
export async function persistOutpatientEncounter(input: {
  soap: Record<string, unknown>;
  prescription?: { id: string } & Record<string, unknown>;
}): Promise<'demo' | 'saved'> {
  const backend = await resolveClinicalBackend();
  if (backend === 'demo') return 'demo';
  await clinicalRequest(clinicalPaths.soap, 'POST', input.soap);
  if (input.prescription) {
    await clinicalRequest(clinicalPaths.prescriberPrescriptions, 'POST', input.prescription);
  }
  return 'saved';
}
