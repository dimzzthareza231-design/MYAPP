export interface Role {
  id: string;
  nama: string;
  icon: string;
  warna: string;
  deskripsi: string;
  kategori?: 'Medis' | 'Penunjang' | 'Administrasi' | 'Manajemen' | 'Sistem';
  moduleAccess: string[]; // daftar ID modul yang bisa diakses
}

// Modul yang bisa diakses SEMUA role (Self-service & Bantuan)
export const COMMON_MODULES = ['profile', 'notifikasi', 'panduan', 'dashboard', 'blueprint'];

// Semua modul aplikasi inti (dipakai super_admin, admin, dan viewer read-only)
export const ALL_MODULES = [
  'rekam-medis', 'pendaftaran', 'igd', 'rawat-jalan', 'rawat-inap', 'operasi', 'laboratorium', 'radiologi',
  'triase', 'icu', 'cssd', 'rehab', 'telemedicine', 'gizi',
  'sdm', 'inventory', 'mutu', 'patient-flow',
  'apotek-ralan', 'apotek-ranap', 'stok-obat',
  'kasir', 'bpjs-klaim', 'laporan',
  'bridging-hub', 'wa-gateway', 'anjungan', 'api', 'jkn-mobile', 'vclaim', 'vedika', 'orthanc', 'bpjs-emr', 'hfis', 'veronisa', 'satu-sehat', 'sertisign', 'cloudflare',
  'pengaturan-klinik', 'security', 'audit', 'backup', 'monitoring',
  ...COMMON_MODULES
];

// Scope server 'data-pasien' (baca daftar pasien & janji temu) diberikan ke role yang memegang salah satu modul layanan pasien ini.
export const PATIENT_DATA_MODULES = [
  'pendaftaran', 'rekam-medis', 'igd', 'rawat-jalan', 'rawat-inap', 'operasi', 'triase', 'icu',
  'laboratorium', 'radiologi', 'apotek-ralan', 'apotek-ranap', 'kasir', 'bpjs-klaim', 'gizi', 'rehab', 'telemedicine', 'patient-flow'
];

// Alias mapping agar backward compatibility dengan route lama / nama alternatif tetap bekerja sempurna
export const MODULE_ALIASES: Record<string, string[]> = {
  'rekam-medis': ['master-data', 'rme', 'rekammedis'],
  'pendaftaran': ['registrasi', 'admisi', 'pasien-baru', 'crm', 'patient-portal', 'display-antrian'],
  'rawat-jalan': ['poli', 'poliklinik', 'rawatjalan'],
  'patient-flow': ['rawat-jalan', 'poli'],
  'rawat-inap': ['bangsal', 'ranap', 'rawatinap', 'bed'],
  'laboratorium': ['lab', 'lis'],
  'radiologi': ['rad', 'pacs'],
  'orthanc': ['dicom', 'orthanc-pacs'],
  'vclaim': ['bpjs', 'v-claim'],
  'bpjs-klaim': ['klaim', 'inacbg', 'ina-cbg'],
  'satu-sehat': ['kemenkes', 'satusehat', 'fhir'],
  'api': ['integrasi', 'api-management'],
  'bridging-hub': ['bridging', 'hub'],
  'kasir': ['billing', 'keuangan', 'pembayaran'],
  'sdm': ['pegawai', 'hrd', 'staff'],
  'inventory': ['gudang', 'logistik'],
  'mutu': ['patient-safety', 'safety', 'komite-mutu'],
  'pengaturan-klinik': ['settings', 'pengaturan', 'multi-branch'],
  'apotek-ralan': ['farmasi-ralan'],
  'apotek-ranap': ['farmasi-ranap'],
  'stok-obat': ['farmasi-stok', 'obat'],
  'security': ['user-management', 'auth-management', 'users', 'roles']
};

export const ROLES: Role[] = [
  {
    id: 'viewer',
    nama: 'Guest Viewer',
    icon: '👁️',
    warna: 'from-gray-400 to-gray-500',
    deskripsi: 'Akses read-only ke seluruh modul operasional dan medis (hanya melihat, tidak dapat mengubah data).',
    kategori: 'Sistem',
    moduleAccess: ALL_MODULES
  },
  {
    id: 'super_admin',
    nama: 'Super Admin',
    icon: '👑',
    warna: 'from-purple-500 to-pink-600',
    deskripsi: 'Akses penuh ke semua modul klinis, bridging, keuangan, keamanan, dan infrastruktur sistem tanpa batas.',
    kategori: 'Sistem',
    moduleAccess: ALL_MODULES
  },
  {
    id: 'admin',
    nama: 'Administrator SIMK',
    icon: '🔧',
    warna: 'from-slate-500 to-slate-700',
    deskripsi: 'Akses ke seluruh modul aplikasi inti: klinis, penunjang, farmasi, keuangan, bridging, SDM, keamanan, dan infrastruktur.',
    kategori: 'Sistem',
    moduleAccess: ALL_MODULES
  },
  {
    id: 'direksi',
    nama: 'Direksi & Manajemen',
    icon: '🏛️',
    warna: 'from-amber-600 to-yellow-600',
    deskripsi: 'Akses executive dashboard tingkat tinggi untuk analitik operasional, KPI, dan laporan mutu layanan.',
    kategori: 'Manajemen',
    moduleAccess: [
      'laporan', 'mutu', 'sdm', 'inventory', 'kasir', 'bpjs-klaim', 'patient-flow', 'monitoring', 'audit',
      'rekam-medis', 'rawat-jalan', 'rawat-inap', 'igd', 'bridging-hub', 'hfis',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'dokter',
    nama: 'Dokter / DPJP',
    icon: '👨‍⚕️',
    warna: 'from-blue-500 to-cyan-600',
    deskripsi: 'Layanan medis: rekam medis/EMR, rawat jalan, rawat inap, IGD, ICU, operasi, triase, order dan hasil lab/radiologi, telemedicine.',
    kategori: 'Medis',
    moduleAccess: [
      'rekam-medis', 'rawat-jalan', 'rawat-inap', 'igd', 'icu', 'operasi', 'triase',
      'laboratorium', 'radiologi', 'orthanc', 'telemedicine', 'rehab', 'gizi', 'patient-flow',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'perawat',
    nama: 'Perawat',
    icon: '👩‍⚕️',
    warna: 'from-emerald-500 to-teal-600',
    deskripsi: 'Asuhan keperawatan: triase, IGD, rawat jalan, rawat inap, ICU, kamar operasi, CSSD, gizi pasien, dan dokumentasi askep di rekam medis.',
    kategori: 'Medis',
    moduleAccess: [
      'triase', 'igd', 'rawat-jalan', 'rawat-inap', 'icu', 'operasi', 'cssd', 'gizi', 'rekam-medis', 'patient-flow',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'bidan',
    nama: 'Bidan',
    icon: '🤱',
    warna: 'from-pink-500 to-rose-600',
    deskripsi: 'Otoritas layanan asuhan kebidanan (Poli KIA/Kandungan), observasi partograf, dan perawatan khusus nifas.',
    kategori: 'Medis',
    moduleAccess: [
      'rawat-inap', 'rawat-jalan', 'igd', 'rekam-medis', 'pendaftaran', 'patient-flow', 'satu-sehat',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'apoteker',
    nama: 'Apoteker & Farmasi',
    icon: '💊',
    warna: 'from-purple-500 to-pink-600',
    deskripsi: 'Farmasi: resep dan dispensing rawat jalan/rawat inap, stok obat multi-depo, dan gudang logistik obat.',
    kategori: 'Penunjang',
    moduleAccess: [
      'apotek-ralan', 'apotek-ranap', 'stok-obat', 'inventory',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'kasir',
    nama: 'Kasir & Keuangan',
    icon: '💰',
    warna: 'from-amber-500 to-orange-600',
    deskripsi: 'Keuangan: billing, pembayaran, kuitansi, klaim BPJS/INA-CBGs, dan verifikasi klaim (Vedika, Veronisa).',
    kategori: 'Administrasi',
    moduleAccess: [
      'kasir', 'bpjs-klaim', 'vedika', 'veronisa',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'pendaftaran',
    nama: 'Petugas Pendaftaran',
    icon: '📋',
    warna: 'from-indigo-500 to-violet-600',
    deskripsi: 'Titik masuk registrasi pasien, penerbitan SEP V-Claim, validasi identitas dan penjadwalan antrian poli.',
    kategori: 'Administrasi',
    moduleAccess: [
      'pendaftaran', 'anjungan', 'jkn-mobile', 'vclaim', 'veronisa', 'rekam-medis', 'patient-flow', 'triase', 'wa-gateway',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'rekam_medis',
    nama: 'Petugas RMIK',
    icon: '🗂️',
    warna: 'from-blue-600 to-indigo-700',
    deskripsi: 'Rekam medis: registrasi dan master pasien, berkas EMR, koding ICD, e-klaim BPJS, SatuSehat, tanda tangan elektronik, dan pelaporan RL.',
    kategori: 'Administrasi',
    moduleAccess: [
      'rekam-medis', 'pendaftaran', 'patient-flow', 'bpjs-emr', 'satu-sehat', 'sertisign', 'vedika', 'laporan',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'laboran',
    nama: 'Analis Laboratorium',
    icon: '🔬',
    warna: 'from-red-500 to-rose-600',
    deskripsi: 'Laboratorium: order dan pemeriksaan spesimen (LIS), nilai kritis, quality control, dan hasil lab.',
    kategori: 'Penunjang',
    moduleAccess: [
      'laboratorium',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'radiografer',
    nama: 'Radiografer',
    icon: '🩻',
    warna: 'from-sky-500 to-blue-600',
    deskripsi: 'Layanan diagnostic imaging radiologi, akuisisi citra ke PACS (Orthanc), dan bridging hasil ekspertise.',
    kategori: 'Penunjang',
    moduleAccess: [
      'radiologi', 'orthanc', 'satu-sehat', 'bridging-hub', 'rekam-medis',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'manajemen_mutu',
    nama: 'Komite Mutu (PMKP)',
    icon: '📊',
    warna: 'from-fuchsia-500 to-purple-600',
    deskripsi: 'Supervisi Indikator Mutu Nasional (INM), evaluasi RCA, insiden (IKP), dan standardisasi clinical pathway.',
    kategori: 'Manajemen',
    moduleAccess: [
      'mutu', 'laporan', 'patient-flow', 'audit', 'monitoring', 'rekam-medis',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'rehab_medik',
    nama: 'Fisioterapis & Rehab',
    icon: '🩺',
    warna: 'from-violet-500 to-purple-600',
    deskripsi: 'Pengkajian indeks Barthel (ADL), evaluasi sesi terapi fisik, dan pembuatan program home exercise pasien.',
    kategori: 'Penunjang',
    moduleAccess: [
      'rehab', 'rawat-jalan', 'rekam-medis',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'gizi',
    nama: 'Nutrisionis / Ahli Gizi',
    icon: '🥗',
    warna: 'from-teal-500 to-emerald-600',
    deskripsi: 'Skrining gizi komprehensif (MST), perhitungan preskripsi diet, serta monitoring asupan makronutrien.',
    kategori: 'Penunjang',
    moduleAccess: [
      'gizi', 'rawat-inap', 'rekam-medis',
      ...COMMON_MODULES
    ]
  },
  {
    id: 'it_support',
    nama: 'IT Support & Infra',
    icon: '💻',
    warna: 'from-cyan-600 to-blue-700',
    deskripsi: 'Otoritas manajemen server, pengelolaan API Gateway, keamanan cyber (WAF), dan disaster recovery (DRC).',
    kategori: 'Sistem',
    moduleAccess: [
      'security', 'audit', 'backup', 'monitoring', 'api', 'bridging-hub', 'pengaturan-klinik', 'wa-gateway', 'anjungan', 'hfis', 'cloudflare',
      ...COMMON_MODULES
    ]
  }
];

// Helper: ambil role by id
export const getRoleById = (roleId: string): Role | undefined => {
  return ROLES.find(r => r.id === roleId);
};

// Helper: cek apakah role memiliki akses ke modul tertentu
export const hasModuleAccess = (roleId: string, moduleId: string): boolean => {
  if (roleId === 'super_admin') return true;
  if (COMMON_MODULES.includes(moduleId)) return true;

  // Akses hanya dari ROLES (sama dengan server); override localStorage bisa dipalsukan pengguna.
  const role = getRoleById(roleId);
  if (!role) return false;
  if (role.moduleAccess.includes(moduleId)) return true;

  // Arah balik (alias -> modul induk) hanya untuk nama URL yang bukan modul sungguhan, mis. user-management -> security.
  // Tanpa syarat ini 'patient-flow' memberi akses 'rawat-jalan', padahal server (hasScope) menolak API-nya.
  const isRealModule = ROLES.some((item) => item.moduleAccess.includes(moduleId));
  for (const [canonical, aliases] of Object.entries(MODULE_ALIASES)) {
    if (canonical === moduleId && aliases.some(a => role.moduleAccess.includes(a))) return true;
    if (!isRealModule && aliases.includes(moduleId) && (role.moduleAccess.includes(canonical) || aliases.some(a => role.moduleAccess.includes(a)))) return true;
  }

  return false;
};

