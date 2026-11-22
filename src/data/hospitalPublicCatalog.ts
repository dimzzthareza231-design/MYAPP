import { MASTER_POLIKLINIK, SEMUA_DOKTER, Doctor, PoliklinikItem } from './seedData';

export interface HospitalServiceItem {
  id: string;
  title: string;
  category: 'Klinik & Darurat' | 'Penunjang Medis' | 'Terapi & Khusus';
  poliKode: string;
  availability: string;
  summary: string;
  highlights: string[];
}

export interface CenterOfExcellence {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  poliKode: string;
  highlightMetric: string;
  services: string[];
  description: string;
}

export interface HospitalPromo {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  poliKode: string;
  validUntil: string;
  benefit: string;
  presetNote: string;
}

export interface InpatientRoomClass {
  id: string;
  name: string;
  tierLabel: string;
  pricePerNight: number;
  capacity: string;
  visitingHours: string;
  summary: string;
  amenities: string[];
}

export interface InsurancePartner {
  id: string;
  name: string;
  type: 'JKN / Pemerintah' | 'Asuransi Swasta' | 'Korporasi & TPA';
  coverageNote: string;
}

export interface MCUPackage {
  id: string;
  name: string;
  tier: string;
  price: number;
  duration: string;
  fastingRequired: boolean;
  highlights: string[];
  recommendedFor: string;
}

export interface HospitalBranch {
  id: string;
  name: string;
  city: string;
  address: string;
  /**
   * Nomor IGD/ambulans cabang. Kosongkan ('') bila belum ada nomor resmi yang terverifikasi;
   * UI akan menyembunyikannya dan tetap menampilkan nomor darurat nasional 119/112.
   */
  emergencyPhone: string;
  appointmentPhone: string;
  whatsappPhone: string;
  bedsCount?: number;
  /** Status akreditasi resmi (kosongkan bila belum terverifikasi). */
  accreditation?: string;
  hours: string;
}

export interface HealthArticle {
  id: string;
  category: string;
  title: string;
  readMinutes: number;
  author: string;
  date: string;
  summary: string;
  body: string[];
}

export interface PatientStory {
  id: string;
  patientInitials: string;
  unit: string;
  quote: string;
  outcome: string;
}

/*
 * KONFIGURASI KONTEN WEB PUBLIK
 * ------------------------------------------------------------------
 * File ini sengaja TIDAK berisi data contoh/demo. Semua daftar di bawah kosong
 * sampai diisi dengan data resmi rumah sakit yang sudah diverifikasi.
 * UI portal publik otomatis menyembunyikan bagian (section) yang datanya kosong,
 * termasuk tautan navigasinya.
 *
 * Jangan isi dengan testimoni, promo, artikel, harga, atau nama dokter karangan.
 */

/** Identitas & kontak umum. String kosong = belum dikonfigurasi (UI menyembunyikan). */
export const HOSPITAL_PROFILE = {
  /** Nama tampilan rumah sakit di web publik. */
  name: 'MYITARU',
  /** Nomor pendaftaran / customer relations, mis. "(021) 1234-5678". */
  customerServicePhone: '', // TODO: isi nomor resmi
  /** Nomor WhatsApp layanan pasien, mis. "0811-xxxx-xxxx". */
  whatsappPhone: '', // TODO: isi nomor resmi
  /** Alamat singkat untuk footer. */
  address: '' // TODO: isi alamat resmi
};

/** Direktori unit layanan medis. TODO: isi dengan unit layanan resmi. */
export const HOSPITAL_SERVICES: HospitalServiceItem[] = [];

/** Pusat layanan unggulan. TODO: isi hanya bila program unggulan resmi tersedia. */
export const CENTERS_OF_EXCELLENCE: CenterOfExcellence[] = [];

/** Promo/program layanan. TODO: isi hanya promo resmi yang sedang berlaku. */
export const HOSPITAL_PROMOS: HospitalPromo[] = [];

/** Kelas kamar rawat inap & tarif resmi. TODO: isi dari daftar tarif yang disahkan manajemen. */
export const INPATIENT_ROOMS: InpatientRoomClass[] = [];

/** Jam besuk rawat inap. String kosong / daftar kosong = disembunyikan. */
export const VISITING_HOURS_INFO: { morningSession: string; eveningSession: string; rules: string[] } = {
  morningSession: '', // TODO: mis. "10:00 – 12:00 WIB"
  eveningSession: '', // TODO: mis. "18:00 – 20:00 WIB"
  rules: [] // TODO: tata tertib kunjungan resmi
};

/** Mitra penjamin/asuransi yang kerja samanya aktif. TODO: isi dari daftar PKS resmi. */
export const INSURANCE_PARTNERS: InsurancePartner[] = [];

/** Paket Medical Check-Up & harga resmi. TODO: isi dari daftar paket yang disahkan. */
export const MCU_PACKAGES: MCUPackage[] = [];

/** Nomor darurat nasional Indonesia (selalu ditampilkan di portal publik). */
export const NATIONAL_EMERGENCY_NUMBERS: Array<{ number: string; label: string }> = [
  { number: '119', label: 'Ambulans / Gawat Darurat (PSC 119)' },
  { number: '112', label: 'Panggilan Darurat Nasional' }
];

/** Nomor IGD utama untuk header/footer; '' = belum dikonfigurasi (UI menyembunyikan). */
export const PRIMARY_EMERGENCY_PHONE = ''; // TODO: isi nomor IGD resmi rumah sakit

/** Ubah nomor tampilan (mis. "(021) 5098-8800") menjadi href tel:. Mengembalikan '' bila kosong. */
export function toTelHref(phone: string): string {
  const trimmed = (phone || '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

/** Ubah nomor WhatsApp lokal (mis. "0811-1500-911") menjadi tautan https://wa.me/62... */
export function toWhatsAppHref(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

/** Lokasi/cabang resmi. TODO: isi alamat, nomor telepon, dan jam layanan yang terverifikasi. */
export const HOSPITAL_BRANCHES: HospitalBranch[] = [];

/** Artikel edukasi kesehatan yang telah ditinjau tenaga medis. TODO: isi artikel resmi. */
export const HEALTH_ARTICLES: HealthArticle[] = [];

/**
 * Kisah/testimoni pasien. Hanya boleh diisi dengan persetujuan tertulis pasien.
 * TODO: isi bila sudah ada testimoni resmi berizin.
 */
export const PATIENT_STORIES: PatientStory[] = [];

/**
 * Daftar poliklinik/dokter dari data master aplikasi. Dipakai aplikasi mobile pasien
 * sebagai cadangan; portal publik hanya menampilkan data dari API.
 */
export function getPublicPoliklinik(): PoliklinikItem[] {
  return MASTER_POLIKLINIK;
}

export function getPublicDoctors(): Doctor[] {
  return SEMUA_DOKTER;
}
