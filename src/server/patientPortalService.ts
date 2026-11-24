import crypto from 'crypto';
import { clientIp } from './clientIp';
import { nextRmNumber } from './rmNumber';
import type express from 'express';
import { createSignedStore } from './signedStore';
import { createSecurePatientQrToken, isSecurePatientQrConfigured } from './securePatientQr';
import { hashQrToken } from './databaseAdapter';
import { MASTER_POLIKLINIK, SEMUA_DOKTER } from '../data/seedData';
import {
  generateAllPatientsWithResumes,
  generate50LabAndRadRequests,
  type PatientFullRecord,
  type ClinicalResume
} from '../data/patientPelayananData';

export interface ServerPatientRecord {
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

export interface ServerAppointmentRecord {
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

export interface ServerQrTokenRecord {
  id: string;
  tokenHash: string;
  subject: string;
  kind: 'patient' | 'reservation' | 'document';
  issuedAt: string;
  expiresAt?: string;
  issuedBy: string;
  consumedAt?: string;
}

export interface ServerBedRecord {
  id: string;
  bangsal: string;
  ruangan: string;
  nomor_bed: string;
  kelas: string;
  status: string;
  pasien_nama?: string;
  no_rm?: string;
  tanggal_masuk?: string;
  tarif_per_hari: number;
}

interface PatientSession {
  token: string;
  no_rm: string;
  authMethod: 'rm_dob' | 'google';
  email?: string;
  verifiedAt: string;
}

export interface PatientDossierPayload {
  patient: {
    id: string;
    no_rm: string;
    nama: string;
    nik_masked: string;
    tanggal_lahir: string;
    jenis_kelamin: 'L' | 'P';
    golongan_darah: string;
    penjamin: string;
    no_bpjs?: string;
    no_hp: string;
    alamat: string;
    status: string;
  };
  authMethod: 'rm_dob' | 'google';
  linkedEmail?: string;
  activeQueues: Array<{
    id: string;
    poli: string;
    dokter: string;
    tanggal: string;
    jam_praktek: string;
    nomor_antrian: string;
    status: string;
    tipe: string;
    estimasi_menit: number;
    poli_sedang_dipanggil: string;
  }>;
  allergies: Array<{ allergen: string; reaction: string; severity: string }>;
  vitalsLatest: {
    date: string;
    bp: string;
    hr: string;
    temp: string;
    rr: string;
    spo2: string;
    bb: string;
    tb: string;
  } | null;
  clinicalResume: ClinicalResume | null;
  problemList: Array<{ nama: string; kode_icd10: string; severity: string; status: string }>;
  medications: Array<{ name: string; dose: string; frequency: string; status: string }>;
  labRadResults: Array<{
    id: string;
    jenis: string;
    pemeriksaan: string;
    tanggal: string;
    dokter: string;
    status: string;
    hasil: string;
    loinc?: string;
  }>;
  billing: {
    invoiceNumber: string;
    penjamin: string;
    status: 'Ditanggung BPJS' | 'Lunas' | 'Menunggu Pembayaran' | 'Belum Tersedia';
    totalBiaya: number;
    ditanggungPenjamin: number;
    sisaTagihan: number;
    items: Array<{ nama: string; kategori: string; nominal: number }>;
  };
  inpatientStay: {
    bangsal: string;
    ruangan: string;
    nomor_bed: string;
    kelas: string;
    tanggal_masuk?: string;
  } | null;
}

export interface ServerFcmTokenRecord {
  token: string;
  no_rm: string;
  mode: 'fcm_web_push' | 'realtime_sse_fallback';
  platform: 'web' | 'pwa' | 'android' | 'ios';
  queueAlertsEnabled: boolean;
  labAlertsEnabled: boolean;
  active: boolean;
  updatedAt: string;
}

export interface ServerPatientNotification {
  id: string;
  no_rm: string;
  type: 'queue_call' | 'lab_ready' | 'system';
  title: string;
  body: string;
  poli?: string;
  nomor_antrian?: string;
  lab_order_id?: string;
  channel: 'fcm_push' | 'fcm_foreground' | 'sse_realtime' | 'firestore_realtime';
  read: boolean;
  createdAt: string;
}

function normalizeRm(val: string): string {
  return String(val || '').trim().toUpperCase();
}

function normalizeDob(val: string): string {
  return String(val || '').trim().slice(0, 10);
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function maskNik(nik: string): string {
  if (!nik || nik.length < 8) return '3171••••••••0001';
  return `${nik.slice(0, 6)}••••••${nik.slice(-4)}`;
}

function maskPatientName(name: string): string {
  const parts = String(name || 'Pasien').trim().split(/\s+/);
  return parts
    .map((part, idx) => {
      if (idx === 0 && /^(ny\.|tn\.|an\.|sdr\.|sdri\.)$/i.test(part)) {
        return part;
      }
      if (part.length <= 2) return `${part[0] || ''}*`;
      return `${part[0]}${'*'.repeat(Math.min(6, part.length - 1))}`;
    })
    .join(' ');
}

export function registerPatientPortalRoutes(
  app: express.Express,
  deps: {
    patientsStore: ServerPatientRecord[];
    appointmentsStore: ServerAppointmentRecord[];
    bedsStore: ServerBedRecord[];
    qrTokensStore?: ServerQrTokenRecord[];
    useDemoData?: boolean;
    /** App staf (berauth). Route dispatch notifikasi hanya didaftarkan di sini, tidak di web publik. */
    staffApp?: express.Express;
    createAuditLog?: (entry: {
      user: string;
      role: string;
      action: string;
      module: string;
      ip: string;
      status: 'SUCCESS' | 'FAILED' | 'WARNING';
      details: string;
    }) => void;
  }
) {
  const { patientsStore, appointmentsStore, bedsStore, createAuditLog } = deps;

  // Lazy-seeded rich clinical records + lab/rad dataset
  const useDemoData = deps.useDemoData !== false;
  const fullClinicalPatients: PatientFullRecord[] = useDemoData ? generateAllPatientsWithResumes() : [];
  const labRadDataset = useDemoData ? generate50LabAndRadRequests() : [];

  const googlePatientLinks = new Map<string, string>();

  // Sesi pasien = token bertanda tangan (stateless), tetap valid di semua instance serverless.
  const patientSessions = createSignedStore<PatientSession>('pat_', 'token', 12 * 60 * 60 * 1000);

  const doctorServedBoost = new Map<string, number>();
  const patientSessionCookieName = 'myitaru_patient_session';

  // Real-time FCM tokens, notification inbox, dynamic lab reports, and SSE streams per No. RM
  const fcmTokensByRm = new Map<string, ServerFcmTokenRecord[]>();
  const notificationsByRm = new Map<string, ServerPatientNotification[]>();
  const dynamicLabResultsByRm = new Map<string, PatientDossierPayload['labRadResults']>();
  const sseClientsByRm = new Map<string, Set<express.Response>>();

  function resolveSessionFromReq(req: express.Request): PatientSession | undefined {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const cookieToken = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${patientSessionCookieName}=`))
      ?.slice(patientSessionCookieName.length + 1);
    return patientSessions.get(bearer || cookieToken || '');
  }

  function setPatientSessionCookie(res: express.Response, token: string, maxAgeSeconds = 12 * 60 * 60): void {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${patientSessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`,
    );
  }

  async function dispatchPatientNotification(params: {
    no_rm: string;
    type: 'queue_call' | 'lab_ready' | 'system';
    title: string;
    body: string;
    poli?: string;
    nomor_antrian?: string;
    lab_order_id?: string;
    force?: boolean;
  }): Promise<{ deliveredSse: number; fcmTargets: number; notification: ServerPatientNotification }> {
    const targetRm = normalizeRm(params.no_rm);
    const registeredTokens = (fcmTokensByRm.get(targetRm) || []).filter((t) => t.active);

    const anyEnabledForType =
      registeredTokens.length === 0 ||
      registeredTokens.some((t) =>
        params.type === 'queue_call'
          ? t.queueAlertsEnabled
          : params.type === 'lab_ready'
          ? t.labAlertsEnabled
          : true
      );

    const hasWebPushToken = registeredTokens.some((t) => t.mode === 'fcm_web_push');

    const notification: ServerPatientNotification = {
      id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      no_rm: targetRm,
      type: params.type,
      title: params.title.slice(0, 160),
      body: params.body.slice(0, 500),
      poli: params.poli,
      nomor_antrian: params.nomor_antrian,
      lab_order_id: params.lab_order_id,
      channel: hasWebPushToken ? 'fcm_push' : 'sse_realtime',
      read: false,
      createdAt: new Date().toISOString()
    };

    if (!params.force && !anyEnabledForType) {
      return { deliveredSse: 0, fcmTargets: 0, notification };
    }

    const existingList = notificationsByRm.get(targetRm) || [];
    notificationsByRm.set(targetRm, [notification, ...existingList].slice(0, 40));

    // Optional relay to FCM HTTP legacy endpoint if FCM_SERVER_KEY is configured on server env
    const fcmServerKey = process.env.FCM_SERVER_KEY;
    const realFcmTokens = registeredTokens
      .filter((t) => t.mode === 'fcm_web_push' && !t.token.startsWith('fcm_sse_'))
      .map((t) => t.token);

    if (fcmServerKey && realFcmTokens.length > 0) {
      try {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmServerKey}`
          },
          body: JSON.stringify({
            registration_ids: realFcmTokens,
            notification: {
              title: notification.title,
              body: notification.body,
              icon: '/pwa-192x192.png'
            },
            data: {
              id: notification.id,
              type: notification.type,
              no_rm: notification.no_rm,
              poli: notification.poli || '',
              nomor_antrian: notification.nomor_antrian || '',
              lab_order_id: notification.lab_order_id || '',
              url: notification.type === 'lab_ready' ? '/mobile?tab=hasil' : '/mobile?tab=beranda'
            }
          })
        });
      } catch (err) {
        console.warn('[FCM Relay] External FCM HTTP relay skipped:', err);
      }
    }

    // Real-time SSE broadcast to all connected mobile tabs/PWAs of this patient
    const listeners = sseClientsByRm.get(targetRm);
    let deliveredSse = 0;
    if (listeners && listeners.size > 0) {
      const payload = `event: patient_notification\ndata: ${JSON.stringify(notification)}\n\n`;
      listeners.forEach((clientRes) => {
        try {
          clientRes.write(payload);
          deliveredSse += 1;
        } catch {
          listeners.delete(clientRes);
        }
      });
    }

    return {
      deliveredSse,
      fcmTargets: realFcmTokens.length,
      notification
    };
  }

  function findRichPatientByRm(noRmRaw: string): {
    core?: ServerPatientRecord;
    rich?: PatientFullRecord;
  } {
    const targetRm = normalizeRm(noRmRaw);
    const core = patientsStore.find((p) => normalizeRm(p.no_rm) === targetRm);
    const rich = fullClinicalPatients.find((p) => normalizeRm(p.no_rm) === targetRm);
    return { core, rich };
  }

  function matchDob(expectedDob: string, providedDob: string): boolean {
    const a = normalizeDob(expectedDob);
    const b = normalizeDob(providedDob);
    return a.length === 10 && a === b;
  }

  function buildDossier(
    noRmRaw: string,
    authMethod: 'rm_dob' | 'google',
    linkedEmail?: string
  ): PatientDossierPayload | null {
    const targetRm = normalizeRm(noRmRaw);
    const { core, rich } = findRichPatientByRm(targetRm);

    if (!core && !rich) return null;

    const baseName = core?.nama || rich?.nama || 'Pasien MYITARU';
    const baseDob = core?.tanggal_lahir || rich?.tanggal_lahir || '1990-01-01';
    const basePenjamin = core?.penjamin || rich?.penjamin || 'Umum / Mandiri';
    const baseNik = core?.nik || rich?.nik || '3171010101900001';

    // Collect queues for this patient
    const matchedAppointments = appointmentsStore.filter(
      (a) => normalizeRm(a.no_rm) === targetRm
    );

    const today = new Date().toISOString().split('T')[0];

    // If patient is from core or rich and has no active appointment yet, construct realistic active/latest outpatient queue snapshot
    const activeQueues =
      matchedAppointments.length > 0
        ? matchedAppointments.map((apt, idx) => {
            const poliItem = MASTER_POLIKLINIK.find((m) =>
              apt.poli.toLowerCase().includes(m.kode.toLowerCase()) ||
              apt.poli.toLowerCase().includes(m.nama.toLowerCase().replace('poli ', ''))
            );
            const poliCode = poliItem?.kode || 'POL';
            return {
              id: apt.id,
              poli: apt.poli,
              dokter: apt.dokter,
              tanggal: apt.tanggal,
              jam_praktek: apt.jam_praktek,
              nomor_antrian: apt.nomor_antrian,
              status: apt.status,
              tipe: apt.tipe,
              estimasi_menit:
                apt.status === 'Selesai' || apt.status === 'Panggil' || apt.status === 'Diperiksa'
                  ? 0
                  : (idx + 1) * 12,
              poli_sedang_dipanggil:
                apt.status === 'Diperiksa' || apt.status === 'Panggil'
                  ? apt.nomor_antrian
                  : `${poliCode}-001`
            };
          })
        : rich
        ? [
            {
              id: `APT-${rich.no_rm}`,
              poli: rich.poli_tujuan || rich.resume_medis?.unit_pelayanan || 'Poli Penyakit Dalam',
              dokter: rich.resume_medis?.dokter_dpjp || 'dr. Hendra Wijaya, Sp.PD',
              tanggal: today,
              jam_praktek: '08:00 - 13:00 WIB',
              nomor_antrian: `RJ-${rich.no_rm.slice(-3)}`,
              status: 'Menunggu',
              tipe: rich.resume_medis?.layanan || 'Rawat Jalan',
              estimasi_menit: 15,
              poli_sedang_dipanggil: 'RJ-001'
            }
          ]
        : [];

    // Allergies
    const allergies =
      rich?.allergies && rich.allergies.length > 0
        ? rich.allergies.map((a) => ({
            allergen: a.allergen,
            reaction: a.reaction,
            severity: a.severity
          }))
        : (core?.alergi || []).map((al) => ({
            allergen: al,
            reaction: 'Reaksi alergi tercatat di Rekam Medis',
            severity: 'Moderate'
          }));

    // Vitals
    const vitalsLatest =
      rich?.vitals && rich.vitals.length > 0
        ? {
            date: rich.vitals[0].date,
            bp: rich.vitals[0].bp,
            hr: rich.vitals[0].hr,
            temp: rich.vitals[0].temp,
            rr: rich.vitals[0].rr,
            spo2: rich.vitals[0].spo2,
            bb: rich.vitals[0].bb,
            tb: rich.vitals[0].tb
          }
        : core && useDemoData
        ? {
            date: 'Kunjungan Terakhir',
            bp: '120/80',
            hr: '78',
            temp: '36.6',
            rr: '18',
            spo2: '98',
            bb: '64',
            tb: '165'
          }
        : null;

    // Problem list
    const problemList =
      rich?.problem_list && rich.problem_list.length > 0
        ? rich.problem_list.map((pr) => ({
            nama: pr.nama,
            kode_icd10: pr.kode_icd10,
            severity: pr.severity,
            status: pr.status
          }))
        : (core?.riwayat_penyakit || []).map((dx, i) => ({
            nama: dx,
            kode_icd10: useDemoData ? (i === 0 ? 'I10' : 'K30') : '',
            severity: 'Moderate',
            status: 'Active'
          }));

    // Medications
    const medications =
      rich?.medications && rich.medications.length > 0
        ? rich.medications.map((m) => ({
            name: m.name,
            dose: m.dose,
            frequency: m.frequency,
            status: m.status
          }))
        : !useDemoData
        ? []
        : core?.no_rm === 'RM-260101-0001'
        ? [
            { name: 'Amlodipine 10 mg Tablet', dose: '10 mg', frequency: '1x1 Malam', status: 'Active' },
            { name: 'Omeprazole 20 mg Kapsul', dose: '20 mg', frequency: '2x1 Sebelum Makan', status: 'Active' }
          ]
        : [
            { name: 'Paracetamol 500 mg', dose: '500 mg', frequency: '3x1 Bila Demam/Nyeri', status: 'Active' }
          ];

    // Lab & Radiology results matching RM or sample linked results
    let labRadResults: PatientDossierPayload['labRadResults'] = labRadDataset
      .filter((item) => normalizeRm(item.no_rm) === targetRm)
      .map((item) => ({
        id: item.id,
        jenis: item.jenis,
        pemeriksaan: item.pemeriksaan,
        tanggal: item.tanggal,
        dokter: item.dokter,
        status: item.status,
        hasil: item.hasil,
        loinc: item.loinc
      }));

    if (labRadResults.length === 0 && useDemoData) {
      labRadResults = [
        {
          id: `LAB-${targetRm.slice(-4)}`,
          jenis: 'Lab',
          pemeriksaan: 'Darah Lengkap 5-Diff & Kimia Darah',
          tanggal: today,
          dokter: activeQueues[0]?.dokter || 'dr. Hendra Wijaya, Sp.PD',
          status: 'Tervalidasi',
          hasil: 'Hb: 13.6 g/dL, Leukosit: 7.400 /uL, Trombosit: 258.000 /uL, Glukosa Puasa: 96 mg/dL. Kesan: Dalam batas normal.',
          loinc: '58410-2'
        },
        {
          id: `RAD-${targetRm.slice(-4)}`,
          jenis: 'Radiologi',
          pemeriksaan: 'Foto Thorax PA Digital',
          tanggal: today,
          dokter: 'dr. Lukman Hakim, Sp.P',
          status: 'Tervalidasi',
          hasil: 'Cor dan Pulmo dalam batas normal, tidak tampak infiltrat maupun efusi pleura.',
          loinc: '24627-2'
        }
      ];
    }

    const dynamicLabs = dynamicLabResultsByRm.get(targetRm) || [];
    if (dynamicLabs.length > 0) {
      const seenIds = new Set(dynamicLabs.map((d) => d.id));
      labRadResults = [...dynamicLabs, ...labRadResults.filter((item) => !seenIds.has(item.id))];
    }

    // Billing computation
    const isBpjsOrInsurance =
      basePenjamin.toLowerCase().includes('bpjs') ||
      basePenjamin.toLowerCase().includes('asuransi') ||
      basePenjamin.toLowerCase().includes('pertamina');

    // Tarif ini contoh demo; di luar mode demo tagihan nyata belum terhubung, jadi jangan tampilkan angka karangan.
    const billItems = !useDemoData ? [] : [
      { nama: 'Administrasi & Pendaftaran Rekam Medis', kategori: 'Administrasi', nominal: 35000 },
      { nama: `Konsultasi ${activeQueues[0]?.dokter || 'Dokter Spesialis'}`, kategori: 'Jasa Medis', nominal: 250000 },
      { nama: 'Pemeriksaan Laboratorium & Penunjang', kategori: 'Penunjang', nominal: 325000 },
      { nama: 'Resep Obat & Farmasi Rawat Jalan', kategori: 'Farmasi', nominal: 145000 }
    ];
    const totalBiaya = billItems.reduce((acc, item) => acc + item.nominal, 0);
    const ditanggungPenjamin = basePenjamin.toLowerCase().includes('bpjs')
      ? totalBiaya
      : isBpjsOrInsurance
      ? Math.round(totalBiaya * 0.85)
      : 0;
    const sisaTagihan = Math.max(0, totalBiaya - ditanggungPenjamin);
    const billingStatus: 'Ditanggung BPJS' | 'Lunas' | 'Menunggu Pembayaran' | 'Belum Tersedia' = !useDemoData
      ? 'Belum Tersedia'
      : basePenjamin
      .toLowerCase()
      .includes('bpjs')
      ? 'Ditanggung BPJS'
      : sisaTagihan === 0
      ? 'Lunas'
      : 'Menunggu Pembayaran';

    // Check inpatient bed
    const activeBed = bedsStore.find((b) => normalizeRm(b.no_rm || '') === targetRm);

    return {
      patient: {
        id: core?.id || rich?.id || targetRm,
        no_rm: targetRm,
        nama: baseName,
        nik_masked: maskNik(baseNik),
        tanggal_lahir: baseDob,
        jenis_kelamin: core?.jenis_kelamin || rich?.jenis_kelamin || 'L',
        golongan_darah: core?.golongan_darah || rich?.golongan_darah || 'O',
        penjamin: basePenjamin,
        no_bpjs: core?.no_bpjs,
        no_hp: core?.no_hp || rich?.no_hp || '-',
        alamat: core?.alamat || rich?.alamat || '-',
        status: core?.status || rich?.status || 'Rawat Jalan'
      },
      authMethod,
      linkedEmail,
      activeQueues,
      allergies,
      vitalsLatest,
      clinicalResume: rich?.resume_medis || null,
      problemList,
      medications,
      labRadResults,
      billing: {
        invoiceNumber: `INV-${today.replace(/-/g, '')}-${targetRm.slice(-4)}`,
        penjamin: basePenjamin,
        status: billingStatus,
        totalBiaya,
        ditanggungPenjamin,
        sisaTagihan,
        items: billItems
      },
      inpatientStay: activeBed
        ? {
            bangsal: activeBed.bangsal,
            ruangan: activeBed.ruangan,
            nomor_bed: activeBed.nomor_bed,
            kelas: activeBed.kelas,
            tanggal_masuk: activeBed.tanggal_masuk
          }
        : null
    };
  }

  function issueSession(no_rm: string, authMethod: 'rm_dob' | 'google', email?: string): PatientSession {
    const session: PatientSession = {
      token: '',
      no_rm: normalizeRm(no_rm),
      authMethod,
      email,
      verifiedAt: new Date().toISOString()
    };
    patientSessions.issue(session);
    return session;
  }

  // 1. Public Hospital Catalog (Doctors, Poliklinik, Live Queue Snapshot, Demo Quick Check Samples)
  app.get('/api/public/hospital-catalog', (req, res) => {
    const doctors = SEMUA_DOKTER.map((doc) => {
      const boost = doctorServedBoost.get(doc.id) || 0;
      const served = (doc.pasien_terlayani || 0) + boost;
      const quota = doc.kuota || 30;
      return {
        id: doc.id,
        nama: doc.nama,
        spesialis: doc.spesialis,
        subspesialis: doc.subspesialis,
        poli: doc.poli,
        poli_id: doc.poli_id,
        penempatan: doc.penempatan,
        jadwal: doc.jadwal,
        hari: doc.hari,
        jam: doc.jam,
        shift: doc.shift,
        ruangan: doc.ruangan,
        status_jaga: doc.status_jaga,
        status: doc.status,
        pasien_terlayani: served,
        kuota_tersisa: Math.max(0, quota - served)
      };
    });

    const poliQueues = MASTER_POLIKLINIK.map((pol) => {
      const poliKey = pol.nama.replace('Poli ', '').toLowerCase();
      const matchingApts = appointmentsStore.filter(
        (a) => a.poli.toLowerCase().includes(poliKey) || a.nomor_antrian.startsWith(`${pol.kode}-`)
      );
      const activeCall = matchingApts.find((a) => a.status === 'Diperiksa' || a.status === 'Panggil');
      const waiting = matchingApts.filter((a) => a.status === 'Menunggu');
      return {
        id: pol.id,
        kode: pol.kode,
        nama: pol.nama,
        sedangDipanggil: activeCall ? activeCall.nomor_antrian : `${pol.kode}-001`,
        totalMenunggu: waiting.length + 2
      };
    });

    res.json({
      hospitalName: 'MYITARU SIMK',
      emergencyHotline: '1-500-911',
      poliklinik: MASTER_POLIKLINIK,
      doctors,
      poliQueues,
      updatedAt: new Date().toISOString()
    });
  });

  // 1b. Public Queue Status Lookup by Queue Number (Nomor Antrean) or No. RM
  app.get('/api/public/queue-status', (req, res) => {
    const rawQuery = String(req.query.q || '').trim().toUpperCase();

    const poliQueues = MASTER_POLIKLINIK.map((pol) => {
      const poliKey = pol.nama.replace('Poli ', '').toLowerCase();
      const matchingApts = appointmentsStore.filter(
        (a) => a.poli.toLowerCase().includes(poliKey) || a.nomor_antrian.startsWith(`${pol.kode}-`)
      );
      const activeCall = matchingApts.find((a) => a.status === 'Diperiksa' || a.status === 'Panggil');
      const waiting = matchingApts.filter((a) => a.status === 'Menunggu');
      return {
        id: pol.id,
        kode: pol.kode,
        nama: pol.nama,
        sedangDipanggil: activeCall ? activeCall.nomor_antrian : `${pol.kode}-001`,
        totalMenunggu: waiting.length + 2
      };
    });

    // Contoh tiket hanya untuk demo; tanpa no. RM.
    const sampleTickets = deps.useDemoData === false
      ? []
      : appointmentsStore.slice(0, 4).map((apt) => ({
          nomor_antrian: apt.nomor_antrian,
          poli: apt.poli
        }));

    if (!rawQuery) {
      return res.json({
        success: true,
        query: '',
        matches: [],
        poliQueues,
        sampleTickets,
        updatedAt: new Date().toISOString()
      });
    }

    const matches = appointmentsStore
      .filter((a) => a.nomor_antrian.toUpperCase() === rawQuery)
      .map((apt) => {
        const poliItem = MASTER_POLIKLINIK.find(
          (m) =>
            apt.poli.toLowerCase().includes(m.nama.replace('Poli ', '').toLowerCase()) ||
            apt.nomor_antrian.startsWith(`${m.kode}-`)
        );
        const queueMeta = poliQueues.find((pq) => pq.id === poliItem?.id);
        const sedangDipanggil =
          apt.status === 'Diperiksa' || apt.status === 'Panggil'
            ? apt.nomor_antrian
            : queueMeta?.sedangDipanggil || `${poliItem?.kode || 'RJ'}-001`;

        const waitingAheadList = appointmentsStore.filter(
          (other) =>
            other.poli === apt.poli &&
            other.status === 'Menunggu' &&
            other.nomor_antrian.localeCompare(apt.nomor_antrian) < 0
        );
        const antreanDiDepan =
          apt.status === 'Selesai' || apt.status === 'Diperiksa' || apt.status === 'Panggil'
            ? 0
            : waitingAheadList.length;

        return {
          id: apt.id,
          nomor_antrian: apt.nomor_antrian,
          pasien_nama_masked: maskPatientName(apt.pasien_nama),
          poli: apt.poli,
          dokter: apt.dokter,
          tanggal: apt.tanggal,
          jam_praktek: apt.jam_praktek,
          status: apt.status,
          tipe: apt.tipe,
          sedang_dipanggil: sedangDipanggil,
          antrean_di_depan: antreanDiDepan,
          estimasi_menit:
            apt.status === 'Selesai'
              ? 0
              : apt.status === 'Diperiksa' || apt.status === 'Panggil'
              ? 0
              : (antreanDiDepan + 1) * 10
        };
      });

    return res.json({
      success: true,
      query: rawQuery,
      matches,
      poliQueues,
      sampleTickets,
      updatedAt: new Date().toISOString()
    });
  });

  // 2. Patient Verification via No. RM + Tanggal Lahir
  app.post('/api/patient/verify', (req, res) => {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_INSECURE_DEMO_AUTH !== 'true') {
      return res.status(503).json({
        success: false,
        code: 'PATIENT_IDENTITY_NOT_CONFIGURED',
        message: 'Verifikasi pasien dinonaktifkan sampai faktor kepemilikan akun pasien dikonfigurasi.'
      });
    }

    try {
      const { no_rm, tanggal_lahir } = req.body || {};
      if (!no_rm || !tanggal_lahir) {
        return res.status(400).json({
          success: false,
          message: 'Nomor Rekam Medis (No. RM) dan Tanggal Lahir wajib diisi.'
        });
      }

      const targetRm = normalizeRm(no_rm);
      const { core, rich } = findRichPatientByRm(targetRm);

      if (!core && !rich) {
        return res.status(404).json({
          success: false,
          message: `Nomor Rekam Medis ${targetRm} tidak ditemukan dalam sistem kami.`
        });
      }

      const expectedDob = core?.tanggal_lahir || rich?.tanggal_lahir || '';
      if (!matchDob(expectedDob, tanggal_lahir)) {
        createAuditLog?.({
          user: `Patient:${targetRm}`,
          role: 'Pasien Mobile',
          action: 'PATIENT_VERIFY_FAILED',
          module: 'Aplikasi Pasien',
          ip: clientIp(req),
          status: 'WARNING',
          details: `Percobaan verifikasi No. RM ${targetRm} dengan tanggal lahir tidak cocok.`
        });

        return res.status(401).json({
          success: false,
          message: 'Tanggal lahir tidak sesuai dengan Nomor Rekam Medis tersebut.'
        });
      }

      const session = issueSession(targetRm, 'rm_dob');
      setPatientSessionCookie(res, session.token);
      const dossier = buildDossier(targetRm, 'rm_dob');

      createAuditLog?.({
        user: dossier?.patient.nama || targetRm,
        role: 'Pasien Mobile',
        action: 'PATIENT_VERIFY_RM_DOB',
        module: 'Aplikasi Pasien',
        ip: clientIp(req),
        status: 'SUCCESS',
        details: `Verifikasi pasien berhasil untuk No. RM ${targetRm}.`
      });

      return res.json({
        success: true,
        token: session.token,
        authMethod: 'rm_dob',
        dossier
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Gagal memverifikasi data pasien.'
      });
    }
  });

  // 3. Google Sign-In Session & Account Linking for Mobile Patient App
  app.post('/api/patient/google-session', (req, res) => {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_INSECURE_DEMO_AUTH !== 'true') {
      return res.status(503).json({
        success: false,
        code: 'PATIENT_IDENTITY_NOT_CONFIGURED',
        message: 'Integrasi Firebase Identity pasien belum dikonfigurasi.'
      });
    }

    try {
      const { email, displayName, linkNoRm, linkTanggalLahir } = req.body || {};

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Email akun Google terautentikasi wajib tersedia.'
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Case A: User wants to bind a specific No. RM + DOB to this Google email
      if (linkNoRm && linkTanggalLahir) {
        const targetRm = normalizeRm(linkNoRm);
        const { core, rich } = findRichPatientByRm(targetRm);
        if (!core && !rich) {
          return res.status(404).json({
            success: false,
            message: `No. RM ${targetRm} tidak ditemukan.`
          });
        }
        const expectedDob = core?.tanggal_lahir || rich?.tanggal_lahir || '';
        if (!matchDob(expectedDob, linkTanggalLahir)) {
          return res.status(401).json({
            success: false,
            message: 'Tanggal lahir tidak sesuai untuk menautkan No. RM ke akun Google ini.'
          });
        }
        googlePatientLinks.set(normalizedEmail, targetRm);
      }

      const linkedRm = googlePatientLinks.get(normalizedEmail);
      if (!linkedRm) {
        // Also check if someone booked with this exact email earlier or create/offer linking prompt
        return res.json({
          success: true,
          linked: false,
          email: normalizedEmail,
          displayName: displayName || normalizedEmail.split('@')[0],
          message: 'Akun Google terverifikasi. Hubungkan No. RM Anda atau buat profil pasien baru.'
        });
      }

      const session = issueSession(linkedRm, 'google', normalizedEmail);
      setPatientSessionCookie(res, session.token);
      const dossier = buildDossier(linkedRm, 'google', normalizedEmail);

      return res.json({
        success: true,
        linked: true,
        token: session.token,
        authMethod: 'google',
        dossier
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Gagal menghubungkan sesi Google pasien.'
      });
    }
  });

  // 4. Refresh Verified Patient Dossier
  app.delete('/api/patient/session', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const cookieToken = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${patientSessionCookieName}=`))
      ?.slice(patientSessionCookieName.length + 1);
    const token = bearer || cookieToken || '';
    if (token) patientSessions.delete(token);
    setPatientSessionCookie(res, '', 0);
    return res.status(204).end();
  });

  app.get('/api/patient/dossier', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Sesi verifikasi pasien tidak valid atau telah berakhir. Silakan verifikasi ulang.'
      });
    }

    const dossier = buildDossier(session.no_rm, session.authMethod, session.email);
    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: 'Data rekam medis pasien tidak ditemukan.'
      });
    }

    return res.json({
      success: true,
      dossier
    });
  });

  // 5. Public & Mobile Patient Online Appointment Booking
  app.post('/api/patient/appointments', (req, res) => {
    try {
      if (!isSecurePatientQrConfigured()) {
        return res.status(503).json({ success: false, code: 'QR_SECRET_NOT_CONFIGURED' });
      }
      const {
        nama,
        no_rm,
        tanggal_lahir,
        nik,
        no_hp,
        poli_id,
        poli_nama,
        dokter_id,
        dokter_nama,
        tanggal,
        jam_praktek,
        penjamin,
        keluhan
      } = req.body || {};

      if (typeof poli_id !== 'string' || typeof dokter_id !== 'string' || !isValidIsoDate(tanggal)) {
        return res.status(400).json({
          success: false,
          message: 'Poliklinik, dokter, dan tanggal kunjungan yang valid wajib dipilih.'
        });
      }

      const poliObj = MASTER_POLIKLINIK.find((item) => item.id === poli_id);
      const doctor = SEMUA_DOKTER.find((item) => item.id === dokter_id && item.poli_id === poli_id);
      if (!poliObj || !doctor || (poli_nama && poli_nama !== poliObj.nama) || (dokter_nama && dokter_nama !== doctor.nama)) {
        return res.status(400).json({ success: false, message: 'Dokter dan poliklinik tidak cocok dengan katalog layanan.' });
      }

      const targetDate = tanggal;
      if (targetDate < new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })) {
        return res.status(400).json({ success: false, message: 'Tanggal kunjungan tidak boleh berada di masa lalu.' });
      }
      const targetDateEnd = Date.parse(`${targetDate}T23:59:59.999Z`);
      const bookingWindowMs = 365 * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(targetDateEnd) || targetDateEnd > Date.now() + bookingWindowMs) {
        return res.status(400).json({ success: false, message: 'Pendaftaran hanya dapat dibuat hingga 1 tahun ke depan.' });
      }
      // Kuota dihitung per dokter per tanggal; jumlah terlayani hari ini hanya berlaku untuk hari ini.
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      const boostKey = `${doctor.id}:${targetDate}`;
      const served = (targetDate === today ? doctor.pasien_terlayani || 0 : 0) + (doctorServedBoost.get(boostKey) || 0);
      if (served >= (doctor.kuota || 30)) {
        return res.status(409).json({ success: false, message: 'Kuota dokter untuk jadwal tersebut telah penuh.' });
      }

      const resolvedName = typeof nama === 'string' ? nama.trim() : '';
      const normalizedRm = typeof no_rm === 'string' ? normalizeRm(no_rm) : '';
      const normalizedDob = normalizeDob(tanggal_lahir || '');
      const phone = typeof no_hp === 'string' ? no_hp.trim() : '';
      const suppliedNik = typeof nik === 'string' ? nik.trim() : '';
      if (resolvedName.length > 120 || phone.length > 24 ||
          !/^[+0-9][0-9+\s().-]{7,23}$/.test(phone) ||
          (suppliedNik && !/^\d{16}$/.test(suppliedNik)) ||
          (typeof keluhan === 'string' && keluhan.length > 500)) {
        return res.status(400).json({ success: false, message: 'Data pasien tidak valid atau melebihi batas panjang.' });
      }

      let resolvedRm = normalizedRm;
      let patientName = resolvedName;
      if (normalizedRm) {
        const { core, rich } = findRichPatientByRm(normalizedRm);
        const expectedDob = core?.tanggal_lahir || rich?.tanggal_lahir;
        // Satu respons untuk "RM tidak ada" dan "tanggal lahir salah" agar keberadaan RM tidak bisa ditebak.
        if (!expectedDob || !isValidIsoDate(normalizedDob) || !matchDob(expectedDob, normalizedDob)) {
          return res.status(401).json({ success: false, message: 'No. RM dan tanggal lahir tidak cocok.' });
        }
        patientName = core?.nama || rich?.nama || 'Pasien Terdaftar';
      } else {
        if (resolvedName.length < 2 || !isValidIsoDate(normalizedDob) || !phone) {
          return res.status(400).json({ success: false, message: 'Nama, tanggal lahir valid, dan nomor telepon wajib untuk pasien baru.' });
        }
        resolvedRm = nextRmNumber(patientsStore);
        patientsStore.unshift({
          id: `p-${crypto.randomUUID()}`,
          no_rm: resolvedRm,
          nik: suppliedNik,
          nama: resolvedName,
          tanggal_lahir: normalizedDob,
          jenis_kelamin: 'L',
          alamat: 'Pendaftaran Online Portal MYITARU',
          no_hp: phone,
          golongan_darah: '',
          penjamin: typeof penjamin === 'string' ? penjamin.slice(0, 80) : 'Umum / Mandiri',
          status: 'Rawat Jalan',
          alergi: [],
          riwayat_penyakit: [],
          created_at: new Date().toISOString()
        });
      }

      const poliKode = poliObj.kode;
      const existingForPoli = appointmentsStore.filter((a) =>
        a.tanggal === targetDate && a.nomor_antrian.startsWith(`${poliKode}-`)
      ).length;
      const nomorAntrian = `${poliKode}-${String(existingForPoli + 2).padStart(3, '0')}`;

      const newApt: ServerAppointmentRecord = {
        id: `apt-${crypto.randomUUID()}`,
        pasien_id: resolvedRm,
        pasien_nama: patientName,
        no_rm: resolvedRm,
        poli: poliObj.nama,
        dokter: doctor.nama,
        tanggal: targetDate,
        jam_praktek: String(doctor.jam || jam_praktek || '08:00 - 13:00 WIB'),
        nomor_antrian: nomorAntrian,
        status: 'Menunggu',
        tipe: 'Rawat Jalan',
        created_at: new Date().toISOString()
      };
      let qrValue: string;
      try {
        qrValue = createSecurePatientQrToken(newApt.id, {
          kind: 'reservation',
          ttlMs: Math.max(60_000, targetDateEnd + 24 * 60 * 60 * 1000 - Date.now())
        });
      } catch (error) {
        // Jangan tinggalkan pasien baru tanpa janji temu bila token QR gagal dibuat.
        if (!normalizedRm) {
          const idx = patientsStore.findIndex((p) => p.no_rm === resolvedRm);
          if (idx >= 0) patientsStore.splice(idx, 1);
        }
        throw error;
      }
      deps.qrTokensStore?.unshift({
        id: hashQrToken(qrValue),
        tokenHash: hashQrToken(qrValue),
        subject: newApt.id,
        kind: 'reservation',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(targetDateEnd + 24 * 60 * 60 * 1000).toISOString(),
        issuedBy: 'patient-portal'
      });
      appointmentsStore.unshift(newApt);

      doctorServedBoost.set(boostKey, (doctorServedBoost.get(boostKey) || 0) + 1);

      createAuditLog?.({
        user: resolvedName,
        role: 'Pasien Portal',
        action: 'ONLINE_APPOINTMENT_BOOKING',
        module: 'Portal & App Pasien',
        ip: clientIp(req),
        status: 'SUCCESS',
        details: `Booking online ${nomorAntrian} (${poliObj.nama} · ${doctor.nama}) untuk No. RM ${resolvedRm}.`
      });

      return res.status(201).json({
        success: true,
        message: 'Janji temu berhasil dibuat dan nomor antrean telah diterbitkan.',
        booking: {
          kode_booking: `BK-${newApt.id.slice(4, 12).toUpperCase()}`,
          no_rm: resolvedRm,
          nama: patientName,
          nomor_antrian: nomorAntrian,
          poli: poliObj.nama,
          dokter: doctor.nama,
          tanggal: targetDate,
          jam_praktek: newApt.jam_praktek,
          penjamin: typeof penjamin === 'string' ? penjamin.slice(0, 80) : 'Umum / Mandiri',
          qr_value: qrValue
        }
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Gagal memproses pendaftaran janji temu.'
      });
    }
  });

  // 6. Register or Update Patient FCM Device Token & Notification Preferences
  app.post('/api/patient/fcm-token', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Sesi pasien tidak valid. Silakan verifikasi ulang.'
      });
    }

    const {
      token: fcmToken,
      mode = 'realtime_sse_fallback',
      platform = 'web',
      queueAlertsEnabled = true,
      labAlertsEnabled = true
    } = req.body || {};

    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Token FCM perangkat wajib disertakan.'
      });
    }

    const targetRm = normalizeRm(session.no_rm);
    const currentTokens = fcmTokensByRm.get(targetRm) || [];
    const updatedRecord: ServerFcmTokenRecord = {
      token: fcmToken.slice(0, 512),
      no_rm: targetRm,
      mode: mode === 'fcm_web_push' ? 'fcm_web_push' : 'realtime_sse_fallback',
      platform: ['web', 'pwa', 'android', 'ios'].includes(platform) ? platform : 'web',
      queueAlertsEnabled: queueAlertsEnabled !== false,
      labAlertsEnabled: labAlertsEnabled !== false,
      active: true,
      updatedAt: new Date().toISOString()
    };

    const filtered = currentTokens.filter((t) => t.token !== updatedRecord.token);
    fcmTokensByRm.set(targetRm, [updatedRecord, ...filtered].slice(0, 10));

    return res.json({
      success: true,
      record: updatedRecord
    });
  });

  // 7. Deactivate FCM Device Token on Patient Logout
  app.delete('/api/patient/fcm-token', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
    }
    const targetRm = normalizeRm(session.no_rm);
    const { token: fcmToken } = req.body || {};
    const currentTokens = fcmTokensByRm.get(targetRm) || [];
    const nextTokens = fcmToken
      ? currentTokens.map((t) => (t.token === fcmToken ? { ...t, active: false } : t))
      : currentTokens.map((t) => ({ ...t, active: false }));
    fcmTokensByRm.set(targetRm, nextTokens);
    return res.json({ success: true });
  });

  // 8. List Patient Real-Time Notifications & Active Preferences
  app.get('/api/patient/notifications', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
    }
    const targetRm = normalizeRm(session.no_rm);
    const notifications = notificationsByRm.get(targetRm) || [];
    const tokens = (fcmTokensByRm.get(targetRm) || []).filter((t) => t.active);

    return res.json({
      success: true,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      registeredDevices: tokens.length,
      preferences: {
        queueAlertsEnabled: tokens[0]?.queueAlertsEnabled ?? true,
        labAlertsEnabled: tokens[0]?.labAlertsEnabled ?? true
      }
    });
  });

  // 9. Mark Patient Notification(s) Read
  app.post('/api/patient/notifications/read', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
    }
    const targetRm = normalizeRm(session.no_rm);
    const { id, markAll } = req.body || {};
    const current = notificationsByRm.get(targetRm) || [];
    const updated = current.map((n) => {
      if (markAll || (id && n.id === id)) {
        return { ...n, read: true };
      }
      return n;
    });
    notificationsByRm.set(targetRm, updated);

    return res.json({
      success: true,
      unreadCount: updated.filter((n) => !n.read).length
    });
  });

  // 10. Real-Time SSE Notification Stream for PatientMobileApp
  app.get('/api/patient/notifications/stream', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
    }
    const targetRm = normalizeRm(session.no_rm);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    let listeners = sseClientsByRm.get(targetRm);
    if (!listeners) {
      listeners = new Set();
      sseClientsByRm.set(targetRm, listeners);
    }
    listeners.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      listeners?.delete(res);
    });
  });

  // Helper to apply queue call or lab ready state into backend stores
  function applyClinicalEventToStores(params: {
    no_rm: string;
    type: 'queue_call' | 'lab_ready';
    nomor_antrian?: string;
    poli?: string;
    dokter?: string;
    lab_order_id?: string;
    pemeriksaan?: string;
    hasil?: string;
    loinc?: string;
  }) {
    const targetRm = normalizeRm(params.no_rm);
    const dossier = buildDossier(targetRm, 'rm_dob');
    const today = new Date().toISOString().split('T')[0];

    if (params.type === 'queue_call') {
      const targetApt = appointmentsStore.find((a) => normalizeRm(a.no_rm) === targetRm);
      const nomor = params.nomor_antrian || targetApt?.nomor_antrian || dossier?.activeQueues[0]?.nomor_antrian || 'RJ-001';
      const poli = params.poli || targetApt?.poli || dossier?.activeQueues[0]?.poli || 'Poli Penyakit Dalam';
      const dokter = params.dokter || targetApt?.dokter || dossier?.activeQueues[0]?.dokter || 'dr. Hendra Wijaya, Sp.PD';

      if (targetApt) {
        targetApt.status = 'Panggil';
        if (params.nomor_antrian) targetApt.nomor_antrian = params.nomor_antrian;
        if (params.poli) targetApt.poli = params.poli;
        if (params.dokter) targetApt.dokter = params.dokter;
      } else {
        appointmentsStore.unshift({
          id: `apt-call-${crypto.randomUUID()}`,
          pasien_id: dossier?.patient.id || targetRm,
          pasien_nama: dossier?.patient.nama || 'Pasien MYITARU',
          no_rm: targetRm,
          poli,
          dokter,
          tanggal: today,
          jam_praktek: '08:00 - 13:00 WIB',
          nomor_antrian: nomor,
          status: 'Panggil',
          tipe: 'Rawat Jalan',
          created_at: new Date().toISOString()
        });
      }

      return {
        title: `Antrean ${nomor} Akan Dipanggil!`,
        body: `Silakan bersiap menuju ${poli} (${dokter}). Nomor Anda sedang dipanggil di ruang periksa.`,
        poli,
        nomor_antrian: nomor
      };
    }

    const labId = params.lab_order_id || `LAB-${Date.now().toString().slice(-6)}`;
    const pemeriksaan = params.pemeriksaan || 'Panel Darah Lengkap & Kimia Klinik (Tervalidasi Sp.PK)';
    const dokter = params.dokter || 'dr. Ratna Dewi, Sp.PK';
    const hasil =
      params.hasil ||
      'Hasil pemeriksaan laboratorium telah selesai diverifikasi dan ditandatangani secara digital oleh Dokter Sp.PK. Silakan buka tab Hasil Lab & Radiologi.';

    const existingLabs = dynamicLabResultsByRm.get(targetRm) || [];
    const newLabEntry = {
      id: labId,
      jenis: 'Lab',
      pemeriksaan,
      tanggal: today,
      dokter,
      status: 'Tervalidasi',
      hasil,
      loinc: params.loinc || '58410-2'
    };
    dynamicLabResultsByRm.set(targetRm, [newLabEntry, ...existingLabs.filter((l) => l.id !== labId)]);

    return {
      title: `Hasil Laboratorium Tersedia (${labId})`,
      body: `${pemeriksaan} telah selesai divalidasi oleh ${dokter}. Ketuk untuk melihat laporan lengkap.`,
      lab_order_id: labId
    };
  }

  // 11. Patient-Triggered Live Simulation Test for FCM & Real-Time Alerts
  app.post('/api/patient/notifications/test', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ success: false, message: 'Tidak tersedia.' });
    }
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
    }
    const { type } = req.body || {};
    if (type !== 'queue_call' && type !== 'lab_ready') {
      return res.status(400).json({
        success: false,
        message: "Tipe simulasi harus 'queue_call' atau 'lab_ready'."
      });
    }

    const applied = applyClinicalEventToStores({
      no_rm: session.no_rm,
      type
    });

    const result = await dispatchPatientNotification({
      no_rm: session.no_rm,
      type,
      title: applied.title,
      body: applied.body,
      poli: applied.poli,
      nomor_antrian: applied.nomor_antrian,
      lab_order_id: applied.lab_order_id,
      force: true
    });

    return res.json({
      success: true,
      ...result
    });
  });

  // 12. SIMK Staff Dispatch Endpoint (Called from Outpatient Queue Call & Lab Sp.PK Validation)
  deps.staffApp?.post('/api/v1/patient-notifications/dispatch', async (req, res) => {
    try {
      const {
        no_rm,
        type,
        nomor_antrian,
        poli,
        dokter,
        lab_order_id,
        pemeriksaan,
        hasil,
        loinc
      } = req.body || {};

      if (!no_rm || (type !== 'queue_call' && type !== 'lab_ready')) {
        return res.status(400).json({
          success: false,
          message: "no_rm dan type ('queue_call' | 'lab_ready') wajib disertakan."
        });
      }

      const applied = applyClinicalEventToStores({
        no_rm,
        type,
        nomor_antrian,
        poli,
        dokter,
        lab_order_id,
        pemeriksaan,
        hasil,
        loinc
      });

      const result = await dispatchPatientNotification({
        no_rm,
        type,
        title: applied.title,
        body: applied.body,
        poli: applied.poli,
        nomor_antrian: applied.nomor_antrian,
        lab_order_id: applied.lab_order_id
      });

      createAuditLog?.({
        user: dokter || 'Staff Klinis SIMK',
        role: 'Klinis SIMK',
        action: type === 'queue_call' ? 'FCM_QUEUE_CALL_DISPATCH' : 'FCM_LAB_READY_DISPATCH',
        module: 'FCM Notifikasi Pasien',
        ip: clientIp(req),
        status: 'SUCCESS',
        details: `Notifikasi real-time (${type}) dikirim ke No. RM ${normalizeRm(no_rm)}.`
      });

      return res.json({
        success: true,
        ...result
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Gagal mengirim notifikasi pasien.'
      });
    }
  });
}
