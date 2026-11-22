
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
  /**
   * Koordinat resmi lokasi (derajat desimal). Bila diisi, tautan petunjuk arah memakai koordinat
   * dan peta tersemat (embed) ditampilkan. Kosongkan bila belum diverifikasi.
   */
  latitude?: number;
  longitude?: number;
}

export interface HealthArticle {
  id: string;
  /** Slug URL (/artikel/:slug). Opsional; bila kosong diturunkan dari judul. */
  slug?: string;
  /** Nama tenaga medis peninjau isi artikel (opsional, tampil bila diisi). */
  reviewedBy?: string;
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
  address: '', // TODO: isi alamat resmi
  /** Email layanan pasien resmi. */
  email: '' // TODO: isi email resmi
};

/**
 * Alamat publik situs (tanpa garis miring di akhir). Dipakai untuk tautan kanonis.
 * TODO: ganti bila domain resmi sudah tersedia (perbarui juga public.html, robots.txt, sitemap.xml).
 */
export const PUBLIC_SITE_URL = 'https://myitaru-public.myappv1.workers.dev';

/**
 * Data hukum & privasi untuk halaman Kebijakan Privasi, Syarat Layanan, dan Pengaduan.
 * String kosong / daftar kosong = belum dikonfigurasi; UI menyembunyikan baris terkait
 * atau menampilkan arahan umum untuk menghubungi rumah sakit.
 */
export const HOSPITAL_LEGAL_CONFIG = {
  /** Nama badan hukum pengelola RS (pengendali data pribadi menurut UU PDP). */
  legalEntityName: '', // TODO: mis. "PT ..."
  /** Tanggal berlaku Kebijakan Privasi, mis. "1 Januari 2027". */
  privacyEffectiveDate: '', // TODO
  /** Tanggal berlaku Syarat Layanan. */
  termsEffectiveDate: '', // TODO
  /** Pejabat/petugas pelindungan data pribadi (PPDP/DPO). */
  dpoName: '', // TODO
  dpoEmail: '', // TODO
  dpoPhone: '', // TODO
  dpoAddress: '', // TODO
  /**
   * Masa retensi data non-rekam-medis (mis. data pendaftaran online yang tidak berlanjut ke kunjungan,
   * log teknis). Contoh isi: "12 bulan sejak pendaftaran". Kosong = baris disembunyikan.
   */
  nonMedicalRetention: '', // TODO
  /**
   * Penyedia layanan pihak ketiga yang memproses data atas nama RS (mis. hosting, SMS gateway).
   * Tampil hanya bila diisi.
   */
  dataProcessors: [] as Array<{ name: string; purpose: string }>, // TODO
  /** Kanal pengaduan resmi. */
  complaintPhone: '', // TODO
  complaintWhatsapp: '', // TODO
  complaintEmail: '', // TODO
  complaintAddress: '', // TODO: mis. "Unit Pengaduan / Customer Service, Lobi Utama"
  complaintHours: '', // TODO: mis. "Senin–Jumat 08:00–16:00 WIB"
  /** Target waktu tanggapan pengaduan sesuai SOP RS, mis. "3 hari kerja". */
  complaintResponseTime: '' // TODO
};

/**
 * Pengaturan pemberitahuan privasi/cookie. Web publik saat ini TIDAK memakai analitik atau
 * cookie pihak ketiga, sehingga hanya ditampilkan pemberitahuan singkat. Ubah ke true hanya
 * bila analitik/penyimpanan non-esensial ditambahkan; UI lalu meminta persetujuan (setuju/tolak).
 */
export const PUBLIC_PRIVACY_SETTINGS = {
  usesAnalytics: false
};

/** Status kerja sama BPJS Kesehatan (JKN). null = belum dikonfigurasi (UI menampilkan arahan umum). */
export const HOSPITAL_BPJS_CONFIG: {
  isBpjsPartner: boolean | null;
  /** Catatan tambahan resmi, mis. lokasi loket BPJS atau jam layanan. */
  notes: string[];
} = {
  isBpjsPartner: null, // TODO: true bila RS bekerja sama dengan BPJS Kesehatan
  notes: [] // TODO
};

/** Tanya-jawab khusus rumah sakit (jam besuk, parkir, dsb.). TODO: isi dari informasi resmi. */
export const HOSPITAL_FAQS: Array<{ question: string; answer: string }> = [];

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

/**
 * Tautan petunjuk arah Google Maps (https://www.google.com/maps/search/?api=1&query=...).
 * Memakai koordinat bila tersedia, selain itu nama + alamat + kota. '' bila tidak ada data lokasi.
 */
export function buildMapsDirectionsUrl(
  branch: Pick<HospitalBranch, 'name' | 'address' | 'city' | 'latitude' | 'longitude'>
): string {
  const hasCoords =
    typeof branch.latitude === 'number' &&
    typeof branch.longitude === 'number' &&
    Number.isFinite(branch.latitude) &&
    Number.isFinite(branch.longitude);
  let query = '';
  if (hasCoords) {
    query = `${branch.latitude},${branch.longitude}`;
  } else if ((branch.address || '').trim()) {
    query = [branch.name, branch.address, branch.city].map((v) => (v || '').trim()).filter(Boolean).join(', ');
  }
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

/** URL peta tersemat; hanya bila koordinat dikonfigurasi (tidak ada embed berbasis alamat bebas). */
export function buildMapsEmbedUrl(branch: Pick<HospitalBranch, 'latitude' | 'longitude'>): string {
  if (
    typeof branch.latitude !== 'number' ||
    typeof branch.longitude !== 'number' ||
    !Number.isFinite(branch.latitude) ||
    !Number.isFinite(branch.longitude)
  ) {
    return '';
  }
  return `https://www.google.com/maps?q=${branch.latitude},${branch.longitude}&z=16&output=embed`;
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

// Dokter & poliklinik TIDAK dikonfigurasi di file ini: web publik membacanya dari
// GET /api/public/hospital-catalog (data master tersimpan di server).
