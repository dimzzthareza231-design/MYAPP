// Data referensi aplikasi inti. Tidak ada data contoh (pasien, dokter, perawat) di repo:
// tenaga medis dan pasien hanya berasal dari data tersimpan (persistensi server / input petugas).
// Modul ini tidak boleh punya efek samping saat di-import (tidak menulis penyimpanan browser).
import type { PatientFullRecord } from './patientPelayananData';

export interface PoliklinikItem {
  id: string;
  kode: string;
  nama: string;
  kategori: 'Spesialis Utama' | 'Subspesialis' | 'Penunjang & Khusus' | 'Umum & Kegawatdaruratan';
  icon: string;
  warna: string;
  deskripsi: string;
  kapasitas: number;
}

export interface Doctor {
  id: string;
  nip: string;
  sip?: string;
  str?: string;
  nama: string;
  spesialis: string;
  subspesialis?: string;
  poli: string;
  poli_id: string;
  penempatan: string;
  jabatan?: string;
  jadwal?: string;
  hari?: string;
  jam?: string;
  shift?: string;
  ruangan?: string;
  kuota?: number;
  pasien_terlayani?: number;
  status_jaga?: string;
  kontak?: string;
  email?: string;
  status: string;
}

export interface Nurse {
  id: string;
  nip: string;
  nama: string;
  jabatan: string;
  unit: string;
  shift: string;
  status: string;
}

export const MASTER_POLIKLINIK: PoliklinikItem[] = [
  // 1. Umum & Kegawatdaruratan
  {
    id: 'POL-01',
    kode: 'UMM',
    nama: 'Poli Umum',
    kategori: 'Umum & Kegawatdaruratan',
    icon: '🩺',
    warna: 'from-blue-500 to-cyan-600',
    deskripsi: 'Pelayanan kesehatan umum dasar, skrining penyakit, dan konsultasi kesehatan berkala.',
    kapasitas: 60
  },
  {
    id: 'POL-02',
    kode: 'IGD',
    nama: 'IGD (Gawat Darurat)',
    kategori: 'Umum & Kegawatdaruratan',
    icon: '🚑',
    warna: 'from-red-500 to-rose-600',
    deskripsi: 'Penanganan gawat darurat medis 24 jam dengan triase ATS & ESI.',
    kapasitas: 40
  },

  // 2. Spesialis Utama (Permintaan User)
  {
    id: 'POL-03',
    kode: 'OBG',
    nama: 'Poli Obgyn (Kebidanan & Kandungan)',
    kategori: 'Spesialis Utama',
    icon: '🤰',
    warna: 'from-pink-500 to-rose-600',
    deskripsi: 'Pemeriksaan kehamilan, USG 4D, persalinan, infertilitas, dan kesehatan reproduksi wanita.',
    kapasitas: 35
  },
  {
    id: 'POL-04',
    kode: 'ANK',
    nama: 'Poli Anak (Pediatri)',
    kategori: 'Spesialis Utama',
    icon: '👶',
    warna: 'from-amber-500 to-yellow-600',
    deskripsi: 'Pelayanan tumbuh kembang anak, imunisasi terpadu, dan penanganan penyakit pediatri.',
    kapasitas: 40
  },
  {
    id: 'POL-05',
    kode: 'BDH',
    nama: 'Poli Bedah Umum',
    kategori: 'Spesialis Utama',
    icon: '🔪',
    warna: 'from-indigo-500 to-purple-600',
    deskripsi: 'Konsultasi pra dan pasca operasi bedah digestif, hernia, apendisitis, dan bedah minor.',
    kapasitas: 30
  },
  {
    id: 'POL-06',
    kode: 'JNT',
    nama: 'Poli Jantung & Pembuluh Darah (Kardiologi)',
    kategori: 'Spesialis Utama',
    icon: '❤️',
    warna: 'from-red-600 to-pink-600',
    deskripsi: 'Pemeriksaan EKG, Echocardiography, Treadmill test, penanganan PJK, hipertensi & aritmia.',
    kapasitas: 25
  },
  {
    id: 'POL-07',
    kode: 'SRF',
    nama: 'Poli Saraf (Neurologi)',
    kategori: 'Spesialis Utama',
    icon: '🧠',
    warna: 'from-violet-500 to-purple-600',
    deskripsi: 'Penanganan pasca stroke, migrain, epilepsi, neuropati, tremor, dan gangguan neuromuskular.',
    kapasitas: 25
  },
  {
    id: 'POL-08',
    kode: 'MAT',
    nama: 'Poli Mata (Oftalmologi)',
    kategori: 'Spesialis Utama',
    icon: '👁️',
    warna: 'from-cyan-500 to-blue-600',
    deskripsi: 'Pemeriksaan refraksi, katarak, glaukoma, retinopati, dan bedah laser oftalmologi.',
    kapasitas: 30
  },
  {
    id: 'POL-09',
    kode: 'THT',
    nama: 'Poli THT-KL (Telinga, Hidung, Tenggorokan, Kepala, Leher)',
    kategori: 'Spesialis Utama',
    icon: '👂',
    warna: 'from-teal-500 to-emerald-600',
    deskripsi: 'Endoskopi THT, tes audiometri, sinus, polip hidung, dan gangguan tonsil/laring.',
    kapasitas: 30
  },
  {
    id: 'POL-10',
    kode: 'KLT',
    nama: 'Poli Kulit & Kelamin (Dermatovenerologi)',
    kategori: 'Spesialis Utama',
    icon: '✨',
    warna: 'from-amber-400 to-orange-500',
    deskripsi: 'Penanganan alergi kulit, psoriasis, infeksi kulit, jerawat/akne, dan penyakit menular seksual.',
    kapasitas: 30
  },
  {
    id: 'POL-11',
    kode: 'PRU',
    nama: 'Poli Paru (Pulmonologi)',
    kategori: 'Spesialis Utama',
    icon: '🫁',
    warna: 'from-sky-500 to-cyan-600',
    deskripsi: 'Spirometri, penanganan asma, PPOK, Tuberkulosis (DOTS), dan infeksi saluran pernapasan.',
    kapasitas: 30
  },
  {
    id: 'POL-12',
    kode: 'JWA',
    nama: 'Poli Jiwa / Psikiatri',
    kategori: 'Spesialis Utama',
    icon: '🧘',
    warna: 'from-purple-500 to-indigo-600',
    deskripsi: 'Konseling psikoterapi, penanganan depresi, kecemasan, skizofrenia, bipolar, dan adiksi.',
    kapasitas: 20
  },
  {
    id: 'POL-13',
    kode: 'URL',
    nama: 'Poli Urologi (Sistem Perkemihan & Ginjal)',
    kategori: 'Spesialis Utama',
    icon: '💧',
    warna: 'from-blue-600 to-teal-600',
    deskripsi: 'Batu saluran kemih (ESWL/URS), pembesaran prostat (BPH), infeksi ginjal dan kandung kemih.',
    kapasitas: 25
  },
  {
    id: 'POL-14',
    kode: 'ORT',
    nama: 'Poli Orthopedi (Tulang & Otot)',
    kategori: 'Spesialis Utama',
    icon: '🦴',
    warna: 'from-emerald-500 to-green-600',
    deskripsi: 'Penanganan cedera sendi/otot, fraktur tulang, osteoporosis, artroskopi, dan pergantian sendi.',
    kapasitas: 25
  },
  {
    id: 'POL-15',
    kode: 'GIG',
    nama: 'Poli Gigi Spesialis (Bedah Mulut, Konservasi, Ortodonsia)',
    kategori: 'Spesialis Utama',
    icon: '🦷',
    warna: 'from-teal-500 to-cyan-600',
    deskripsi: 'Pencabutan impaksi (odontektomi), perawatan saluran akar, pasang behel, dan restorasi estetika.',
    kapasitas: 25
  },
  {
    id: 'POL-16',
    kode: 'PDL',
    nama: 'Poli Penyakit Dalam (Internis)',
    kategori: 'Spesialis Utama',
    icon: '🩺',
    warna: 'from-blue-700 to-indigo-700',
    deskripsi: 'Penanganan diabetes melitus, hipertensi, gangguan lambung, hati/hepatitis, dan rematologi.',
    kapasitas: 45
  },

  // 3. Subspesialis (Permintaan User)
  {
    id: 'POL-17',
    kode: 'ONK',
    nama: 'Poli Onkologi & Hematologi (Kanker & Kelainan Darah)',
    kategori: 'Subspesialis',
    icon: '🎗️',
    warna: 'from-fuchsia-600 to-pink-600',
    deskripsi: 'Khusus menangani kanker, protokol kemoterapi, leukemia, limfoma, anemia berat, dan hemofilia.',
    kapasitas: 20
  },
  {
    id: 'POL-18',
    kode: 'GRT',
    nama: 'Poli Geriatri (Perawatan Medis Lansia)',
    kategori: 'Subspesialis',
    icon: '👴',
    warna: 'from-amber-600 to-stone-600',
    deskripsi: 'Perawatan medis komprehensif lansia dengan sindrom geriatri, multimorbiditas, dan polifarmasi.',
    kapasitas: 20
  },
  {
    id: 'POL-19',
    kode: 'EDK',
    nama: 'Poli Endokrin (Gangguan Hormon & Tiroid)',
    kategori: 'Subspesialis',
    icon: '🧬',
    warna: 'from-indigo-600 to-blue-600',
    deskripsi: 'Menangani gangguan hormon, hipertiroid/hipotiroid, nodul tiroid, adrenal, dan hipofisis.',
    kapasitas: 20
  },
  {
    id: 'POL-20',
    kode: 'FTM',
    nama: 'Poli Fetomaternal (Kandungan Risiko Tinggi)',
    kategori: 'Subspesialis',
    icon: '🤰',
    warna: 'from-rose-600 to-purple-600',
    deskripsi: 'Subspesialis kandungan untuk kehamilan berisiko tinggi, skrining kelainan janin, USG Doppler fetomaternal.',
    kapasitas: 15
  },

  // 4. Poliklinik Penunjang & Khusus (Permintaan User)
  {
    id: 'POL-21',
    kode: 'RHB',
    nama: 'Poli Rehabilitasi Medik / Fisioterapi',
    kategori: 'Penunjang & Khusus',
    icon: '🏃',
    warna: 'from-lime-600 to-emerald-600',
    deskripsi: 'Fisioterapi pasca stroke, terapi okupasi, terapi wicara, latihan kardiorespirasi, dan modalitas panas/listrik.',
    kapasitas: 35
  },
  {
    id: 'POL-22',
    kode: 'GZI',
    nama: 'Poli Gizi Klinik',
    kategori: 'Penunjang & Khusus',
    icon: '🥗',
    warna: 'from-green-500 to-teal-600',
    deskripsi: 'Konsultasi dietetik klinis diabetes, obesitas, malnutrisi, gagal ginjal, dan enteral/parenteral feeding.',
    kapasitas: 25
  },
  {
    id: 'POL-23',
    kode: 'NYR',
    nama: 'Poli Nyeri atau Akupunktur',
    kategori: 'Penunjang & Khusus',
    icon: '📍',
    warna: 'from-orange-500 to-red-500',
    deskripsi: 'Manajemen nyeri kronis, blok saraf, trigger point injection, dan akupunktur medik terintegrasi.',
    kapasitas: 20
  },
  {
    id: 'POL-24',
    kode: 'MCU',
    nama: 'Poli MCU (Medical Check-Up)',
    kategori: 'Penunjang & Khusus',
    icon: '📑',
    warna: 'from-teal-600 to-sky-600',
    deskripsi: 'Paket pemeriksaan kesehatan menyeluruh karyawan, calon pengantin, visa, dan general health check.',
    kapasitas: 50
  }
];

/** Tidak ada pasien contoh. Daftar pasien berasal dari data tersimpan. */
export const PASIEN: PatientFullRecord[] = [];

/** Tidak ada dokter contoh. Dokter dikelola petugas lewat API master (/api/v1/master/doctors). */
export const SEMUA_DOKTER: Doctor[] = [];

/** Tidak ada perawat contoh. */
export const SEMUA_PERAWAT: Nurse[] = [];

export function dokterByPenempatan(penempatan: 'Poli' | 'IGD' | 'Operasi' | 'Rawat Inap' | string): Doctor[] {
  return SEMUA_DOKTER.filter(d => d.penempatan.includes(penempatan));
}
