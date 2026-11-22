import { storage } from '../utils/storage';
import {
  generateAllPatientsWithResumes,
  generate50IGDPatients,
  generate50InpatientBeds,
  generate50SurgeryPatients,
  generate50LabAndRadRequests
} from './patientPelayananData';
import { DATA_DOKTER_JAGA_LENGKAP } from './dataDokterJagaLengkap';

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

const FIRST_NAMES = [
  'Andi', 'Budi', 'Citra', 'Doni', 'Eka', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko',
  'Kartika', 'Lukman', 'Maya', 'Nugroho', 'Olivia', 'Pratama', 'Rina', 'Siti', 'Taufik', 'Utami',
  'Vina', 'Wahyu', 'Yuliana', 'Zulfikar', 'Bambang', 'Dian', 'Fachri', 'Hany', 'Irawan', 'Kurniawan'
];

const LAST_NAMES = [
  'Pratama', 'Wijaya', 'Kusuma', 'Santoso', 'Putri', 'Hidayat', 'Savitri', 'Gunawan', 'Permata', 'Susanto',
  'Wulandari', 'Hakim', 'Lestari', 'Saputra', 'Siregar', 'Alamsyah', 'Setiawan', 'Aminah', 'Ramadhan', 'Nugraha',
  'Mahendra', 'Purnomo', 'Syahputra', 'Firmansyah', 'Sudrajat', 'Suharto', 'Yudhistira', 'Anwar', 'Chandra', 'Darsono'
];

const STREETS = ['Jl. Sudirman', 'Jl. Thamrin', 'Jl. Gatot Subroto', 'Jl. Melawai', 'Jl. Kemang', 'Jl. Kebon Jeruk', 'Jl. Menteng', 'Jl. Kuningan', 'Jl. Senayan', 'Jl. Asia Afrika'];

// 1. DATA PASIEN LENGKAP DENGAN RESUME MEDIS & PROFIL KLINIS 100+ PASIEN
export const PASIEN = generateAllPatientsWithResumes();

// 2. MASTER DOKTER DARI PAKET ASET MYITARU
export const SEMUA_DOKTER: Doctor[] = DATA_DOKTER_JAGA_LENGKAP.map((record) => ({
  id: record.id,
  nip: record.nip,
  sip: record.sip,
  str: record.str,
  nama: record.nama,
  spesialis: record.spesialis || record.spesialisasi,
  subspesialis: record.subspesialis,
  poli: record.poli_nama || record.unit_tugas,
  poli_id: record.poli_id || 'POL-01',
  penempatan: record.penempatan || record.unit_tugas,
  jabatan: record.peran,
  jadwal: `${record.hari_praktik} - ${record.jam_praktik}`,
  hari: record.hari_praktik,
  jam: record.jam_praktik,
  shift: record.shift,
  ruangan: record.ruangan,
  kuota: record.kuota_pasien,
  pasien_terlayani: record.pasien_terlayani,
  status_jaga: record.status_kehadiran,
  kontak: record.kontak_darurat,
  email: record.email,
  status: 'Aktif'
}));

// 3. DATA PERAWAT LENGKAP & SINKRON
export const SEMUA_PERAWAT: Nurse[] = MASTER_POLIKLINIK.flatMap((poli, idx) => {
  return [1, 2].map(nNum => {
    const nIdx = idx * 2 + nNum;
    const fName = FIRST_NAMES[(nIdx * 2) % FIRST_NAMES.length];
    const lName = LAST_NAMES[(nIdx * 5) % LAST_NAMES.length];
    const isBidan = poli.kode === 'OBG' || poli.kode === 'FTM';

    return {
      id: `NUR-${nIdx}`,
      nip: `NIP-${String(2000 + nIdx)}`,
      nama: `${isBidan ? 'Bdn.' : 'Ns.'} ${fName} ${lName}, S.Tr.Kep`,
      jabatan: isBidan ? 'Bidan Pelaksana' : (nNum === 1 ? 'Penanggung Jawab Poli (PJ)' : 'Perawat Pelaksana'),
      unit: poli.nama,
      shift: nNum === 1 ? 'Pagi (07:00 - 14:00)' : 'Siang (14:00 - 21:00)',
      status: 'Aktif'
    };
  });
});

export function dokterByPenempatan(penempatan: 'Poli' | 'IGD' | 'Operasi' | 'Rawat Inap' | string): Doctor[] {
  return SEMUA_DOKTER.filter(d => d.penempatan.includes(penempatan));
}

export function initSeedData() {
  try {
    // Check if initial master data is already loaded to prevent redundant writes
    const existingPasien = storage.get('hospital_pasien', null);
    if (!existingPasien || !Array.isArray(existingPasien) || existingPasien.length === 0) {
      // 1. Sync Doctors & Nurses
      storage.set('db_dokter', SEMUA_DOKTER);
      storage.set('db_dokter_igd', SEMUA_DOKTER.filter(d => d.penempatan.includes('IGD')));
      storage.set('hospital_dokter', SEMUA_DOKTER);
      storage.set('db_perawat', SEMUA_PERAWAT);
      storage.set('hospital_perawat', SEMUA_PERAWAT);
      storage.set('hospital_poli_master', MASTER_POLIKLINIK);

      // 2. Sync 100+ Patients with Full Medical Resumes & Clinical Profiles
      storage.set('db_pasien', PASIEN);
      storage.set('hospital_pasien', PASIEN);
      
      const resumes = PASIEN.map(p => p.resume_medis).filter(Boolean);
      storage.set('hospital_resumes', resumes);
      storage.set('db_resumes', resumes);

      // 3. Sync 50+ IGD / Emergency Cases
      const igdPatients = generate50IGDPatients();
      storage.set('myitaru_igd_triase', igdPatients);
      storage.set('hospital_emergency_triage', igdPatients);
      storage.set('hospital_igd_Penanganan IGD', igdPatients.map(p => ({
        waktu: p.waktu,
        nama_pasien: p.nama_pasien,
        no_rm: p.no_rm,
        kondisi: p.kondisi,
        tindakan: p.tindakan,
        status: p.status
      })));
      storage.set('hospital_igd_Observasi', igdPatients.map(p => ({
        waktu: p.waktu,
        nama_pasien: p.nama_pasien,
        tensi: p.tensi,
        nadi: p.nadi,
        suhu: p.suhu,
        rr: p.rr,
        spo2: p.spo2,
        dokter_jaga: p.dokter_jaga,
        status: p.status
      })));
      storage.set('hospital_igd_Dokter IGD', igdPatients.map(p => ({
        waktu: p.waktu,
        nama_pasien: p.nama_pasien,
        triage: p.triage,
        diagnosa: p.diagnosa,
        dokter_dpjp: p.dokter_jaga,
        tindakan: p.tindakan,
        status: p.status
      })));

      // 4. Sync 50+ Rawat Inap (Inpatient Beds & Admisi & Visite & Discharge)
      const beds = generate50InpatientBeds();
      storage.set('hospital_beds', beds);
      storage.set('hospital_ranap_Admisi', beds.filter(b => b.status === 'Terisi').map(b => ({
        tanggal: b.tanggal,
        nama_pasien: b.nama_pasien,
        no_rm: b.no_rm,
        ruangan: b.ruangan,
        diagnosa: b.diagnosa,
        penjamin: b.penjamin,
        status: 'Dirawat'
      })));
      storage.set('hospital_ranap_Visite', beds.filter(b => b.status === 'Terisi').map(b => ({
        tanggal: b.tanggal,
        nama_pasien: b.nama_pasien,
        ruangan: b.ruangan,
        dpjp: b.dpjp,
        catatan_visite: `S: Pasien mengeluh nyeri berkurang. O: TD 120/80, Nadi 80x/m, afebris. A: ${b.diagnosa} perbaikan. P: Lanjutkan terapi antibiotik & analgetik oral.`,
        status: 'Selesai Visite'
      })));
      storage.set('hospital_ranap_Asuhan Keperawatan', beds.filter(b => b.status === 'Terisi').map((b, idx) => ({
        tanggal: b.tanggal,
        nama_pasien: b.nama_pasien,
        ruangan: b.ruangan,
        diagnosa_keperawatan: idx % 2 === 0 ? 'Nyeri Akut b.d Agen Pencedera Fisiologis (SDKI D.0077)' : 'Risiko Ketidakseimbangan Cairan (SDKI D.0036)',
        intervensi: idx % 2 === 0 ? 'Manajemen Nyeri (SIKI I.08238): Observasi skala nyeri, ajarkan teknik relaksasi napas dalam' : 'Manajemen Cairan (SIKI I.03098): Monitor intake & output per 8 jam, observasi turgor kulit',
        perawat: idx % 2 === 0 ? 'Ns. Rina Wulandari, S.Kep' : 'Ns. Hendra Saputra, S.Kep',
        status: 'Terlaksana'
      })));
      storage.set('hospital_ranap_Discharge Planning', beds.filter(b => b.status === 'Terisi').map(b => ({
        tanggal: b.tanggal,
        nama_pasien: b.nama_pasien,
        ruangan: b.ruangan,
        resume_pulang: `Pasien telah dirawat dengan diagnosis ${b.diagnosa}. Kondisi saat ini stabil dan siap pulang rawat jalan.`,
        kondisi_keluar: 'Perbaikan',
        jadwal_kontrol: '3 hari pasca pulang di Poli Spesialis Terkait',
        status: 'Siap Discharge'
      })));

      // 5. Sync 50+ Kamar Operasi / Bedah Cases
      const surgeries = generate50SurgeryPatients();
      storage.set('hospital_ok_jadwal', surgeries);
      storage.set('hospital_ok_Pasien Operasi', surgeries);
      storage.set('hospital_ok_Laporan Operasi', surgeries.map(s => ({
        nomor: s.nomor,
        nama_pasien: s.nama_pasien,
        tindakan: s.tindakan,
        kode_icd9: s.kode_icd9,
        operator: s.operator,
        anastesi: s.anastesi,
        tanggal: s.tanggal,
        durasi: s.durasi,
        status: s.status
      })));
      storage.set('hospital_ok_Paket Operasi', [
        { nama_paket: 'Paket Laparoskopi Kolesistektomi', jenis: 'Bedah Digestif Mayor', kelas: 'Kelas 1 / VIP', estimasi_biaya: 'Rp 22.500.000', status: 'Tersedia' },
        { nama_paket: 'Paket Seksio Sesarea Cito & ERACS', jenis: 'Obstetri & Ginekologi', kelas: 'Kelas 1 / VIP', estimasi_biaya: 'Rp 18.000.000', status: 'Tersedia' },
        { nama_paket: 'Paket ORIF Fraktur Ekstremitas', jenis: 'Orthopedi & Traumatologi', kelas: 'Kelas 1 / Kelas 2', estimasi_biaya: 'Rp 25.000.000', status: 'Tersedia' },
        { nama_paket: 'Paket Fakoemulsifikasi Katarak + IOL', jenis: 'Bedah Mata Mikro', kelas: 'One Day Care', estimasi_biaya: 'Rp 9.500.000', status: 'Tersedia' },
        { nama_paket: 'Paket TURP Prostat Endourologi', jenis: 'Urologi', kelas: 'Kelas 1 / Kelas 2', estimasi_biaya: 'Rp 16.500.000', status: 'Tersedia' }
      ]);

      // 6. Sync 55 Lab & Radiology Requests and Results
      const labRad = generate50LabAndRadRequests();
      storage.set('hospital_lab_rad', labRad);
      storage.set('hospital_laboratorium_Permintaan Lab', labRad.filter(x => x.type === 'Lab'));
      storage.set('hospital_laboratorium_Hasil Lab', labRad.filter(x => x.type === 'Lab'));
      storage.set('hospital_laboratorium_Validasi Hasil', labRad.filter(x => x.type === 'Lab' && x.status === 'Tervalidasi'));
      storage.set('hospital_radiologi_Permintaan Radiologi', labRad.filter(x => x.type === 'Radiologi'));
      storage.set('hospital_radiologi_Hasil Radiologi', labRad.filter(x => x.type === 'Radiologi'));
    }
  } catch (e) {
    console.warn('[seedData] Failed to initialize seed data safely', e);
  }
}

initSeedData();
