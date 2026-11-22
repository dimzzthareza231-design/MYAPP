import crypto from 'crypto';
import type express from 'express';
import { createSignedStore } from './signedStore';
import { createSecurePatientQrToken, isSecurePatientQrConfigured } from './securePatientQr';
import { hashQrToken } from './databaseAdapter';
import { MASTER_POLIKLINIK, SEMUA_DOKTER } from '../data/seedData';
import type { ClinicalResume } from '../data/patientPelayananData';

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

/**
 * Metode autentikasi pasien. Belum ada penyedia OTP yang terpasang, jadi saat ini
 * tidak ada jalur login yang menerbitkan sesi; mesin sesi di bawah tetap dipakai
 * ketika verifikasi OTP nyata tersedia.
 */
export type PatientAuthMethod = 'otp' | 'google';

interface PatientSession {
  token: string;
  no_rm: string;
  authMethod: PatientAuthMethod;
  email?: string;
  verifiedAt: string;
}

const PATIENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// Sesi pasien = token bertanda tangan (stateless), tetap valid di semua instance serverless.
const patientSessions = createSignedStore<PatientSession>('pat_', 'token', PATIENT_SESSION_TTL_MS);

/**
 * Menerbitkan sesi pasien untuk No. RM yang identitasnya SUDAH diverifikasi oleh
 * penyedia autentikasi nyata (mis. OTP). Jangan panggil tanpa verifikasi kepemilikan.
 */
export function issuePatientSession(no_rm: string, authMethod: PatientAuthMethod, email?: string): string {
  return patientSessions.issue({
    token: '',
    no_rm: normalizeRm(no_rm),
    authMethod,
    email,
    verifiedAt: new Date().toISOString()
  });
}

const PATIENT_LOGIN_UNAVAILABLE = {
  success: false,
  code: 'PATIENT_LOGIN_UNAVAILABLE',
  message: 'Login pasien belum tersedia'
} as const;

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
  authMethod: PatientAuthMethod;
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
    status: 'Ditanggung BPJS' | 'Lunas' | 'Menunggu Pembayaran' | 'Belum Ada Tagihan';
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
  if (!nik || nik.length < 8) return '-';
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

  const doctorServedBoost = new Map<string, number>();
  const patientSessionCookieName = 'myitaru_patient_session';

  // Token FCM, kotak notifikasi, hasil lab yang dikirim petugas, dan stream SSE per No. RM
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

    if (!anyEnabledForType) {
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

  function findPatientByRm(noRmRaw: string): ServerPatientRecord | undefined {
    const targetRm = normalizeRm(noRmRaw);
    return patientsStore.find((p) => normalizeRm(p.no_rm) === targetRm);
  }

  // Dossier pasien hanya dibangun dari data tersimpan (store yang dimuat dari adapter persistensi).
  // Bagian yang belum memiliki data dikembalikan sebagai array kosong / null, tanpa nilai karangan.
  function buildDossier(
    noRmRaw: string,
    authMethod: PatientAuthMethod,
    linkedEmail?: string
  ): PatientDossierPayload | null {
    const targetRm = normalizeRm(noRmRaw);
    const core = findPatientByRm(targetRm);
    if (!core) return null;

    const matchedAppointments = appointmentsStore.filter((a) => normalizeRm(a.no_rm) === targetRm);
    const activeQueues = matchedAppointments.map((apt) => {
      const samePoli = appointmentsStore.filter((other) => other.poli === apt.poli && other.tanggal === apt.tanggal);
      const calling = samePoli.find((other) => other.status === 'Diperiksa' || other.status === 'Panggil');
      const isDone = apt.status === 'Selesai' || apt.status === 'Panggil' || apt.status === 'Diperiksa';
      const waitingAhead = samePoli.filter(
        (other) => other.status === 'Menunggu' && other.nomor_antrian.localeCompare(apt.nomor_antrian) < 0
      ).length;
      return {
        id: apt.id,
        poli: apt.poli,
        dokter: apt.dokter,
        tanggal: apt.tanggal,
        jam_praktek: apt.jam_praktek,
        nomor_antrian: apt.nomor_antrian,
        status: apt.status,
        tipe: apt.tipe,
        estimasi_menit: isDone ? 0 : (waitingAhead + 1) * 10,
        poli_sedang_dipanggil: calling?.nomor_antrian || '-'
      };
    });

    const allergies = (core.alergi || []).map((allergen) => ({
      allergen,
      reaction: 'Tidak tercatat',
      severity: 'Tidak tercatat'
    }));

    const problemList = (core.riwayat_penyakit || []).map((nama) => ({
      nama,
      kode_icd10: '-',
      severity: 'Tidak tercatat',
      status: 'Tercatat'
    }));

    // Hasil lab/radiologi hanya yang dikirim petugas melalui endpoint dispatch.
    const labRadResults = dynamicLabResultsByRm.get(targetRm) || [];

    const activeBed = bedsStore.find((b) => normalizeRm(b.no_rm || '') === targetRm);
    const penjamin = core.penjamin || '-';

    return {
      patient: {
        id: core.id,
        no_rm: targetRm,
        nama: core.nama,
        nik_masked: maskNik(core.nik),
        tanggal_lahir: core.tanggal_lahir,
        jenis_kelamin: core.jenis_kelamin,
        golongan_darah: core.golongan_darah || '-',
        penjamin,
        no_bpjs: core.no_bpjs,
        no_hp: core.no_hp || '-',
        alamat: core.alamat || '-',
        status: core.status
      },
      authMethod,
      linkedEmail,
      activeQueues,
      allergies,
      vitalsLatest: null,
      clinicalResume: null,
      problemList,
      medications: [],
      labRadResults,
      // Belum ada modul tagihan tersimpan untuk pasien; jangan tampilkan rincian karangan.
      billing: {
        invoiceNumber: '-',
        penjamin,
        status: 'Belum Ada Tagihan',
        totalBiaya: 0,
        ditanggungPenjamin: 0,
        sisaTagihan: 0,
        items: []
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

  // Ringkasan antrean publik per poliklinik: HANYA agregat (nomor yang sedang dipanggil
  // dan jumlah menunggu). Jangan pernah menambahkan No. RM, nama, atau ID pasien di sini.
  function buildPublicPoliQueues(): Array<{
    id: string;
    kode: string;
    nama: string;
    sedangDipanggil: string | null;
    totalMenunggu: number;
  }> {
    return MASTER_POLIKLINIK.map((pol) => {
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
        sedangDipanggil: activeCall ? activeCall.nomor_antrian : null,
        totalMenunggu: waiting.length
      };
    });
  }

  // 1. Public Hospital Catalog (Doctors, Poliklinik, Live Queue Snapshot)
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

    const poliQueues = buildPublicPoliQueues();

    res.json({
      hospitalName: 'MYITARU SIMK',
      // Nomor IGD per cabang dikelola di katalog publik (src/data/hospitalPublicCatalog.ts).
      // Nomor darurat nasional selalu ditampilkan oleh UI.
      emergencyHotline: null,
      nationalEmergencyNumbers: ['119', '112'],
      poliklinik: MASTER_POLIKLINIK,
      doctors,
      poliQueues,
      updatedAt: new Date().toISOString()
    });
  });

  // 1b. Public Queue Status Lookup — hanya dengan kode tiket/nomor antrean milik pasien sendiri.
  // Tidak mendukung pencarian No. RM dan tidak pernah mengembalikan identitas pasien (No. RM, nama, ID).
  app.get('/api/public/queue-status', (req, res) => {
    const rawQuery = String(req.query.q || '').trim().toUpperCase().slice(0, 32);
    const poliQueues = buildPublicPoliQueues();

    if (!rawQuery) {
      return res.json({
        success: true,
        query: '',
        matches: [],
        poliQueues,
        updatedAt: new Date().toISOString()
      });
    }

    // Kode tiket harus diketik lengkap (mis. "PD-003"); tidak ada pencocokan sebagian.
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
            : queueMeta?.sedangDipanggil ?? null;

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
          nomor_antrian: apt.nomor_antrian,
          poli: apt.poli,
          dokter: apt.dokter,
          tanggal: apt.tanggal,
          jam_praktek: apt.jam_praktek,
          status: apt.status,
          tipe: apt.tipe,
          sedang_dipanggil: sedangDipanggil,
          antrean_di_depan: antreanDiDepan,
          estimasi_menit:
            apt.status === 'Selesai' || apt.status === 'Diperiksa' || apt.status === 'Panggil'
              ? 0
              : (antreanDiDepan + 1) * 10
        };
      });

    return res.json({
      success: true,
      query: rawQuery,
      matches,
      poliQueues,
      updatedAt: new Date().toISOString()
    });
  });

  // 2-3. Login pasien. Belum ada penyedia OTP / identitas pasien yang terpasang, sehingga kedua
  // endpoint menolak dengan 503 sampai verifikasi kepemilikan akun yang nyata tersedia.
  // Saat penyedia tersedia, panggil issuePatientSession() setelah verifikasi berhasil.
  app.post('/api/patient/verify', (req, res) => {
    return res.status(503).json(PATIENT_LOGIN_UNAVAILABLE);
  });

  app.post('/api/patient/google-session', (req, res) => {
    return res.status(503).json(PATIENT_LOGIN_UNAVAILABLE);
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

  // 4b. Kartu pasien digital: QR opaque (AES-GCM, berumur pendek) yang diterbitkan server.
  // Payload tidak memuat nama atau No. RM; petugas membacanya lewat /api/v1/patient-qr/resolve.
  const PATIENT_CARD_QR_TTL_MS = 10 * 60 * 1000;
  app.post('/api/patient/qr-card', (req, res) => {
    const session = resolveSessionFromReq(req);
    if (!session) {
      return res.status(401).json({
        success: false,
        code: 'PATIENT_SESSION_REQUIRED',
        message: 'Sesi pasien tidak valid atau telah berakhir. Silakan masuk kembali.'
      });
    }
    if (!isSecurePatientQrConfigured()) {
      return res.status(503).json({ success: false, code: 'QR_SECRET_NOT_CONFIGURED' });
    }
    const subject = findPatientByRm(session.no_rm)?.id;
    if (!subject || subject.length > 128) {
      return res.status(404).json({ success: false, message: 'Data rekam medis pasien tidak ditemukan.' });
    }
    const issuedAt = Date.now();
    const qrValue = createSecurePatientQrToken(subject, { kind: 'patient', ttlMs: PATIENT_CARD_QR_TTL_MS, now: issuedAt });
    const expiresAt = new Date(issuedAt + PATIENT_CARD_QR_TTL_MS).toISOString();
    deps.qrTokensStore?.unshift({
      id: hashQrToken(qrValue),
      tokenHash: hashQrToken(qrValue),
      subject,
      kind: 'patient',
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt,
      issuedBy: 'patient-app'
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, qr_value: qrValue, expires_at: expiresAt });
  });

  // 5. Public & Mobile Patient Online Appointment Booking
  app.post('/api/patient/appointments', (req, res) => {
    try {
      // Booking pasien terdaftar wajib memakai sesi pasien (Authorization: Bearer / cookie sesi).
      // Tanpa sesi hanya pendaftaran pasien BARU (tanpa No. RM) dari web publik yang diizinkan;
      // No. RM + tanggal lahir di body tidak lagi diterima sebagai bukti identitas.
      const session = resolveSessionFromReq(req);
      const authHeader = req.headers.authorization || '';
      const hasBearer = authHeader.startsWith('Bearer ') && authHeader.slice(7).trim().length > 0;
      const bodyRm = typeof req.body?.no_rm === 'string' ? req.body.no_rm.trim() : '';
      if (!session && (hasBearer || bodyRm)) {
        return res.status(401).json({
          success: false,
          code: 'PATIENT_SESSION_REQUIRED',
          message: 'Sesi pasien tidak valid atau telah berakhir. Silakan masuk kembali untuk membuat janji temu.'
        });
      }
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
      if (targetDate < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ success: false, message: 'Tanggal kunjungan tidak boleh berada di masa lalu.' });
      }
      const targetDateEnd = Date.parse(`${targetDate}T23:59:59.999Z`);
      const bookingWindowMs = 365 * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(targetDateEnd) || targetDateEnd > Date.now() + bookingWindowMs) {
        return res.status(400).json({ success: false, message: 'Pendaftaran hanya dapat dibuat hingga 1 tahun ke depan.' });
      }
      const served = (doctor.pasien_terlayani || 0) + (doctorServedBoost.get(doctor.id) || 0);
      if (served >= (doctor.kuota || 30)) {
        return res.status(409).json({ success: false, message: 'Kuota dokter untuk jadwal tersebut telah penuh.' });
      }

      const resolvedName = typeof nama === 'string' ? nama.trim() : '';
      const normalizedRm = typeof no_rm === 'string' ? normalizeRm(no_rm) : '';
      const normalizedDob = normalizeDob(tanggal_lahir || '');
      const phone = typeof no_hp === 'string' ? no_hp.trim() : '';
      const suppliedNik = typeof nik === 'string' ? nik.trim() : '';

      let resolvedRm = normalizedRm;
      let patientName = resolvedName;
      if (session) {
        // Identitas pasien terdaftar selalu diambil dari sesi, bukan dari body permintaan.
        if (normalizedRm && normalizedRm !== session.no_rm) {
          createAuditLog?.({
            user: `Patient:${session.no_rm}`,
            role: 'Pasien Mobile',
            action: 'ONLINE_APPOINTMENT_IDENTITY_MISMATCH',
            module: 'Portal & App Pasien',
            ip: req.ip || '127.0.0.1',
            status: 'WARNING',
            details: `Percobaan booking untuk No. RM ${normalizedRm} memakai sesi No. RM ${session.no_rm}.`
          });
          return res.status(403).json({
            success: false,
            code: 'PATIENT_IDENTITY_MISMATCH',
            message: 'Janji temu hanya dapat dibuat untuk pasien yang sedang masuk.'
          });
        }
        const core = findPatientByRm(session.no_rm);
        if (!core) {
          return res.status(404).json({ success: false, message: 'Data rekam medis pasien tidak ditemukan.' });
        }
        if ((typeof keluhan === 'string' && keluhan.length > 500)) {
          return res.status(400).json({ success: false, message: 'Data pasien tidak valid atau melebihi batas panjang.' });
        }
        resolvedRm = session.no_rm;
        patientName = core.nama;
      } else if (resolvedName.length > 120 || phone.length > 24 ||
          !/^[+0-9][0-9+\s().-]{7,23}$/.test(phone) ||
          (suppliedNik && !/^\d{16}$/.test(suppliedNik)) ||
          (typeof keluhan === 'string' && keluhan.length > 500)) {
        return res.status(400).json({ success: false, message: 'Data pasien tidak valid atau melebihi batas panjang.' });
      } else {
        if (resolvedName.length < 2 || !isValidIsoDate(normalizedDob) || !phone) {
          return res.status(400).json({ success: false, message: 'Nama, tanggal lahir valid, dan nomor telepon wajib untuk pasien baru.' });
        }
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const seq = String(patientsStore.length + 101).padStart(4, '0');
        resolvedRm = `RM-${yy}${mm}${dd}-${seq}`;
        patientsStore.unshift({
          id: `p-${Date.now()}`,
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
        a.nomor_antrian.startsWith(`${poliKode}-`)
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
        jam_praktek: String(doctor.jam || jam_praktek || ''),
        nomor_antrian: nomorAntrian,
        status: 'Menunggu',
        tipe: 'Rawat Jalan',
        created_at: new Date().toISOString()
      };
      const qrValue = createSecurePatientQrToken(newApt.id, {
        kind: 'reservation',
        ttlMs: Math.max(60_000, targetDateEnd + 24 * 60 * 60 * 1000 - Date.now())
      });
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

      doctorServedBoost.set(dokter_id, (doctorServedBoost.get(dokter_id) || 0) + 1);

      createAuditLog?.({
        user: session ? `Patient:${resolvedRm}` : resolvedName,
        role: 'Pasien Portal',
        action: 'ONLINE_APPOINTMENT_BOOKING',
        module: 'Portal & App Pasien',
        ip: req.ip || '127.0.0.1',
        status: 'SUCCESS',
        details: `Booking online ${nomorAntrian} (${poliObj.nama} · ${doctor.nama}) untuk No. RM ${resolvedRm}.`
      });

      return res.status(201).json({
        success: true,
        message: 'Janji temu berhasil dibuat dan nomor antrean telah diterbitkan.',
        booking: {
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

  // Menerapkan event klinis yang dikirim petugas ke store. Tidak pernah mengarang antrean,
  // dokter, atau hasil: event tanpa data pendukung ditolak oleh pemanggil.
  type ClinicalEventResult =
    | { ok: true; title: string; body: string; poli?: string; nomor_antrian?: string; lab_order_id?: string }
    | { ok: false; status: number; code: string; message: string };

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
  }): ClinicalEventResult {
    const targetRm = normalizeRm(params.no_rm);
    if (!findPatientByRm(targetRm)) {
      return { ok: false, status: 404, code: 'PATIENT_NOT_FOUND', message: 'Data pasien tidak ditemukan.' };
    }

    if (params.type === 'queue_call') {
      const patientApts = appointmentsStore.filter((a) => normalizeRm(a.no_rm) === targetRm);
      const targetApt = params.nomor_antrian
        ? patientApts.find((a) => a.nomor_antrian === params.nomor_antrian)
        : patientApts[0];
      if (!targetApt) {
        return {
          ok: false,
          status: 404,
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Antrean pasien tidak ditemukan untuk dipanggil.'
        };
      }
      targetApt.status = 'Panggil';
      if (params.poli) targetApt.poli = params.poli;
      if (params.dokter) targetApt.dokter = params.dokter;

      return {
        ok: true,
        title: `Antrean ${targetApt.nomor_antrian} Akan Dipanggil!`,
        body: `Silakan bersiap menuju ${targetApt.poli} (${targetApt.dokter}). Nomor Anda sedang dipanggil di ruang periksa.`,
        poli: targetApt.poli,
        nomor_antrian: targetApt.nomor_antrian
      };
    }

    const labId = typeof params.lab_order_id === 'string' ? params.lab_order_id.trim().slice(0, 64) : '';
    const pemeriksaan = typeof params.pemeriksaan === 'string' ? params.pemeriksaan.trim().slice(0, 200) : '';
    if (!labId || !pemeriksaan) {
      return {
        ok: false,
        status: 400,
        code: 'LAB_RESULT_INCOMPLETE',
        message: 'lab_order_id dan pemeriksaan wajib disertakan untuk notifikasi hasil lab.'
      };
    }
    const dokter = typeof params.dokter === 'string' ? params.dokter.trim().slice(0, 120) : '';
    const today = new Date().toISOString().split('T')[0];

    const existingLabs = dynamicLabResultsByRm.get(targetRm) || [];
    const newLabEntry: PatientDossierPayload['labRadResults'][number] = {
      id: labId,
      jenis: 'Lab',
      pemeriksaan,
      tanggal: today,
      dokter: dokter || '-',
      status: 'Tervalidasi',
      hasil: typeof params.hasil === 'string' ? params.hasil.slice(0, 2000) : '',
      loinc: typeof params.loinc === 'string' ? params.loinc.slice(0, 32) : undefined
    };
    dynamicLabResultsByRm.set(targetRm, [newLabEntry, ...existingLabs.filter((l) => l.id !== labId)]);

    return {
      ok: true,
      title: `Hasil Laboratorium Tersedia (${labId})`,
      body: dokter
        ? `${pemeriksaan} telah selesai divalidasi oleh ${dokter}. Ketuk untuk melihat laporan lengkap.`
        : `${pemeriksaan} telah selesai divalidasi. Ketuk untuk melihat laporan lengkap.`,
      lab_order_id: labId
    };
  }

  // 12. SIMK Staff Dispatch Endpoint (Called from Outpatient Queue Call & Lab Sp.PK Validation)
  app.post('/api/v1/patient-notifications/dispatch', async (req, res) => {
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
      if (!applied.ok) {
        return res.status(applied.status).json({ success: false, code: applied.code, message: applied.message });
      }

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
        ip: req.ip || '127.0.0.1',
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
