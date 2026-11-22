// Akun pasien (web publik): profil kontak, akun keluarga (wali -> tanggungan), penilaian layanan,
// dan pengaduan. Endpoint petugas untuk tindak lanjut pengaduan dipasang di aplikasi inti (staffApp,
// di belakang coreAuth, scope 'mutu').
//
// Pasien (sesi dari resolvePatientSession):
//   GET    /api/patient/profile                 profil sendiri (atau tanggungan saat wali beralih)
//   PATCH  /api/patient/profile                 hanya alamat, email, kontak_darurat; no_hp read-only
//   GET    /api/patient/family                  daftar tanggungan & wali
//   POST   /api/patient/family/link/request     {no_rm, hubungan} -> OTP ke nomor TERDAFTAR tanggungan
//   POST   /api/patient/family/link/verify      {request_id, code} -> tautan aktif
//   DELETE /api/patient/family/:rm              lepas tanggungan, atau cabut akses wali atas diri sendiri
//   POST   /api/patient/family/switch/:rm       sesi untuk tanggungan (actorRm = wali; dicatat di audit)
//   GET    /api/patient/feedback                penilaian milik sendiri
//   POST   /api/patient/feedback                {appointment_id?, rating 1-5, komentar?, kategori}
//   GET    /api/patient/complaints              pengaduan milik sendiri + status
//   POST   /api/patient/complaints              {kategori, isi, kontak_balik?} -> nomor tiket acak
// Petugas (aplikasi inti):
//   GET    /api/v1/patient-feedback             daftar + ringkasan
//   GET    /api/v1/patient-complaints           daftar (filter ?status=)
//   PATCH  /api/v1/patient-complaints/:id       {status?, tanggapan?, catatan_internal?}
//
// Hanya Web Crypto/global API (aman untuk Cloudflare Workers).
import type express from 'express';
import type { PersistenceRepository } from './databaseAdapter';
import {
  OtpLoginService,
  PersistenceOtpStore,
  normalizeIndonesianPhone,
  resolveOtpSecret,
  resolveOtpSender,
  type OtpAuditEntry
} from './otp';
import {
  PATIENT_SESSION_COOKIE,
  issuePatientSession,
  readPatientSessionTokenFromRequest,
  resolvePatientSession,
  revokePatientSessionToken,
  type ServerAppointmentRecord,
  type ServerPatientRecord
} from './patientPortalService';

// ── Tipe data tersimpan ────────────────────────────────────────────────────

export const FAMILY_RELATIONS = ['anak', 'orang_tua', 'pasangan', 'lainnya'] as const;
export type FamilyRelation = typeof FAMILY_RELATIONS[number];

export interface FamilyLinkRecord {
  id: string;
  kind: 'link';
  guardian_rm: string;
  dependent_rm: string;
  hubungan: FamilyRelation;
  status: 'active' | 'revoked';
  verified_by: 'otp';
  created_at: string;
  updated_at: string;
  revoked_at?: string;
  revoked_by?: string;
}

export interface FamilyLinkRequestRecord {
  id: string;
  kind: 'request';
  guardian_rm: string;
  dependent_rm: string;
  hubungan: FamilyRelation;
  otp_request_id: string;
  status: 'pending' | 'verified' | 'failed';
  created_at: string;
  expires_at: string;
}

export const FEEDBACK_CATEGORIES = ['pelayanan', 'dokter', 'perawat', 'fasilitas', 'administrasi', 'aplikasi', 'lainnya'] as const;
export const COMPLAINT_CATEGORIES = [
  'pelayanan', 'tenaga_medis', 'administrasi', 'biaya', 'fasilitas', 'privasi', 'aplikasi', 'lainnya'
] as const;
export const COMPLAINT_STATUSES = ['Diterima', 'Diproses', 'Selesai', 'Ditolak'] as const;
export type ComplaintStatus = typeof COMPLAINT_STATUSES[number];

export interface FeedbackRecord {
  id: string;
  patient_rm: string;
  actor_rm?: string;
  appointment_id?: string;
  rating: number;
  komentar?: string;
  kategori: string;
  poli?: string;
  dokter?: string;
  created_at: string;
}

export interface ComplaintRecord {
  id: string;
  ticket_no: string;
  patient_rm: string;
  actor_rm?: string;
  kategori: string;
  isi: string;
  kontak_balik?: string;
  status: ComplaintStatus;
  tanggapan?: string;
  catatan_internal?: string;
  history: Array<{ at: string; by: string; status: ComplaintStatus; note?: string }>;
  created_at: string;
  updated_at: string;
}

export interface PatientAccountAuditEntry {
  user: string;
  role: string;
  action: string;
  module: string;
  ip: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  details: string;
}

export interface PatientAccountDeps {
  persistence: PersistenceRepository;
  patientsStore: ServerPatientRecord[];
  appointmentsStore: ServerAppointmentRecord[];
  /** Aplikasi inti (di belakang coreAuth) untuk endpoint petugas. */
  staffApp?: express.Express;
  createAuditLog?: (entry: PatientAccountAuditEntry) => void;
  now?: () => number;
}

// ── Konstanta ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_REQUEST_TTL_MS = 5 * 60 * 1000;
export const MAX_LINK_REQUESTS_PER_DAY = 5;
export const MAX_ACTIVE_DEPENDENTS = 10;
export const MAX_FEEDBACK_PER_DAY = 10;
export const MAX_COMPLAINTS_PER_DAY = 5;
const MODULE = 'Patient Account';
const TICKET_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const RM_RE = /^[A-Z0-9._/-]{3,64}$/;

type PatientWithContact = ServerPatientRecord & {
  email?: string;
  kontak_darurat?: { nama: string; hubungan: string; no_hp: string } | null;
};

function normalizeRm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase().slice(0, 64) : '';
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Buang karakter kontrol kecuali baris baru/tab.
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return text.length <= max ? text : undefined;
}

function randomTicket(nowMs: number): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const byte of bytes) suffix += TICKET_ALPHABET[byte % TICKET_ALPHABET.length];
  const d = new Date(nowMs).toISOString();
  return `ADU-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${suffix}`;
}

function maskName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 1 ? part : `${part[0]}${'*'.repeat(Math.min(part.length - 1, 6))}`))
    .join(' ');
}

function clientIp(req: express.Request): string {
  const header = (name: string) => {
    const value = req.headers[name];
    return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
  };
  if (process.env.CLOUDFLARE_WORKER) return header('cf-connecting-ip') || req.ip || 'unknown';
  if (process.env.VERCEL) return header('x-real-ip') || header('x-forwarded-for') || req.ip || 'unknown';
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function linkId(guardianRm: string, dependentRm: string): string {
  return `fl:${guardianRm}:${dependentRm}`.slice(0, 128);
}

// ── Registrasi rute ────────────────────────────────────────────────────────

export function registerPatientAccountRoutes(app: express.Express, deps: PatientAccountDeps): void {
  const { persistence, patientsStore, appointmentsStore } = deps;
  const now = deps.now ?? Date.now;
  const nowIso = () => new Date(now()).toISOString();

  function findPatient(rm: string): PatientWithContact | undefined {
    const target = normalizeRm(rm);
    return patientsStore.find((p) => normalizeRm(p.no_rm) === target) as PatientWithContact | undefined;
  }

  /** Log audit: buffer aplikasi (disimpan middleware saat 2xx) + tulis langsung saat respons gagal. */
  async function audit(entry: PatientAccountAuditEntry, durable = false): Promise<void> {
    try {
      deps.createAuditLog?.(entry);
      if (durable && persistence.mode !== 'memory') {
        const id = `pa-log-${now()}-${crypto.randomUUID().slice(0, 8)}`;
        await persistence.commit([{ entity: 'audit_logs', id, data: { id, timestamp: nowIso(), ...entry } }]);
      }
    } catch (error) {
      console.warn('[PatientAccount] audit log failed', error);
    }
  }

  interface AccountSession {
    /** Pasien yang datanya sedang diakses. */
    rm: string;
    /** Orang yang benar-benar login (wali saat beralih, atau pasien itu sendiri). */
    actorRm: string;
    acting: boolean;
    authMethod: 'otp' | 'google';
    token: string;
  }

  function requireSession(req: express.Request, res: express.Response): AccountSession | undefined {
    const session = resolvePatientSession(req);
    if (!session) {
      res.status(401).json({
        success: false,
        code: 'PATIENT_SESSION_REQUIRED',
        message: 'Sesi pasien tidak valid atau telah berakhir. Silakan masuk kembali.'
      });
      return undefined;
    }
    res.setHeader('Cache-Control', 'no-store');
    return {
      rm: session.no_rm,
      actorRm: session.actorRm || session.no_rm,
      acting: Boolean(session.actorRm),
      authMethod: session.authMethod,
      token: readPatientSessionTokenFromRequest(req)
    };
  }

  function auditUser(session: AccountSession): { user: string; role: string } {
    return session.acting
      ? { user: session.actorRm, role: 'wali pasien' }
      : { user: session.rm, role: 'pasien' };
  }

  function actingSuffix(session: AccountSession): string {
    return session.acting ? ` (oleh wali ${session.actorRm} atas nama ${session.rm})` : '';
  }

  const sendInternalError = (res: express.Response, error: unknown) => {
    console.error('[PatientAccount] unexpected error', error);
    return res.status(500).json({ success: false, code: 'PATIENT_ACCOUNT_ERROR', message: 'Terjadi kesalahan. Coba lagi.' });
  };

  // ── 1. Profil ────────────────────────────────────────────────────────────

  const profileView = (p: PatientWithContact) => ({
    no_rm: p.no_rm,
    nama: p.nama,
    tanggal_lahir: p.tanggal_lahir,
    jenis_kelamin: p.jenis_kelamin,
    penjamin: p.penjamin,
    no_hp: p.no_hp && p.no_hp !== '-' ? p.no_hp : '',
    alamat: p.alamat || '',
    email: p.email || '',
    kontak_darurat: p.kontak_darurat || null,
    editable_fields: ['alamat', 'email', 'kontak_darurat'],
    no_hp_editable: false,
    no_hp_note: 'Nomor HP dipakai untuk kode verifikasi. Untuk mengubahnya, datang ke loket pendaftaran dengan identitas.'
  });

  app.get('/api/patient/profile', (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const patient = findPatient(session.rm);
    if (!patient) return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND', message: 'Data pasien tidak ditemukan.' });
    return res.json({ success: true, profile: profileView(patient), acting_as_guardian: session.acting });
  });

  app.patch('/api/patient/profile', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    const patient = findPatient(session.rm);
    if (!patient) return res.status(404).json({ success: false, code: 'PATIENT_NOT_FOUND', message: 'Data pasien tidak ditemukan.' });
    const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body as Record<string, unknown> : {};
    const keys = Object.keys(body);
    if ('no_hp' in body) {
      return res.status(400).json({
        success: false,
        code: 'NO_HP_READ_ONLY',
        message: 'Nomor HP tidak dapat diubah dari aplikasi. Silakan ubah di loket pendaftaran.'
      });
    }
    const allowed = new Set(['alamat', 'email', 'kontak_darurat']);
    if (!keys.length || keys.some((k) => !allowed.has(k))) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_PROFILE_UPDATE',
        message: 'Hanya alamat, email, dan kontak darurat yang dapat diubah.'
      });
    }
    const updates: Partial<PatientWithContact> = {};
    const invalid = (field: string, message: string) =>
      res.status(422).json({ success: false, code: 'INVALID_PROFILE_FIELD', field, message });

    if ('alamat' in body) {
      const alamat = cleanText(body.alamat, 500);
      if (!alamat || alamat.length < 5) return invalid('alamat', 'Alamat minimal 5 karakter dan maksimal 500 karakter.');
      updates.alamat = alamat;
    }
    if ('email' in body) {
      const email = cleanText(body.email, 254);
      if (email === undefined || (email && !EMAIL_RE.test(email))) return invalid('email', 'Format email tidak valid.');
      updates.email = email.toLowerCase();
    }
    if ('kontak_darurat' in body) {
      const raw = body.kontak_darurat;
      if (raw === null) {
        updates.kontak_darurat = null;
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const kd = raw as Record<string, unknown>;
        const extra = Object.keys(kd).filter((k) => !['nama', 'hubungan', 'no_hp'].includes(k));
        const nama = cleanText(kd.nama, 120);
        const hubungan = cleanText(kd.hubungan, 40);
        const phone = normalizeIndonesianPhone(kd.no_hp);
        if (extra.length) return invalid('kontak_darurat', 'Kontak darurat hanya berisi nama, hubungan, dan nomor HP.');
        if (!nama || nama.length < 2) return invalid('kontak_darurat.nama', 'Nama kontak darurat wajib diisi.');
        if (!hubungan) return invalid('kontak_darurat.hubungan', 'Hubungan kontak darurat wajib diisi.');
        if (!phone) return invalid('kontak_darurat.no_hp', 'Nomor HP kontak darurat tidak valid (format Indonesia).');
        updates.kontak_darurat = { nama, hubungan, no_hp: `0${phone.slice(2)}` };
      } else {
        return invalid('kontak_darurat', 'Kontak darurat tidak valid.');
      }
    }

    const changed = Object.keys(updates);
    Object.assign(patient, updates);
    await audit({
      ...auditUser(session),
      action: 'PATIENT_PROFILE_UPDATE',
      module: MODULE,
      ip: clientIp(req),
      status: 'SUCCESS',
      details: `Pasien ${session.rm} memperbarui kontak: ${changed.join(', ')}${actingSuffix(session)}.`
    });
    return res.json({ success: true, profile: profileView(patient) });
  });

  // ── 2. Akun keluarga ─────────────────────────────────────────────────────

  async function listLinkRecords(): Promise<Array<FamilyLinkRecord | FamilyLinkRequestRecord>> {
    return (await persistence.list<FamilyLinkRecord | FamilyLinkRequestRecord>('patient_family_links')).map((r) => r.data);
  }

  async function activeLinks(): Promise<FamilyLinkRecord[]> {
    return (await listLinkRecords()).filter((r): r is FamilyLinkRecord => r.kind === 'link' && r.status === 'active');
  }

  async function findActiveLink(guardianRm: string, dependentRm: string): Promise<FamilyLinkRecord | undefined> {
    const record = await persistence.get<FamilyLinkRecord>('patient_family_links', linkId(guardianRm, dependentRm));
    return record && record.kind === 'link' && record.status === 'active' ? record : undefined;
  }

  function buildFamilyOtp(auditBuffer: OtpAuditEntry[]): OtpLoginService | null {
    const sender = resolveOtpSender();
    const secret = resolveOtpSecret();
    if (!sender || !secret) return null;
    return new OtpLoginService({
      store: new PersistenceOtpStore(persistence, now),
      sender,
      // Rahasia turunan: permintaan OTP tautan keluarga tidak bisa dipakai di endpoint login, dan sebaliknya.
      secret: `${secret}:family-link`,
      patients: {
        findByRm: (rm) => {
          const p = findPatient(rm);
          return p ? { no_rm: normalizeRm(p.no_rm), no_hp: p.no_hp } : undefined;
        },
        findByPhone: () => []
      },
      audit: (entry) => {
        auditBuffer.push(entry);
      },
      now
    });
  }

  async function flushOtpAudit(buffer: OtpAuditEntry[], session: AccountSession, durable: boolean): Promise<void> {
    for (const entry of buffer.splice(0)) {
      await audit({
        user: session.rm,
        role: 'pasien',
        action: entry.action === 'OTP_REQUEST' ? 'FAMILY_LINK_OTP_REQUEST' : 'FAMILY_LINK_OTP_VERIFY',
        module: MODULE,
        ip: entry.ip,
        status: entry.status,
        details: `Tautan keluarga: ${entry.details.replace('Login pasien berhasil dengan OTP WhatsApp.', 'OTP tanggungan cocok.')}`
      }, durable);
    }
  }

  const FAMILY_UNAVAILABLE = {
    success: false,
    code: 'FAMILY_LINK_UNAVAILABLE',
    message: 'Penautan akun keluarga belum tersedia. Silakan hubungi loket pendaftaran.'
  } as const;
  const ACTOR_FORBIDDEN = {
    success: false,
    code: 'FAMILY_MANAGE_AS_SELF',
    message: 'Kembali ke akun Anda sendiri untuk mengelola anggota keluarga.'
  } as const;

  app.get('/api/patient/family', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const links = await activeLinks();
      const owner = findPatient(session.actorRm);
      const dependents = links
        .filter((l) => l.guardian_rm === session.actorRm)
        .map((l) => {
          const p = findPatient(l.dependent_rm);
          return p ? { no_rm: p.no_rm, nama: p.nama, hubungan: l.hubungan, linked_at: l.created_at } : null;
        })
        .filter(Boolean);
      // Wali yang dapat mengakses akun ini (nama disamarkan); hanya ditampilkan ke pemilik akun sendiri.
      const guardians = session.acting
        ? []
        : links
            .filter((l) => l.dependent_rm === session.rm)
            .map((l) => {
              const p = findPatient(l.guardian_rm);
              return p ? { no_rm: p.no_rm, nama: maskName(p.nama), hubungan: l.hubungan, linked_at: l.created_at } : null;
            })
            .filter(Boolean);
      const current = findPatient(session.rm);
      return res.json({
        success: true,
        owner: owner ? { no_rm: owner.no_rm, nama: owner.nama } : { no_rm: session.actorRm, nama: '' },
        acting_as: session.acting && current ? { no_rm: current.no_rm, nama: current.nama } : null,
        can_manage: !session.acting,
        max_dependents: MAX_ACTIVE_DEPENDENTS,
        dependents,
        guardians
      });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  app.post('/api/patient/family/link/request', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (session.acting) return res.status(403).json(ACTOR_FORBIDDEN);
    try {
      const dependentRm = normalizeRm(req.body?.no_rm);
      const hubungan = req.body?.hubungan as FamilyRelation;
      if (!RM_RE.test(dependentRm) || !FAMILY_RELATIONS.includes(hubungan)) {
        return res.status(400).json({
          success: false,
          code: 'FAMILY_INVALID_INPUT',
          message: 'Masukkan No. RM anggota keluarga dan pilih hubungan.'
        });
      }
      if (dependentRm === session.rm) {
        return res.status(400).json({ success: false, code: 'FAMILY_SELF_LINK', message: 'Tidak dapat menautkan akun Anda sendiri.' });
      }
      const records = await listLinkRecords();
      const nowMs = now();
      const active = records.filter((r) => r.kind === 'link' && r.status === 'active' && r.guardian_rm === session.rm);
      if (active.some((r) => r.dependent_rm === dependentRm)) {
        return res.status(409).json({ success: false, code: 'FAMILY_ALREADY_LINKED', message: 'Anggota keluarga ini sudah tertaut.' });
      }
      if (active.length >= MAX_ACTIVE_DEPENDENTS) {
        return res.status(409).json({
          success: false,
          code: 'FAMILY_LIMIT_REACHED',
          message: `Maksimal ${MAX_ACTIVE_DEPENDENTS} anggota keluarga per akun.`
        });
      }
      const recentRequests = records.filter((r): r is FamilyLinkRequestRecord =>
        r.kind === 'request' && r.guardian_rm === session.rm && nowMs - Date.parse(r.created_at) < DAY_MS
      );
      if (recentRequests.length >= MAX_LINK_REQUESTS_PER_DAY) {
        await audit({
          user: session.rm, role: 'pasien', action: 'FAMILY_LINK_REQUEST', module: MODULE, ip: clientIp(req),
          status: 'WARNING', details: 'Permintaan tautan keluarga ditolak: batas harian terlampaui.'
        }, true);
        res.setHeader('Retry-After', String(Math.ceil(DAY_MS / 1000)));
        return res.status(429).json({
          success: false,
          code: 'FAMILY_RATE_LIMITED',
          message: 'Terlalu banyak permintaan penautan hari ini. Coba lagi besok.'
        });
      }

      const buffer: OtpAuditEntry[] = [];
      const otp = buildFamilyOtp(buffer);
      if (!otp) return res.status(503).json(FAMILY_UNAVAILABLE);
      const result = await otp.requestOtp({ no_rm: dependentRm, ip: clientIp(req) });
      await flushOtpAudit(buffer, session, result.kind !== 'accepted');
      if (result.kind === 'rate_limited') {
        res.setHeader('Retry-After', String(result.retryAfterSec));
        return res.status(429).json({
          success: false, code: 'FAMILY_RATE_LIMITED', retry_after: result.retryAfterSec,
          message: 'Terlalu banyak permintaan kode. Coba lagi nanti.'
        });
      }
      if (result.kind === 'delivery_failed') {
        return res.status(502).json({ success: false, code: 'OTP_DELIVERY_FAILED', message: 'Kode belum dapat dikirim. Coba beberapa saat lagi.' });
      }
      if (result.kind === 'invalid_input') {
        return res.status(400).json({ success: false, code: 'FAMILY_INVALID_INPUT', message: 'No. RM tidak valid.' });
      }
      // Catatan permintaan disimpan juga untuk No. RM yang tidak dikenal (respons identik, verifikasi pasti gagal).
      const request: FamilyLinkRequestRecord = {
        id: `flr-${crypto.randomUUID().replace(/-/g, '')}`,
        kind: 'request',
        guardian_rm: session.rm,
        dependent_rm: dependentRm,
        hubungan,
        otp_request_id: result.requestId,
        status: 'pending',
        created_at: new Date(nowMs).toISOString(),
        expires_at: new Date(nowMs + LINK_REQUEST_TTL_MS).toISOString()
      };
      // Bersihkan permintaan lama (>24 jam) milik wali ini secara oportunistis.
      const stale = records.filter((r) => r.kind === 'request' && r.guardian_rm === session.rm && nowMs - Date.parse(r.created_at) >= DAY_MS);
      await persistence.commit([
        { entity: 'patient_family_links', id: request.id, data: request },
        ...stale.map((r) => ({ entity: 'patient_family_links' as const, id: r.id, data: null }))
      ]);
      await audit({
        user: session.rm, role: 'pasien', action: 'FAMILY_LINK_REQUEST', module: MODULE, ip: clientIp(req),
        status: 'SUCCESS', details: `Permintaan tautan keluarga (${hubungan}) ke No. RM ${dependentRm}; OTP ke nomor terdaftar tanggungan.`
      });
      return res.json({
        success: true,
        request_id: request.id,
        masked_phone: result.maskedPhone,
        expires_in: result.expiresInSec,
        message: 'Jika No. RM terdaftar, kode verifikasi dikirim via WhatsApp ke nomor HP yang terdaftar atas nama anggota keluarga tersebut.'
      });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  app.post('/api/patient/family/link/verify', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (session.acting) return res.status(403).json(ACTOR_FORBIDDEN);
    try {
      const requestId = typeof req.body?.request_id === 'string' ? req.body.request_id.trim() : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      if (!/^flr-[a-f0-9]{32}$/.test(requestId) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, code: 'FAMILY_INVALID_INPUT', message: 'Masukkan 6 digit kode verifikasi.' });
      }
      const pending = await persistence.get<FamilyLinkRequestRecord>('patient_family_links', requestId);
      // Permintaan harus milik wali yang sedang login: kode tidak dapat dipakai oleh akun lain.
      if (!pending || pending.kind !== 'request' || pending.guardian_rm !== session.rm ||
          pending.status !== 'pending' || Date.parse(pending.expires_at) <= now()) {
        await audit({
          user: session.rm, role: 'pasien', action: 'FAMILY_LINK_VERIFY', module: MODULE, ip: clientIp(req),
          status: 'FAILED', details: 'Verifikasi tautan keluarga gagal: permintaan tidak ada, bukan milik akun ini, atau kedaluwarsa.'
        }, true);
        return res.status(400).json({ success: false, code: 'FAMILY_REQUEST_EXPIRED', message: 'Permintaan sudah tidak berlaku. Minta kode baru.' });
      }
      const buffer: OtpAuditEntry[] = [];
      const otp = buildFamilyOtp(buffer);
      if (!otp) return res.status(503).json(FAMILY_UNAVAILABLE);
      const result = await otp.verifyOtp({ request_id: pending.otp_request_id, code, ip: clientIp(req) });
      const verified = result.kind === 'ok' && result.no_rm === pending.dependent_rm && Boolean(findPatient(pending.dependent_rm));
      await flushOtpAudit(buffer, session, !verified);

      if (!verified) {
        if (result.kind === 'locked' || result.kind === 'invalid_or_expired' || result.kind === 'ok') {
          await persistence.commit([{ entity: 'patient_family_links', id: pending.id, data: { ...pending, status: 'failed' } }]);
        }
        if (result.kind === 'rate_limited') {
          res.setHeader('Retry-After', String(result.retryAfterSec));
          return res.status(429).json({ success: false, code: 'FAMILY_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi nanti.' });
        }
        if (result.kind === 'wrong_code') {
          return res.status(400).json({
            success: false, code: 'OTP_INVALID', attempts_remaining: result.attemptsRemaining,
            message: `Kode salah. Sisa ${result.attemptsRemaining} percobaan.`
          });
        }
        if (result.kind === 'locked') {
          return res.status(429).json({ success: false, code: 'OTP_LOCKED', message: 'Terlalu banyak kode salah. Minta kode baru.' });
        }
        return res.status(400).json({ success: false, code: 'FAMILY_REQUEST_EXPIRED', message: 'Kode sudah tidak berlaku. Minta kode baru.' });
      }

      const ts = nowIso();
      const existing = await persistence.get<FamilyLinkRecord>('patient_family_links', linkId(session.rm, pending.dependent_rm));
      const link: FamilyLinkRecord = {
        id: linkId(session.rm, pending.dependent_rm),
        kind: 'link',
        guardian_rm: session.rm,
        dependent_rm: pending.dependent_rm,
        hubungan: pending.hubungan,
        status: 'active',
        verified_by: 'otp',
        created_at: existing?.status === 'active' ? existing.created_at : ts,
        updated_at: ts
      };
      await persistence.commit([
        { entity: 'patient_family_links', id: link.id, data: link },
        { entity: 'patient_family_links', id: pending.id, data: { ...pending, status: 'verified' } }
      ]);
      await audit({
        user: session.rm, role: 'pasien', action: 'FAMILY_LINK_VERIFIED', module: MODULE, ip: clientIp(req),
        status: 'SUCCESS', details: `Akun keluarga tertaut: wali ${session.rm} -> tanggungan ${link.dependent_rm} (${link.hubungan}), diverifikasi OTP ke nomor terdaftar tanggungan.`
      });
      const dependent = findPatient(link.dependent_rm)!;
      return res.status(201).json({
        success: true,
        dependent: { no_rm: dependent.no_rm, nama: dependent.nama, hubungan: link.hubungan, linked_at: link.created_at }
      });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  app.delete('/api/patient/family/:rm', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    if (session.acting) return res.status(403).json(ACTOR_FORBIDDEN);
    try {
      const otherRm = normalizeRm(req.params.rm);
      // Wali melepas tanggungan, atau pasien mencabut akses wali atas akunnya sendiri.
      const asGuardian = await findActiveLink(session.rm, otherRm);
      const asDependent = asGuardian ? undefined : await findActiveLink(otherRm, session.rm);
      const link = asGuardian || asDependent;
      if (!link) return res.status(404).json({ success: false, code: 'FAMILY_LINK_NOT_FOUND', message: 'Tautan keluarga tidak ditemukan.' });
      const ts = nowIso();
      await persistence.commit([{
        entity: 'patient_family_links',
        id: link.id,
        data: { ...link, status: 'revoked', revoked_at: ts, revoked_by: session.rm, updated_at: ts }
      }]);
      await audit({
        user: session.rm, role: 'pasien', action: 'FAMILY_LINK_REVOKED', module: MODULE, ip: clientIp(req),
        status: 'SUCCESS',
        details: asGuardian
          ? `Wali ${session.rm} melepas tanggungan ${otherRm}.`
          : `Pasien ${session.rm} mencabut akses wali ${otherRm}.`
      });
      return res.json({ success: true });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  const setSessionCookie = (res: express.Response, token: string, maxAgeSeconds: number) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${PATIENT_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`
    );
  };

  app.post('/api/patient/family/switch/:rm', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const targetRm = normalizeRm(req.params.rm);
      const ip = clientIp(req);
      let token: string;
      if (targetRm === session.actorRm) {
        // Kembali ke akun wali sendiri.
        token = issuePatientSession(session.actorRm, session.authMethod);
        setSessionCookie(res, token, 12 * 60 * 60);
      } else {
        const link = await findActiveLink(session.actorRm, targetRm);
        if (!link || !findPatient(targetRm)) {
          await audit({
            user: session.actorRm, role: 'pasien', action: 'FAMILY_SWITCH', module: MODULE, ip,
            status: 'FAILED', details: `Peralihan ke akun ${targetRm} ditolak: tidak ada tautan keluarga aktif.`
          }, true);
          return res.status(403).json({ success: false, code: 'FAMILY_LINK_REQUIRED', message: 'Akun ini tidak tertaut dengan akun Anda.' });
        }
        token = issuePatientSession(targetRm, session.authMethod, undefined, { actorRm: session.actorRm });
        setSessionCookie(res, token, 60 * 60);
      }
      revokePatientSessionToken(session.token);
      await audit({
        user: session.actorRm,
        role: targetRm === session.actorRm ? 'pasien' : 'wali pasien',
        action: 'FAMILY_SWITCH',
        module: MODULE,
        ip,
        status: 'SUCCESS',
        details: targetRm === session.actorRm
          ? `Wali ${session.actorRm} kembali ke akunnya sendiri dari akun ${session.rm}.`
          : `Wali ${session.actorRm} beralih ke akun tanggungan ${targetRm} (actor=${session.actorRm}).`
      });
      const target = findPatient(targetRm);
      return res.json({
        success: true,
        token,
        acting_as_guardian: targetRm !== session.actorRm,
        patient: target ? { no_rm: target.no_rm, nama: target.nama } : null
      });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  // ── 3. Penilaian & pengaduan ─────────────────────────────────────────────

  const feedbackView = (f: FeedbackRecord) => ({
    id: f.id,
    appointment_id: f.appointment_id || null,
    rating: f.rating,
    komentar: f.komentar || '',
    kategori: f.kategori,
    poli: f.poli || null,
    dokter: f.dokter || null,
    created_at: f.created_at
  });

  app.get('/api/patient/feedback', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const own = (await persistence.list<FeedbackRecord>('patient_feedback'))
        .map((r) => r.data)
        .filter((f) => f.patient_rm === session.rm)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const rated = new Set(own.map((f) => f.appointment_id).filter(Boolean));
      // Kunjungan selesai yang belum dinilai (untuk ajakan menilai di aplikasi).
      const pending = appointmentsStore
        .filter((a) => normalizeRm(a.no_rm) === session.rm && a.status === 'Selesai' && !rated.has(a.id))
        .sort((a, b) => (b.tanggal + b.created_at).localeCompare(a.tanggal + a.created_at))
        .slice(0, 5)
        .map((a) => ({ appointment_id: a.id, poli: a.poli, dokter: a.dokter, tanggal: a.tanggal }));
      return res.json({ success: true, feedback: own.map(feedbackView), pending_visits: pending });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  app.post('/api/patient/feedback', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const rating = body.rating;
      const kategori = body.kategori as string;
      const komentar = body.komentar === undefined || body.komentar === null ? '' : cleanText(body.komentar, 1000);
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(422).json({ success: false, code: 'INVALID_RATING', message: 'Nilai harus 1 sampai 5.' });
      }
      if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(kategori)) {
        return res.status(422).json({ success: false, code: 'INVALID_CATEGORY', message: 'Kategori penilaian tidak valid.' });
      }
      if (komentar === undefined) {
        return res.status(422).json({ success: false, code: 'INVALID_COMMENT', message: 'Komentar maksimal 1000 karakter.' });
      }
      const appointmentId = body.appointment_id === undefined || body.appointment_id === null || body.appointment_id === ''
        ? undefined
        : typeof body.appointment_id === 'string' ? body.appointment_id.slice(0, 128) : null;
      if (appointmentId === null) {
        return res.status(422).json({ success: false, code: 'INVALID_APPOINTMENT', message: 'Kunjungan tidak valid.' });
      }
      let appointment: ServerAppointmentRecord | undefined;
      if (appointmentId) {
        appointment = appointmentsStore.find((a) => a.id === appointmentId && normalizeRm(a.no_rm) === session.rm);
        // Kunjungan pasien lain diperlakukan sama dengan kunjungan yang tidak ada.
        if (!appointment) return res.status(404).json({ success: false, code: 'VISIT_NOT_FOUND', message: 'Kunjungan tidak ditemukan.' });
        if (appointment.status !== 'Selesai') {
          return res.status(409).json({ success: false, code: 'VISIT_NOT_COMPLETED', message: 'Penilaian hanya untuk kunjungan yang sudah selesai.' });
        }
      }
      const all = (await persistence.list<FeedbackRecord>('patient_feedback')).map((r) => r.data);
      const own = all.filter((f) => f.patient_rm === session.rm);
      if (appointmentId && own.some((f) => f.appointment_id === appointmentId)) {
        return res.status(409).json({ success: false, code: 'FEEDBACK_EXISTS', message: 'Kunjungan ini sudah Anda nilai.' });
      }
      const nowMs = now();
      if (own.filter((f) => nowMs - Date.parse(f.created_at) < DAY_MS).length >= MAX_FEEDBACK_PER_DAY) {
        res.setHeader('Retry-After', String(Math.ceil(DAY_MS / 1000)));
        return res.status(429).json({ success: false, code: 'FEEDBACK_RATE_LIMITED', message: 'Batas penilaian harian tercapai. Coba lagi besok.' });
      }
      const record: FeedbackRecord = {
        id: `fb-${crypto.randomUUID().replace(/-/g, '')}`,
        patient_rm: session.rm,
        ...(session.acting ? { actor_rm: session.actorRm } : {}),
        ...(appointment ? { appointment_id: appointment.id, poli: appointment.poli, dokter: appointment.dokter } : {}),
        rating,
        ...(komentar ? { komentar } : {}),
        kategori,
        created_at: new Date(nowMs).toISOString()
      };
      await persistence.commit([{ entity: 'patient_feedback', id: record.id, data: record }]);
      await audit({
        ...auditUser(session), action: 'PATIENT_FEEDBACK_CREATE', module: MODULE, ip: clientIp(req), status: 'SUCCESS',
        details: `Penilaian ${rating}/5 (${kategori})${appointment ? ` untuk kunjungan ${appointment.id}` : ''}${actingSuffix(session)}.`
      });
      return res.status(201).json({ success: true, feedback: feedbackView(record) });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  const complaintPatientView = (c: ComplaintRecord) => ({
    id: c.id,
    ticket_no: c.ticket_no,
    kategori: c.kategori,
    isi: c.isi,
    kontak_balik: c.kontak_balik || '',
    status: c.status,
    tanggapan: c.tanggapan || '',
    history: c.history.map(({ at, status }) => ({ at, status })),
    created_at: c.created_at,
    updated_at: c.updated_at
  });

  app.get('/api/patient/complaints', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const own = (await persistence.list<ComplaintRecord>('patient_complaints'))
        .map((r) => r.data)
        .filter((c) => c.patient_rm === session.rm)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return res.json({ success: true, complaints: own.map(complaintPatientView) });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  app.post('/api/patient/complaints', async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const kategori = body.kategori as string;
      const isi = cleanText(body.isi, 2000);
      const kontak = body.kontak_balik === undefined || body.kontak_balik === null ? '' : cleanText(body.kontak_balik, 160);
      if (!(COMPLAINT_CATEGORIES as readonly string[]).includes(kategori)) {
        return res.status(422).json({ success: false, code: 'INVALID_CATEGORY', message: 'Kategori pengaduan tidak valid.' });
      }
      if (!isi || isi.length < 10) {
        return res.status(422).json({ success: false, code: 'INVALID_CONTENT', message: 'Isi pengaduan 10 sampai 2000 karakter.' });
      }
      if (kontak === undefined) {
        return res.status(422).json({ success: false, code: 'INVALID_CONTACT', message: 'Kontak balik maksimal 160 karakter.' });
      }
      const all = (await persistence.list<ComplaintRecord>('patient_complaints')).map((r) => r.data);
      const nowMs = now();
      if (all.filter((c) => c.patient_rm === session.rm && nowMs - Date.parse(c.created_at) < DAY_MS).length >= MAX_COMPLAINTS_PER_DAY) {
        res.setHeader('Retry-After', String(Math.ceil(DAY_MS / 1000)));
        return res.status(429).json({ success: false, code: 'COMPLAINT_RATE_LIMITED', message: 'Batas pengaduan harian tercapai. Hubungi kami lewat telepon bila mendesak.' });
      }
      const tickets = new Set(all.map((c) => c.ticket_no));
      let ticket = randomTicket(nowMs);
      while (tickets.has(ticket)) ticket = randomTicket(nowMs);
      const ts = new Date(nowMs).toISOString();
      const record: ComplaintRecord = {
        id: `cmp-${crypto.randomUUID().replace(/-/g, '')}`,
        ticket_no: ticket,
        patient_rm: session.rm,
        ...(session.acting ? { actor_rm: session.actorRm } : {}),
        kategori,
        isi,
        ...(kontak ? { kontak_balik: kontak } : {}),
        status: 'Diterima',
        history: [{ at: ts, by: session.actorRm, status: 'Diterima' }],
        created_at: ts,
        updated_at: ts
      };
      await persistence.commit([{ entity: 'patient_complaints', id: record.id, data: record }]);
      await audit({
        ...auditUser(session), action: 'PATIENT_COMPLAINT_CREATE', module: MODULE, ip: clientIp(req), status: 'SUCCESS',
        details: `Pengaduan ${ticket} (${kategori}) dibuat${actingSuffix(session)}.`
      });
      return res.status(201).json({ success: true, ticket_no: ticket, complaint: complaintPatientView(record) });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  // ── 4. Endpoint petugas (aplikasi inti; coreAuth scope 'mutu') ──────────

  const staff = deps.staffApp;
  if (!staff) return;

  const staffName = (req: express.Request) => {
    const principal = (req as express.Request & { corePrincipal?: { email?: string; uid?: string; roleId?: string } }).corePrincipal;
    return { user: principal?.email || principal?.uid || 'petugas', role: principal?.roleId || 'staf' };
  };

  staff.get('/api/v1/patient-feedback', async (req, res) => {
    try {
      const list = (await persistence.list<FeedbackRecord>('patient_feedback'))
        .map((r) => r.data)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const total = list.length;
      const average = total ? Math.round((list.reduce((s, f) => s + f.rating, 0) / total) * 100) / 100 : null;
      const distribution = [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: list.filter((f) => f.rating === r).length }));
      const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || '200'), 10) || 200));
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        success: true,
        summary: { total, average, distribution },
        data: list.slice(0, limit).map((f) => ({ ...feedbackView(f), patient_rm: f.patient_rm, actor_rm: f.actor_rm || null }))
      });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  staff.get('/api/v1/patient-complaints', async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : '';
      const list = (await persistence.list<ComplaintRecord>('patient_complaints'))
        .map((r) => r.data)
        .filter((c) => !status || c.status === status)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((c) => ({ ...c, pasien_nama: findPatient(c.patient_rm)?.nama || null }));
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, total: list.length, data: list });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });

  staff.patch('/api/v1/patient-complaints/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').slice(0, 128);
      const current = id ? await persistence.get<ComplaintRecord>('patient_complaints', id) : null;
      if (!current) return res.status(404).json({ success: false, code: 'COMPLAINT_NOT_FOUND' });
      const body = (req.body || {}) as Record<string, unknown>;
      const keys = Object.keys(body);
      if (!keys.length || keys.some((k) => !['status', 'tanggapan', 'catatan_internal'].includes(k))) {
        return res.status(400).json({ success: false, code: 'INVALID_COMPLAINT_UPDATE' });
      }
      const next: ComplaintRecord = { ...current, history: [...current.history] };
      if ('status' in body) {
        if (!(COMPLAINT_STATUSES as readonly string[]).includes(body.status as string)) {
          return res.status(422).json({ success: false, code: 'INVALID_COMPLAINT_FIELD', field: 'status' });
        }
        next.status = body.status as ComplaintStatus;
      }
      if ('tanggapan' in body) {
        const text = cleanText(body.tanggapan, 2000);
        if (text === undefined) return res.status(422).json({ success: false, code: 'INVALID_COMPLAINT_FIELD', field: 'tanggapan' });
        next.tanggapan = text;
      }
      if ('catatan_internal' in body) {
        const text = cleanText(body.catatan_internal, 2000);
        if (text === undefined) return res.status(422).json({ success: false, code: 'INVALID_COMPLAINT_FIELD', field: 'catatan_internal' });
        next.catatan_internal = text;
      }
      const who = staffName(req);
      const ts = nowIso();
      next.updated_at = ts;
      next.history.push({ at: ts, by: who.user, status: next.status, ...('tanggapan' in body ? { note: 'tanggapan diperbarui' } : {}) });
      await persistence.commit([{ entity: 'patient_complaints', id: next.id, data: next }]);
      await audit({
        ...who, action: 'PATIENT_COMPLAINT_UPDATE', module: 'Mutu', ip: req.ip || 'unknown', status: 'SUCCESS',
        details: `Pengaduan ${next.ticket_no}: status ${current.status} -> ${next.status}.`
      });
      return res.json({ success: true, data: next });
    } catch (error) {
      return sendInternalError(res, error);
    }
  });
}
