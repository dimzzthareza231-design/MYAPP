import crypto from 'crypto';
import type express from 'express';
import { MASTER_POLIKLINIK, SEMUA_DOKTER } from '../data/seedData';
import type { ClinicalResume } from '../data/patientPelayananData';
import type { Databases } from './db';

interface PatientSession {
  no_rm: string;
  authMethod: 'rm_dob' | 'google';
  email?: string;
}

// pasien row: column fields merged over the `data` JSON (same shape as /api/v1/records/pasien).
type CorePatient = Record<string, any> & { id: string; no_rm: string; nik: string; nama: string };

// Visit row (kunjungan) joined with its patient; poli/dokter names etc. live in kunjungan.data.
interface QueueRow {
  id: string;
  no_rm: string;
  pasien_nama: string;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
  nomor_antrian: string;
  status: string;
  tipe: string;
}

type LabRadResult = PatientDossierPayload['labRadResults'][number];

const SESSION_MAX_AGE = '-30 days';

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
    status: 'Ditanggung BPJS' | 'Lunas' | 'Menunggu Pembayaran';
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

function sha256Hex(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function parseJson(val: unknown): Record<string, any> {
  try {
    const out = JSON.parse(String(val || '{}'));
    return out && typeof out === 'object' ? out : {};
  } catch {
    return {};
  }
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function toQueueRow(row: Record<string, any>): QueueRow {
  const d = parseJson(row.data);
  return {
    id: row.id,
    no_rm: row.no_rm,
    pasien_nama: row.pasien_nama || '',
    poli: String(d.poli || d.poli_nama || ''),
    dokter: String(d.dokter || d.dokter_nama || ''),
    tanggal: row.tanggal,
    jam_praktek: String(d.jam_praktek || ''),
    nomor_antrian: String(row.nomor_antrian || ''),
    status: row.status,
    tipe: String(d.tipe || 'Rawat Jalan')
  };
}

function poliQueueSnapshot(todayQueue: QueueRow[]) {
  return MASTER_POLIKLINIK.map((pol) => {
    const poliKey = pol.nama.replace('Poli ', '').toLowerCase();
    const matchingApts = todayQueue.filter(
      (a) => a.poli.toLowerCase().includes(poliKey) || a.nomor_antrian.startsWith(`${pol.kode}-`)
    );
    const activeCall = matchingApts.find((a) => a.status === 'Diperiksa' || a.status === 'Panggil');
    const waiting = matchingApts.filter((a) => a.status === 'Menunggu');
    return {
      id: pol.id,
      kode: pol.kode,
      nama: pol.nama,
      sedangDipanggil: activeCall ? activeCall.nomor_antrian : `${pol.kode}-001`,
      totalMenunggu: waiting.length
    };
  });
}

export function registerPatientPortalRoutes(
  app: express.Express,
  deps: {
    db: Databases;
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
  const { db, createAuditLog } = deps;

  // shortcut: SSE fan-out is per-instance (each Worker isolate / Node process only reaches its own
  // connections), so a notification reaches only streams on the instance that handled the dispatch;
  // clients still see it on the next /api/patient/notifications poll. Upgrade to a Durable Object
  // hub when realtime across instances matters.
  const sseClientsByRm = new Map<string, Set<express.Response>>();

  async function loadPatient(noRmRaw: string): Promise<CorePatient | null> {
    const row = await db.core
      .prepare('SELECT * FROM pasien WHERE no_rm = ?')
      .bind(normalizeRm(noRmRaw))
      .first<Record<string, any>>();
    if (!row) return null;
    return {
      ...parseJson(row.data),
      id: row.id,
      no_rm: row.no_rm,
      nik: row.nik,
      nama: row.nama,
      penjamin: row.penjamin ?? undefined,
      status: row.status ?? undefined
    };
  }

  function patientDob(p: CorePatient): string {
    return String(p.tanggal_lahir || p.tgl_lahir || '');
  }

  async function loadTodayQueue(): Promise<QueueRow[]> {
    const { results } = await db.core
      .prepare(
        `SELECT k.id, k.tanggal, k.status, k.nomor_antrian, k.data, p.no_rm, p.nama AS pasien_nama
         FROM kunjungan k JOIN pasien p ON p.id = k.pasien_id
         WHERE k.tanggal = ? ORDER BY k.nomor_antrian`
      )
      .bind(todayIso())
      .all<Record<string, any>>();
    return results.map(toQueueRow);
  }

  async function resolveSessionFromReq(req: express.Request): Promise<PatientSession | undefined> {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const queryToken = String(req.query.token || '').trim();
    const token = bearer || queryToken;
    if (!token) return undefined;
    const row = await db.public
      .prepare(
        `SELECT no_rm, auth_method, email FROM portal_session
         WHERE token_hash = ? AND verified_at > datetime('now', ?)`
      )
      .bind(sha256Hex(token), SESSION_MAX_AGE)
      .first<{ no_rm: string; auth_method: 'rm_dob' | 'google'; email: string | null }>();
    if (!row) return undefined;
    return { no_rm: row.no_rm, authMethod: row.auth_method, email: row.email || undefined };
  }

  async function issueSession(no_rm: string, authMethod: 'rm_dob' | 'google', email?: string): Promise<string> {
    const token = 'pat_' + crypto.randomBytes(20).toString('hex');
    await db.public
      .prepare('INSERT INTO portal_session (token_hash, no_rm, auth_method, email) VALUES (?, ?, ?, ?)')
      .bind(sha256Hex(token), normalizeRm(no_rm), authMethod, email || null)
      .run();
    return token;
  }

  async function linkGoogleEmail(email: string, no_rm: string) {
    await db.public
      .prepare(
        `INSERT INTO portal_google_link (email, no_rm) VALUES (?, ?)
         ON CONFLICT(email) DO UPDATE SET no_rm = excluded.no_rm`
      )
      .bind(email.trim().toLowerCase(), normalizeRm(no_rm))
      .run();
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
    const { results: tokenRows } = await db.public
      .prepare('SELECT * FROM portal_fcm_token WHERE no_rm = ? AND active = 1')
      .bind(targetRm)
      .all<Record<string, any>>();

    const anyEnabledForType =
      tokenRows.length === 0 ||
      tokenRows.some((t) =>
        params.type === 'queue_call'
          ? t.queue_alerts_enabled === 1
          : params.type === 'lab_ready'
          ? t.lab_alerts_enabled === 1
          : true
      );

    const hasWebPushToken = tokenRows.some((t) => t.mode === 'fcm_web_push');

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

    await db.public
      .prepare(
        `INSERT INTO portal_notification
           (id, no_rm, type, title, body, poli, nomor_antrian, lab_order_id, channel, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .bind(
        notification.id,
        targetRm,
        notification.type,
        notification.title,
        notification.body,
        notification.poli ?? null,
        notification.nomor_antrian ?? null,
        notification.lab_order_id ?? null,
        notification.channel,
        notification.createdAt
      )
      .run();

    // Optional relay to FCM HTTP legacy endpoint if FCM_SERVER_KEY is configured on server env
    const fcmServerKey = process.env.FCM_SERVER_KEY;
    const realFcmTokens = tokenRows
      .filter((t) => t.mode === 'fcm_web_push' && !String(t.token).startsWith('fcm_sse_'))
      .map((t) => String(t.token));

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

    // Real-time SSE broadcast to connected mobile tabs/PWAs of this patient (this instance only)
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

  function matchDob(expectedDob: string, providedDob: string): boolean {
    const a = normalizeDob(expectedDob);
    const b = normalizeDob(providedDob);
    return a.length === 10 && a === b;
  }

  async function buildDossier(
    noRmRaw: string,
    authMethod: 'rm_dob' | 'google',
    linkedEmail?: string
  ): Promise<PatientDossierPayload | null> {
    const targetRm = normalizeRm(noRmRaw);
    const core = await loadPatient(targetRm);
    if (!core) return null;

    const today = todayIso();
    const basePenjamin = String(core.penjamin || 'Umum / Mandiri');

    const [{ results: visitRows }, bedRow] = await Promise.all([
      db.core
        .prepare(
          `SELECT k.id, k.tanggal, k.status, k.nomor_antrian, k.data, ? AS no_rm, ? AS pasien_nama
           FROM kunjungan k WHERE k.pasien_id = ? ORDER BY k.tanggal DESC, k.created_at DESC LIMIT 50`
        )
        .bind(core.no_rm, core.nama, core.id)
        .all<Record<string, any>>(),
      db.core.prepare('SELECT kelas, data FROM beds WHERE no_rm = ? LIMIT 1').bind(core.no_rm).first<Record<string, any>>()
    ]);

    const activeQueues = visitRows
      .map(toQueueRow)
      .filter((v) => v.tanggal >= today && !['Selesai', 'Batal', 'Dibatalkan'].includes(v.status))
      .map((apt, idx) => {
        const poliItem = MASTER_POLIKLINIK.find(
          (m) =>
            apt.poli.toLowerCase().includes(m.kode.toLowerCase()) ||
            apt.poli.toLowerCase().includes(m.nama.toLowerCase().replace('poli ', ''))
        );
        const poliCode = poliItem?.kode || 'POL';
        const called = apt.status === 'Panggil' || apt.status === 'Diperiksa';
        return {
          id: apt.id,
          poli: apt.poli,
          dokter: apt.dokter,
          tanggal: apt.tanggal,
          jam_praktek: apt.jam_praktek,
          nomor_antrian: apt.nomor_antrian,
          status: apt.status,
          tipe: apt.tipe,
          estimasi_menit: called ? 0 : (idx + 1) * 12,
          poli_sedang_dipanggil: called ? apt.nomor_antrian : `${poliCode}-001`
        };
      });

    // Allergies: data.alergi may be a string, string[] or object[]
    const rawAllergies = Array.isArray(core.alergi) ? core.alergi : core.alergi ? [core.alergi] : [];
    const allergies = rawAllergies.map((a: any) =>
      typeof a === 'string'
        ? { allergen: a, reaction: 'Reaksi alergi tercatat di Rekam Medis', severity: '-' }
        : {
            allergen: String(a?.allergen || a?.nama || ''),
            reaction: String(a?.reaction || a?.reaksi || ''),
            severity: String(a?.severity || '-')
          }
    );

    const v = Array.isArray(core.vitals) ? core.vitals[0] : null;
    const vitalsLatest = v
      ? {
          date: String(v.date || ''),
          bp: String(v.bp || ''),
          hr: String(v.hr || ''),
          temp: String(v.temp || ''),
          rr: String(v.rr || ''),
          spo2: String(v.spo2 || ''),
          bb: String(v.bb || ''),
          tb: String(v.tb || '')
        }
      : null;

    const problemList = Array.isArray(core.problem_list)
      ? core.problem_list.map((pr: any) => ({
          nama: String(pr.nama || ''),
          kode_icd10: String(pr.kode_icd10 || ''),
          severity: String(pr.severity || '-'),
          status: String(pr.status || 'Active')
        }))
      : (Array.isArray(core.riwayat_penyakit) ? core.riwayat_penyakit : []).map((dx: any) => ({
          nama: String(dx),
          kode_icd10: '',
          severity: '-',
          status: 'Active'
        }));

    const medications = (Array.isArray(core.medications) ? core.medications : []).map((m: any) => ({
      name: String(m.name || ''),
      dose: String(m.dose || ''),
      frequency: String(m.frequency || ''),
      status: String(m.status || 'Active')
    }));

    // Validated lab/radiology results are stored per visit in kunjungan.data.lab_results
    const seenIds = new Set<string>();
    const labRadResults: LabRadResult[] = [];
    for (const row of visitRows) {
      const labs = parseJson(row.data).lab_results;
      if (!Array.isArray(labs)) continue;
      for (const lab of [...labs].reverse()) {
        if (!lab?.id || seenIds.has(lab.id)) continue;
        seenIds.add(lab.id);
        labRadResults.push(lab);
      }
    }

    // Billing computation
    const isBpjsOrInsurance =
      basePenjamin.toLowerCase().includes('bpjs') ||
      basePenjamin.toLowerCase().includes('asuransi') ||
      basePenjamin.toLowerCase().includes('pertamina');

    const billItems = [
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
    const billingStatus: 'Ditanggung BPJS' | 'Lunas' | 'Menunggu Pembayaran' = basePenjamin
      .toLowerCase()
      .includes('bpjs')
      ? 'Ditanggung BPJS'
      : sisaTagihan === 0
      ? 'Lunas'
      : 'Menunggu Pembayaran';

    const bed = bedRow ? parseJson(bedRow.data) : null;

    return {
      patient: {
        id: core.id,
        no_rm: core.no_rm,
        nama: core.nama,
        nik_masked: maskNik(core.nik),
        tanggal_lahir: patientDob(core),
        jenis_kelamin: core.jenis_kelamin === 'P' ? 'P' : 'L',
        golongan_darah: String(core.golongan_darah || '-'),
        penjamin: basePenjamin,
        no_bpjs: core.no_bpjs,
        no_hp: String(core.no_hp || core.telepon || '-'),
        alamat: String(core.alamat || '-'),
        status: String(core.status || 'Rawat Jalan')
      },
      authMethod,
      linkedEmail,
      activeQueues,
      allergies,
      vitalsLatest,
      clinicalResume: (core.resume_medis as ClinicalResume) || null,
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
      inpatientStay:
        bedRow && bed
          ? {
              bangsal: String(bed.bangsal || ''),
              ruangan: String(bed.ruangan || ''),
              nomor_bed: String(bed.nomor_bed || ''),
              kelas: bedRow.kelas,
              tanggal_masuk: bed.tanggal_masuk
            }
          : null
    };
  }

  // 1. Public Hospital Catalog (Doctors, Poliklinik, Live Queue Snapshot)
  app.get('/api/public/hospital-catalog', async (req, res) => {
    try {
      const [{ results: counts }, todayQueue] = await Promise.all([
        db.public.prepare('SELECT dokter_id, booked FROM portal_doctor_booking_count').all<{ dokter_id: string; booked: number }>(),
        loadTodayQueue()
      ]);
      const booked = new Map(counts.map((c) => [c.dokter_id, c.booked]));
      const doctors = SEMUA_DOKTER.map((doc) => {
        const served = (doc.pasien_terlayani || 0) + (booked.get(doc.id) || 0);
        const quota = doc.kuota || 30;
        return {
          ...doc,
          pasien_terlayani: served,
          kuota_tersisa: Math.max(0, quota - served)
        };
      });

      res.json({
        hospitalName: 'Klinik Tarumanagara (MYITARU SIMK)',
        emergencyHotline: '1-500-911',
        poliklinik: MASTER_POLIKLINIK,
        doctors,
        poliQueues: poliQueueSnapshot(todayQueue),
        demoPatients: [],
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Gagal memuat katalog.' });
    }
  });

  // 1b. Public Queue Status Lookup by exact Queue Number (Nomor Antrean) or No. RM, today only
  app.get('/api/public/queue-status', async (req, res) => {
    try {
      const rawQuery = String(req.query.q || '').trim().toUpperCase();
      const todayQueue = await loadTodayQueue();
      const poliQueues = poliQueueSnapshot(todayQueue);

      // sampleTickets used to list other patients' No. RM on a public page; now always empty.
      if (!rawQuery) {
        return res.json({
          success: true,
          query: '',
          matches: [],
          poliQueues,
          sampleTickets: [],
          updatedAt: new Date().toISOString()
        });
      }

      const matches = todayQueue
        .filter((a) => a.nomor_antrian.toUpperCase() === rawQuery || normalizeRm(a.no_rm) === rawQuery)
        .map((apt) => {
          const poliItem = MASTER_POLIKLINIK.find(
            (m) =>
              apt.poli.toLowerCase().includes(m.nama.replace('Poli ', '').toLowerCase()) ||
              apt.nomor_antrian.startsWith(`${m.kode}-`)
          );
          const queueMeta = poliQueues.find((pq) => pq.id === poliItem?.id);
          const called = apt.status === 'Diperiksa' || apt.status === 'Panggil';
          const sedangDipanggil = called
            ? apt.nomor_antrian
            : queueMeta?.sedangDipanggil || `${poliItem?.kode || 'RJ'}-001`;

          const antreanDiDepan =
            apt.status === 'Selesai' || called
              ? 0
              : todayQueue.filter(
                  (other) =>
                    other.poli === apt.poli &&
                    other.status === 'Menunggu' &&
                    other.nomor_antrian.localeCompare(apt.nomor_antrian) < 0
                ).length;

          return {
            id: apt.id,
            nomor_antrian: apt.nomor_antrian,
            no_rm: apt.no_rm,
            pasien_nama_masked: maskPatientName(apt.pasien_nama),
            poli: apt.poli,
            dokter: apt.dokter,
            tanggal: apt.tanggal,
            jam_praktek: apt.jam_praktek,
            status: apt.status,
            tipe: apt.tipe,
            sedang_dipanggil: sedangDipanggil,
            antrean_di_depan: antreanDiDepan,
            estimasi_menit: apt.status === 'Selesai' || called ? 0 : (antreanDiDepan + 1) * 10
          };
        });

      return res.json({
        success: true,
        query: rawQuery,
        matches,
        poliQueues,
        sampleTickets: [],
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal memuat status antrean.' });
    }
  });

  // 2. Patient Verification via No. RM + Tanggal Lahir
  app.post('/api/patient/verify', async (req, res) => {
    try {
      const { no_rm, tanggal_lahir } = req.body || {};
      if (!no_rm || !tanggal_lahir) {
        return res.status(400).json({
          success: false,
          message: 'Nomor Rekam Medis (No. RM) dan Tanggal Lahir wajib diisi.'
        });
      }

      const targetRm = normalizeRm(no_rm);
      const core = await loadPatient(targetRm);

      if (!core) {
        return res.status(404).json({
          success: false,
          message: `Nomor Rekam Medis ${targetRm} tidak ditemukan dalam sistem kami.`
        });
      }

      if (!matchDob(patientDob(core), tanggal_lahir)) {
        createAuditLog?.({
          user: `Patient:${targetRm}`,
          role: 'Pasien Mobile',
          action: 'PATIENT_VERIFY_FAILED',
          module: 'Aplikasi Pasien',
          ip: req.ip || '127.0.0.1',
          status: 'WARNING',
          details: `Percobaan verifikasi No. RM ${targetRm} dengan tanggal lahir tidak cocok.`
        });

        return res.status(401).json({
          success: false,
          message: 'Tanggal lahir tidak sesuai dengan Nomor Rekam Medis tersebut.'
        });
      }

      const token = await issueSession(targetRm, 'rm_dob');
      const dossier = await buildDossier(targetRm, 'rm_dob');

      createAuditLog?.({
        user: dossier?.patient.nama || targetRm,
        role: 'Pasien Mobile',
        action: 'PATIENT_VERIFY_RM_DOB',
        module: 'Aplikasi Pasien',
        ip: req.ip || '127.0.0.1',
        status: 'SUCCESS',
        details: `Verifikasi pasien berhasil untuk No. RM ${targetRm}.`
      });

      return res.json({
        success: true,
        token,
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
  // shortcut: trusts the email in the request body (no Google/Firebase ID token check), so anyone who
  // knows a linked email gets that patient's session; verify an ID token before production use.
  app.post('/api/patient/google-session', async (req, res) => {
    try {
      const { email, displayName, linkNoRm, linkTanggalLahir } = req.body || {};

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Email akun Google terautentikasi wajib tersedia.'
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Bind a specific No. RM + DOB to this Google email
      if (linkNoRm && linkTanggalLahir) {
        const targetRm = normalizeRm(linkNoRm);
        const core = await loadPatient(targetRm);
        if (!core) {
          return res.status(404).json({
            success: false,
            message: `No. RM ${targetRm} tidak ditemukan.`
          });
        }
        if (!matchDob(patientDob(core), linkTanggalLahir)) {
          return res.status(401).json({
            success: false,
            message: 'Tanggal lahir tidak sesuai untuk menautkan No. RM ke akun Google ini.'
          });
        }
        await linkGoogleEmail(normalizedEmail, targetRm);
      }

      const link = await db.public
        .prepare('SELECT no_rm FROM portal_google_link WHERE email = ?')
        .bind(normalizedEmail)
        .first<{ no_rm: string }>();
      if (!link) {
        return res.json({
          success: true,
          linked: false,
          email: normalizedEmail,
          displayName: displayName || normalizedEmail.split('@')[0],
          message: 'Akun Google terverifikasi. Hubungkan No. RM Anda atau buat profil pasien baru.'
        });
      }

      const token = await issueSession(link.no_rm, 'google', normalizedEmail);
      const dossier = await buildDossier(link.no_rm, 'google', normalizedEmail);

      return res.json({
        success: true,
        linked: true,
        token,
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
  app.get('/api/patient/dossier', async (req, res) => {
    try {
      const session = await resolveSessionFromReq(req);
      if (!session) {
        return res.status(401).json({
          success: false,
          message: 'Sesi verifikasi pasien tidak valid atau telah berakhir. Silakan verifikasi ulang.'
        });
      }

      const dossier = await buildDossier(session.no_rm, session.authMethod, session.email);
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
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal memuat data pasien.' });
    }
  });

  // 5. Public & Mobile Patient Online Appointment Booking -> core pasien (new patients) + kunjungan
  app.post('/api/patient/appointments', async (req, res) => {
    try {
      const {
        nama,
        no_rm,
        tanggal_lahir,
        nik,
        jenis_kelamin,
        no_hp,
        poli_id,
        poli_nama,
        dokter_id,
        dokter_nama,
        tanggal,
        jam_praktek,
        penjamin,
        keluhan,
        google_email
      } = req.body || {};

      if (!poli_nama || !dokter_nama) {
        return res.status(400).json({
          success: false,
          message: 'Poliklinik dan dokter tujuan wajib dipilih.'
        });
      }

      const resolvedPenjamin = String(penjamin || 'Umum / Mandiri');
      let resolvedRm = no_rm ? normalizeRm(no_rm) : '';
      let resolvedDob = normalizeDob(tanggal_lahir || '');
      let resolvedName = String(nama || '').trim();
      let pasienId = '';
      let newPatient: { id: string; nik: string; data: string } | null = null;

      if (resolvedRm) {
        // Existing patient: the booking issues a session + dossier, so it needs the same RM + DOB proof as /verify.
        const core = await loadPatient(resolvedRm);
        if (!core) {
          return res.status(404).json({
            success: false,
            message: `Nomor Rekam Medis ${resolvedRm} tidak ditemukan. Daftar sebagai pasien baru.`
          });
        }
        if (!matchDob(patientDob(core), resolvedDob)) {
          return res.status(401).json({
            success: false,
            message: 'Tanggal lahir tidak sesuai dengan Nomor Rekam Medis tersebut.'
          });
        }
        pasienId = core.id;
        resolvedName = core.nama;
        resolvedDob = patientDob(core);
      } else {
        if (!resolvedName || resolvedDob.length !== 10) {
          return res.status(400).json({
            success: false,
            message: 'Untuk pasien baru, Nama Lengkap dan Tanggal Lahir wajib diisi.'
          });
        }
        pasienId = `p-${crypto.randomUUID()}`;
        newPatient = {
          id: pasienId,
          nik: String(nik || '').trim(),
          data: JSON.stringify({
            tanggal_lahir: resolvedDob,
            jenis_kelamin: jenis_kelamin === 'P' ? 'P' : 'L',
            no_hp: String(no_hp || ''),
            alamat: '',
            alergi: [],
            riwayat_penyakit: keluhan ? [String(keluhan)] : [],
            sumber: 'portal_online'
          })
        };
      }

      const poliObj = MASTER_POLIKLINIK.find((p) => p.id === poli_id || p.nama === poli_nama);
      const poliKode = poliObj?.kode || 'RJ';
      const targetDate = tanggal ? normalizeDob(tanggal) : todayIso();
      // shortcut: count-then-insert can hand two concurrent bookings the same nomor_antrian; move to a
      // per-poli/day counter row when online booking volume makes that likely.
      const existingForPoli = await db.core
        .prepare('SELECT COUNT(*) AS n FROM kunjungan WHERE tanggal = ? AND nomor_antrian LIKE ?')
        .bind(targetDate, `${poliKode}-%`)
        .first<number>('n');
      const nomorAntrian = `${poliKode}-${String((existingForPoli || 0) + 1).padStart(3, '0')}`;
      const resolvedJam = String(jam_praktek || '08:00 - 13:00 WIB');

      const insertVisit = db.core
        .prepare(
          `INSERT INTO kunjungan (id, pasien_id, dokter_id, tanggal, status, nomor_antrian, data)
           VALUES (?, ?, (SELECT id FROM dokter WHERE id = ?), ?, 'Menunggu', ?, ?)`
        )
        .bind(
          `kj-${crypto.randomUUID()}`,
          pasienId,
          dokter_id ? String(dokter_id) : null,
          targetDate,
          nomorAntrian,
          JSON.stringify({
            poli_id: poliObj?.id || poli_id || '',
            poli: String(poli_nama),
            dokter_id: dokter_id ? String(dokter_id) : '',
            dokter: String(dokter_nama),
            jam_praktek: resolvedJam,
            tipe: 'Rawat Jalan',
            penjamin: resolvedPenjamin,
            keluhan_utama: keluhan ? String(keluhan) : '',
            sumber: 'portal_online'
          })
        );

      if (newPatient) {
        // New RM = RM-yymmdd-<seq>; retry on a UNIQUE clash from a concurrent registration.
        const now = new Date();
        const prefix = `RM-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const total = (await db.core.prepare('SELECT COUNT(*) AS n FROM pasien').first<number>('n')) || 0;
        for (let attempt = 0; ; attempt++) {
          resolvedRm = `${prefix}-${String(total + 101 + attempt).padStart(4, '0')}`;
          try {
            await db.core.batch([
              db.core
                .prepare('INSERT INTO pasien (id, no_rm, nik, nama, penjamin, status, data) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .bind(newPatient.id, resolvedRm, newPatient.nik, resolvedName, resolvedPenjamin, 'Rawat Jalan', newPatient.data),
              insertVisit
            ]);
            break;
          } catch (err: any) {
            if (attempt >= 4 || !/UNIQUE/i.test(String(err?.message)) || /nik/i.test(String(err?.message))) throw err;
          }
        }
      } else {
        await insertVisit.run();
      }

      if (dokter_id) {
        await db.public
          .prepare(
            `INSERT INTO portal_doctor_booking_count (dokter_id, booked) VALUES (?, 1)
             ON CONFLICT(dokter_id) DO UPDATE SET booked = booked + 1`
          )
          .bind(String(dokter_id))
          .run();
      }

      if (google_email && typeof google_email === 'string') {
        await linkGoogleEmail(google_email, resolvedRm);
      }

      const authMethod: 'rm_dob' | 'google' = google_email ? 'google' : 'rm_dob';
      const token = await issueSession(resolvedRm, authMethod, google_email || undefined);
      const dossier = await buildDossier(resolvedRm, authMethod, google_email || undefined);

      createAuditLog?.({
        user: resolvedName,
        role: 'Pasien Portal',
        action: 'ONLINE_APPOINTMENT_BOOKING',
        module: 'Portal & App Pasien',
        ip: req.ip || '127.0.0.1',
        status: 'SUCCESS',
        details: `Booking online ${nomorAntrian} (${poli_nama} · ${dokter_nama}) untuk No. RM ${resolvedRm}.`
      });

      return res.status(201).json({
        success: true,
        message: 'Janji temu berhasil dibuat dan nomor antrean telah diterbitkan.',
        booking: {
          no_rm: resolvedRm,
          tanggal_lahir: resolvedDob,
          nama: resolvedName,
          nomor_antrian: nomorAntrian,
          poli: poli_nama,
          dokter: dokter_nama,
          tanggal: targetDate,
          jam_praktek: resolvedJam,
          penjamin: resolvedPenjamin
        },
        token,
        dossier
      });
    } catch (err: any) {
      if (/idx_pasien_nik|pasien\.nik/i.test(String(err?.message))) {
        return res.status(409).json({
          success: false,
          message: 'NIK sudah terdaftar. Gunakan No. RM Anda untuk booking sebagai pasien lama.'
        });
      }
      return res.status(500).json({
        success: false,
        message: err?.message || 'Gagal memproses pendaftaran janji temu.'
      });
    }
  });

  // 6. Register or Update Patient FCM Device Token & Notification Preferences
  app.post('/api/patient/fcm-token', async (req, res) => {
    try {
      const session = await resolveSessionFromReq(req);
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

      const record: ServerFcmTokenRecord = {
        token: fcmToken.slice(0, 512),
        no_rm: normalizeRm(session.no_rm),
        mode: mode === 'fcm_web_push' ? 'fcm_web_push' : 'realtime_sse_fallback',
        platform: ['web', 'pwa', 'android', 'ios'].includes(platform) ? platform : 'web',
        queueAlertsEnabled: queueAlertsEnabled !== false,
        labAlertsEnabled: labAlertsEnabled !== false,
        active: true,
        updatedAt: new Date().toISOString()
      };

      await db.public
        .prepare(
          `INSERT INTO portal_fcm_token
             (token, no_rm, mode, platform, queue_alerts_enabled, lab_alerts_enabled, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(token) DO UPDATE SET
             no_rm = excluded.no_rm, mode = excluded.mode, platform = excluded.platform,
             queue_alerts_enabled = excluded.queue_alerts_enabled,
             lab_alerts_enabled = excluded.lab_alerts_enabled, active = 1, updated_at = excluded.updated_at`
        )
        .bind(
          record.token,
          record.no_rm,
          record.mode,
          record.platform,
          record.queueAlertsEnabled ? 1 : 0,
          record.labAlertsEnabled ? 1 : 0,
          record.updatedAt
        )
        .run();

      return res.json({ success: true, record });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal menyimpan token perangkat.' });
    }
  });

  // 7. Deactivate FCM Device Token on Patient Logout
  app.delete('/api/patient/fcm-token', async (req, res) => {
    try {
      const session = await resolveSessionFromReq(req);
      if (!session) {
        return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
      }
      const { token: fcmToken } = req.body || {};
      await db.public
        .prepare('UPDATE portal_fcm_token SET active = 0 WHERE no_rm = ? AND (? IS NULL OR token = ?)')
        .bind(normalizeRm(session.no_rm), fcmToken || null, fcmToken || null)
        .run();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal menonaktifkan token.' });
    }
  });

  // 8. List Patient Real-Time Notifications & Active Preferences
  app.get('/api/patient/notifications', async (req, res) => {
    try {
      const session = await resolveSessionFromReq(req);
      if (!session) {
        return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
      }
      const targetRm = normalizeRm(session.no_rm);
      const [{ results: rows }, { results: tokens }] = await Promise.all([
        db.public
          .prepare('SELECT * FROM portal_notification WHERE no_rm = ? ORDER BY created_at DESC, id DESC LIMIT 40')
          .bind(targetRm)
          .all<Record<string, any>>(),
        db.public
          .prepare('SELECT queue_alerts_enabled, lab_alerts_enabled FROM portal_fcm_token WHERE no_rm = ? AND active = 1 ORDER BY updated_at DESC')
          .bind(targetRm)
          .all<{ queue_alerts_enabled: number; lab_alerts_enabled: number }>()
      ]);
      const notifications: ServerPatientNotification[] = rows.map((r) => ({
        id: r.id,
        no_rm: r.no_rm,
        type: r.type,
        title: r.title,
        body: r.body,
        poli: r.poli ?? undefined,
        nomor_antrian: r.nomor_antrian ?? undefined,
        lab_order_id: r.lab_order_id ?? undefined,
        channel: r.channel,
        read: r.is_read === 1,
        createdAt: r.created_at
      }));

      return res.json({
        success: true,
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        registeredDevices: tokens.length,
        preferences: {
          queueAlertsEnabled: tokens[0] ? tokens[0].queue_alerts_enabled === 1 : true,
          labAlertsEnabled: tokens[0] ? tokens[0].lab_alerts_enabled === 1 : true
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal memuat notifikasi.' });
    }
  });

  // 9. Mark Patient Notification(s) Read
  app.post('/api/patient/notifications/read', async (req, res) => {
    try {
      const session = await resolveSessionFromReq(req);
      if (!session) {
        return res.status(401).json({ success: false, message: 'Sesi pasien tidak valid.' });
      }
      const targetRm = normalizeRm(session.no_rm);
      const { id, markAll } = req.body || {};
      await db.public
        .prepare('UPDATE portal_notification SET is_read = 1 WHERE no_rm = ? AND (? = 1 OR id = ?)')
        .bind(targetRm, markAll ? 1 : 0, id ? String(id) : null)
        .run();
      const unread = await db.public
        .prepare(
          `SELECT COUNT(*) AS n FROM (SELECT is_read FROM portal_notification WHERE no_rm = ?
           ORDER BY created_at DESC, id DESC LIMIT 40) WHERE is_read = 0`
        )
        .bind(targetRm)
        .first<number>('n');

      return res.json({ success: true, unreadCount: unread || 0 });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal memperbarui notifikasi.' });
    }
  });

  // 10. Real-Time SSE Notification Stream for PatientMobileApp
  app.get('/api/patient/notifications/stream', async (req, res) => {
    let session: PatientSession | undefined;
    try {
      session = await resolveSessionFromReq(req);
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal membuka stream.' });
    }
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
      if (listeners?.size === 0) sseClientsByRm.delete(targetRm);
    });
  });

  // Notification text for a queue call / lab ready event. Pure: no clinical writes.
  function describeClinicalEvent(
    params: {
      type: 'queue_call' | 'lab_ready';
      nomor_antrian?: string;
      poli?: string;
      dokter?: string;
      lab_order_id?: string;
      pemeriksaan?: string;
    },
    dossier: PatientDossierPayload | null
  ) {
    if (params.type === 'queue_call') {
      const q = dossier?.activeQueues[0];
      const nomor = params.nomor_antrian || q?.nomor_antrian || '-';
      const poli = params.poli || q?.poli || 'Poliklinik';
      const dokter = params.dokter || q?.dokter || 'Dokter Poliklinik';
      return {
        title: `Antrean ${nomor} Akan Dipanggil!`,
        body: `Silakan bersiap menuju ${poli} (${dokter}). Nomor Anda sedang dipanggil di ruang periksa.`,
        poli,
        nomor_antrian: nomor
      };
    }
    const labId = params.lab_order_id || `LAB-${Date.now().toString().slice(-6)}`;
    const pemeriksaan = params.pemeriksaan || 'Pemeriksaan Laboratorium';
    const dokter = params.dokter || 'Dokter Sp.PK';
    return {
      title: `Hasil Laboratorium Tersedia (${labId})`,
      body: `${pemeriksaan} telah selesai divalidasi oleh ${dokter}. Ketuk untuk melihat laporan lengkap.`,
      lab_order_id: labId
    };
  }

  // 11. Patient-Triggered Live Test for FCM & Real-Time Alerts.
  // Only sends a notification; a patient must never be able to change queue status or lab results.
  app.post('/api/patient/notifications/test', async (req, res) => {
    try {
      const session = await resolveSessionFromReq(req);
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

      const dossier = await buildDossier(session.no_rm, session.authMethod, session.email);
      const msg = describeClinicalEvent({ type }, dossier);
      const result = await dispatchPatientNotification({
        no_rm: session.no_rm,
        type,
        title: `[Uji Coba] ${msg.title}`,
        body: msg.body,
        poli: msg.poli,
        nomor_antrian: msg.nomor_antrian,
        lab_order_id: msg.lab_order_id,
        force: true
      });

      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || 'Gagal mengirim notifikasi uji.' });
    }
  });

  // 12. SIMK Staff Dispatch Endpoint (Called from Outpatient Queue Call & Lab Sp.PK Validation).
  // Staff-only: relies on the /api/v1 staff-session guard in app.ts.
  app.post('/api/v1/patient-notifications/dispatch', async (req, res) => {
    try {
      const { no_rm, type, nomor_antrian, poli, dokter, lab_order_id, pemeriksaan, hasil, loinc } = req.body || {};

      if (!no_rm || (type !== 'queue_call' && type !== 'lab_ready')) {
        return res.status(400).json({
          success: false,
          message: "no_rm dan type ('queue_call' | 'lab_ready') wajib disertakan."
        });
      }

      const targetRm = normalizeRm(no_rm);
      const core = await loadPatient(targetRm);
      if (!core) {
        return res.status(404).json({ success: false, message: `No. RM ${targetRm} tidak ditemukan.` });
      }

      // Queue status itself is written by the caller (Outpatient updates kunjungan). A validated lab
      // result is appended to the patient's latest visit (kunjungan.data.lab_results) so the dossier shows it.
      const msg = describeClinicalEvent({ type, nomor_antrian, poli, dokter, lab_order_id, pemeriksaan }, null);
      let labStored = false;
      if (type === 'lab_ready') {
        const entry: LabRadResult = {
          id: msg.lab_order_id!,
          jenis: 'Lab',
          pemeriksaan: String(pemeriksaan || 'Pemeriksaan Laboratorium'),
          tanggal: todayIso(),
          dokter: String(dokter || ''),
          status: 'Tervalidasi',
          hasil: String(hasil || ''),
          loinc: loinc ? String(loinc) : undefined
        };
        const r = await db.core
          .prepare(
            `UPDATE kunjungan SET
               data = json_set(data, '$.lab_results',
                        json_insert(coalesce(json_extract(data, '$.lab_results'), '[]'), '$[#]', json(?))),
               updated_at = datetime('now')
             WHERE id = (SELECT id FROM kunjungan WHERE pasien_id = ? ORDER BY tanggal DESC, created_at DESC LIMIT 1)`
          )
          .bind(JSON.stringify(entry), core.id)
          .run();
        labStored = (r.meta?.changes || 0) > 0;
      }

      const result = await dispatchPatientNotification({
        no_rm: targetRm,
        type,
        title: msg.title,
        body: msg.body,
        poli: msg.poli,
        nomor_antrian: msg.nomor_antrian,
        lab_order_id: msg.lab_order_id
      });

      createAuditLog?.({
        user: dokter || 'Staff Klinis SIMK',
        role: 'Klinis SIMK',
        action: type === 'queue_call' ? 'FCM_QUEUE_CALL_DISPATCH' : 'FCM_LAB_READY_DISPATCH',
        module: 'FCM Notifikasi Pasien',
        ip: req.ip || '127.0.0.1',
        status: 'SUCCESS',
        details: `Notifikasi real-time (${type}) dikirim ke No. RM ${targetRm}.`
      });

      return res.json({ success: true, labStored, ...result });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Gagal mengirim notifikasi pasien.'
      });
    }
  });
}
