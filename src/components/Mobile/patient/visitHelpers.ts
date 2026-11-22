/** Helper murni untuk layar Riwayat Kunjungan (GET /api/patient/visits). */
import type { PublicDoctor } from './types';

export interface PatientVisit {
  id: string;
  kode_booking: string | null;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
  nomor_antrian: string;
  status: string;
  tipe: string;
  created_at: string;
  can_cancel: boolean;
  can_reschedule: boolean;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Validasi longgar respons server; entri tanpa id dibuang. */
export function parseVisits(payload: unknown): PatientVisit[] {
  const list = (payload as { visits?: unknown } | null)?.visits;
  if (!Array.isArray(list)) return [];
  return list
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string')
    .map((v) => ({
      id: v.id as string,
      kode_booking: typeof v.kode_booking === 'string' && v.kode_booking ? v.kode_booking : null,
      poli: str(v.poli),
      dokter: str(v.dokter),
      tanggal: str(v.tanggal),
      jam_praktek: str(v.jam_praktek),
      nomor_antrian: str(v.nomor_antrian),
      status: str(v.status),
      tipe: str(v.tipe),
      created_at: str(v.created_at),
      can_cancel: v.can_cancel === true,
      can_reschedule: v.can_reschedule === true
    }));
}

/** Terbaru lebih dulu (tanggal kunjungan, lalu waktu dibuat). */
export function sortVisitsNewestFirst(visits: PatientVisit[]): PatientVisit[] {
  return [...visits].sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at));
}

export type VisitTone = 'waiting' | 'active' | 'done' | 'cancelled' | 'neutral';

export function visitStatusTone(status: string): VisitTone {
  const s = status.toLowerCase();
  if (s === 'menunggu') return 'waiting';
  if (['panggil', 'diperiksa', 'farmasi', 'kasir'].includes(s)) return 'active';
  if (s === 'selesai') return 'done';
  if (s === 'batal' || s === 'dibatalkan') return 'cancelled';
  return 'neutral';
}

export type VisitAction = 'cancel' | 'reschedule' | 'load';

/** Pesan galat ramah (Bahasa Indonesia) untuk setiap kode galat endpoint kunjungan. */
export function describeVisitError(
  action: VisitAction,
  status: number | null,
  code?: string | null,
  serverMessage?: string | null
): string {
  const verb = action === 'cancel' ? 'dibatalkan' : action === 'reschedule' ? 'dijadwalkan ulang' : 'dimuat';
  if (status === null) return 'Tidak dapat menghubungi server. Periksa koneksi internet Anda lalu coba lagi.';
  switch (code) {
    case 'PATIENT_SESSION_REQUIRED':
      return 'Sesi Anda telah berakhir. Silakan masuk kembali.';
    case 'APPOINTMENT_NOT_FOUND':
      return 'Janji temu tidak ditemukan. Mungkin sudah diubah oleh petugas; daftar akan dimuat ulang.';
    case 'APPOINTMENT_NOT_MODIFIABLE':
      return `Janji temu ini tidak dapat ${verb} lagi karena sudah diproses atau tanggalnya telah lewat.`;
    case 'DOCTOR_QUOTA_FULL':
      return 'Kuota dokter pada tanggal tersebut sudah penuh. Silakan pilih tanggal lain.';
    case 'INVALID_VISIT_DATE':
      return serverMessage || 'Tanggal kunjungan tidak valid. Pilih tanggal hari ini atau mendatang.';
    case 'DOCTOR_NOT_AVAILABLE':
      return 'Dokter tidak lagi tersedia di poliklinik ini. Silakan hubungi bagian pendaftaran.';
    case 'NO_CHANGE':
      return 'Tanggal baru sama dengan jadwal saat ini. Pilih tanggal lain.';
    case 'QR_SECRET_NOT_CONFIGURED':
      return 'Layanan ubah jadwal sedang tidak tersedia. Silakan hubungi bagian pendaftaran.';
    default:
      break;
  }
  if (status === 401) return 'Sesi Anda telah berakhir. Silakan masuk kembali.';
  if (status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';
  if (status >= 500) return 'Server sedang bermasalah. Coba beberapa saat lagi.';
  return `Janji temu belum dapat ${verb}. Coba beberapa saat lagi.`;
}

/** Dokter di katalog publik yang menangani kunjungan (nama + poli), untuk membatasi tanggal ubah jadwal. */
export function findVisitDoctor(visit: Pick<PatientVisit, 'dokter' | 'poli'>, doctors: PublicDoctor[]): PublicDoctor | null {
  const name = visit.dokter.trim().toLowerCase();
  if (!name) return null;
  const poli = visit.poli.trim().toLowerCase();
  const byName = doctors.filter((d) => d.nama.trim().toLowerCase() === name);
  return byName.find((d) => d.poli.trim().toLowerCase() === poli) ?? byName[0] ?? null;
}

/** Kunjungan yang masih akan datang (relevan untuk "Tambah ke Kalender"). */
export function isUpcomingVisit(visit: PatientVisit, todayIso: string): boolean {
  const tone = visitStatusTone(visit.status);
  return /^\d{4}-\d{2}-\d{2}$/.test(visit.tanggal) && visit.tanggal >= todayIso && tone !== 'cancelled' && tone !== 'done';
}
