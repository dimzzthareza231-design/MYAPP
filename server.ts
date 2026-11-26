import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import {
  executeResilientGemini,
  getGeminiModelFallbackChain,
  parseSafeJson,
  analyzeClinicalNoteDeterministic,
  generateClinicalDecisionSupportDeterministic,
  auditBpjsClaimDeterministic,
  checkDrugInteractionsDeterministic,
  analyzeRadiologyDeterministic,
  auditDocumentCompletenessDeterministic,
  generateMedicalSearchEvidenceDeterministic,
  generateHealthUpdates2026
} from './src/server/aiIntelligenceEngine';
import { registerPatientPortalRoutes } from './src/server/patientPortalService';
import { registerEmployeePortalGateway } from './src/server/employeePortalGateway';
import {
  assertProductionAuthConfiguration,
  getCoreAuthMode,
  registerCoreAuthentication,
  hasScope,
  type CoreAuthRequest,
  type CoreAuthOptions
} from './src/server/coreAuth';
import { LocalAuthService } from './src/server/localAuth';
import { clientIp } from './src/server/clientIp';
import { nextRmNumber } from './src/server/rmNumber';
import { scrubPhi } from './src/server/scrubPhi';
import {
  createSecurePatientQrToken,
  getDocumentQrScope,
  isSecurePatientQrConfigured,
  readSecurePatientQrToken
} from './src/server/securePatientQr';
import {
  createPersistenceRepository,
  HybridAdapter,
  hashQrToken,
  type PersistenceChange,
  type PersistenceFactoryOptions,
  type PersistenceEntity,
  type PersistenceRepository
} from './src/server/databaseAdapter';

dotenv.config();

interface PersistentArrayBinding {
  entity: PersistenceEntity;
  records: Array<{ id: string }>;
}

function arraySnapshot(records: Array<{ id: string }>): Array<{ id: string }> {
  return JSON.parse(JSON.stringify(records)) as Array<{ id: string }>;
}

function diffPersistentArrays(
  entity: PersistenceEntity,
  before: Array<{ id: string }>,
  after: Array<{ id: string }>
): PersistenceChange[] {
  const beforeById = new Map(before.map((record) => [record.id, JSON.stringify(record)]));
  const afterById = new Map(after.map((record) => [record.id, JSON.stringify(record)]));
  const changes: PersistenceChange[] = [];

  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const previous = beforeById.get(id);
    const current = afterById.get(id);
    if (previous === current) continue;
    changes.push({
      entity,
      id,
      data: current === undefined ? null : JSON.parse(current) as unknown
    });
  }
  return changes;
}

function restorePersistentArrays(
  bindings: PersistentArrayBinding[],
  snapshots: Array<Array<{ id: string }>>
): void {
  bindings.forEach((binding, index) => {
    binding.records.splice(0, binding.records.length, ...snapshots[index]);
  });
}

function installPersistenceMiddleware(
  targets: express.Express[],
  persistence: PersistenceRepository,
  bindings: PersistentArrayBinding[]
): void {
  if (persistence.mode === 'memory') return;

  let writeQueue = Promise.resolve();
  for (const target of targets) {
    target.use(async (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      // Route ini tidak menulis array persisten; jangan antre di belakang panggilan Gemini yang lambat.
      if (req.path.startsWith('/api/ai/') || req.path.startsWith('/api/cloudflare/')) return next();

      let release!: () => void;
      const currentWrite = new Promise<void>((resolve) => { release = resolve; });
      const previousWrite = writeQueue;
      writeQueue = currentWrite;
      await previousWrite;

      const snapshots = bindings.map((binding) => arraySnapshot(binding.records));
      const sendJson = res.json.bind(res);
      let finalized = false;
      const finish = (body: unknown) => {
        if (finalized) return res;
        finalized = true;
        void (async () => {
          if (res.statusCode >= 400) {
            restorePersistentArrays(bindings, snapshots);
            sendJson(body);
            return;
          }
          const changes = bindings.flatMap((binding, index) =>
            diffPersistentArrays(binding.entity, snapshots[index], binding.records)
          );
          await persistence.commit(changes);
          sendJson(body);
        })().catch((error: unknown) => {
          restorePersistentArrays(bindings, snapshots);
          console.error('[Persistence] Write-through failed; API mutation rolled back.', error);
          if (!res.headersSent) {
            res.status(503);
            sendJson({
              success: false,
              code: 'PERSISTENCE_UNAVAILABLE',
              message: 'Data belum tersimpan. Periksa koneksi penyimpanan lalu coba kembali.'
            });
          }
        }).finally(release);
        return res;
      };

      res.json = finish as typeof res.json;
      res.once('close', () => {
        if (finalized) return;
        finalized = true;
        restorePersistentArrays(bindings, snapshots);
        release();
      });
      return next();
    });
  }
}

// Membangun kedua Express app tanpa listen; dipakai server lokal/Docker (startServer) dan Vercel Function (api/index.ts).
export async function createApps(
  authOptions: CoreAuthOptions = {},
  persistenceOptions: PersistenceFactoryOptions = {}
) {
  const authMode = authOptions.authMode || (authOptions.resolvePrincipal ? 'firebase' : getCoreAuthMode());
  assertProductionAuthConfiguration(authMode);
  const persistence = await createPersistenceRepository(persistenceOptions);
  const startupStorageHealth = await persistence.health();
  if (process.env.NODE_ENV === 'production' && !startupStorageHealth.persistentReady) {
    throw new Error(
      `Production startup requires healthy durable, access-controlled persistence (mode=${startupStorageHealth.mode}).`
    );
  }
  // Aplikasi inti (SIMK/RME + API /api/v1, /api/ai, /api/gateway) dan web publik pasien
  // (/api/public, /api/patient) dilayani oleh dua Express app di dua port berbeda.
  // Keduanya satu proses agar tetap berbagi data store in-memory di bawah.
  // shortcut: satu proses = data bersama; pecah jadi dua layanan setelah data pindah ke database.
  const app = express();
  const publicApp = express();
  if (process.env.TRUST_PROXY) {
    // Di belakang proxy (Docker/Vercel) req.ip harus dari X-Forwarded-For, bukan IP proxy.
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
    publicApp.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  }
  const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
  const resolvedAuthOptions: CoreAuthOptions = { ...authOptions, authMode };
  if (authMode === 'local') {
    if (persistence.mode === 'firebase' || persistence.mode === 'hybrid') {
      throw new Error('AUTH_MODE=local supports only MySQL, D1 or in-memory development storage; Firebase and hybrid storage are not supported for offline local authentication.');
    }
    resolvedAuthOptions.localAuth ||= new LocalAuthService(persistence);
    await resolvedAuthOptions.localAuth.initialize();
  }

  for (const target of [app, publicApp]) {
  target.use(express.json({ limit: '5mb' }));
  target.use(express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 100 }));
  target.use('/api', (req, res, next) => {
    const limits: Record<string, { max: number; windowMs: number }> = {
      '/auth/session': { max: 20, windowMs: 15 * 60 * 1000 },
      '/auth/login': { max: 10, windowMs: 15 * 60 * 1000 },
      '/auth/logout': { max: 20, windowMs: 15 * 60 * 1000 },
      '/patient/verify': { max: 10, windowMs: 15 * 60 * 1000 },
      '/patient/google-session': { max: 10, windowMs: 15 * 60 * 1000 },
      '/patient/appointments': { max: 20, windowMs: 15 * 60 * 1000 },
      '/v1/patient-qr/issue': { max: 30, windowMs: 15 * 60 * 1000 },
      '/v1/patient-qr/resolve': { max: 60, windowMs: 15 * 60 * 1000 },
      '/v1/patient-qr/redeem': { max: 60, windowMs: 15 * 60 * 1000 },
      '/v1/dossier/document-qr/issue': { max: 30, windowMs: 15 * 60 * 1000 },
      '/gateway/auth/login': { max: 10, windowMs: 15 * 60 * 1000 },
      '/gateway/auth/verify-mfa': { max: 10, windowMs: 15 * 60 * 1000 },
      '/cloudflare/verify-turnstile': { max: 20, windowMs: 60 * 1000 }
    };
    // Express tidak peka huruf besar dan abaikan "/" akhir; normalisasi agar batas tidak bisa dilewati.
    const normPath = req.path.toLowerCase().replace(/\/+$/, '');
    const limit = req.method === 'POST'
      ? limits[normPath] ?? (normPath.startsWith('/ai/') ? { max: 30, windowMs: 60 * 1000 } : undefined)
      : undefined;
    if (!limit) return next();

    const now = Date.now();
    const key = `${clientIp(req)}:${normPath}`;
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + limit.windowMs };
      rateLimitBuckets.set(key, bucket);
    }

    if (bucket.count >= limit.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, code: 'RATE_LIMITED' });
    }
    bucket.count += 1;
    if (rateLimitBuckets.size > 5000) {
      for (const [bucketKey, value] of rateLimitBuckets) {
        if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
      }
    }
    return next();
  });

  // Security Headers Middleware
  target.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Request Performance & Access Logger Middleware
  const logTag = target === publicApp ? 'PUBLIC-API' : 'SIMK-API';
  target.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (req.path.startsWith('/api')) {
        // Pola route (/api/v1/patients/:idOrRm), bukan path asli yang berisi No. RM pasien.
        const routePath = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path.replace(/RM-[\w-]+/gi, 'RM-*');
        console.log(`[${logTag}] ${req.method} ${routePath} -> ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });
  }

  registerCoreAuthentication(app, resolvedAuthOptions);

  // =========================================================================
  // 🏥 IN-MEMORY KLINIK DATA STORE (Simulated Enterprise SIMK State)
  // =========================================================================
  interface PatientRecord {
    id: string;
    no_rm: string;
    nik: string;
    nama: string;
    tanggal_lahir: string;
    jenis_kelamin: 'L' | 'P';
    alamat: string;
    no_hp: string;
    golongan_darah: string;
    penjamin: string;
    no_bpjs?: string;
    status: 'Rawat Jalan' | 'Rawat Inap' | 'IGD' | 'Selesai';
    alergi?: string[];
    riwayat_penyakit?: string[];
    created_at: string;
  }

  interface AppointmentRecord {
    id: string;
    pasien_id: string;
    pasien_nama: string;
    no_rm: string;
    poli: string;
    dokter: string;
    tanggal: string;
    jam_praktek: string;
    nomor_antrian: string;
    status: 'Menunggu' | 'Panggil' | 'Diperiksa' | 'Farmasi' | 'Kasir' | 'Selesai' | 'Batal' | 'Dibatalkan';
    tipe: 'Rawat Jalan' | 'IGD' | 'Konsultasi';
    created_at: string;
    checked_in_at?: string;
  }

  interface BedRecord {
    id: string;
    bangsal: string;
    ruangan: string;
    nomor_bed: string;
    kelas: 'VVIP' | 'VIP' | 'Kelas 1' | 'Kelas 2' | 'Kelas 3' | 'ICU' | 'NICU' | 'Isolasi';
    status: 'Tersedia' | 'Terisi' | 'Dibersihkan' | 'Perbaikan';
    pasien_nama?: string;
    no_rm?: string;
    tanggal_masuk?: string;
    tarif_per_hari: number;
  }

  interface InventoryItem {
    id: string;
    kode: string;
    nama: string;
    kategori: 'Obat Oral' | 'Injeksi' | 'Infus' | 'Alat Kesehatan' | 'BHP';
    stok: number;
    stok_minimum: number;
    satuan: string;
    harga_beli: number;
    harga_jual: number;
    batch: string;
    expired_date: string;
    lokasi: 'Gudang Farmasi' | 'Depo Ralan' | 'Depo Ranap' | 'Depo IGD';
  }

  interface DossierDocument {
    id: string;
    no_rm: string;
    pasien_nama: string;
    doc_type: string;
    title: string;
    created_at: string;
    created_by: string;
    status: 'Lengkap' | 'Draft' | 'Menunggu TTD' | 'Terverifikasi';
    data: Record<string, any>;
  }

  interface AuditLogEntry {
    id: string;
    timestamp: string;
    user: string;
    role: string;
    action: string;
    module: string;
    ip: string;
    status: 'SUCCESS' | 'FAILED' | 'WARNING';
    details: string;
  }

  interface QRTokenRecord {
    id: string;
    tokenHash: string;
    subject: string;
    kind: 'patient' | 'reservation' | 'document';
    issuedAt: string;
    expiresAt?: string;
    issuedBy: string;
    consumedAt?: string;
    document?: {
      verificationCode: string;
      documentType: string;
      documentNumber: string;
      title: string;
      signer: string;
      issuedAt: string;
      facility: string;
    };
  }

  // Initial Seed Patients
  const patientsStore: PatientRecord[] = [
    {
      id: 'p-001',
      no_rm: 'RM-260101-0001',
      nik: '3171012304850001',
      nama: 'Ny. Siti Rahmawati',
      tanggal_lahir: '1985-04-23',
      jenis_kelamin: 'P',
      alamat: 'Jl. Salemba Raya No. 45, Jakarta Pusat',
      no_hp: '081234567890',
      golongan_darah: 'O',
      penjamin: 'BPJS Kesehatan',
      no_bpjs: '0001234567891',
      status: 'Rawat Jalan',
      alergi: ['Amoxicillin', 'Aspirin'],
      riwayat_penyakit: ['Hipertensi Derajat 2', 'Dispepsia'],
      created_at: '2026-01-10T08:30:00Z'
    },
    {
      id: 'p-002',
      no_rm: 'RM-260102-0002',
      nik: '3171021508780003',
      nama: 'Tn. Budi Santoso',
      tanggal_lahir: '1978-08-15',
      jenis_kelamin: 'L',
      alamat: 'Jl. Diponegoro No. 12, Jakarta Pusat',
      no_hp: '081398765432',
      golongan_darah: 'A',
      penjamin: 'BPJS Kesehatan',
      no_bpjs: '0002345678902',
      status: 'Rawat Inap',
      alergi: [],
      riwayat_penyakit: ['Diabetes Melitus Tipe 2', 'Penyakit Jantung Koroner'],
      created_at: '2026-01-15T09:15:00Z'
    },
    {
      id: 'p-003',
      no_rm: 'RM-260103-0003',
      nik: '3171035512150005',
      nama: 'An. Rizky Pratama',
      tanggal_lahir: '2015-12-15',
      jenis_kelamin: 'L',
      alamat: 'Jl. Kramat Raya No. 88, Jakarta Pusat',
      no_hp: '085712348901',
      golongan_darah: 'B',
      penjamin: 'Umum / Mandiri',
      status: 'IGD',
      alergi: ['Seafood'],
      riwayat_penyakit: ['Asma Bronkial'],
      created_at: '2026-02-01T14:20:00Z'
    },
    {
      id: 'p-004',
      no_rm: 'RM-260104-0004',
      nik: '3171044406920002',
      nama: 'Ny. Dewi Lestari',
      tanggal_lahir: '1992-06-04',
      jenis_kelamin: 'P',
      alamat: 'Jl. Cikini Raya No. 20, Jakarta Pusat',
      no_hp: '081987654321',
      golongan_darah: 'AB',
      penjamin: 'Asuransi Mandiri Inhealth',
      status: 'Rawat Inap',
      alergi: ['Sulfa'],
      riwayat_penyakit: ['Demam Berdarah Dengue (DBD)'],
      created_at: '2026-02-14T11:00:00Z'
    }
  ];

  // Initial Seed Appointments
  const appointmentsStore: AppointmentRecord[] = [
    {
      id: 'apt-001',
      pasien_id: 'p-001',
      pasien_nama: 'Ny. Siti Rahmawati',
      no_rm: 'RM-260101-0001',
      poli: 'Poli Penyakit Dalam',
      dokter: 'dr. Hendra Wijaya, Sp.PD',
      tanggal: new Date().toISOString().split('T')[0],
      jam_praktek: '09:00 - 12:00',
      nomor_antrian: 'PD-001',
      status: 'Menunggu',
      tipe: 'Rawat Jalan',
      created_at: new Date().toISOString()
    },
    {
      id: 'apt-002',
      pasien_id: 'p-003',
      pasien_nama: 'An. Rizky Pratama',
      no_rm: 'RM-260103-0003',
      poli: 'Instalasi Gawat Darurat (IGD)',
      dokter: 'dr. Sarah Amanda, Sp.A',
      tanggal: new Date().toISOString().split('T')[0],
      jam_praktek: '24 Jam',
      nomor_antrian: 'IGD-004',
      status: 'Diperiksa',
      tipe: 'IGD',
      created_at: new Date().toISOString()
    }
  ];

  // Initial Seed Bed Management
  const bedsStore: BedRecord[] = [
    { id: 'b-01', bangsal: 'Paviliun Melati', ruangan: 'Melati 101', nomor_bed: 'Bed 1', kelas: 'VVIP', status: 'Tersedia', tarif_per_hari: 1500000 },
    { id: 'b-02', bangsal: 'Paviliun Melati', ruangan: 'Melati 102', nomor_bed: 'Bed 1', kelas: 'VIP', status: 'Terisi', pasien_nama: 'Tn. Budi Santoso', no_rm: 'RM-260102-0002', tanggal_masuk: '2026-03-25', tarif_per_hari: 1000000 },
    { id: 'b-03', bangsal: 'Bangsal Mawar', ruangan: 'Mawar 201', nomor_bed: 'Bed A', kelas: 'Kelas 1', status: 'Terisi', pasien_nama: 'Ny. Dewi Lestari', no_rm: 'RM-260104-0004', tanggal_masuk: '2026-03-27', tarif_per_hari: 650000 },
    { id: 'b-04', bangsal: 'Bangsal Mawar', ruangan: 'Mawar 201', nomor_bed: 'Bed B', kelas: 'Kelas 1', status: 'Tersedia', tarif_per_hari: 650000 },
    { id: 'b-05', bangsal: 'Bangsal Anggrek', ruangan: 'Anggrek 301', nomor_bed: 'Bed 1', kelas: 'Kelas 2', status: 'Tersedia', tarif_per_hari: 450000 },
    { id: 'b-06', bangsal: 'Bangsal Anggrek', ruangan: 'Anggrek 301', nomor_bed: 'Bed 2', kelas: 'Kelas 2', status: 'Dibersihkan', tarif_per_hari: 450000 },
    { id: 'b-07', bangsal: 'Bangsal Dahlia', ruangan: 'Dahlia 401', nomor_bed: 'Bed 1', kelas: 'Kelas 3', status: 'Tersedia', tarif_per_hari: 250000 },
    { id: 'b-08', bangsal: 'Bangsal Dahlia', ruangan: 'Dahlia 401', nomor_bed: 'Bed 2', kelas: 'Kelas 3', status: 'Tersedia', tarif_per_hari: 250000 },
    { id: 'b-09', bangsal: 'ICU Terpadu', ruangan: 'ICU Central', nomor_bed: 'Bed ICU-1', kelas: 'ICU', status: 'Tersedia', tarif_per_hari: 2200000 },
    { id: 'b-10', bangsal: 'ICU Terpadu', ruangan: 'ICU Central', nomor_bed: 'Bed ICU-2', kelas: 'ICU', status: 'Terisi', pasien_nama: 'Tn. Gunawan Siregar', no_rm: 'RM-260105-0005', tanggal_masuk: '2026-03-26', tarif_per_hari: 2200000 }
  ];

  // Initial Seed Pharmacy Inventory
  const inventoryStore: InventoryItem[] = [
    { id: 'inv-01', kode: 'OBAT-001', nama: 'Paracetamol 500 mg Tablet', kategori: 'Obat Oral', stok: 1250, stok_minimum: 200, satuan: 'Tablet', harga_beli: 300, harga_jual: 600, batch: 'B2601A', expired_date: '2027-12-31', lokasi: 'Gudang Farmasi' },
    { id: 'inv-02', kode: 'OBAT-002', nama: 'Amoxicillin 500 mg Kapsul', kategori: 'Obat Oral', stok: 80, stok_minimum: 150, satuan: 'Kapsul', harga_beli: 600, harga_jual: 1200, batch: 'B2511C', expired_date: '2026-10-31', lokasi: 'Depo Ralan' },
    { id: 'inv-03', kode: 'OBAT-003', nama: 'Amlodipine 10 mg Tablet', kategori: 'Obat Oral', stok: 540, stok_minimum: 100, satuan: 'Tablet', harga_beli: 450, harga_jual: 900, batch: 'B2602D', expired_date: '2028-01-31', lokasi: 'Depo Ralan' },
    { id: 'inv-04', kode: 'OBAT-004', nama: 'Metformin 500 mg Tablet', kategori: 'Obat Oral', stok: 420, stok_minimum: 100, satuan: 'Tablet', harga_beli: 350, harga_jual: 700, batch: 'B2601E', expired_date: '2027-08-31', lokasi: 'Depo Ralan' },
    { id: 'inv-05', kode: 'OBAT-005', nama: 'Ceftriaxone 1g Injeksi', kategori: 'Injeksi', stok: 95, stok_minimum: 50, satuan: 'Vial', harga_beli: 18000, harga_jual: 35000, batch: 'B2603A', expired_date: '2027-05-31', lokasi: 'Depo Ranap' },
    { id: 'inv-06', kode: 'OBAT-006', nama: 'Ringer Lactate (RL) 500 ml', kategori: 'Infus', stok: 310, stok_minimum: 100, satuan: 'Kolf', harga_beli: 12000, harga_jual: 22000, batch: 'B2602B', expired_date: '2028-06-30', lokasi: 'Depo IGD' },
    { id: 'inv-07', kode: 'OBAT-007', nama: 'Omeprazole 40 mg Injeksi', kategori: 'Injeksi', stok: 45, stok_minimum: 60, satuan: 'Vial', harga_beli: 22000, harga_jual: 42000, batch: 'B2512F', expired_date: '2026-11-30', lokasi: 'Depo Ranap' },
    { id: 'inv-08', kode: 'OBAT-008', nama: 'Salbutamol Nebulizer 2.5 mg', kategori: 'Injeksi', stok: 180, stok_minimum: 50, satuan: 'Respules', harga_beli: 8000, harga_jual: 15000, batch: 'B2601H', expired_date: '2027-09-30', lokasi: 'Depo IGD' }
  ];

  // Initial Seed Dossier Documents
  const dossierStore: DossierDocument[] = [
    {
      id: 'doc-001',
      no_rm: 'RM-260101-0001',
      pasien_nama: 'Ny. Siti Rahmawati',
      doc_type: 'AsesmenMedisAwal',
      title: 'Asesmen Medis Awal Rawat Jalan',
      created_at: '2026-03-20T09:00:00Z',
      created_by: 'dr. Hendra Wijaya, Sp.PD',
      status: 'Terverifikasi',
      data: {
        keluhanUtama: 'Nyeri kepala tengkuk dan pusing berputar sejak 3 hari',
        tandaVital: { td: '160/95 mmHg', nadi: 82, suhu: 36.6, rr: 18, spo2: 99 },
        diagnosaKerja: 'Hipertensi Derajat 2 (I10)',
        terapi: 'Amlodipine 10mg 1x1 tab pagi, Candesartan 8mg 1x1 tab malam'
      }
    },
    {
      id: 'doc-002',
      no_rm: 'RM-260102-0002',
      pasien_nama: 'Tn. Budi Santoso',
      doc_type: 'TriaseIGD',
      title: 'Formulir Triase Gawat Darurat (ATS/ESI)',
      created_at: '2026-03-25T07:15:00Z',
      created_by: 'dr. Sarah Amanda',
      status: 'Terverifikasi',
      data: {
        kategoriTriase: 'P2 - Emergensi (Kuning)',
        keluhanUtama: 'Nyeri dada retrosternal menjalar ke pundak kiri',
        tandaVital: { td: '150/90 mmHg', nadi: 96, suhu: 36.8, rr: 22, spo2: 96 },
        gcs: 'E4M6V5 (15)',
        tindakanAwal: 'O2 Kanul 3 lpm, EKG 12 Lead, Pasang IV Line RL'
      }
    }
  ];

  // Audit Logs Store
  const auditLogsStore: AuditLogEntry[] = [
    {
      id: 'log-001',
      timestamp: new Date().toISOString(),
      user: 'dr. Hendra Wijaya, Sp.PD',
      role: 'DPJP',
      action: 'UPDATE_EMR',
      module: 'Rekam Medis (RME)',
      ip: '192.168.1.45',
      status: 'SUCCESS',
      details: 'Pengesahan dan tanda tangan elektronik resume medis No. RM-260101-0001'
    },
    {
      id: 'log-002',
      timestamp: new Date().toISOString(),
      user: 'Apoteker Rina, S.Farm',
      role: 'Farmasi',
      action: 'DISPENSE_MEDICATION',
      module: 'Farmasi Ralan',
      ip: '192.168.1.72',
      status: 'SUCCESS',
      details: 'Telaah resep & penyerahan obat resep No. RX-260328-0091'
    }
  ];

  const qrTokensStore: QRTokenRecord[] = [];
  const persistentBindings: PersistentArrayBinding[] = [
    { entity: 'patients', records: patientsStore },
    { entity: 'registrations', records: appointmentsStore },
    { entity: 'beds', records: bedsStore },
    { entity: 'inventory', records: inventoryStore },
    { entity: 'documents', records: dossierStore },
    { entity: 'audit_logs', records: auditLogsStore },
    { entity: 'qr_tokens', records: qrTokensStore }
  ];

  if (persistence.mode !== 'memory') {
    for (const binding of persistentBindings) binding.records.splice(0, binding.records.length);
    if (startupStorageHealth.persistentReady) {
      try {
        if (persistence instanceof HybridAdapter) {
          await persistence.syncPending();
          await persistence.syncExternalBookings();
        }
        // Paralel: cold start dulu membaca koleksi satu per satu (~8 detik di Firestore).
        const loadStartedAt = Date.now();
        const loaded = await Promise.all(persistentBindings
          .map(async (binding) => ({ binding, stored: await persistence.list<Record<string, unknown>>(binding.entity) })));
        for (const { binding, stored } of loaded) {
          for (const record of stored) {
            if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) {
              throw new Error(`Invalid persisted ${binding.entity} record ${record.id}.`);
            }
            binding.records.push({ ...record.data, id: record.id });
          }
        }
        console.info(`[Persistence] Loaded ${loaded.map(({ binding, stored }) => `${binding.entity}=${stored.length}`).join(' ')} in ${Date.now() - loadStartedAt}ms`);
      } catch (error) {
        await persistence.close();
        throw new Error('Configured persistence is reachable but its records could not be loaded safely.', { cause: error });
      }
    } else {
      console.warn('[Persistence] Persistent storage is unavailable; demo seeds are disabled and writes will fail closed.');
    }
  }

  installPersistenceMiddleware([app, publicApp], persistence, persistentBindings);
  app.locals.persistence = persistence;
  publicApp.locals.persistence = persistence;
  if (persistence instanceof HybridAdapter) {
    persistence.setBookingsImportedHandler((bookings) => {
      const currentIds = new Set(appointmentsStore.map((appointment) => appointment.id));
      for (const booking of bookings) {
        if (currentIds.has(booking.id) || !booking.data || typeof booking.data !== 'object') continue;
        appointmentsStore.unshift({ ...booking.data, id: booking.id } as AppointmentRecord);
        currentIds.add(booking.id);
      }
    });
    persistence.startSyncWorker();
  }


  const findActiveQrRecord = (
    token: string,
    claims: ReturnType<typeof readSecurePatientQrToken>
  ): QRTokenRecord | undefined => {
    if (!claims) return undefined;
    const tokenHash = hashQrToken(token);
    const record = qrTokensStore.find((item) =>
      item.tokenHash === tokenHash &&
      item.kind === claims.kind &&
      item.subject === claims.subject
    );
    if (!record) return undefined;
    if (record.expiresAt !== undefined) {
      const expiresAt = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
    }
    return record;
  };

  const auditQrAccess = (req: express.Request, action: string, subject: string) => {
    const principal = req.corePrincipal;
    auditLogsStore.unshift({
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      user: principal?.email || 'unknown',
      role: principal?.roleId || 'unknown',
      action,
      module: 'Rekam Medis',
      ip: req.ip || 'unknown',
      status: 'SUCCESS',
      details: `Akses QR untuk identitas internal ${subject}.`
    });
  };

  app.post('/api/v1/dossier/document-qr/issue', (req, res) => {
    if (!isSecurePatientQrConfigured()) {
      return res.status(503).json({ success: false, code: 'QR_SECRET_NOT_CONFIGURED' });
    }

    const body = req.body || {};
    const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : '';
    const documentNumber = typeof body.documentNumber === 'string' ? body.documentNumber.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const signer = typeof body.signer === 'string' ? body.signer.trim() : '';
    const issuedAt = typeof body.issuedAt === 'string' ? body.issuedAt.trim() : '';
    const facility = typeof body.facility === 'string' ? body.facility.trim() : '';
    if (!/^[a-z0-9_-]{1,64}$/i.test(documentType) ||
        !documentNumber || documentNumber.length > 128 ||
        !title || title.length > 160 ||
        !signer || signer.length > 120 ||
        !issuedAt || issuedAt.length > 64 ||
        !facility || facility.length > 160) {
      return res.status(400).json({ success: false, code: 'INVALID_DOCUMENT_METADATA' });
    }

    const subject = randomUUID();
    const verificationCode = `MYT-${new Date().getFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;
    const qrValue = createSecurePatientQrToken(subject, {
      kind: 'document',
      scope: getDocumentQrScope(documentType)
    });
    const tokenHash = hashQrToken(qrValue);
    qrTokensStore.unshift({
      id: tokenHash,
      tokenHash,
      subject,
      kind: 'document',
      issuedAt: new Date().toISOString(),
      issuedBy: req.corePrincipal?.email || 'unknown',
      document: {
        verificationCode,
        documentType,
        documentNumber,
        title,
        signer,
        issuedAt,
        facility
      }
    });
    auditQrAccess(req, 'DOCUMENT_QR_ISSUED', subject);
    return res.status(201).json({ success: true, qrValue, verificationCode });
  });

  app.post('/api/v1/patient-qr/issue', (req, res) => {
    if (!isSecurePatientQrConfigured()) {
      return res.status(503).json({ success: false, code: 'QR_SECRET_NOT_CONFIGURED' });
    }
    const noRm = typeof req.body?.no_rm === 'string' ? req.body.no_rm.trim() : '';
    if (!noRm || noRm.length > 32) {
      return res.status(400).json({ success: false, code: 'INVALID_PATIENT_REFERENCE' });
    }
    const patient = patientsStore.find((item) => item.no_rm.toLowerCase() === noRm.toLowerCase());
    if (!patient) {
      return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND' });
    }
    if (!patient.id || patient.id.length > 128) {
      return res.status(500).json({ success: false, code: 'PATIENT_IDENTIFIER_INVALID' });
    }

    // QR pasien berlaku 24 jam; buang QR kedaluwarsa agar store tidak tumbuh tanpa batas.
    const now = Date.now();
    for (let i = qrTokensStore.length - 1; i >= 0; i--) {
      const exp = qrTokensStore[i].expiresAt;
      if (exp && Date.parse(exp) <= now) qrTokensStore.splice(i, 1);
    }
    const qrValue = createSecurePatientQrToken(patient.id);
    const tokenHash = hashQrToken(qrValue);
    qrTokensStore.unshift({
      id: tokenHash,
      tokenHash,
      subject: patient.id,
      kind: 'patient',
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      issuedBy: req.corePrincipal?.email || 'unknown'
    });
    auditQrAccess(req, 'PATIENT_QR_ISSUED', patient.id);
    return res.json({ success: true, qrValue });
  });

  app.post('/api/v1/patient-qr/resolve', (req, res) => {
    if (typeof req.body?.token !== 'string') {
      return res.status(400).json({ success: false, code: 'INVALID_QR_TOKEN' });
    }
    const claims = readSecurePatientQrToken(req.body.token);
    if (!claims || claims.kind !== 'patient' || !findActiveQrRecord(req.body.token, claims)) {
      return res.status(400).json({ success: false, code: 'INVALID_QR_TOKEN' });
    }
    const patient = patientsStore.find((item) => item.id === claims.subject);
    if (!patient) {
      return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND' });
    }
    auditQrAccess(req, 'PATIENT_QR_ACCESSED', patient.id);
    // Hanya identitas yang dibutuhkan untuk mengenali pasien; NIK dan alamat tidak ikut.
    const { id, no_rm, nama, tanggal_lahir, jenis_kelamin, golongan_darah, alergi, penjamin, status } = patient;
    return res.json({ success: true, patient: { id, no_rm, nama, tanggal_lahir, jenis_kelamin, golongan_darah, alergi, penjamin, status } });
  });

  app.post('/api/v1/patient-qr/redeem', (req, res) => {
    if (typeof req.body?.token !== 'string') {
      return res.status(400).json({ success: false, code: 'INVALID_QR_TOKEN' });
    }
    const claims = readSecurePatientQrToken(req.body.token);
    if (!claims) {
      return res.status(400).json({ success: false, code: 'INVALID_QR_TOKEN' });
    }
    const qrRecord = findActiveQrRecord(req.body.token, claims);
    if (!qrRecord) {
      return res.status(400).json({ success: false, code: 'INVALID_QR_TOKEN' });
    }

    if (claims.kind === 'patient') {
      const patient = patientsStore.find((item) => item.id === claims.subject);
      if (!patient) return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND' });
      auditQrAccess(req, 'PATIENT_QR_ACCESSED', patient.id);
      return res.json({ success: true, kind: 'patient', patient });
    }

    if (claims.kind === 'document') {
      if (!qrRecord.document) {
        return res.status(404).json({ success: false, code: 'DOCUMENT_VERIFICATION_NOT_FOUND' });
      }
      auditQrAccess(req, 'DOCUMENT_QR_VERIFIED', claims.subject);
      return res.json({
        success: true,
        kind: 'document',
        document: { ...qrRecord.document, status: 'valid' }
      });
    }

    const appointment = appointmentsStore.find((item) => item.id === claims.subject);
    if (!appointment || appointment.status === 'Dibatalkan') {
      return res.status(404).json({ success: false, code: 'RESERVATION_NOT_FOUND' });
    }
    if (appointment.tanggal !== new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })) {
      return res.status(409).json({ success: false, code: 'CHECKIN_DATE_MISMATCH' });
    }
    if (appointment.checked_in_at) {
      return res.status(409).json({ success: false, code: 'RESERVATION_ALREADY_CHECKED_IN' });
    }
    if (qrRecord.consumedAt) {
      return res.status(409).json({ success: false, code: 'RESERVATION_ALREADY_CHECKED_IN' });
    }

    const patient = patientsStore.find((item) => item.no_rm === appointment.no_rm);
    if (!patient) return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND' });
    appointment.checked_in_at = new Date().toISOString();
    if (qrRecord) qrRecord.consumedAt = appointment.checked_in_at;
    auditLogsStore.unshift({
      id: `log-${randomUUID()}`,
      timestamp: appointment.checked_in_at,
      user: req.corePrincipal?.email || 'unknown',
      role: req.corePrincipal?.roleId || 'unknown',
      action: 'PATIENT_RESERVATION_CHECK_IN',
      module: 'Pendaftaran',
      ip: req.ip || 'unknown',
      status: 'SUCCESS',
      details: `Check-in antrean ${appointment.nomor_antrian} untuk No. RM ${appointment.no_rm}.`
    });
    return res.json({
      success: true,
      kind: 'reservation',
      patient,
      booking: {
        no_rm: appointment.no_rm,
        nomor_antrian: appointment.nomor_antrian,
        poli: appointment.poli,
        dokter: appointment.dokter,
        tanggal: appointment.tanggal,
        checked_in_at: appointment.checked_in_at
      }
    });
  });

  // =========================================================================
  // 🚀 REST API V1 ENDPOINTS (Enterprise Klinik Information System Backend)
  // =========================================================================

  // 1. System Health Check Endpoint
  app.get('/api/v1/health', async (req, res) => {
    const storage = await persistence.health();
    res.json({
      status: storage.persistentReady ? 'HEALTHY' : 'DEGRADED',
      storage,
      timestamp: new Date().toISOString()
    });
  });

  // Data modul yang dulu hanya di localStorage tiap browser (billing, farmasi, dossier RME, lab, ...).
  // shortcut: satu dokumen per kunci, yang terakhir menyimpan menang; ganti dengan API per modul bila perlu kontrol konflik.
  // Spasi dipakai komponen (mis. "hospital_igd_Penanganan IGD"); garis miring ditolak karena memecah path dokumen.
  const MODULE_DATA_KEY = /^(hospital_|simrs_|klinik_|bpjs_|myitaru_igd_)[A-Za-z0-9._:\- &()]{1,100}$/;
  const MODULE_INDEX_ID = 'module-index';
  // Id dokumen hanya [a-z0-9_]: Firestore REST meng-encode nama di body commit berbeda dari path GET.
  const moduleDocId = (key: string) => `module_${createHash('sha256').update(key).digest('hex')}`;
  type ModuleIndex = Record<string, string>;
  const readModuleIndex = async () =>
    (await persistence.get<{ index?: ModuleIndex }>('system_data', MODULE_INDEX_ID))?.index ?? {};

  app.get('/api/v1/module-data', async (_req, res) => {
    try {
      return res.json({ success: true, index: await readModuleIndex() });
    } catch (error) {
      console.error('[Persistence] Could not read module index.', error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.get('/api/v1/module-data/:key', async (req, res) => {
    if (!MODULE_DATA_KEY.test(req.params.key)) return res.status(400).json({ success: false, code: 'INVALID_MODULE_KEY' });
    try {
      const record = await persistence.get<{ data: string; updatedAt: string }>('system_data', moduleDocId(req.params.key));
      if (!record) return res.status(404).json({ success: false, code: 'MODULE_DATA_NOT_FOUND' });
      return res.json({ success: true, data: record.data, updatedAt: record.updatedAt });
    } catch (error) {
      console.error('[Persistence] Could not read module data.', error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  const writeModuleData = async (key: string, data: string | null) => {
    const updatedAt = new Date().toISOString();
    const index = await readModuleIndex();
    if (data === null) delete index[key];
    else index[key] = updatedAt;
    await persistence.commit([
      { entity: 'system_data', id: moduleDocId(key), data: data === null ? null : { key, data, updatedAt } },
      { entity: 'system_data', id: MODULE_INDEX_ID, data: { key: MODULE_INDEX_ID, index, updatedAt } }
    ]);
    return updatedAt;
  };

  app.put('/api/v1/module-data/:key', async (req, res) => {
    const data = req.body?.data;
    if (!MODULE_DATA_KEY.test(req.params.key)) return res.status(400).json({ success: false, code: 'INVALID_MODULE_KEY' });
    if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > 900_000) {
      return res.status(413).json({ success: false, code: 'INVALID_MODULE_PAYLOAD' });
    }
    try {
      return res.json({ success: true, updatedAt: await writeModuleData(req.params.key, data) });
    } catch (error) {
      console.error('[Persistence] Could not write module data.', error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.delete('/api/v1/module-data/:key', async (req, res) => {
    if (!MODULE_DATA_KEY.test(req.params.key)) return res.status(400).json({ success: false, code: 'INVALID_MODULE_KEY' });
    try {
      await writeModuleData(req.params.key, null);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Persistence] Could not delete module data.', error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.get('/api/v1/system-data/:key', async (req, res) => {
    const key = req.params.key;
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
      return res.status(400).json({ success: false, code: 'INVALID_SYSTEM_DATA_KEY' });
    }
    try {
      const record = await persistence.get<{ key: string; data: string; updatedAt: string }>('system_data', key);
      if (!record) return res.status(404).json({ success: false, code: 'SYSTEM_DATA_NOT_FOUND' });
      return res.json({ success: true, ...record });
    } catch (error) {
      console.error('[Persistence] Could not read system data.', error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.put('/api/v1/system-data/:key', async (req, res) => {
    const key = req.params.key;
    const data = req.body?.data;
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
      return res.status(400).json({ success: false, code: 'INVALID_SYSTEM_DATA_KEY' });
    }
    if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > 900_000) {
      return res.status(413).json({ success: false, code: 'INVALID_SYSTEM_DATA_PAYLOAD' });
    }
    const record = { key, data, updatedAt: new Date().toISOString() };
    try {
      await persistence.commit([{ entity: 'system_data', id: key, data: record }]);
      return res.json({ success: true, updatedAt: record.updatedAt });
    } catch (error) {
      console.error('[Persistence] Could not write system data.', error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  // 2. High-Level System Analytics & Operational Stats
  app.get('/api/v1/system/stats', (req, res) => {
    const totalBeds = bedsStore.length;
    const occupiedBeds = bedsStore.filter(b => b.status === 'Terisi').length;
    const bor = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    const lowStockItems = inventoryStore.filter(i => i.stok <= i.stok_minimum).length;

    res.json({
      totalPatients: patientsStore.length,
      activeVisitsToday: appointmentsStore.length,
      bedOccupancy: {
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        borPercent: bor
      },
      pharmacy: {
        totalSkus: inventoryStore.length,
        lowStockAlerts: lowStockItems
      },
      satusehatSyncRate: '99.4%',
      bpjsClaimApprovalRate: '98.8%',
      timestamp: new Date().toISOString()
    });
  });

  // 2b. Official Health Updates & Surveillance Indicators 2026 (Kemenkes RI & WHO)
  app.get('/api/v1/health-updates', (req, res) => {
    const data = generateHealthUpdates2026();
    res.json(data);
  });

  // Kasir, farmasi, pendaftaran dsb. hanya butuh identitas; catatan klinis (SOAP, resume, obat) untuk peran rekam medis.
  const PATIENT_IDENTITY_FIELDS = ['id', 'no_rm', 'nik', 'nama', 'tanggal_lahir', 'jenis_kelamin', 'alamat', 'no_hp',
    'golongan_darah', 'penjamin', 'no_bpjs', 'status', 'alergi', 'created_at'] as const;
  const patientForRole = (patient: PatientRecord, req: express.Request) =>
    hasScope((req as CoreAuthRequest).corePrincipal?.roleId || '', 'rekam-medis')
      ? patient
      : Object.fromEntries(PATIENT_IDENTITY_FIELDS.filter((key) => key in patient).map((key) => [key, patient[key]]));

  // 3. Patients API: List & Search
  app.get('/api/v1/patients', (req, res) => {
    const { q, penjamin, status, page = '1', limit = '20' } = req.query;
    let results = [...patientsStore];

    if (q && typeof q === 'string') {
      const queryLower = q.toLowerCase();
      results = results.filter(p =>
        p.nama.toLowerCase().includes(queryLower) ||
        p.no_rm.toLowerCase().includes(queryLower) ||
        p.nik.includes(queryLower)
      );
    }

    if (penjamin && typeof penjamin === 'string') {
      results = results.filter(p => p.penjamin.toLowerCase() === penjamin.toLowerCase());
    }

    if (status && typeof status === 'string') {
      results = results.filter(p => p.status.toLowerCase() === status.toLowerCase());
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    // Daftar hanya ringkasan (~300 B/pasien), jadi batas 1000 aman; rekam lengkap lewat GET /patients/:id.
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit as string, 10) || 20));
    const startIndex = (pageNum - 1) * limitNum;
    const clinical = hasScope((req as CoreAuthRequest).corePrincipal?.roleId || '', 'rekam-medis');
    const summaryFields: readonly string[] = clinical ? [...PATIENT_IDENTITY_FIELDS, 'keluhan_utama', 'diagnosa_primer'] : PATIENT_IDENTITY_FIELDS;
    const paginated = results.slice(startIndex, startIndex + limitNum).map((patient) =>
      Object.fromEntries(summaryFields.filter((key) => key in patient).map((key) => [key, (patient as unknown as Record<string, unknown>)[key]])));

    res.json({
      success: true,
      total: results.length,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(results.length / limitNum),
      data: paginated
    });
  });

  // 4. Patients API: Single Patient Detail
  app.get('/api/v1/patients/:idOrRm', (req, res) => {
    const { idOrRm } = req.params;
    const patient = patientsStore.find(p => p.id === idOrRm || p.no_rm === idOrRm);

    if (!patient) {
      return res.status(404).json({ success: false, error: 'Pasien tidak ditemukan dalam database.' });
    }

    const appointments = appointmentsStore.filter(a => a.pasien_id === patient.id || a.no_rm === patient.no_rm);
    const dossiers = dossierStore.filter(d => d.no_rm === patient.no_rm);

    res.json({
      success: true,
      data: {
        ...patientForRole(patient, req),
        appointments,
        // Dokumen klinis hanya untuk peran dengan akses rekam medis.
        ...(hasScope((req as CoreAuthRequest).corePrincipal?.roleId || '', 'rekam-medis') ? { documents: dossiers } : {})
      }
    });
  });

  // 5. Patients API: Register New Patient
  app.post('/api/v1/patients', (req, res) => {
    const { nik, nama, tanggal_lahir, jenis_kelamin, alamat, no_hp, golongan_darah, penjamin, no_bpjs } = req.body;

    if (!nama || !tanggal_lahir || !jenis_kelamin || !alamat) {
      return res.status(400).json({
        success: false,
        error: 'Field wajib tidak lengkap: nama, tanggal_lahir, jenis_kelamin, dan alamat harus diisi.'
      });
    }

    if (nik && !/^\d{16}$/.test(nik)) {
      return res.status(422).json({
        success: false,
        error: 'Nomor Induk Kependudukan (NIK) harus terdiri dari tepat 16 digit angka.'
      });
    }

    // Check duplicate NIK
    if (nik && patientsStore.some(p => p.nik === nik)) {
      return res.status(409).json({
        success: false,
        error: 'Pasien dengan NIK tersebut sudah terdaftar dalam sistem.'
      });
    }

    // Auto-generate No RM: RM-YYMMDD-XXXX
    const no_rm = nextRmNumber(patientsStore);

    const newPatient: PatientRecord = {
      id: `p-${randomUUID()}`,
      no_rm,
      nik: nik || '',
      nama: nama.trim(),
      tanggal_lahir,
      jenis_kelamin: jenis_kelamin === 'P' ? 'P' : 'L',
      alamat: alamat.trim(),
      no_hp: no_hp || '-',
      golongan_darah: golongan_darah || '-',
      penjamin: penjamin || 'Umum / Mandiri',
      no_bpjs: no_bpjs || undefined,
      status: 'Rawat Jalan',
      alergi: req.body.alergi || [],
      riwayat_penyakit: req.body.riwayat_penyakit || [],
      created_at: new Date().toISOString()
    };

    patientsStore.unshift(newPatient);

    // Audit log
    auditLogsStore.unshift({
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      user: (req as CoreAuthRequest).corePrincipal?.email || 'Petugas Pendaftaran',
      role: (req as CoreAuthRequest).corePrincipal?.roleId || 'Admisi',
      action: 'CREATE_PATIENT',
      module: 'Pendaftaran',
      ip: clientIp(req),
      status: 'SUCCESS',
      details: `Pendaftaran pasien baru ${newPatient.nama} dengan No. RM ${newPatient.no_rm}`
    });

    res.status(201).json({
      success: true,
      message: 'Pasien berhasil didaftarkan ke SIMK.',
      data: newPatient
    });
  });

  app.patch('/api/v1/patients/:idOrRm', (req, res) => {
    const patient = patientsStore.find((item) =>
      item.id === req.params.idOrRm || item.no_rm === req.params.idOrRm
    );
    if (!patient) return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND' });

    const allowedFields = new Set([
      'nik', 'nama', 'tanggal_lahir', 'jenis_kelamin', 'alamat', 'no_hp',
      'golongan_darah', 'penjamin', 'no_bpjs', 'status', 'alergi', 'riwayat_penyakit'
    ]);
    const entries = Object.entries(req.body || {});
    if (!entries.length || entries.some(([key]) => !allowedFields.has(key))) {
      return res.status(400).json({ success: false, code: 'INVALID_PATIENT_UPDATE' });
    }
    if (typeof req.body.nik === 'string') {
      if (req.body.nik && !/^\d{16}$/.test(req.body.nik)) {
        return res.status(422).json({ success: false, code: 'INVALID_NIK' });
      }
      if (req.body.nik && patientsStore.some((item) => item.id !== patient.id && item.nik === req.body.nik)) {
        return res.status(409).json({ success: false, code: 'DUPLICATE_NIK' });
      }
    }
    const stringLimits: Record<string, number> = {
      nik: 16, nama: 160, tanggal_lahir: 32, jenis_kelamin: 1,
      alamat: 500, no_hp: 40, golongan_darah: 10, penjamin: 80,
      no_bpjs: 40, status: 30
    };
    for (const [key, value] of entries) {
      if (key in stringLimits && (typeof value !== 'string' || value.length > stringLimits[key])) {
        return res.status(422).json({ success: false, code: 'INVALID_PATIENT_FIELD', field: key });
      }
      if (key === 'jenis_kelamin' && value !== 'L' && value !== 'P') {
        return res.status(422).json({ success: false, code: 'INVALID_PATIENT_FIELD', field: key });
      }
      if (key === 'status' && !['Aktif', 'Rawat Jalan', 'Rawat Inap', 'IGD', 'Selesai', 'Nonaktif'].includes(String(value))) {
        return res.status(422).json({ success: false, code: 'INVALID_PATIENT_FIELD', field: key });
      }
      if (['alergi', 'riwayat_penyakit'].includes(key) && !Array.isArray(value)) {
        return res.status(422).json({ success: false, code: 'INVALID_PATIENT_FIELD', field: key });
      }
      if (['alergi', 'riwayat_penyakit'].includes(key) &&
          ((value as unknown[]).length > 100 || (value as unknown[]).some((item) => typeof item !== 'string' || item.length > 200))) {
        return res.status(422).json({ success: false, code: 'INVALID_PATIENT_FIELD', field: key });
      }
    }
    Object.assign(patient, req.body);
    return res.json({ success: true, data: patient });
  });

  // 6. Appointments & Queue API
  app.get('/api/v1/appointments', (req, res) => {
    const { poli, tanggal, status } = req.query;
    let list = [...appointmentsStore];

    if (poli && typeof poli === 'string') {
      list = list.filter(a => a.poli.toLowerCase().includes(poli.toLowerCase()));
    }
    if (tanggal && typeof tanggal === 'string') {
      list = list.filter(a => a.tanggal === tanggal);
    }
    if (status && typeof status === 'string') {
      list = list.filter(a => a.status.toLowerCase() === status.toLowerCase());
    }

    res.json({
      success: true,
      total: list.length,
      data: list
    });
  });

  app.post('/api/v1/appointments', (req, res) => {
    const { pasien_id, no_rm, poli, dokter, jam_praktek, tipe = 'Rawat Jalan' } = req.body;

    if (!poli || !dokter) {
      return res.status(400).json({ success: false, error: 'Poli dan dokter wajib dipilih.' });
    }

    const patient = patientsStore.find(p => p.id === pasien_id || p.no_rm === no_rm);
    // Kunjungan tanpa pasien terdaftar menjadi yatim (id pasien acak, RM-BARU); tolak.
    if (!patient) return res.status(400).json({ success: false, code: 'PATIENT_NOT_FOUND', error: 'Pasien belum terdaftar.' });
    const pasien_nama = patient.nama;
    const patientRm = patient.no_rm;
    const tanggal = String(req.body.tanggal || new Date().toISOString()).slice(0, 10);

    const queuePrefix = poli.includes('Dalam') ? 'PD' : poli.includes('Jantung') ? 'JT' : poli.includes('Anak') ? 'AN' : 'Q';
    // Nomor antrean mulai dari 001 setiap hari per poli.
    const currentQueueCount = appointmentsStore.filter(a => a.poli === poli && String(a.tanggal).slice(0, 10) === tanggal).length + 1;
    const nomor_antrian = `${queuePrefix}-${String(currentQueueCount).padStart(3, '0')}`;

    const newAppointment: AppointmentRecord = {
      id: `apt-${randomUUID()}`,
      pasien_id: patient.id,
      pasien_nama,
      no_rm: patientRm,
      poli,
      dokter,
      tanggal,
      jam_praktek: jam_praktek || '09:00 - 12:00',
      nomor_antrian,
      status: 'Menunggu',
      tipe: tipe as any,
      created_at: new Date().toISOString()
    };

    appointmentsStore.unshift(newAppointment);

    res.status(201).json({
      success: true,
      message: `Nomor antrian berhasil diterbitkan: ${nomor_antrian}`,
      data: newAppointment
    });
  });

  app.patch('/api/v1/appointments/:id', (req, res) => {
    const appointment = appointmentsStore.find((item) => item.id === req.params.id);
    if (!appointment) return res.status(404).json({ success: false, code: 'APPOINTMENT_NOT_FOUND' });
    if (typeof req.body?.status !== 'string' ||
        !['Menunggu', 'Panggil', 'Diperiksa', 'Farmasi', 'Kasir', 'Selesai', 'Batal'].includes(req.body.status)) {
      return res.status(400).json({ success: false, code: 'INVALID_APPOINTMENT_STATUS' });
    }
    appointment.status = req.body.status === 'Batal' ? 'Dibatalkan' : req.body.status;
    return res.json({ success: true, data: appointment });
  });

  // 7. Bed Management API (Rawat Inap)
  app.get('/api/v1/bed-management/status', (req, res) => {
    const totalBeds = bedsStore.length;
    const occupied = bedsStore.filter(b => b.status === 'Terisi').length;
    const available = bedsStore.filter(b => b.status === 'Tersedia').length;
    const cleaning = bedsStore.filter(b => b.status === 'Dibersihkan').length;
    const maintenance = bedsStore.filter(b => b.status === 'Perbaikan').length;

    // Grouping by class
    const byClass: Record<string, { total: number; occupied: number; available: number }> = {};
    for (const b of bedsStore) {
      if (!byClass[b.kelas]) {
        byClass[b.kelas] = { total: 0, occupied: 0, available: 0 };
      }
      byClass[b.kelas].total += 1;
      if (b.status === 'Terisi') byClass[b.kelas].occupied += 1;
      if (b.status === 'Tersedia') byClass[b.kelas].available += 1;
    }

    res.json({
      success: true,
      overview: {
        totalBeds,
        occupied,
        available,
        cleaning,
        maintenance,
        borPercent: totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0
      },
      byClass,
      beds: bedsStore
    });
  });

  // 8. Pharmacy & Inventory Stock API
  app.get('/api/v1/inventory/stock', (req, res) => {
    const { kategori, lowStockOnly } = req.query;
    let items = [...inventoryStore];

    if (kategori && typeof kategori === 'string') {
      items = items.filter(i => i.kategori.toLowerCase() === kategori.toLowerCase());
    }

    if (lowStockOnly === 'true') {
      items = items.filter(i => i.stok <= i.stok_minimum);
    }

    const totalValuation = items.reduce((acc, curr) => acc + curr.stok * curr.harga_beli, 0);

    res.json({
      success: true,
      totalItems: items.length,
      totalValuationRp: totalValuation,
      lowStockCount: items.filter(i => i.stok <= i.stok_minimum).length,
      items
    });
  });

  app.post('/api/v1/inventory/dispense', async (req, res) => {
    const { items, recipeId, no_rm } = req.body;

    // Isolate lain mungkin sudah memotong stok; segarkan angka stok dari database sebelum memeriksa.
    if (persistence.mode !== 'memory') {
      try {
        for (const { data } of await persistence.list<{ id: string; stok: number }>('inventory')) {
          const local = inventoryStore.find((i) => i.id === data.id);
          if (local && Number.isFinite(data.stok)) local.stok = data.stok;
        }
      } catch (error) {
        console.error('[Persistence] Could not refresh inventory stock.', error);
        return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
      }
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      return res.status(400).json({ success: false, error: 'Daftar item obat yang akan dikeluarkan diperlukan.' });
    }

    const errors: string[] = [];
    const requested = new Map<InventoryItem, number>();

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push('Setiap item obat harus berupa objek yang valid.');
        continue;
      }

      const hasCode = typeof item.kode === 'string' && item.kode.trim().length > 0;
      const hasName = typeof item.nama === 'string' && item.nama.trim().length > 0;
      if ((!hasCode && !hasName) || !Number.isSafeInteger(item.qty) || item.qty <= 0) {
        errors.push('Setiap item harus memiliki kode atau nama obat serta kuantitas bilangan bulat positif.');
        continue;
      }

      const stockItem = inventoryStore.find(i =>
        (hasCode && i.kode.toLowerCase() === item.kode.trim().toLowerCase()) ||
        (hasName && i.nama.toLowerCase() === item.nama.trim().toLowerCase())
      );
      if (!stockItem) {
        errors.push(`Item obat ${hasName ? item.nama : item.kode} tidak ditemukan dalam inventaris.`);
        continue;
      }

      const combinedQty = (requested.get(stockItem) || 0) + item.qty;
      if (!Number.isSafeInteger(combinedQty)) {
        errors.push(`Total kuantitas obat ${stockItem.nama} tidak valid.`);
        continue;
      }
      requested.set(stockItem, combinedQty);
    }

    for (const [stockItem, qty] of requested) {
      if (stockItem.stok < qty) {
        errors.push(`Stok obat ${stockItem.nama} tidak mencukupi (Tersedia: ${stockItem.stok}, Diminta: ${qty}).`);
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({ success: false, errors });
    }

    const dispensed = [...requested].map(([stockItem, qty]) => {
      stockItem.stok -= qty;
      return {
        kode: stockItem.kode,
        nama: stockItem.nama,
        qty,
        sisa_stok: stockItem.stok
      };
    });

    auditLogsStore.unshift({
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      user: req.corePrincipal?.email || 'unknown',
      role: req.corePrincipal?.roleId || 'unknown',
      action: 'DISPENSE_MEDICATION',
      module: 'Farmasi',
      ip: clientIp(req),
      status: 'SUCCESS',
      details: `Pengeluaran ${dispensed.length} item obat untuk resep ${recipeId || 'R-DIRECT'} (Pasien: ${no_rm || '-'})`
    });

    res.json({
      success: true,
      message: 'Obat berhasil didispensasi dan stok inventaris terpotong otomatis.',
      dispensed,
      warnings: errors.length > 0 ? errors : undefined
    });
  });

  // 11. Payment Gateway & QRIS Callback Webhook
  app.post('/api/v1/billing/qris/callback', (req, res) => {
    return res.status(503).json({
      success: false,
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'Callback pembayaran dinonaktifkan sampai provider dan verifikasi tanda tangannya dikonfigurasi.'
    });
  });

  // 12. RME Complete Dossier Electronic Documents Hub API
  app.get('/api/v1/dossier/documents/:noRm', (req, res) => {
    const { noRm } = req.params;
    const documents = dossierStore.filter(d => d.no_rm === noRm);

    res.json({
      success: true,
      no_rm: noRm,
      total: documents.length,
      documents
    });
  });

  app.post('/api/v1/dossier/documents', (req, res) => {
    const { no_rm, pasien_nama, doc_type, title, data } = req.body;

    if (!no_rm || !doc_type || !title) {
      return res.status(400).json({
        success: false,
        error: 'no_rm, doc_type, dan title dokumen wajib diisi.'
      });
    }

    const newDoc: DossierDocument = {
      id: `doc-${randomUUID()}`,
      no_rm,
      pasien_nama: pasien_nama || 'Pasien',
      doc_type,
      title,
      created_at: new Date().toISOString(),
      created_by: (req as CoreAuthRequest).corePrincipal?.email || 'Tenaga Medis',
      // Verifikasi dokter dilakukan terpisah; dokumen baru selalu draft.
      status: 'Draft',
      data: data || {}
    };

    dossierStore.unshift(newDoc);

    res.status(201).json({
      success: true,
      message: `Berkas ${title} berhasil disimpan ke Rekam Medis Elektronik (RME).`,
      data: newDoc
    });
  });

  // 13. Audit Trail API
  app.get('/api/v1/audit/logs', (req, res) => {
    const { module, user, limit = '50' } = req.query;
    let logs = [...auditLogsStore];

    if (module && typeof module === 'string') {
      logs = logs.filter(l => l.module.toLowerCase().includes(module.toLowerCase()));
    }
    if (user && typeof user === 'string') {
      logs = logs.filter(l => l.user.toLowerCase().includes(user.toLowerCase()));
    }

    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
    res.json({
      success: true,
      total: logs.length,
      data: logs.slice(0, limitNum)
    });
  });

  app.post('/api/v1/audit/logs', (req, res) => {
    const { action, module, details, status = 'SUCCESS' } = req.body;
    const entry: AuditLogEntry = {
      id: `log-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      user: (req as CoreAuthRequest).corePrincipal?.email || 'Staf SIMK',
      role: (req as CoreAuthRequest).corePrincipal?.roleId || 'Tenaga Medis',
      action: action || 'DATA_ACCESS',
      module: module || 'Umum',
      ip: clientIp(req),
      status: status as any,
      details: details || 'Aktivitas terekam'
    };
    auditLogsStore.unshift(entry);
    res.status(201).json({ success: true, data: entry });
  });

  // 14. Database Backup & Disaster Recovery API
  app.post('/api/v1/backup/create', (req, res) => {
    return res.status(503).json({
      success: false,
      code: 'BACKUP_NOT_CONFIGURED',
      message: 'Backup dinonaktifkan karena penyimpanan persisten dan tujuan backup belum dikonfigurasi.'
    });
  });

  app.get('/api/v1/backup/status', (req, res) => {
    return res.status(503).json({
      success: false,
      code: 'BACKUP_NOT_CONFIGURED',
      status: 'UNAVAILABLE',
      message: 'Belum ada layanan backup yang dikonfigurasi.'
    });
  });

  // =========================================================================
  // 🧠 AI MEDICAL INTELLIGENCE ENDPOINTS (Powered by Google Gemini 4)
  // =========================================================================

  // AI Medical Assistant Endpoint
  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const { clinicalNote } = req.body;

      if (!clinicalNote) {
        return res.status(400).json({ error: 'Clinical note is required.' });
      }

      const prompt = `
You are MY ITARU AI, a world-class Clinical Decision Support System and Medical Assistant.
Analyze the following clinical note or transcription provided by a doctor.

Clinical Note:
"${clinicalNote}"

Perform the following tasks:
1. Convert the note into a structured SOAP format (Subjective, Objective, Assessment, Plan).
2. Recommend likely ICD-10 codes based on the assessment.
3. Recommend likely ICD-9-CM codes based on the assessment.
4. Provide a clinical summary (Resume Medis).
5. Identify any missing critical data or potential drug interaction warnings (if applicable based on the context).
6. Provide a recommendation for next steps.

IMPORTANT: You are an assistant, NOT a doctor. Ensure you state that this is for clinical decision support only and not a final diagnosis.
`;

      const aiResult = await executeResilientGemini({
        prompt: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            soap: {
              type: Type.OBJECT,
              properties: {
                subjective: { type: Type.STRING },
                objective: { type: Type.STRING },
                assessment: { type: Type.STRING },
                plan: { type: Type.STRING }
              }
            },
            icd10: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            icd9: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            resume: { type: Type.STRING },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            disclaimer: { type: Type.STRING }
          },
          required: ['soap', 'icd10', 'icd9', 'resume', 'warnings', 'recommendations', 'disclaimer']
        }
      });

      if (aiResult?.text) {
        const data = parseSafeJson(aiResult.text);
        if (data) {
          return res.json(data);
        }
      }

      // High-Detail Deterministic Fallback
      const fallback = analyzeClinicalNoteDeterministic(clinicalNote);
      return res.json({ ...fallback, fallback: true });
    } catch (error: any) {
      console.warn('AI Analysis Warning/Fallback triggered:', error?.message || error);
      const fallback = analyzeClinicalNoteDeterministic(req.body?.clinicalNote || '');
      return res.json({ ...fallback, fallback: true });
    }
  });

  // ⭐ ENDPOINT: Clinical Decision Support Widget (CDSS) with Gemini API
  app.post('/api/ai/clinical-decision-support', async (req, res) => {
    try {
      const { patient, vitals, symptoms, clinicalNotes } = req.body;

      if (!symptoms?.chiefComplaint && !clinicalNotes) {
        return res.status(400).json({ error: 'Keluhan utama (chief complaint) atau catatan klinis diperlukan.' });
      }

      const prompt = `
You are MY ITARU Clinical Decision Support System (CDSS), an advanced medical intelligence assistant for clinic doctors in Indonesia.
Analyze the following patient's vital signs and symptoms to provide evidence-based clinical decision support and accurate ICD-10 diagnosis recommendations.

Patient Context:
- Patient Name: ${patient?.name || 'Pasien Anonim'}
- Medical Record Number (No. RM): ${patient?.noRm || '-'}
- Age / Gender: ${patient?.age || 'Dewasa'} / ${patient?.gender || '-'}
- Known Allergies: ${patient?.allergies || 'Tidak ada riwayat alergi'}
- Relevant Medical History: ${patient?.history || 'Tidak ada riwayat penyakit sebelumnya'}

Vital Signs:
- Blood Pressure: ${vitals?.systolic || '-'}/${vitals?.diastolic || '-'} mmHg
- Heart Rate (Nadi): ${vitals?.heartRate || '-'} bpm
- Body Temperature (Suhu): ${vitals?.temperature || '-'} °C
- Respiratory Rate (RR): ${vitals?.respiratoryRate || '-'} breaths/min
- Oxygen Saturation (SpO2): ${vitals?.spO2 || '-'} %
- Pain Scale (NRS/VAS): ${vitals?.painScale || '0'} / 10
- Consciousness (GCS): ${vitals?.gcs || 'Compos Mentis (E4M6V5 / 15)'}
- Random Blood Glucose (GDS): ${vitals?.bloodGlucose || '-'} mg/dL
- Weight / Height: ${vitals?.weight || '-'} kg / ${vitals?.height || '-'} cm

Symptoms & Clinical Findings:
- Chief Complaint (Keluhan Utama): "${symptoms?.chiefComplaint || clinicalNotes || '-'}"
- Duration of Symptoms: "${symptoms?.duration || '-'}"
- Associated Symptoms (Gejala Penyerta): "${symptoms?.additionalSymptoms || '-'}"
- Clinical Notes / Physical Findings: "${clinicalNotes || '-'}"

Task:
1. Synthesize a professional clinical case summary in Indonesian.
2. Evaluate vital signs: identify any abnormal parameters (Hypertension, Tachycardia, Hypoxemia, Fever, Tachypnea, etc.) and calculate an Early Warning Score (NEWS).
3. Determine Triage Urgency Level (P1 Resusitasi / P2 Emergensi / P3 Urgensi / P4 Semi-Urgensi / P5 Non-Urgensi).
4. Recommend the Primary ICD-10 Diagnosis with official WHO ICD-10 code, Indonesian diagnosis name, English name, confidence score (0-100), clinical rationale explaining how the vitals and symptoms justify this code, and criteria met.
5. Recommend 2 to 4 Differential Diagnoses (Diagnosis Banding) with valid ICD-10 codes, confidence scores, reasoning, and key differentiating clinical clues.
6. Suggest relevant ICD-9-CM procedural / diagnostic codes (e.g., 89.52 EKG, 87.44 Foto Thorax, 90.59 Pemeriksaan Darah).
7. Flag any urgent Red Flags or life-threatening symptoms requiring immediate action.
8. Recommend targeted diagnostic workup (Laboratorium, Radiologi, Penunjang Lain).
9. Outline initial therapeutic & non-pharmacological management aligned with Indonesian Panduan Praktik Klinis (PPK Kemenkes RI) and Formularium Nasional (Fornas).
10. Emphasize that this is a Clinical Decision Support tool for licensed medical personnel, not an autonomous final diagnosis.
`;

      const aiResult = await executeResilientGemini({
        prompt,
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              vitalStatus: {
                type: Type.OBJECT,
                properties: {
                  status: { type: Type.STRING, enum: ['NORMAL', 'ABNORMAL', 'CRITICAL'] },
                  flags: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        parameter: { type: Type.STRING },
                        value: { type: Type.STRING },
                        severity: { type: Type.STRING, enum: ['warning', 'critical', 'info'] },
                        message: { type: Type.STRING }
                      },
                      required: ['parameter', 'value', 'severity', 'message']
                    }
                  },
                  earlyWarningScore: {
                    type: Type.OBJECT,
                    properties: {
                      score: { type: Type.INTEGER },
                      category: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
                      recommendation: { type: Type.STRING }
                    },
                    required: ['score', 'category', 'recommendation']
                  }
                },
                required: ['status', 'flags', 'earlyWarningScore']
              },
              triage: {
                type: Type.OBJECT,
                properties: {
                  level: { type: Type.STRING, enum: ['P1', 'P2', 'P3', 'P4', 'P5'] },
                  name: { type: Type.STRING },
                  color: { type: Type.STRING },
                  urgency: { type: Type.STRING }
                },
                required: ['level', 'name', 'color', 'urgency']
              },
              primaryDiagnosis: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  nameId: { type: Type.STRING },
                  nameEn: { type: Type.STRING },
                  confidence: { type: Type.INTEGER },
                  reasoning: { type: Type.STRING },
                  clinicalCriteria: { type: Type.STRING },
                  category: { type: Type.STRING }
                },
                required: ['code', 'nameId', 'nameEn', 'confidence', 'reasoning', 'clinicalCriteria', 'category']
              },
              differentialDiagnoses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING },
                    nameId: { type: Type.STRING },
                    nameEn: { type: Type.STRING },
                    confidence: { type: Type.INTEGER },
                    reasoning: { type: Type.STRING },
                    differentiatingClues: { type: Type.STRING }
                  },
                  required: ['code', 'nameId', 'nameEn', 'confidence', 'reasoning', 'differentiatingClues']
                }
              },
              suggestedIcd9: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING },
                    name: { type: Type.STRING },
                    category: { type: Type.STRING },
                    indication: { type: Type.STRING }
                  },
                  required: ['code', 'name', 'category', 'indication']
                }
              },
              redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedWorkup: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    testName: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  },
                  required: ['category', 'testName', 'reason']
                }
              },
              immediateActions: { type: Type.ARRAY, items: { type: Type.STRING } },
              clinicalGuidelineRef: { type: Type.STRING },
              disclaimer: { type: Type.STRING }
            },
            required: [
              'summary', 'vitalStatus', 'triage', 'primaryDiagnosis',
              'differentialDiagnoses', 'suggestedIcd9', 'redFlags',
              'recommendedWorkup', 'immediateActions', 'clinicalGuidelineRef', 'disclaimer'
            ]
        }
      });

      const parsedData = parseSafeJson(aiResult?.text);
      if (parsedData) {
        return res.json(parsedData);
      }

      const fallbackResult = generateClinicalDecisionSupportDeterministic(req.body);
      return res.json({ ...fallbackResult, fallback: true });
    } catch (error: any) {
      console.warn('Clinical Decision Support Fallback triggered:', error?.message || error);
      const fallbackResult = generateClinicalDecisionSupportDeterministic(req.body || {});
      return res.json({ ...fallbackResult, fallback: true });
    }
  });

  // ⭐ ENDPOINT BARU: AI Medical Intelligence & Clinical Search Grounding
  app.post('/api/ai/grounded-search', async (req, res) => {
    try {
      const query = scrubPhi(req.body?.query, 500);
      const context = scrubPhi(req.body?.context);

      if (!query) {
        return res.status(400).json({ error: 'Query is required.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const prompt = `
You are MY ITARU Medical Search & Clinical Evidence Assistant, an integrated AI assistant in the SIMK clinic system.
Provide up-to-date, accurate, evidence-based medical information in Bahasa Indonesia using Google Search data.

Clinical / Query Context:
${context ? `Context: "${context}"\n` : ''}
User Medical Query:
"${query}"

Instructions:
1. Provide a comprehensive, accurate clinical summary based on the latest medical guidelines (Kemenkes RI, WHO, IDI, FDA, BPOM, PubMed, clinical trials, or trusted medical literature).
2. Detail guidelines, indications, dosages, contraindications, or treatment protocols where relevant.
3. Highlight any critical clinical warnings, red flags, or drug interactions.
4. Structure the answer clearly with headings, bullet points, and concise explanations.
5. Emphasize that this information is for clinical decision support for healthcare professionals and not an independent medical diagnosis.
`;

      let response: any = null;
      for (const modelName of getGeminiModelFallbackChain()) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }]
            }
          });
          if (response?.text) break;
        } catch (modelErr: any) {
          console.warn(`[Grounded Search] Model ${modelName} failed:`, modelErr?.message || modelErr);
        }
      }

      if (!response?.text) {
        throw new Error('Grounded search models unavailable, switching to deterministic evidence engine.');
      }

      const responseText = response.text || '';
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const searchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];

      // Extract sources
      const sources = groundingChunks
        .map((chunk: any) => chunk.web)
        .filter((web: any) => web && web.uri)
        .map((web: any) => ({
          title: web.title || web.uri,
          url: web.uri
        }));

      res.json({
        answer: responseText,
        sources: sources.length > 0 ? sources : [
          { title: "Kemenkes RI — Panduan Praktik Klinis Dokter di Fasyankes", url: "https://kemkes.go.id" },
          { title: "Badan Pengawas Obat dan Makanan (BPOM) — Informasi Spesialite Obat", url: "https://pom.go.id" }
        ],
        searchQueries,
        groundingMetadata: response.candidates?.[0]?.groundingMetadata || null
      });
    } catch (error: any) {
      console.warn('AI Grounded Search Warning/Fallback triggered:', error?.message || error);
      return res.json({ ...generateMedicalSearchEvidenceDeterministic(req.body?.query || "", req.body?.context), fallback: true });
    }
  });

  // ⭐ ENDPOINT BARU: Google Maps Grounding & Geospatial Health Locator
  app.post('/api/ai/maps-grounding', async (req, res) => {
    try {
      const { latitude, longitude, category } = req.body;
      const query = scrubPhi(req.body?.query, 500);

      if (!query) {
        return res.status(400).json({ error: 'Query is required for Google Maps search.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const prompt = `
You are MY ITARU Geospatial Health & Medical Facility Locator.
Use Google Maps data to provide precise, real-time geographical information for healthcare facilities, referral hospitals, BPJS faskes, 24/7 pharmacies, emergency rooms, ambulance hubs, or clinics in Indonesia.

Query: "${query}"
${category ? `Facility Category: ${category}\n` : ''}
${latitude && longitude ? `User Coordinates: Lat ${latitude}, Lng ${longitude}\n` : ''}

Instructions:
1. Identify the best matching healthcare facilities, emergency hubs, or referral centers based on the query.
2. Provide facility name, full address, key specialties/services (e.g., IGD 24 Jam, NICU/PICU, Bedah, Hemodialisa, BPJS), and operational hours.
3. Include helpful navigation details (approximate distance/travel notes).
4. Format the output with clear markdown headings, bullet points, and organized sections.
`;

      const configObj: any = {
        tools: [{ googleMaps: {} }]
      };

      if (latitude && longitude && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
        configObj.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: Number(latitude),
              longitude: Number(longitude)
            }
          }
        };
      }

      let response: any = null;
      for (const modelName of getGeminiModelFallbackChain()) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: configObj
          });
          if (response?.text) break;
        } catch (modelErr: any) {
          console.warn(`[Maps Grounding] Model ${modelName} failed:`, modelErr?.message || modelErr);
        }
      }

      if (!response?.text) {
        throw new Error('Maps grounding models unavailable, falling back.');
      }

      const responseText = response.text || '';
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const searchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];

      // Extract Google Maps sources and links
      const mapsSources: any[] = [];
      for (const chunk of groundingChunks) {
        if ((chunk as any).maps) {
          const mapData = (chunk as any).maps;
          mapsSources.push({
            title: mapData.title || 'Fasilitas Kesehatan di Google Maps',
            url: mapData.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapData.title || query)}`,
            address: mapData.formattedAddress || '',
            rating: mapData.rating || null,
            reviewSnippets: mapData.placeAnswerSources?.reviewSnippets || []
          });
        } else if ((chunk as any).web) {
          mapsSources.push({
            title: (chunk as any).web.title || query,
            url: (chunk as any).web.uri
          });
        }
      }

      res.json({
        answer: responseText,
        sources: mapsSources.length > 0 ? mapsSources : [
          {
            title: `Pencarian Google Maps: ${query}`,
            url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
          }
        ],
        searchQueries,
        groundingMetadata: response.candidates?.[0]?.groundingMetadata || null
      });
    } catch (error: any) {
      console.warn('Google Maps Grounding Warning/Fallback triggered:', error?.message || error);
      
      const q = String(req.body.query || '');
      const userLat = Number(req.body.latitude) || -6.2088;
      const userLng = Number(req.body.longitude) || 106.8456;
      const category = String(req.body.category || 'all');

      // Curated verified Indonesian medical facilities dataset for reliable fallback
      const mockFacilities = [
        {
          id: 'f-1',
          name: 'RSUP Nasional Dr. Cipto Mangunkusumo (RSCM)',
          category: 'RS Rujukan Nasional / Tipe A',
          address: 'Jl. Pangeran Diponegoro No.71, Kenari, Senen, Jakarta Pusat 10430',
          lat: -6.1969,
          lng: 106.8488,
          distance: '2.4 km',
          eta: '8 menit',
          phone: '(021) 1500135',
          services: ['IGD 24 Jam', 'Trauma Center Level 1', 'Hemodialisa', 'Bedah Jantung', 'BPJS Kesehatan', 'SatuSehat Ready'],
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=RSUP+Nasional+Dr.+Cipto+Mangunkusumo',
          rating: 4.7
        },
        {
          id: 'f-2',
          name: 'RS Jantung dan Pembuluh Darah Harapan Kita',
          category: 'RS Khusus Jantung / Rujukan Nasional',
          address: 'Jl. Letjen S. Parman Kav. 87, Slipi, Palmerah, Jakarta Barat 11420',
          lat: -6.1867,
          lng: 106.7979,
          distance: '5.1 km',
          eta: '14 menit',
          phone: '(021) 5684093',
          services: ['Emergency Jantung (Cath Lab 24 Jam)', 'ICCU Terpadu', 'BPJS Rujukan', 'Ambulans Mobile Coronary Care'],
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=RS+Jantung+dan+Pembuluh+Darah+Harapan+Kita',
          rating: 4.8
        },
        {
          id: 'f-3',
          name: 'RS Kanker Dharmais (Pusat Kanker Nasional)',
          category: 'RS Khusus Onkologi',
          address: 'Jl. Letjen S. Parman No.84-86, Kota Bambu Selatan, Palmerah, Jakarta Barat',
          lat: -6.1884,
          lng: 106.7987,
          distance: '5.3 km',
          eta: '15 menit',
          phone: '(021) 5681570',
          services: ['Kemoterapi & Radioterapi', 'Onkologi Terpadu', 'BPJS Tercover', 'Rawat Inap Khusus'],
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=RS+Kanker+Dharmais',
          rating: 4.6
        },
        {
          id: 'f-4',
          name: 'Puskesmas Kecamatan Menteng (FKTP BPJS)',
          category: 'Puskesmas / FKTP 1 BPJS',
          address: 'Jl. Pegangsaan Barat No.14, Menteng, Jakarta Pusat',
          lat: -6.1995,
          lng: 106.8437,
          distance: '1.2 km',
          eta: '4 menit',
          phone: '(021) 31924513',
          services: ['Poli Umum & Gigi', 'KIA / KB', 'Imunisasi', 'Laboratorium Dasar', 'Rujukan Berjenjang BPJS'],
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Puskesmas+Kecamatan+Menteng',
          rating: 4.5
        },
        {
          id: 'f-5',
          name: 'Apotek Kimia Farma 24 Jam Salemba Raya',
          category: 'Apotek 24 Jam & Farmasi',
          address: 'Jl. Salemba Raya No.22, Kenari, Senen, Jakarta Pusat',
          lat: -6.1942,
          lng: 106.8512,
          distance: '1.8 km',
          eta: '5 menit',
          phone: '(021) 31934522',
          services: ['Resep Dokter 24 Jam', 'Konseling Apoteker', 'Obat Kronis PRB BPJS', 'Alat Kesehatan'],
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Apotek+Kimia+Farma+Salemba+Raya',
          rating: 4.6
        },
        {
          id: 'f-6',
          name: 'Posko Ambulans Gawat Darurat Dinkes & Palang Merah Indonesia (PMI)',
          category: 'Pos Ambulans & Bank Darah',
          address: 'Jl. Kramat Raya No.47, Kramat, Senen, Jakarta Pusat',
          lat: -6.1852,
          lng: 106.8431,
          distance: '2.8 km',
          eta: '7 menit',
          phone: '119 / (021) 3906666',
          services: ['Layanan Ambulans 119', 'Bank Darah PMI', 'Emergency Response', 'Penjemputan Medis'],
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=PMI+DKI+Jakarta+Kramat+Raya',
          rating: 4.9
        }
      ];

      const answerMarkdown = `### 📍 Rekomendasi Fasilitas Kesehatan & Lokasi Terdekat (Google Maps Grounding)

Berdasarkan pencarian: **"${q}"** (Area sekitar koordinat ${userLat.toFixed(4)}, ${userLng.toFixed(4)}):

1. **RSUP Nasional Dr. Cipto Mangunkusumo (RSCM)**
   - **Kategori:** RS Rujukan Nasional / Tipe A (Faskes Tingkat Lanjut)
   - **Alamat:** Jl. Pangeran Diponegoro No.71, Kenari, Senen, Jakarta Pusat
   - **Layanan Unggulan:** IGD 24 Jam, Trauma Center Level 1, ICU/PICU/NICU, Hemodialisa Terpadu.
   - **Estimasi Jarak:** ~2.4 km (8 menit via rute utama).

2. **RS Jantung dan Pembuluh Darah Harapan Kita**
   - **Kategori:** RS Khusus Jantung / Pusat Rujukan Kardiovaskular
   - **Alamat:** Jl. Letjen S. Parman Kav. 87, Slipi, Jakarta Barat
   - **Layanan Unggulan:** Cath Lab 24 Jam, Emergency Kardiovaskular, Tercover BPJS V-Claim.
   - **Estimasi Jarak:** ~5.1 km (14 menit).

3. **Puskesmas Kecamatan Menteng (Faskes Primer BPJS)**
   - **Kategori:** Fasilitas Kesehatan Tingkat Pertama (FKTP)
   - **Alamat:** Jl. Pegangsaan Barat No.14, Menteng, Jakarta Pusat
   - **Layanan Unggulan:** Rawat Jalan Umum, Poli Gigi, Farmasi PRB, Rujukan Terintegrasi.
   - **Estimasi Jarak:** ~1.2 km (4 menit).

4. **Apotek Kimia Farma 24 Jam Salemba Raya**
   - **Kategori:** Apotek Jaga & Pengambilan Obat Kronis (PRB)
   - **Alamat:** Jl. Salemba Raya No.22, Kenari, Senen, Jakarta Pusat
   - **Estimasi Jarak:** ~1.8 km (5 menit).

💡 *Klik tautan rute Google Maps untuk navigasi langsung dengan GPS real-time.*`;

      return res.json({
        answer: answerMarkdown,
        sources: mockFacilities.map(f => ({
          title: `${f.name} — ${f.category}`,
          url: f.googleMapsUrl,
          address: f.address,
          rating: f.rating
        })),
        facilities: mockFacilities,
        searchQueries: [q, `${q} rumah sakit terdekat`, `${q} faskes bpjs google maps`],
        groundingMetadata: null,
        fallback: true
      });
    }
  });

  // ⭐ ENDPOINT: AI BPJS Claim Pre-Check & Dispute Predictor
  app.post('/api/ai/bpjs-audit', async (req, res) => {
    try {
      const { billingId, patientName, diagnosis, items, totalBill, sepNo } = req.body;

      const prompt = `
Anda adalah Auditor Ahli Casemix & AI INA-CBGs Validator pada MYITARU SIMK.
Evaluasi kelayakan klaim BPJS Kesehatan berdasarkan rincian berikut:

Nama Pasien: ${patientName || 'Pasien BPJS'}
No SEP: ${sepNo || 'SEP-ELEKTRONIK-TERDAFTAR'}
Diagnosis Utama & Sekunder: ${JSON.stringify(diagnosis || 'Hipertensi / Observasi Febris')}
Total Tagihan Kasir: Rp ${totalBill || 0}
Item Tindakan & Obat: ${JSON.stringify(items || [])}

Tugas Anda:
1. Hitung skor kelayakan klaim BPJS (0-100%).
2. Identifikasi apakah ada potensi klaim pending / dispute dengan verifikator BPJS.
3. Periksa kesesuaian diagnosis ICD-10 dengan item obat (Fornas) dan tindakan medis.
4. Berikan temuan spesifik (findings) dan rekomendasi preskriptif untuk koder/kasir.
`;

      const aiResult = await executeResilientGemini({
        prompt: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            status: { type: Type.STRING, enum: ['valid', 'warning', 'dispute_risk'] },
            findings: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.STRING },
            inacbgGroup: { type: Type.STRING },
            potentialPendingReason: { type: Type.STRING }
          },
          required: ['score', 'status', 'findings', 'recommendation']
        }
      });

      if (aiResult?.text) {
        const parsedBpjs = parseSafeJson(aiResult.text);
        if (parsedBpjs) return res.json(parsedBpjs);
      }

      const fallback = auditBpjsClaimDeterministic({ billingId, patientName, diagnosis, items, totalBill, sepNo });
      return res.json({ ...fallback, fallback: true });
    } catch (error: any) {
      console.warn('AI BPJS Audit Warning/Fallback triggered:', error?.message || error);
      const fallback = auditBpjsClaimDeterministic(req.body);
      return res.json({ ...fallback, fallback: true });
    }
  });

  // ⭐ ENDPOINT: AI Radiology Computer-Assisted Expertise
  app.post('/api/ai/radiology-analyze', async (req, res) => {
    try {
      const { examinationName, modality, clinicalDiagnosis, patientAge, gender } = req.body;

      const prompt = `
Anda adalah AI Radiologist Assistant & Computer Vision Diagnostic Engine pada MYITARU SIMK.
Lakukan analisis temuan radiologis terstruktur berdasarkan data pemeriksaan:

Nama Pemeriksaan: ${examinationName || 'Foto Thorax PA'}
Modalitas: ${modality || 'X-Ray'}
Diagnosa Kerja / Klinis: ${clinicalDiagnosis || 'Suspek Pneumonia / Batuk kronis'}
Usia & Jenis Kelamin: ${patientAge || 'Dewasa'} / ${gender || 'L'}

Berikan:
1. Ringkasan temuan radiologis (summary) dalam Bahasa Indonesia profesional.
2. Estimasi confidence level (85.0 - 99.0%).
3. Daftar temuan deteksi terstruktur (findings_detected).
4. Usulan draf ekspertise lengkap untuk DPJP Radiologi.
5. Kesimpulan akhir.
`;

      const aiResult = await executeResilientGemini({
        prompt: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            findings_detected: { type: Type.ARRAY, items: { type: Type.STRING } },
            draft_ekspertise: { type: Type.STRING },
            kesimpulan: { type: Type.STRING }
          },
          required: ['summary', 'confidence', 'findings_detected', 'draft_ekspertise', 'kesimpulan']
        }
      });

      if (aiResult?.text) {
        const parsedRad = parseSafeJson(aiResult.text);
        if (parsedRad) return res.json(parsedRad);
      }

      const fallback = analyzeRadiologyDeterministic({ examinationName, modality, clinicalDiagnosis, patientAge, gender });
      return res.json({ ...fallback, fallback: true });
    } catch (error: any) {
      console.warn('AI Radiology Analysis Warning/Fallback triggered:', error?.message || error);
      const fallback = analyzeRadiologyDeterministic(req.body);
      return res.json({ ...fallback, fallback: true });
    }
  });

  // ⭐ ENDPOINT: AI Pharmacovigilance & Drug Interaction
  app.post('/api/ai/drug-interaction', async (req, res) => {
    try {
      const { medications, patientContext } = req.body;

      if (!medications || !Array.isArray(medications)) {
        return res.status(400).json({ error: 'Medications array is required.' });
      }

      const prompt = `
Anda adalah AI Clinical Pharmacologist pada MYITARU SIMK.
Analisis keamanan resep dan potensi interaksi obat berikut:

Daftar Obat Resep:
${medications.map((m: any) => `- ${typeof m === 'string' ? m : m.nama || m.name}`).join('\n')}

Konteks Pasien:
${patientContext ? JSON.stringify(patientContext) : 'Umum (Tanpa komorbiditas ginjal/hepar)'}

Evaluasi:
1. Keselamatan keseluruhan (Safety Index 0-100%).
2. Interaksi obat signifikan (kategori: Kontraindikasi, Mayor, Moderat, Minor, atau Aman).
3. Rekomendasi penyesuaian dosis atau alternatif obat bila ada interaksi berisiko.
`;

      const aiResult = await executeResilientGemini({
        prompt: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safetyIndex: { type: Type.INTEGER },
            hasCriticalInteraction: { type: Type.BOOLEAN },
            interactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  drugA: { type: Type.STRING },
                  drugB: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ['Kontraindikasi', 'Mayor', 'Moderat', 'Minor', 'Aman'] },
                  mechanism: { type: Type.STRING },
                  action: { type: Type.STRING }
                },
                required: ['drugA', 'drugB', 'severity', 'mechanism', 'action']
              }
            },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['safetyIndex', 'hasCriticalInteraction', 'interactions', 'recommendations']
        }
      });

      if (aiResult?.text) {
        const parsedDrug = parseSafeJson(aiResult.text);
        if (parsedDrug) return res.json(parsedDrug);
      }

      const fallback = checkDrugInteractionsDeterministic(medications, patientContext);
      return res.json({ ...fallback, fallback: true });
    } catch (error: any) {
      console.warn('AI Drug Interaction Warning/Fallback triggered:', error?.message || error);
      const fallback = checkDrugInteractionsDeterministic(req.body?.medications || [], req.body?.patientContext);
      return res.json({ ...fallback, fallback: true });
    }
  });

  // ⭐ ENDPOINT: AI Electronic Medical Record (EMR) Completeness & KLPCM Audit (Permenkes 24/2022)
  app.post('/api/ai/document-completeness', async (req, res) => {
    try {
      const { documentType, patientName, patientData, medicalNotes, fields, signatures } = req.body;
      const effectivePatientData = patientData || (patientName ? { nama: patientName } : {});
      const effectiveNotes = medicalNotes || fields || {};

      const prompt = `
Anda adalah Auditor Mutu Rekam Medis Elektronik (RME) dan Tim Verifikasi Akreditasi Fasilitas Kesehatan (KARS/LAM-KPRS) MYITARU SIMK berdasarkan Permenkes No. 24 Tahun 2022.
Evaluasi kelengkapan berkas rekam medis berikut:

Jenis Berkas: ${documentType || 'Resume Medis / Asesmen Rawat Inap'}
Data Pasien: ${JSON.stringify(effectivePatientData)}
Catatan Medis / Konten: ${JSON.stringify(effectiveNotes)}
Status Tanda Tangan Elektronik: ${JSON.stringify(signatures || {})}

Evaluasi 4 Aspek Wajib KLPCM (Ketidaklengkapan Pengisian Catatan Medis):
1. Kelengkapan Identitas Pasien (No. RM, Nama, NIK, Tgl Lahir, Jenis Kelamin).
2. Kelengkapan Autentikasi (Nama Terang & Tanda Tangan Elektronik DPJP / Tenaga Kesehatan).
3. Kelengkapan Pencatatan Laporan Penting (Anamnesis, TTV, Diagnosis ICD-10, Tindakan, Obat Pulang).
4. Kerapian dan Konsistensi Catatan Medis.
`;

      const aiResult = await executeResilientGemini({
        prompt: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            completenessScore: { type: Type.INTEGER },
            accreditationStatus: { type: Type.STRING, enum: ['Paripurna', 'Utama', 'Madya', 'Tidak Memenuhi'] },
            isPermenkesCompliant: { type: Type.BOOLEAN },
            missingElements: { type: Type.ARRAY, items: { type: Type.STRING } },
            positiveFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctiveRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['completenessScore', 'accreditationStatus', 'isPermenkesCompliant', 'missingElements', 'positiveFindings', 'correctiveRecommendations']
        }
      });

      if (aiResult?.text) {
        const parsedDoc = parseSafeJson(aiResult.text);
        if (parsedDoc) return res.json(parsedDoc);
      }

      const fallback = auditDocumentCompletenessDeterministic({ documentType, patientName, patientData: effectivePatientData, medicalNotes: effectiveNotes, signatures });
      return res.json({ ...fallback, fallback: true });
    } catch (error: any) {
      console.warn('AI Document Completeness Warning/Fallback triggered:', error?.message || error);
      const fallback = auditDocumentCompletenessDeterministic(req.body || {});
      return res.json({ ...fallback, fallback: true });
    }
  });

  // Cloudflare Turnstile Verification API
  app.post('/api/cloudflare/verify-turnstile', async (req, res) => {
    const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    const expectedHostname = process.env.CLOUDFLARE_TURNSTILE_EXPECTED_HOSTNAME;
    if (!secret || !expectedHostname) {
      return res.status(503).json({ success: false, code: 'TURNSTILE_NOT_CONFIGURED' });
    }

    try {
      const { token } = req.body || {};

      if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
        return res.status(400).json({ success: false, message: 'Turnstile token is required.' });
      }

      const formData = new URLSearchParams();
      formData.append('secret', secret);
      formData.append('response', token);
      if (req.ip) {
        formData.append('remoteip', req.ip);
      }

      const cfResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        signal: AbortSignal.timeout(10_000)
      });

      if (!cfResponse.ok) {
        return res.status(502).json({ success: false, code: 'TURNSTILE_PROVIDER_ERROR' });
      }
      const cfData = await cfResponse.json() as { success?: boolean; hostname?: string; action?: string };
      const valid = cfData.success === true &&
        cfData.hostname === expectedHostname &&
        cfData.action === (process.env.CLOUDFLARE_TURNSTILE_EXPECTED_ACTION || 'login');
      return res.status(200).json({ success: valid });
    } catch (err) {
      console.error('Cloudflare Turnstile verification error:', err);
      return res.status(502).json({ success: false, code: 'TURNSTILE_VERIFICATION_FAILED' });
    }
  });

  // Register Public Hospital Portal & Patient Mobile App Routes (hanya di web publik)
  registerPatientPortalRoutes(publicApp, {
    patientsStore: patientsStore as any,
    appointmentsStore: appointmentsStore as any,
    bedsStore: bedsStore as any,
    qrTokensStore,
    staffApp: app,
    useDemoData: persistence.mode === 'memory',
    createAuditLog: (entry) => {
      auditLogsStore.unshift({
        id: `log-${randomUUID()}`,
        timestamp: new Date().toISOString(),
        ...entry
      });
    }
  });

  // Register Unified Employee Ecosystem API Gateway (/api/gateway/*)
  registerEmployeePortalGateway(app, {
    createAuditLog: (entry) => {
      auditLogsStore.unshift({
        id: `log-${randomUUID()}`,
        timestamp: new Date().toISOString(),
        user: entry.user_name || entry.user_id,
        role: entry.user_id,
        action: entry.action,
        module: entry.module,
        ip: entry.ip_address || '127.0.0.1',
        status: entry.status,
        details: entry.details
      });
    }
  });

  return { app, publicApp, persistence };
}

export function addErrorHandler(target: express.Application) {
  target.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global Server Error:', err);
    if (!res.headersSent) {
      // Kesalahan klien (JSON rusak 400, body besar 413) dilaporkan apa adanya; selain itu pesan internal tidak dibocorkan.
      const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
      res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan pada server.' : (err?.message || 'Permintaan tidak valid.') });
    }
  });
}

async function startServer() {
  const { app, publicApp, persistence } = await createApps();
  const httpServer = http.createServer(app);
  const publicHttpServer = http.createServer(publicApp);
  const CORE_PORT = Number(process.env.CORE_PORT) || 3001;
  const PUBLIC_PORT = Number(process.env.PUBLIC_PORT) || Number(process.env.PORT) || 3000;

  // Frontend: tiap app hanya menyajikan bundel miliknya sendiri.
  const isProd = process.env.NODE_ENV === 'production';
  const mountFrontend = async (target: express.Application, server: http.Server, appTarget: 'core' | 'public') => {
    const htmlFile = appTarget === 'public' ? 'public.html' : 'index.html';
    const distPath = path.join(process.cwd(), 'dist', appTarget);
    const serveStatic = () => {
      target.use(express.static(distPath, { index: false }));
      target.get('*', (req, res) => {
        res.sendFile(path.join(distPath, htmlFile), (err) => {
          if (err && !res.headersSent) {
            res.status(500).send(`Gagal memuat ${htmlFile}. Silakan build ulang aplikasi.`);
          }
        });
      });
    };
    if (isProd) return serveStatic();
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        configFile: path.join(process.cwd(), appTarget === 'public' ? 'vite.public.config.ts' : 'vite.config.ts'),
        server: {
          middlewareMode: true,
          hmr: { server },
          watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        appType: 'custom',
      });
      target.use(vite.middlewares);
      target.get('*', async (req, res, next) => {
        try {
          const raw = await fs.promises.readFile(path.join(process.cwd(), htmlFile), 'utf-8');
          res.status(200).set({ 'Content-Type': 'text/html' }).end(await vite.transformIndexHtml(req.originalUrl, raw));
        } catch (e) {
          next(e);
        }
      });
    } catch (err) {
      console.error(`Vite dev server (${appTarget}) failed to start, falling back to static:`, err);
      serveStatic();
    }
  };
  await mountFrontend(app, httpServer, 'core');
  await mountFrontend(publicApp, publicHttpServer, 'public');

  // Global Error Handler
  addErrorHandler(app);
  addErrorHandler(publicApp);

  httpServer.listen(CORE_PORT, '0.0.0.0', () => {
    console.log("Aplikasi inti (SIMK/RME) running on port " + CORE_PORT);
  });
  publicHttpServer.listen(PUBLIC_PORT, '0.0.0.0', () => {
    console.log("Web publik pasien running on port " + PUBLIC_PORT);
  });

  const shutdown = async () => {
    await Promise.all([
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
      new Promise<void>((resolve) => publicHttpServer.close(() => resolve()))
    ]);
    await persistence.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

// Di Vercel/Cloudflare, server tidak listen sendiri; request masuk lewat api/index.ts atau worker/index.ts.
if (!process.env.VERCEL && !process.env.CLOUDFLARE_WORKER) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
  });
}
