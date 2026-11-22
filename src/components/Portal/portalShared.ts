import type { Doctor, PoliklinikItem } from '../../data/seedData';

/** Dokter seperti dipublikasikan oleh GET /api/public/hospital-catalog. */
export interface LiveDoctor extends Doctor {
  kuota_tersisa?: number;
}

export type PublicPoli = Pick<PoliklinikItem, 'id' | 'kode' | 'nama'> & { kategori?: string };

export interface PoliQueueSnapshot {
  id: string;
  kode: string;
  nama: string;
  sedangDipanggil: string | null;
  totalMenunggu: number;
}

// Hasil cek antrean publik: sengaja TIDAK memuat No. RM, nama, atau ID pasien.
export interface QueueLookupMatch {
  nomor_antrian: string;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
  status: string;
  tipe: string;
  sedang_dipanggil: string | null;
  antrean_di_depan: number;
  estimasi_menit: number;
}

export interface RecentTicketSummary {
  nomor_antrian: string;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
}

export interface BookingSuccess {
  no_rm: string;
  tanggal_lahir: string;
  nama: string;
  nomor_antrian: string;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
  penjamin: string;
  qr_value: string;
}

export interface BookingFormState {
  isExistingPatient: boolean;
  nama: string;
  tanggal_lahir: string;
  no_hp: string;
  tanggal: string;
  penjamin: string;
  keluhan: string;
}

export type WorkspaceMode = 'daftar' | 'antrean';

/** Id elemen jangkar yang dipakai navigasi (<a href="#...">). */
export const SECTION_IDS = {
  workspace: 'portal-workspace',
  bookingForm: 'formulir-pendaftaran',
  queue: 'cek-antrean',
  services: 'layanan-medis',
  centers: 'pusat-unggulan',
  inpatient: 'rawat-inap',
  promo: 'promo-mcu',
  mobileApp: 'aplikasi-pasien',
  insurance: 'mitra-asuransi',
  articles: 'artikel',
  branches: 'lokasi'
} as const;

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const VIEWPORT_CONFIG = { once: true, amount: 0.14 } as const;

/** Jadwal praktik dokter apa adanya; tidak mengarang jam bila data kosong. */
export function formatDoctorSchedule(doc: Pick<LiveDoctor, 'hari' | 'jam'>): string {
  const parts = [doc.hari, doc.jam].map((v) => (v || '').trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Jadwal belum tersedia';
}

/** Sisa kuota hanya dari data server; null bila tidak diketahui. */
export function getQuotaLeft(doc: LiveDoctor): number | null {
  if (typeof doc.kuota_tersisa === 'number' && Number.isFinite(doc.kuota_tersisa)) {
    return Math.max(0, doc.kuota_tersisa);
  }
  if (typeof doc.kuota === 'number' && typeof doc.pasien_terlayani === 'number') {
    return Math.max(0, doc.kuota - doc.pasien_terlayani);
  }
  return null;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatTimeLabel(iso: string): string {
  if (!iso) return 'Belum diperbarui';
  try {
    return `Diperbarui ${new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })} WIB`;
  } catch {
    return 'Belum diperbarui';
  }
}

export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/** Gulir ke elemen dengan id tertentu (dipakai setelah state berubah, mis. memilih dokter). */
export function scrollToId(id: string, block: ScrollLogicalPosition = 'start'): void {
  // Elemen bisa baru muncul setelah animasi pergantian mode selesai; coba beberapa kali.
  let attempts = 0;
  const tryScroll = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block });
      return;
    }
    if (attempts++ < 10) window.setTimeout(tryScroll, 80);
  };
  window.setTimeout(tryScroll, 40);
}
