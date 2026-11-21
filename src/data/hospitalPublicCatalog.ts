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
  emergencyPhone: string;
  appointmentPhone: string;
  whatsappPhone: string;
  bedsCount: number;
  accreditation: string;
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

export const HOSPITAL_SERVICES: HospitalServiceItem[] = [
  {
    id: 'srv-ralan',
    title: 'Poliklinik Rawat Jalan Spesialis',
    category: 'Klinik & Darurat',
    poliKode: 'PDL',
    availability: 'Senin – Sabtu · 07:00 – 21:00 WIB',
    summary:
      'Layanan konsultasi lebih dari 18 poliklinik spesialis & subspesialis dengan sistem antrean digital terintegrasi.',
    highlights: ['Booking Online Tanpa Antre Loket', 'Rekam Medis Terpadu', 'Resep Elektronik Langsung ke Farmasi']
  },
  {
    id: 'srv-ranap',
    title: 'Rawat Inap & Perawatan Intensif',
    category: 'Klinik & Darurat',
    poliKode: 'PDL',
    availability: 'Layanan 24 Jam · Deluxe hingga Junior Suite',
    summary:
      'Kamar perawatan nyaman dari kelas Deluxe hingga Junior Suite, ICU/NICU/PICU dengan pengawasan perawat dan dokter jaga 24 jam.',
    highlights: ['5 Pilihan Kelas Kamar Nyaman', 'Monitor Tanda Vital Kontinu', 'Gizi Klinis Terukur per Pasien']
  },
  {
    id: 'srv-igd',
    title: 'IGD & Ambulans Siaga 24 Jam',
    category: 'Klinik & Darurat',
    poliKode: 'IGD',
    availability: 'Buka 24 Jam · Hotline 1-500-911',
    summary:
      'Penanganan kegawatdaruratan medis, trauma, Code Stroke, dan nyeri dada akut dengan sistem triase cepat < 5 menit.',
    highlights: ['Jalur Triase Cepat (Merah/Kuning/Hijau)', 'CT-Scan & Lab Cito Terhubung', 'Ambulans Medik Lengkap']
  },
  {
    id: 'srv-ok',
    title: 'Kamar Operasi Sentral (OK)',
    category: 'Klinik & Darurat',
    poliKode: 'BDH',
    availability: 'Terjadwal & Cito 24 Jam',
    summary:
      'Ruang bedah bertekanan positif HEPA filter untuk bedah umum, orthopedi artroskopi, bedah saraf, mata, dan kebidanan.',
    highlights: ['Protokol Keselamatan Bedah WHO', 'Bedah Minimal Invasif & Laparoskopi', 'Ruang Pemulihan Terpantau']
  },
  {
    id: 'srv-lab',
    title: 'Laboratorium Patologi Klinik 24 Jam',
    category: 'Penunjang Medis',
    poliKode: 'MCU',
    availability: 'Buka 24 Jam · Tersedia Home Care',
    summary:
      'Pemeriksaan hematologi, kimia klinik, imunologi, mikrobiologi, dan biomarker jantung dengan hasil validasi Sp.PK di App Mobile.',
    highlights: ['Hasil Tervalidasi Muncul di HP', 'Layanan Ambil Darah di Rumah', 'Akurasi Terkalibrasi Otomatis']
  },
  {
    id: 'srv-rad',
    title: 'Radiologi & Pencitraan CT-Scan 128 Slices',
    category: 'Penunjang Medis',
    poliKode: 'MCU',
    availability: 'Buka 24 Jam · PACS Digital',
    summary:
      'CT-Scan 128 Slices, MRI Resolusi Tinggi, USG 4D Fetomaternal, Mammografi, serta Rontgen Digital cepat tanpa film fisik.',
    highlights: ['CT Angiografi Koroner Non-Invasif', 'Bacaan Dokter Spesialis Radiologi Cepat', 'Arsip PACS Digital Aman']
  },
  {
    id: 'srv-farmasi',
    title: 'Instalasi Farmasi Klinis 24 Jam',
    category: 'Penunjang Medis',
    poliKode: 'UMM',
    availability: 'Buka 24 Jam · Rawat Jalan & Ranap',
    summary:
      'Penyediaan obat paten, generik, racikan anak, dan penjaminan obat kronis PRB BPJS dengan telaah interaksi obat klinis.',
    highlights: ['Pengecekan Interaksi Obat Otomatis', 'Status Antrean Obat di App Pasien', 'Konseling Apoteker Berpengalaman']
  },
  {
    id: 'srv-mcu',
    title: 'Executive Medical Check-Up (MCU)',
    category: 'Penunjang Medis',
    poliKode: 'MCU',
    availability: 'Senin – Sabtu · 07:00 – 14:00 WIB',
    summary:
      'Pemeriksaan kesehatan komprehensif personal, calon karyawan, maupun paket korporasi dalam satu lantai terpadu yang efisien.',
    highlights: ['Area Pemeriksaan Khusus Terpisah', 'Hasil Rangkuman Medis di Hari Sama', 'Paket Custom Korporasi & Keluarga']
  },
  {
    id: 'srv-fisio',
    title: 'Fisioterapi, Rehab Medik & Home Care',
    category: 'Terapi & Khusus',
    poliKode: 'RHB',
    availability: 'Senin – Sabtu · Klinik & Kunjungan Rumah',
    summary:
      'Pemulihan fungsi gerak pascastroke, cedera olahraga, nyeri punggung bawah, hingga layanan fisioterapi eksklusif di rumah pasien.',
    highlights: ['Program Latihan Personal 1-on-1', 'Modalitas Ultrasound, TENS & Diathermy', 'Layanan Fisioterapi Home Care']
  },
  {
    id: 'srv-hd',
    title: 'Unit Hemodialisa (Cuci Darah)',
    category: 'Terapi & Khusus',
    poliKode: 'PDL',
    availability: 'Senin – Sabtu · 3 Sesi Perawatan',
    summary:
      'Layanan dialisis dengan mesin water treatment RO berstandar tinggi di bawah supervisi Konsultan Ginjal Hipertensi.',
    highlights: ['Mesin Dialisis Generasi Terbaru', 'Ruang Isolasi & Reguler Terpisah', 'Dukungan Penjaminan BPJS & Swasta']
  },
  {
    id: 'srv-pain',
    title: 'Pain Clinic & Sports Medicine',
    category: 'Terapi & Khusus',
    poliKode: 'NYR',
    availability: 'Senin – Sabtu · Sesuai Jadwal Dokter',
    summary:
      'Penanganan nyeri kronis tulang belakang, sendi lutut, bahu, dan pemulihan cedera atlet secara non-bedah maupun intervensi.',
    highlights: ['Intervensi Nyeri Dipandu USG/C-Arm', 'Evaluasi Biomekanika Cedera Olahraga', 'Kolaborasi Orthopedi & Rehab']
  },
  {
    id: 'srv-tele',
    title: 'Telemedicine & Konsultasi Online',
    category: 'Terapi & Khusus',
    poliKode: 'UMM',
    availability: 'Setiap Hari · 08:00 – 20:00 WIB',
    summary:
      'Konsultasi jarak jauh dengan dokter umum maupun spesialis pilihan dilengkapi pengiriman resep obat langsung ke rumah.',
    highlights: ['Terhubung ke Rekam Medis Pasien', 'Evaluasi Hasil Lab Tanpa Harus Datang', 'Pengantaran Obat Resep']
  }
];

export const CENTERS_OF_EXCELLENCE: CenterOfExcellence[] = [
  {
    id: 'coe-ortho',
    slug: 'orthopedi',
    title: 'Orthopedic & Sports Center',
    subtitle: 'Rekonstruksi Sendi, Lutut & Cedera Olahraga',
    poliKode: 'ORT',
    highlightMetric: 'Arthroscopy Suite',
    services: ['Total Knee & Hip Replacement', 'Rekonstruksi ACL Minimal Invasif', 'Penanganan Cedera Bahu & Pergelangan', 'Fisioterapi Pascacedera Terukur'],
    description: 'Pusat unggulan bedah tulang, sendi, dan kedokteran olahraga dengan teknik minimal invasif untuk mempercepat kembalinya mobilitas pasien.'
  },
  {
    id: 'coe-cardiac',
    slug: 'jantung',
    title: 'Heart & Vascular Center',
    subtitle: 'Kardiologi Intervensi & Pembuluh Darah',
    poliKode: 'JNT',
    highlightMetric: 'Cath Lab 24/7',
    services: ['Primary PCI Akut < 90 Menit', 'Echocardiography 4D & Treadmill', 'CT Angiografi Koroner', 'Rehabilitasi Jantung Terpadu'],
    description: 'Penanganan komprehensif penyakit jantung koroner, aritmia, dan hipertensi oleh tim dokter spesialis jantung berpengalaman.'
  },
  {
    id: 'coe-neuro',
    slug: 'saraf',
    title: 'Brain, Spine & Stroke Center',
    subtitle: 'Neurologi Akut & Bedah Saraf Tulang Belakang',
    poliKode: 'SRF',
    highlightMetric: 'Code Stroke Ready',
    services: ['Trombolisis Stroke Golden Period', 'Penanganan Saraf Kejepit (HNP)', 'MRI & CT Perfusion Cepat', 'Klinik Nyeri Kronis & Epilepsi'],
    description: 'Unit respons cepat stroke dan kelainan saraf tulang belakang terintegrasi diagnostik pencitraan resolusi tinggi serta fisioterapi dini.'
  },
  {
    id: 'coe-eye',
    slug: 'mata',
    title: 'Eye Center',
    subtitle: 'Katarak Fakoemulsifikasi & Kesehatan Retina',
    poliKode: 'MAT',
    highlightMetric: 'Micro-Incision Surgery',
    services: ['Operasi Katarak Tanpa Jahitan', 'Skrining Glaukoma & Retinopati Diabetik', 'OCT Retina & Biometri Presisi', 'Klinik Refraksi Anak & Dewasa'],
    description: 'Pelayanan kesehatan mata modern dari pemeriksaan refraksi presisi hingga bedah mikro katarak dengan pemulihan penglihatan cepat.'
  },
  {
    id: 'coe-dental',
    slug: 'gigi',
    title: 'Dental & Oral Center',
    subtitle: 'Konservasi Gigi, Bedah Mulut & Ortodonti',
    poliKode: 'GIG',
    highlightMetric: 'Sterilisasi CSSD Penuh',
    services: ['Perawatan Saluran Akar Modern', 'Pencabutan Gigi Bungsu Impaksi', 'Ortodonti & Estetik Gigi', 'Kedokteran Gigi Anak Ramah Anak'],
    description: 'Layanan perawatan kesehatan gigi menyeluruh dengan alat berstandar sterilisasi rumah sakit dan ruang perawatan nyaman.'
  },
  {
    id: 'coe-endo-uro',
    slug: 'endoskopi-urologi',
    title: 'Endoscopy & Urology Center',
    subtitle: 'Saluran Cerna, Batu Ginjal & Prostat',
    poliKode: 'URL',
    highlightMetric: 'Minimal Invasif',
    services: ['Gastroskopi & Kolonoskopi Diagnostik', 'Penanganan Batu Ginjal Tanpa Sayatan Besar', 'Terapi Gangguan Prostat Terpadu', 'Pemeriksaan Hati & Saluran Empedu'],
    description: 'Diagnostik dan intervensi modern saluran cerna serta sistem perkemihan dengan nyeri minimal dan masa rawat lebih singkat.'
  },
  {
    id: 'coe-women',
    slug: 'ibu-anak',
    title: 'Mother & Child Sanctuary',
    subtitle: 'Kebidanan, Fetomaternal & Pediatri Terpadu',
    poliKode: 'OBG',
    highlightMetric: 'NICU Level III',
    services: ['Persalinan ERACS Minimal Nyeri', 'USG 4D Fetomaternal', 'Klinik Tumbuh Kembang Anak', 'Imunisasi Lengkap Anak & Dewasa'],
    description: 'Pendampingan kehamilan, persalinan nyaman, hingga pemantauan tumbuh kembang dan imunisasi anak dalam suasana ramah keluarga.'
  },
  {
    id: 'coe-oncology',
    slug: 'onkologi',
    title: 'Integrated Oncology Center',
    subtitle: 'Deteksi Dini, Bedah & Terapi Sistemik',
    poliKode: 'ONK',
    highlightMetric: 'Tumor Board Multidisiplin',
    services: ['Skrining Kanker Payudara & Serviks', 'Kemoterapi Rawat Jalan Nyaman', 'Bedah Onkologi Terpadu', 'Dukungan Gizi & Paliatif Holistik'],
    description: 'Pendampingan pasien onkologi berbasis rencana terapi personal dari tim bedah onkologi, penyakit dalam, dan gizi klinis.'
  }
];

export const HOSPITAL_PROMOS: HospitalPromo[] = [
  {
    id: 'promo-fisio',
    tag: 'HOME CARE EKSKLUSIF',
    title: 'Fisioterapi & Rehabilitasi di Rumah Anda',
    subtitle: 'Pemulihan pascastroke, nyeri punggung, dan cedera olahraga didampingi fisioterapis bersertifikat langsung ke rumah.',
    poliKode: 'RHB',
    validUntil: 'Tersedia Setiap Hari',
    benefit: 'Kunjungan Terjadwal + Laporan Progres ke Dokter Sp.KFR',
    presetNote: 'Permintaan Layanan Promo Fisioterapi Home Care'
  },
  {
    id: 'promo-jantung',
    tag: 'DETEKSI DINI KARDIO',
    title: 'Paket Skrining Jantung & Pembuluh Darah',
    subtitle: 'Cegah risiko serangan jantung mendadak dengan evaluasi EKG, Treadmill Test, Profil Lipid, dan konsultasi Sp.JP.',
    poliKode: 'JNT',
    validUntil: 'Periode Promo 2026',
    benefit: 'Hasil Terintegrasi Langsung ke Aplikasi Mobile Pasien',
    presetNote: 'Pendaftaran Paket Promo Skrining Jantung'
  },
  {
    id: 'promo-vaksin',
    tag: 'IMUNISASI KELUARGA',
    title: 'Layanan Vaksinasi Influenza, Pneumonia & HPV',
    subtitle: 'Perlindungan imunitas dewasa, lansia, serta persiapan perjalanan dengan vaksin resmi terjamin rantai dinginnya.',
    poliKode: 'PDL',
    validUntil: 'Poliklinik Imunisasi Dewasa',
    benefit: 'Gratis Konsultasi Skrining Pra-Vaksinasi',
    presetNote: 'Pendaftaran Promo Vaksinasi Keluarga'
  },
  {
    id: 'promo-mata',
    tag: 'EYE CENTER',
    title: 'Skrining Katarak & Kesehatan Retina Mata',
    subtitle: 'Pemeriksaan menyeluruh tajam penglihatan, tekanan bola mata, serta evaluasi retina bagi penderita diabetes.',
    poliKode: 'MAT',
    validUntil: 'Poliklinik Mata Terpadu',
    benefit: 'Dapat Menggunakan Penjaminan Umum maupun Asuransi',
    presetNote: 'Pendaftaran Skrining Eye Center'
  }
];

export const INPATIENT_ROOMS: InpatientRoomClass[] = [
  {
    id: 'room-deluxe',
    name: 'Kelas Deluxe',
    tierLabel: 'Nyaman & Terjangkau',
    pricePerNight: 650000,
    capacity: '2 Tempat Tidur / Kamar',
    visitingHours: '10:00 – 12:00 WIB & 18:00 – 20:00 WIB',
    summary: 'Ruang perawatan dengan tirai privasi penuh, pencahayaan alami, dan akses cepat ke stasiun perawat.',
    amenities: ['Tempat Tidur Elektrik Pasien', 'TV & Wi-Fi Pasien', 'Kamar Mandi Dalam Air Hangat', 'Nurse Call 24 Jam', 'Makan Pasien 3x + Snack Gizi']
  },
  {
    id: 'room-superior',
    name: 'Kelas Superior',
    tierLabel: 'Privat 1 Pasien',
    pricePerNight: 1150000,
    capacity: '1 Tempat Tidur Privat',
    visitingHours: '10:00 – 12:00 WIB & 18:00 – 20:00 WIB',
    summary: 'Kamar satu pasien yang tenang untuk mendukung istirahat optimal dan privasi penuh bersama satu pendamping.',
    amenities: ['1 Pasien per Kamar (Full Privat)', 'Sofa Bed Pendamping', 'Lemari Pakaian & Kulkas Mini', 'Smart TV & Wi-Fi Kecepatan Tinggi', 'Makan Pasien Terjadwal Ahli Gizi']
  },
  {
    id: 'room-premiere',
    name: 'Kelas Premiere',
    tierLabel: 'Ruang Luas & Modern',
    pricePerNight: 1650000,
    capacity: '1 Tempat Tidur + Area Keluarga',
    visitingHours: '10:00 – 12:00 WIB & 18:00 – 20:00 WIB',
    summary: 'Kamar perawatan lebih lega dilengkapi meja makan pendamping dan fasilitas hospitality modern.',
    amenities: ['Ruang Rawat Lebih Luas', 'Sofa Bed & Meja Pendamping', 'Welcome Amenity Kit Pasien', 'Dispenser Air & Teko Pemanas', 'Prioritas Layanan Farmasi Kamar']
  },
  {
    id: 'room-executive',
    name: 'Kelas Executive',
    tierLabel: 'Suite Hospitality',
    pricePerNight: 2450000,
    capacity: 'Suite 1 Pasien + Ruang Tamu',
    visitingHours: '10:00 – 12:00 WIB & 18:00 – 20:00 WIB',
    summary: 'Dirancang menyerupai kamar hotel berbintang dengan ruang tamu terpisah agar keluarga tetap nyaman mendampingi.',
    amenities: ['Ruang Tamu Terpisah untuk Penunggu', '2 Smart TV & Akses Wi-Fi Khusus', 'Pantry Mini & Kulkas 2 Pintu', 'Pilihan Menu Gizi Khusus', 'Layanan Administrasi Kepulangan di Kamar']
  },
  {
    id: 'room-junior-suite',
    name: 'Junior Suite',
    tierLabel: 'Layanan Paripurna',
    pricePerNight: 3400000,
    capacity: 'Grand Suite + Ruang Keluarga',
    visitingHours: 'Fleksibel sesuai izin DPJP & kenyamanan pasien',
    summary: 'Tipe kamar perawatan tertinggi dengan area keluarga luas, pemandangan kota yang tenang, serta layanan perawat prioritas.',
    amenities: ['Area Keluarga & Ruang Tamu Luas', 'Kamar Tidur Pendamping Terpisah', 'Complimentary Meal untuk 1 Pendamping', 'Peralatan Mandi & Amenity Premium', 'Koordinasi Discharge Eksekutif']
  }
];

export const VISITING_HOURS_INFO = {
  morningSession: '10:00 – 12:00 WIB',
  eveningSession: '18:00 – 20:00 WIB',
  rules: [
    'Maksimal 2 pengunjung secara bergantian di dalam kamar pasien demi menjaga ketenangan pemulihan.',
    'Anak di bawah usia 12 tahun tidak disarankan memasuki ruang perawatan demi pencegahan infeksi.',
    'Pengunjung dengan gejala batuk, pilek, atau demam dimohon menggunakan masker medis atau menunda kunjungan.'
  ]
};

export const INSURANCE_PARTNERS: InsurancePartner[] = [
  { id: 'ins-bpjs', name: 'BPJS Kesehatan', type: 'JKN / Pemerintah', coverageNote: 'Terintegrasi Bridging V-Claim & Antrean Online JKN' },
  { id: 'ins-inhealth', name: 'Mandiri Inhealth', type: 'Asuransi Swasta', coverageNote: 'Cashless Rawat Jalan & Rawat Inap' },
  { id: 'ins-admedika', name: 'AdMedika (Telkom Group)', type: 'Korporasi & TPA', coverageNote: 'Verifikasi Kartu Digital & Surat Jaminan' },
  { id: 'ins-prudential', name: 'Prudential Indonesia', type: 'Asuransi Swasta', coverageNote: 'PRUHospital & Surgical Partner' },
  { id: 'ins-allianz', name: 'Allianz Life Indonesia', type: 'Asuransi Swasta', coverageNote: 'Jaringan Layanan Cashless Rawat Inap' },
  { id: 'ins-axa', name: 'AXA Mandiri Financial', type: 'Asuransi Swasta', coverageNote: 'Perlindungan Kesehatan Individu & Keluarga' },
  { id: 'ins-brilife', name: 'BRI Life', type: 'Asuransi Swasta', coverageNote: 'Penjaminan Karyawan & Nasabah Korporasi' },
  { id: 'ins-sinarmas', name: 'Sinarmas MSIG & Simas Sehat', type: 'Asuransi Swasta', coverageNote: 'Rawat Jalan Spesialis & Inap' },
  { id: 'ins-jasaraharja', name: 'Jasa Raharja', type: 'JKN / Pemerintah', coverageNote: 'Penjaminan Kecelakaan Lalu Lintas IGD 24 Jam' },
  { id: 'ins-pertamedika', name: 'Pertamina & BUMN Medika', type: 'Korporasi & TPA', coverageNote: 'Kerja Sama Korporasi & MCU Tahunan' },
  { id: 'ins-bcalife', name: 'BCA Life', type: 'Asuransi Swasta', coverageNote: 'Penjaminan Rawat Inap Terpadu' },
  { id: 'ins-bnilife', name: 'BNI Life', type: 'Asuransi Swasta', coverageNote: 'Layanan Cashless Poliklinik & Rawat Inap' }
];

export const MCU_PACKAGES: MCUPackage[] = [
  {
    id: 'mcu-essential',
    name: 'MCU Essential Wellness',
    tier: 'Dasar & Pekerja',
    price: 950000,
    duration: '± 2 Jam',
    fastingRequired: true,
    highlights: [
      'Konsultasi Dokter Pemeriksa',
      'Darah Lengkap & Urine Rutin',
      'Gula Darah Puasa & Profil Kolesterol',
      'Fungsi Hati (SGOT/SGPT) & Ginjal (Ureum/Kreatinin)',
      'Rontgen Thorax PA Digital'
    ],
    recommendedFor: 'Evaluasi tahunan karyawan & dewasa muda'
  },
  {
    id: 'mcu-cardiac',
    name: 'MCU Executive Heart & Metabolic',
    tier: 'Eksekutif Populer',
    price: 2450000,
    duration: '± 3,5 Jam',
    fastingRequired: true,
    highlights: [
      'Konsultasi Dokter Spesialis Penyakit Dalam',
      'EKG 12 Lead & Treadmill Stress Test',
      'HbA1c, Profil Lipid Lengkap & Asam Urat',
      'USG Whole Abdomen (Hati, Empedu, Ginjal)',
      'Laporan Lengkap Digital di Aplikasi Mobile'
    ],
    recommendedFor: 'Usia 30+ tahun dengan gaya hidup aktif & berisiko tinggi'
  },
  {
    id: 'mcu-senior',
    name: 'MCU Comprehensive Senior & Longevity',
    tier: 'Paripurna',
    price: 3850000,
    duration: '± 4,5 Jam',
    fastingRequired: true,
    highlights: [
      'Konsultasi Spesialis Jantung & Penyakit Dalam',
      'Echocardiography & Skrining Tiroid (TSH/FT4)',
      'Panel Tumor Marker (CEA / AFP / PSA atau CA-125)',
      'Spirometri Paru & Audiometri',
      'Sarapan Bergizi & Lounge Eksekutif Privat'
    ],
    recommendedFor: 'Orang tua & evaluasi kesehatan menyeluruh'
  }
];

export const HOSPITAL_BRANCHES: HospitalBranch[] = [
  {
    id: 'MYI-JKT',
    name: 'MYITARU Pusat (Flagship)',
    city: 'Jakarta Pusat',
    address: 'Jl. Kesehatan Raya No. 88, Menteng, Jakarta Pusat 10310',
    emergencyPhone: '1-500-911',
    appointmentPhone: '(021) 5098-8800',
    whatsappPhone: '0811-1500-911',
    bedsCount: 380,
    accreditation: 'KARS Paripurna · SatuSehat Terintegrasi',
    hours: 'IGD & Farmasi 24 Jam · Poliklinik 07:00 – 21:00 WIB'
  },
  {
    id: 'MYI-TNG',
    name: 'MYITARU Karawaci',
    city: 'Tangerang',
    address: 'Jl. Boulevard Medika Kav. 12, Lippo Village, Tangerang 15811',
    emergencyPhone: '1-500-911',
    appointmentPhone: '(021) 5460-2200',
    whatsappPhone: '0811-5460-220',
    bedsCount: 240,
    accreditation: 'KARS Paripurna',
    hours: 'IGD & Laboratorium 24 Jam · Poliklinik 08:00 – 20:00 WIB'
  },
  {
    id: 'MYI-SBY',
    name: 'MYITARU Surabaya',
    city: 'Surabaya',
    address: 'Jl. Mayjen Sungkono No. 105, Gubeng, Surabaya 60281',
    emergencyPhone: '1-500-911',
    appointmentPhone: '(031) 5020-7700',
    whatsappPhone: '0811-5020-770',
    bedsCount: 210,
    accreditation: 'KARS Paripurna',
    hours: 'IGD 24 Jam · Poliklinik 08:00 – 20:00 WIB'
  }
];

export const HEALTH_ARTICLES: HealthArticle[] = [
  {
    id: 'art-stroke',
    category: 'Neurologi & Gawat Darurat',
    title: 'Kenali Tanda Dini Stroke dengan Metode SeGeRa Ke RS',
    readMinutes: 4,
    author: 'Tim Dokter Spesialis Saraf MYITARU',
    date: 'Update Medis 2026',
    summary: 'Penanganan stroke iskemik dalam 4,5 jam pertama menentukan kualitas pemulihan fungsi gerak dan bicara pasien.',
    body: [
      'Setiap menit saat pembuluh darah otak tersumbat, jutaan sel saraf kehilangan suplai oksigen. Karena itu, keluarga perlu mengenali gejala awal stroke secara cepat tanpa menunda.',
      'Ingat akronim SeGeRa Ke RS: Senyum tidak simetris, Gerak separuh anggota tubuh melemah tiba-tiba, bicaRa pelo atau sulit memahami kata, Kebas/baal separuh tubuh, Rabun mendadak, serta Sakit kepala hebat yang belum pernah dirasakan sebelumnya.',
      'Unit Code Stroke MYITARU siaga 24 jam dengan CT-Scan cepat di dekat IGD sehingga pasien segera menerima terapi trombolisis bila memenuhi kriteria klinis.'
    ]
  },
  {
    id: 'art-cardiac',
    category: 'Kardiologi',
    title: 'Kapan Nyeri Dada Memerlukan Pemeriksaan EKG dan Troponin Segera?',
    readMinutes: 5,
    author: 'Tim Heart & Vascular Center MYITARU',
    date: 'Update Medis 2026',
    summary: 'Membedakan nyeri dada akibat asam lambung dengan serangan jantung akut yang memerlukan pertolongan segera.',
    body: [
      'Nyeri dada akibat penyakit jantung koroner umumnya terasa seperti ditekan benda berat di tengah atau sisi kiri dada, menjalar ke rahang, punggung, atau lengan kiri, dan disertai keringat dingin maupun sesak napas.',
      'Bila gejala berlangsung lebih dari 15 menit dan tidak membaik dengan istirahat, segera kunjungi IGD 24 Jam untuk pemeriksaan EKG dalam 10 menit dan pemeriksaan enzim jantung Troponin I.',
      'Pasien dengan riwayat hipertensi, diabetes, atau kolesterol tinggi disarankan menjalani Medical Check-Up tahunan termasuk pemeriksaan profil lipid dan EKG berkala.'
    ]
  },
  {
    id: 'art-rehab',
    category: 'Fisioterapi & Orthopedi',
    title: 'Pemulihan Cedera Lutut & Nyeri Punggung Melalui Fisioterapi Terstruktur',
    readMinutes: 4,
    author: 'Tim Rehabilitasi Medik & Orthopedi MYITARU',
    date: 'Update Medis 2026',
    summary: 'Kapan nyeri lutut atau saraf kejepit dapat ditangani dengan program fisioterapi terukur dan latihan penguatan otot inti.',
    body: [
      'Sebagian besar keluhan nyeri punggung bawah dan cedera ringan ligamen lutut dapat membaik tanpa pembedahan apabila ditangani sejak dini oleh dokter spesialis kedokteran fisik dan rehabilitasi medik bersama fisioterapis.',
      'Melalui kombinasi pengurangan nyeri dengan modalitas TENS/ultrasound, koreksi postur, serta penguatan bertahap otot penyangga sendi, pasien dapat kembali beraktivitas secara aman.',
      'Bagi pasien dengan keterbatasan mobilitas pascaoperasi atau pascastroke, layanan Fisioterapi Home Care kami siap hadir langsung di rumah.'
    ]
  },
  {
    id: 'art-digital',
    category: 'Panduan Pasien',
    title: 'Cara Memantau Antrean Poli dan Hasil Lab dari Ponsel Tanpa Antre di Loket',
    readMinutes: 3,
    author: 'Layanan Pasien Digital MYITARU',
    date: 'Panduan Praktis',
    summary: 'Gunakan Aplikasi Mobile MYITARU SIMK dengan login Google atau Nomor Rekam Medis untuk memantau giliran panggilan poli secara langsung.',
    body: [
      'Pasien tidak perlu menunggu lama di ruang tunggu yang padat. Setelah mendaftar online atau di anjungan pendaftaran, buka halaman Aplikasi Pasien (/mobile) di ponsel Anda.',
      'Masuk cukup menggunakan Akun Google atau masukkan Nomor Rekam Medis (No. RM) beserta Tanggal Lahir untuk verifikasi identitas.',
      'Nomor antrean aktif, estimasi waktu panggilan, hasil laboratorium yang sudah divalidasi analis, serta rincian tagihan atau penjaminan BPJS langsung tersedia dalam satu layar.'
    ]
  }
];

export const PATIENT_STORIES: PatientStory[] = [
  {
    id: 'st-1',
    patientInitials: 'Bpk. Hendra K. · 54 Thn',
    unit: 'Heart Center & Cath Lab',
    quote: 'Penanganan di IGD sangat sigap sejak tiba dengan keluhan nyeri dada. Keluarga saya bisa memantau perkembangan dan jadwal kontrol langsung dari aplikasi ponsel tanpa bingung menanyakan loket.',
    outcome: 'Pemulihan stabil pasca tindakan pasang ring koroner'
  },
  {
    id: 'st-2',
    patientInitials: 'Ibu Larasati M. · 32 Thn',
    unit: 'Mother & Child Center',
    quote: 'Ruang poli kebidanan tenang, dokter menjelaskan hasil USG dengan sangat sabar, dan hasil laboratorium pra-persalinan langsung muncul di HP sore harinya.',
    outcome: 'Persalinan ERACS lancar & kontrol tumbuh kembang rutin'
  },
  {
    id: 'st-3',
    patientInitials: 'Sdr. Bagus P. · 28 Thn',
    unit: 'Orthopedic & Sports Clinic',
    quote: 'Mulai dari booking jadwal dokter spesialis orthopedi sampai melihat nomor antrean saat masih di jalan, alurnya sangat rapi dan tidak membuang waktu.',
    outcome: 'Kembali berolahraga setelah fisioterapi pascarekonstruksi lutut'
  }
];

export function getPublicPoliklinik(): PoliklinikItem[] {
  return MASTER_POLIKLINIK;
}

export function getPublicDoctors(): Doctor[] {
  return SEMUA_DOKTER;
}
