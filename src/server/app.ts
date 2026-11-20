import express from 'express';
import { randomUUID } from 'node:crypto';
import { firebaseVerifier, HttpError, requireRole, ADMIN_ROLES, STAFF_ROLES, CLINICAL_ROLES, type Identity } from './security';
import { FirestoreRepository, type Repository, type RecordData } from './firestoreRepository';
import { authenticate } from './middleware';
export interface AppOptions { verify?: (token: string) => Promise<Identity>; repository?: (token: string) => Repository; origin?: string; rateLimit?: number; }
function rateLimit(max: number): express.RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const key = req.ip || 'unknown', now = Date.now();
    if (buckets.size > 10000) for (const [ip, bucket] of buckets) if (bucket.until < now) buckets.delete(ip);
    if (!buckets.has(key) && buckets.size >= 10000) return res.status(429).json({ error: 'Batas kapasitas permintaan tercapai.' });
    let bucket = buckets.get(key);
    if (!bucket || bucket.until < now) { bucket = { count: 0, until: now + 60000 }; buckets.set(key, bucket); }
    if (++bucket.count > max) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Terlalu banyak permintaan.' }); }
    next();
  };
}
const route = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler => (req, res, next) => { Promise.resolve().then(() => fn(req, res)).catch(next); };
function patientInput(body: any): RecordData {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Data pasien tidak valid.');
  const allowed = ['nama', 'no_rm', 'nik', 'tanggal_lahir', 'tgl_lahir', 'jenis_kelamin', 'alamat', 'telepon', 'no_hp', 'golongan_darah', 'penjamin', 'status'];
  const data: RecordData = {};
  for (const field of allowed) if (body[field] !== undefined) {
    if (typeof body[field] !== 'string' || body[field].length > 500) throw new HttpError(400, `Field ${field} tidak valid.`);
    data[field] = body[field].trim();
  }
  if (!data.nama || !data.no_rm || data.nama.length > 160 || data.no_rm.length > 40 || (data.nik && !/^\d{16}$/.test(data.nik))) throw new HttpError(400, 'Nama, No. RM, atau NIK tidak valid.');
  return data;
}
export function createApp(options: AppOptions = {}) {
  const app = express(); app.disable('x-powered-by');
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(proxyHops) && proxyHops > 0 && proxyHops <= 2) app.set('trust proxy', proxyHops);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next();
  });
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit(options.rateLimit ?? 90));
  app.use(express.json({ limit: '256kb', strict: true }));
  const origin = options.origin ?? process.env.MAIN_APP_ORIGIN;
  app.use('/api', (req, res, next) => { if (req.headers.origin && origin && req.headers.origin !== origin) return res.status(403).json({ error: 'Origin tidak diizinkan.' }); next(); });
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', service: 'myitaru-main' }));
  app.use('/api', authenticate(options.verify || firebaseVerifier(), options.repository || (token => new FirestoreRepository(token)), [...STAFF_ROLES, 'patient', 'viewer']));
  app.get('/api/auth/me', (_req, res) => {
    const p = res.locals.profile, identity = res.locals.identity as Identity;
    res.json({ success: true, user: { id: identity.uid, username: p.username || identity.email, nama: p.nama || identity.email, email: identity.email, photoURL: p.photoURL || '', roleId: p.roleId, aktif: true, dibuatPada: p.dibuatPada || '', isGoogleAuth: false } });
  });
  app.get('/api/v1/patients', route(async (req, res) => {
    requireRole(res.locals.profile.roleId, STAFF_ROLES);
    const result = await (res.locals.store as Repository).list('pasien', typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined);
    res.json({ success: true, data: result.documents, nextPageToken: result.nextPageToken || null });
  }));
  app.get('/api/v1/patients/:id', route(async (req, res) => {
    requireRole(res.locals.profile.roleId, STAFF_ROLES);
    const patient = await (res.locals.store as Repository).get('pasien', req.params.id);
    if (!patient) throw new HttpError(404, 'Pasien tidak ditemukan.');
    res.json({ success: true, data: patient });
  }));
  app.post('/api/v1/patients', route(async (req, res) => {
    requireRole(res.locals.profile.roleId, [...ADMIN_ROLES, 'pendaftaran', ...CLINICAL_ROLES]);
    const saved = await (res.locals.store as Repository).put('pasien', randomUUID(), patientInput(req.body));
    res.status(201).json({ success: true, data: saved });
  }));
  app.get('/api/v1/appointments', route(async (req, res) => {
    requireRole(res.locals.profile.roleId, STAFF_ROLES);
    const result = await (res.locals.store as Repository).list('kunjungan', typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined);
    res.json({ success: true, data: result.documents, nextPageToken: result.nextPageToken || null });
  }));
  app.get('/api/patient/dossier', route(async (_req, res) => {
    const p = res.locals.profile;
    if (typeof p.no_rm !== 'string' || !p.no_rm) throw new HttpError(403, 'Hubungan akun dengan pasien belum ditetapkan administrator.');
    const store = res.locals.store as Repository, patients = await store.query('pasien', 'no_rm', p.no_rm);
    if (!patients.length) throw new HttpError(404, 'Data pasien belum tersedia.');
    res.json({ success: true, dossier: { patient: patients[0], visits: await store.query('kunjungan', 'no_rm', p.no_rm) } });
  }));
  app.post(['/api/patient/verify', '/api/patient/google-session', '/api/gateway/auth/login', '/api/gateway/auth/verify-mfa'], (_req, res) => res.status(410).json({ success: false, error: 'Login demo dihentikan. Gunakan Firebase Authentication.' }));
  app.use('/api/ai', (_req, res) => { requireRole(res.locals.profile.roleId, CLINICAL_ROLES); res.status(501).json({ success: false, configured: false, error: 'AI klinis dinonaktifkan sampai validasi klinis dan kebijakan pemrosesan data disetujui. Tidak ada hasil fallback simulasi.' }); });
  app.use('/api/v1/backup', (_req, res) => { requireRole(res.locals.profile.roleId, ADMIN_ROLES); res.status(501).json({ success: false, configured: false, error: 'Backup belum dikonfigurasi. Tidak ada snapshot yang dibuat.' }); });
  app.use(['/api/v1/bpjs', '/api/v1/satusehat', '/api/v1/billing/qris', '/api/gateway'], (_req, res) => res.status(501).json({ success: false, configured: false, error: 'Integrasi belum diaktifkan; tidak ada transaksi eksternal yang dijalankan.' }));
  app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'Endpoint tidak tersedia.' }));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof HttpError ? error.status : error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ success: false, error: error instanceof HttpError ? error.message : status === 400 ? 'JSON tidak valid.' : status === 413 ? 'Payload terlalu besar.' : 'Permintaan gagal.' });
  });
  return app;
}
