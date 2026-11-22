// Klien API akun pasien (profil, keluarga, penilaian, pengaduan). Identitas selalu dari sesi (Bearer/cookie).

export interface EmergencyContact {
  nama: string;
  hubungan: string;
  no_hp: string;
}

export interface PatientProfile {
  no_rm: string;
  nama: string;
  tanggal_lahir: string;
  jenis_kelamin: 'L' | 'P';
  penjamin: string;
  no_hp: string;
  alamat: string;
  email: string;
  kontak_darurat: EmergencyContact | null;
  no_hp_editable: false;
  no_hp_note: string;
}

export type FamilyRelation = 'anak' | 'orang_tua' | 'pasangan' | 'lainnya';

export const FAMILY_RELATION_LABELS: Record<FamilyRelation, string> = {
  anak: 'Anak',
  orang_tua: 'Orang tua',
  pasangan: 'Pasangan',
  lainnya: 'Lainnya'
};

export interface FamilyMember {
  no_rm: string;
  nama: string;
  hubungan: FamilyRelation;
  linked_at: string;
}

export interface FamilyOverview {
  owner: { no_rm: string; nama: string };
  acting_as: { no_rm: string; nama: string } | null;
  can_manage: boolean;
  max_dependents: number;
  dependents: FamilyMember[];
  guardians: FamilyMember[];
}

export const FEEDBACK_CATEGORY_LABELS: Record<string, string> = {
  pelayanan: 'Pelayanan umum',
  dokter: 'Dokter',
  perawat: 'Perawat',
  fasilitas: 'Fasilitas',
  administrasi: 'Administrasi',
  aplikasi: 'Aplikasi',
  lainnya: 'Lainnya'
};

export const COMPLAINT_CATEGORY_LABELS: Record<string, string> = {
  pelayanan: 'Pelayanan',
  tenaga_medis: 'Tenaga medis',
  administrasi: 'Administrasi',
  biaya: 'Biaya / tagihan',
  fasilitas: 'Fasilitas',
  privasi: 'Privasi data',
  aplikasi: 'Aplikasi',
  lainnya: 'Lainnya'
};

export interface FeedbackItem {
  id: string;
  appointment_id: string | null;
  rating: number;
  komentar: string;
  kategori: string;
  poli: string | null;
  dokter: string | null;
  created_at: string;
}

export interface PendingVisit {
  appointment_id: string;
  poli: string;
  dokter: string;
  tanggal: string;
}

export interface ComplaintItem {
  id: string;
  ticket_no: string;
  kategori: string;
  isi: string;
  kontak_balik: string;
  status: 'Diterima' | 'Diproses' | 'Selesai' | 'Ditolak';
  tanggapan: string;
  history: Array<{ at: string; status: string }>;
  created_at: string;
  updated_at: string;
}

export class AccountApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string, readonly body?: any) {
    super(message);
  }
}

const TOKEN_KEY = 'myitaru_patient_token';

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function request<T>(path: string, token: string | null | undefined, init: RequestInit = {}): Promise<T> {
  const bearer = token || readStoredToken();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(init.headers || {})
      }
    });
  } catch {
    throw new AccountApiError(0, 'NETWORK', 'Tidak dapat menghubungi server. Periksa koneksi internet Anda.');
  }
  const body = (await res.json().catch(() => null)) as ({ success?: boolean; code?: string; message?: string } & T) | null;
  if (!res.ok || !body?.success) {
    throw new AccountApiError(res.status, body?.code, body?.message || 'Permintaan gagal. Coba lagi.', body);
  }
  return body;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data === undefined ? {} : { body: JSON.stringify(data) })
});

export const accountApi = {
  profile: (token?: string | null) => request<{ profile: PatientProfile; acting_as_guardian: boolean }>('/api/patient/profile', token),
  updateProfile: (
    data: Partial<{ alamat: string; email: string; kontak_darurat: EmergencyContact | null }>,
    token?: string | null
  ) => request<{ profile: PatientProfile }>('/api/patient/profile', token, json('PATCH', data)),

  family: (token?: string | null) => request<FamilyOverview>('/api/patient/family', token),
  requestLink: (no_rm: string, hubungan: FamilyRelation, token?: string | null) =>
    request<{ request_id: string; masked_phone: string; expires_in: number; message: string }>(
      '/api/patient/family/link/request',
      token,
      json('POST', { no_rm, hubungan })
    ),
  verifyLink: (request_id: string, code: string, token?: string | null) =>
    request<{ dependent: FamilyMember }>('/api/patient/family/link/verify', token, json('POST', { request_id, code })),
  unlink: (rm: string, token?: string | null) =>
    request<{ success: true }>(`/api/patient/family/${encodeURIComponent(rm)}`, token, { method: 'DELETE' }),
  switchTo: (rm: string, token?: string | null) =>
    request<{ token: string; acting_as_guardian: boolean; patient: { no_rm: string; nama: string } | null }>(
      `/api/patient/family/switch/${encodeURIComponent(rm)}`,
      token,
      { method: 'POST' }
    ),

  feedback: (token?: string | null) =>
    request<{ feedback: FeedbackItem[]; pending_visits: PendingVisit[] }>('/api/patient/feedback', token),
  sendFeedback: (
    data: { appointment_id?: string; rating: number; komentar?: string; kategori: string },
    token?: string | null
  ) => request<{ feedback: FeedbackItem }>('/api/patient/feedback', token, json('POST', data)),
  complaints: (token?: string | null) => request<{ complaints: ComplaintItem[] }>('/api/patient/complaints', token),
  sendComplaint: (data: { kategori: string; isi: string; kontak_balik?: string }, token?: string | null) =>
    request<{ ticket_no: string; complaint: ComplaintItem }>('/api/patient/complaints', token, json('POST', data))
};

export function formatDateId(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
