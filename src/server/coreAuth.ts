// Staff authentication on core D1: password login (PBKDF2), TOTP MFA, cookie sessions, admin user management.
// Uses globalThis.crypto.subtle only, so it runs in Node and Workers alike.
import type express from 'express';
import type { D1Database } from './db';

export const ADMIN_ROLES = ['super_admin', 'admin'];
// isClinicalOrAdmin() in firestore.rules: every role except viewer.
export const CLINICAL_ROLES = [
  'direksi', 'dokter', 'perawat', 'bidan', 'apoteker', 'kasir', 'pendaftaran', 'rekam_medis', 'laboran',
  'radiografer', 'manajemen_mutu', 'gizi', 'rehab_medik', 'it_support',
];
export const CLINICAL_OR_ADMIN = [...ADMIN_ROLES, ...CLINICAL_ROLES];
const ALL_ROLES = ['viewer', ...CLINICAL_OR_ADMIN];

const SESSION_COOKIE = 'myitaru_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000; // Workers maximum; same as scripts/create-user.mjs
const PENDING_PREFIX = 'pending$';

export interface StaffUser {
  id: string;
  username: string;
  email: string;
  nama: string;
  roleId: string;
  aktif: boolean;
  dibuatPada: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      staff?: StaffUser;
    }
  }
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  nama: string;
  role_id: string;
  aktif: number;
  password_hash: string | null;
  must_change_password: number;
  mfa_secret_enc: string | null;
  created_at: string;
}

const toStaff = (u: UserRow): StaffUser => ({
  id: u.id,
  username: u.username,
  email: u.email,
  nama: u.nama,
  roleId: u.role_id,
  aktif: u.aktif === 1,
  dibuatPada: u.created_at,
  mustChangePassword: u.must_change_password === 1,
});

// ---------- crypto ----------
const subtle = () => globalThis.crypto.subtle;
const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64');
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(s, "base64"));

export function randomToken(bytes = 32): string {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
}

export async function sha256Hex(text: string): Promise<string> {
  return Buffer.from(await subtle().digest('SHA-256', new TextEncoder().encode(text))).toString('hex');
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ITERATIONS))}`;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Format pbkdf2$<iter>$<saltB64>$<hashB64> (scripts/create-user.mjs writes the same).
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored || '').split('$');
  const iterations = Number(parts[1]);
  if (parts.length !== 4 || parts[0] !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) {
    return false;
  }
  return constantTimeEqual(await pbkdf2(password, fromB64(parts[2]), iterations), fromB64(parts[3]));
}
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(bytes: Uint8Array): string {
  let value = 0, bits = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Uint8Array<ArrayBuffer> {
  let value = 0, bits = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const d = B32.indexOf(ch);
    if (d < 0) throw new Error('Invalid TOTP secret.');
    value = (value << 5) | d;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export async function totpCode(secret: string, counter: number): Promise<string> {
  const key = await subtle().importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const d = new Uint8Array(await subtle().sign('HMAC', key, msg));
  const o = d[d.length - 1] & 15;
  const v = (((d[o] & 0x7f) << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) % 1_000_000;
  return String(v).padStart(6, '0');
}

async function verifyTotp(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 30_000);
  let ok = false;
  for (const step of [-1, 0, 1]) {
    if (constantTimeEqual(new TextEncoder().encode(await totpCode(secret, now + step)), new TextEncoder().encode(code))) ok = true;
  }
  return ok;
}

// TOTP secrets must be recoverable, so they are AES-GCM encrypted with MFA_ENCRYPTION_KEY.
async function mfaKey(): Promise<CryptoKey> {
  let secret = process.env.MFA_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('MFA_ENCRYPTION_KEY is not configured.');
    secret = 'myitaru-dev-only-mfa-key';
  }
  const raw = await subtle().digest('SHA-256', new TextEncoder().encode(secret));
  return subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptSecret(plain: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, await mfaKey(), new TextEncoder().encode(plain));
  return `v1$${b64(iv)}$${b64(ct)}`;
}
async function decryptSecret(enc: string): Promise<string> {
  const [v, iv, ct] = enc.split('$');
  if (v !== 'v1' || !iv || !ct) throw new Error('Unsupported MFA secret format.');
  return new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await mfaKey(), fromB64(ct)));
}

// ---------- audit ----------
const AUDIT_STATUS = ['SUCCESS', 'FAILED', 'DENIED', 'WARNING'];
const AUDIT_CATEGORY = ['auth', 'database', 'security', 'ai'];
export interface AuditRow {
  userId?: string | null;
  actor: string;
  role?: string | null;
  category?: string | null;
  action: string;
  module?: string | null;
  status: string;
  data?: Record<string, unknown>;
}
export async function writeAudit(db: D1Database, row: AuditRow): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO audit_log (id, created_at, user_id, actor, role, category, action, module, status, data) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(
        globalThis.crypto.randomUUID(),
        new Date().toISOString(),
        row.userId ?? null,
        String(row.actor || 'unknown').slice(0, 200),
        row.role ? String(row.role).slice(0, 40) : null,
        row.category && AUDIT_CATEGORY.includes(row.category) ? row.category : null,
        String(row.action).slice(0, 80),
        row.module ? String(row.module).slice(0, 200) : null,
        AUDIT_STATUS.includes(row.status) ? row.status : 'WARNING',
        JSON.stringify(row.data ?? {}),
      )
      .run();
  } catch (err) {
    console.error('[audit] insert failed:', err);
  }
}

// ---------- cookies, rate limit ----------
function getCookie(req: express.Request, name: string): string | undefined {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
function setSessionCookie(res: express.Response, token: string, maxAgeSec: number) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`);
}

// shortcut: per-isolate in-memory counter (resets on Worker restart, not shared across isolates); move to D1/KV if abused.
const attempts = new Map<string, { count: number; resetAt: number }>();
function tooMany(key: string, max: number, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || cur.resetAt <= now) {
    if (attempts.size > 10000) attempts.clear();
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  cur.count += 1;
  return cur.count > max;
}

const fail = (res: express.Response, status: number, message: string) => res.status(status).json({ success: false, error: message, message });

// ---------- middleware ----------
export async function resolveStaff(db: D1Database, req: express.Request): Promise<StaffUser | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.mfa_verified = 1 AND s.expires_at > ? AND u.aktif = 1`,
    )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<UserRow>();
  return row ? toStaff(row) : null;
}

export function requireStaff(db: D1Database): express.RequestHandler {
  return (req, res, next) => {
    if (req.staff) return next();
    resolveStaff(db, req)
      .then((staff) => {
        if (!staff) return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir. Silakan login kembali.' });
        req.staff = staff;
        next();
      })
      .catch(next);
  };
}

export function requireRoles(roles: string[]): express.RequestHandler {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.roleId)) return res.status(403).json({ error: 'Peran Anda tidak memiliki akses ke sumber daya ini.' });
    next();
  };
}

// ---------- routes ----------
type Handler = (req: express.Request, res: express.Response) => Promise<unknown>;
const wrap = (fn: Handler): express.RequestHandler => (req, res, next) => { fn(req, res).catch(next); };

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null);
const validPassword = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 128;
const ipOf = (req: express.Request) => String(req.headers['cf-connecting-ip'] || req.ip || '');

export function registerCoreAuth(app: express.Express, db: D1Database): void {
  const auth = (req: express.Request, row: Omit<AuditRow, 'category'>) =>
    writeAudit(db, { category: 'auth', ...row, data: { ip: ipOf(req), ...row.data } });

  async function startSession(res: express.Response, userId: string) {
    const token = randomToken();
    const now = new Date();
    await db
      .prepare('INSERT INTO sessions (id, user_id, token_hash, mfa_verified, expires_at, created_at) VALUES (?,?,?,1,?,?)')
      .bind(globalThis.crypto.randomUUID(), userId, await sha256Hex(token), new Date(now.getTime() + SESSION_TTL_MS).toISOString(), now.toISOString())
      .run();
    setSessionCookie(res, token, SESSION_TTL_MS / 1000);
  }

  app.get('/api/auth/bootstrap-status', wrap(async (_req, res) => {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    res.json({ initialized: Number(row?.n ?? 0) > 0 });
  }));

  // Every account goes through TOTP: enrollment on first login, challenge afterwards. The session is only issued after MFA.
  app.post('/api/auth/login', wrap(async (req, res) => {
    const identifier = str(req.body?.identifier, 254);
    const password = req.body?.password;
    if (!identifier || typeof password !== 'string' || password.length > 128) return fail(res, 400, 'Username/email dan kata sandi wajib diisi.');
    if (tooMany(`login:${identifier.toLowerCase()}`, 10) || tooMany(`login-ip:${ipOf(req)}`, 50)) {
      return fail(res, 429, 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.');
    }

    const user = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').bind(identifier, identifier).first<UserRow>();
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || user.aktif !== 1) {
      await auth(req, { userId: user?.id, actor: identifier, action: 'STAFF_LOGIN', status: 'FAILED', data: { reason: !user || !ok ? 'bad_credentials' : 'inactive' } });
      return fail(res, 401, 'Username/email atau kata sandi tidak valid.');
    }

    const enrolled = user.mfa_secret_enc && !user.mfa_secret_enc.startsWith(PENDING_PREFIX);
    let secretKey: string | undefined;
    if (!enrolled) {
      secretKey = base32Encode(globalThis.crypto.getRandomValues(new Uint8Array(20)));
      await db.prepare('UPDATE users SET mfa_secret_enc = ? WHERE id = ?').bind(PENDING_PREFIX + (await encryptSecret(secretKey)), user.id).run();
    }
    const challengeToken = randomToken();
    const now = Date.now();
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE (user_id = ? AND mfa_verified = 0) OR expires_at < ?').bind(user.id, new Date(now).toISOString()),
      db.prepare('INSERT INTO sessions (id, user_id, token_hash, mfa_verified, expires_at, created_at) VALUES (?,?,?,0,?,?)')
        .bind(globalThis.crypto.randomUUID(), user.id, await sha256Hex(challengeToken), new Date(now + MFA_CHALLENGE_TTL_MS).toISOString(), new Date(now).toISOString()),
    ]);
    res.json({
      success: false,
      authMode: 'local',
      mfaFlow: enrolled ? 'challenge' : 'enrollment',
      challengeToken,
      userId: user.id,
      user: toStaff(user),
      ...(secretKey
        ? { secretKey, qrCodeUrl: `otpauth://totp/${encodeURIComponent(`MYITARU:${user.username}`)}?secret=${secretKey}&issuer=MYITARU%20SIMK&digits=6&period=30` }
        : {}),
    });
  }));

  app.post('/api/auth/mfa/complete', wrap(async (req, res) => {
    const { challengeToken, userId, code } = req.body ?? {};
    if (typeof challengeToken !== 'string' || typeof userId !== 'string' || typeof code !== 'string') return fail(res, 400, 'Tantangan MFA tidak valid.');
    const tokenHash = await sha256Hex(challengeToken);
    const user = await db
      .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.mfa_verified = 0 AND s.expires_at > ? AND u.id = ? AND u.aktif = 1`)
      .bind(tokenHash, new Date().toISOString(), userId)
      .first<UserRow>();
    if (!user || !user.mfa_secret_enc) return fail(res, 401, 'Tantangan MFA berakhir. Silakan login kembali.');

    const pending = user.mfa_secret_enc.startsWith(PENDING_PREFIX);
    const enc = pending ? user.mfa_secret_enc.slice(PENDING_PREFIX.length) : user.mfa_secret_enc;
    if (!(await verifyTotp(await decryptSecret(enc), code))) {
      if (tooMany(`mfa:${tokenHash}`, 5)) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
      await auth(req, { userId: user.id, actor: user.email, role: user.role_id, action: 'MFA_VERIFY', status: 'FAILED' });
      return fail(res, 401, 'Kode autentikator salah.');
    }

    const stmts = [db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash)];
    if (pending) stmts.push(db.prepare('UPDATE users SET mfa_secret_enc = ?, updated_at = ? WHERE id = ?').bind(enc, new Date().toISOString(), user.id));
    await db.batch(stmts);
    await startSession(res, user.id);
    await auth(req, { userId: user.id, actor: user.email, role: user.role_id, action: pending ? 'MFA_ENROLL' : 'STAFF_LOGIN', status: 'SUCCESS' });
    res.json({ success: true, authMode: 'local', user: toStaff(user) });
  }));

  app.post('/api/auth/mfa/cancel', wrap(async (req, res) => {
    if (typeof req.body?.challengeToken !== 'string') return fail(res, 400, 'Tantangan MFA tidak valid.');
    await db.prepare('DELETE FROM sessions WHERE token_hash = ? AND mfa_verified = 0').bind(await sha256Hex(req.body.challengeToken)).run();
    res.json({ success: true });
  }));

  app.get('/api/auth/me', wrap(async (req, res) => {
    const staff = await resolveStaff(db, req);
    if (!staff) return fail(res, 401, 'Belum login.');
    res.json({ success: true, authMode: 'local', user: staff });
  }));

  const logout = wrap(async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    setSessionCookie(res, '', 0);
    res.json({ success: true });
  });
  app.post('/api/auth/logout', logout);
  app.delete('/api/auth/session', logout);
  // Firebase ID-token exchange is gone with Firebase Admin; staff sign in with /api/auth/login.
  app.post('/api/auth/session', (_req, res) => fail(res, 410, 'Login Firebase tidak lagi didukung. Gunakan login staf.'));

  // ----- admin user management (AuthContext addUser/updateUser/deleteUser) -----
  const admin = [requireStaff(db), requireRoles(ADMIN_ROLES)];
  // Only a super_admin may create, change or remove super_admin accounts.
  const canTouch = (actor: StaffUser, roleId: string) => roleId !== 'super_admin' || actor.roleId === 'super_admin';

  app.get('/api/v1/auth/users', ...admin, wrap(async (_req, res) => {
    const { results } = await db.prepare('SELECT * FROM users ORDER BY nama').all<UserRow>();
    res.json({ success: true, users: results.map(toStaff) });
  }));

  app.post('/api/v1/auth/users', ...admin, wrap(async (req, res) => {
    const b = req.body ?? {};
    const email = str(b.email, 160)?.toLowerCase();
    const nama = str(b.nama, 120);
    const username = (str(b.username, 64) || email?.split('@')[0] || '').toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nama || !/^[a-z0-9._-]{2,64}$/.test(username)) return fail(res, 400, 'Email, nama, dan username wajib valid.');
    if (!ALL_ROLES.includes(b.roleId)) return fail(res, 400, 'Peran tidak dikenal.');
    if (!canTouch(req.staff!, b.roleId)) return fail(res, 403, 'Hanya Super Admin yang dapat membuat akun Super Admin.');
    if (!validPassword(b.password)) return fail(res, 400, 'Kata sandi harus 8-128 karakter.');
    const id = globalThis.crypto.randomUUID();
    try {
      await db
        .prepare('INSERT INTO users (id, username, email, nama, role_id, aktif, password_hash) VALUES (?,?,?,?,?,?,?)')
        .bind(id, username, email, nama, b.roleId, b.aktif === false ? 0 : 1, await hashPassword(b.password))
        .run();
    } catch (err) {
      if (/UNIQUE/i.test(String(err))) return fail(res, 409, 'Username atau email sudah terdaftar.');
      throw err;
    }
    await auth(req, { userId: req.staff!.id, actor: req.staff!.email, role: req.staff!.roleId, action: 'USER_CREATE', status: 'SUCCESS', data: { targetUserId: id, roleId: b.roleId } });
    const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
    res.status(201).json({ success: true, user: toStaff(row!) });
  }));

  app.patch('/api/v1/auth/users/:id', ...admin, wrap(async (req, res) => {
    const actor = req.staff!;
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(req.params.id).first<UserRow>();
    if (!target) return fail(res, 404, 'Pengguna tidak ditemukan.');
    const b = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.email !== undefined) {
      const email = str(b.email, 160)?.toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Email tidak valid.');
      sets.push('email = ?'); vals.push(email);
    }
    if (b.nama !== undefined) {
      const nama = str(b.nama, 120);
      if (!nama) return fail(res, 400, 'Nama tidak valid.');
      sets.push('nama = ?'); vals.push(nama);
    }
    if (b.roleId !== undefined) {
      if (!ALL_ROLES.includes(b.roleId)) return fail(res, 400, 'Peran tidak dikenal.');
      if (target.id === actor.id && b.roleId !== target.role_id) return fail(res, 403, 'Tidak dapat mengubah peran akun sendiri.');
      sets.push('role_id = ?'); vals.push(b.roleId);
    }
    if (b.password !== undefined) {
      if (!validPassword(b.password)) return fail(res, 400, 'Kata sandi harus 8-128 karakter.');
      sets.push('password_hash = ?'); vals.push(await hashPassword(b.password));
    }
    if (b.aktif !== undefined) {
      if (typeof b.aktif !== 'boolean') return fail(res, 400, 'Status aktif tidak valid.');
      if (target.id === actor.id && !b.aktif) return fail(res, 403, 'Tidak dapat menonaktifkan akun sendiri.');
      sets.push('aktif = ?'); vals.push(b.aktif ? 1 : 0);
    }
    if (!canTouch(actor, target.role_id) || !canTouch(actor, b.roleId ?? target.role_id)) return fail(res, 403, 'Hanya Super Admin yang dapat mengubah akun Super Admin.');
    if (sets.length === 0) return res.json({ success: true, user: toStaff(target) });

    const stmts = [db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, new Date().toISOString(), target.id)];
    // Credential or privilege change ends the user's open sessions.
    if (b.password !== undefined || b.aktif === false || (b.roleId !== undefined && b.roleId !== target.role_id)) {
      stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id));
    }
    try {
      await db.batch(stmts);
    } catch (err) {
      if (/UNIQUE/i.test(String(err))) return fail(res, 409, 'Email sudah dipakai akun lain.');
      throw err;
    }
    await auth(req, { userId: actor.id, actor: actor.email, role: actor.roleId, action: 'USER_UPDATE', status: 'SUCCESS', data: { targetUserId: target.id, fields: Object.keys(b).filter((k) => k !== 'password') } });
    const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(target.id).first<UserRow>();
    res.json({ success: true, user: toStaff(row!) });
  }));

  app.delete('/api/v1/auth/users/:id', ...admin, wrap(async (req, res) => {
    const actor = req.staff!;
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(req.params.id).first<UserRow>();
    if (!target) return fail(res, 404, 'Pengguna tidak ditemukan.');
    if (target.id === actor.id) return fail(res, 403, 'Tidak dapat menghapus akun sendiri.');
    if (!canTouch(actor, target.role_id)) return fail(res, 403, 'Hanya Super Admin yang dapat menghapus akun Super Admin.');
    await db.prepare('DELETE FROM users WHERE id = ?').bind(target.id).run(); // sessions cascade
    await auth(req, { userId: actor.id, actor: actor.email, role: actor.roleId, action: 'USER_DELETE', status: 'SUCCESS', data: { targetUserId: target.id, email: target.email } });
    res.json({ success: true });
  }));
}
