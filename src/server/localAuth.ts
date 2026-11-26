import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { CorePrincipal } from './coreAuth';
import type { PersistenceChange, PersistenceRepository } from './databaseAdapter';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

interface LocalStaffUserRecord {
  id: string;
  username: string;
  email: string;
  nama: string;
  roleId: string;
  passwordSalt: string;
  passwordHash: string;
  aktif: boolean;
  dibuatPada: string;
  passwordSeed?: string;
}

interface LocalAuthSessionRecord {
  userId: string;
  expiresAt: number;
  createdAt: string;
}

export interface LocalAuthPublicUser {
  id: string;
  username: string;
  email: string;
  nama: string;
  roleId: string;
  aktif: true;
  dibuatPada: string;
}

export interface LocalAuthLoginResult {
  token: string;
  user: LocalAuthPublicUser;
  principal: CorePrincipal;
}

export interface LocalAuthSession {
  user: LocalAuthPublicUser;
  principal: CorePrincipal;
}

export interface LocalAuthProvider {
  initialize(): Promise<void>;
  login(identifier: string, password: string): Promise<LocalAuthLoginResult | null>;
  loginWithEmail?(email: string): Promise<LocalAuthLoginResult | null>;
  resolveSession(token: string): Promise<LocalAuthSession | null>;
  logout(token: string): Promise<void>;
}

interface LocalAuthBootstrapUser {
  username: string;
  email: string;
  nama: string;
  roleId: string;
  password: string;
}

interface LocalAuthOptions {
  sessionSecret?: string;
  sessionTtlMs?: number;
  bootstrapUsers?: LocalAuthBootstrapUser[];
}

// Sandi bawaan per role = <username>123 (permintaan pemilik). Naikkan versi untuk me-reset ulang semua akun bawaan.
const PASSWORD_SEED = 'rbac-default-v1';
const ROLE_SEEDS = [
  { username: 'admin', email: process.env.LOCAL_AUTH_ADMIN_EMAIL?.trim() || 'admin@myitaru.local', nama: 'Administrator SIMK', roleId: 'admin' },
  { username: 'dokter', email: 'dokter@myitaru.local', nama: 'Dokter MYITARU', roleId: 'dokter' },
  { username: 'perawat', email: 'perawat@myitaru.local', nama: 'Perawat MYITARU', roleId: 'perawat' },
  { username: 'rmik', email: 'rmik@myitaru.local', nama: 'Perekam Medis MYITARU', roleId: 'rekam_medis' },
  { username: 'apoteker', email: 'apoteker@myitaru.local', nama: 'Apoteker MYITARU', roleId: 'apoteker' },
  { username: 'kasir', email: 'kasir@myitaru.local', nama: 'Kasir MYITARU', roleId: 'kasir' },
  { username: 'lab', email: 'lab@myitaru.local', nama: 'Analis Laboratorium MYITARU', roleId: 'laboran' },
  { username: 'super_admin', email: 'super_admin@myitaru.local', nama: 'Super Admin', roleId: 'super_admin' },
  { username: 'viewer', email: 'viewer@myitaru.local', nama: 'Guest Viewer', roleId: 'viewer' },
  { username: 'direksi', email: 'direksi@myitaru.local', nama: 'Direksi & Manajemen', roleId: 'direksi' },
  { username: 'bidan', email: 'bidan@myitaru.local', nama: 'Bidan', roleId: 'bidan' },
  { username: 'pendaftaran', email: 'pendaftaran@myitaru.local', nama: 'Petugas Pendaftaran', roleId: 'pendaftaran' },
  { username: 'radiografer', email: 'radiografer@myitaru.local', nama: 'Radiografer', roleId: 'radiografer' },
  { username: 'manajemen_mutu', email: 'manajemen_mutu@myitaru.local', nama: 'Komite Mutu (PMKP)', roleId: 'manajemen_mutu' },
  { username: 'rehab_medik', email: 'rehab_medik@myitaru.local', nama: 'Fisioterapis & Rehab', roleId: 'rehab_medik' },
  { username: 'gizi', email: 'gizi@myitaru.local', nama: 'Nutrisionis / Ahli Gizi', roleId: 'gizi' },
  { username: 'it_support', email: 'it_support@myitaru.local', nama: 'IT Support & Infra', roleId: 'it_support' }
] as const;

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function accountId(username: string): string {
  return createHmac('sha256', 'myitaru-local-user-id')
    .update(username.trim().toLowerCase())
    .digest('hex');
}

function asPublicUser(user: LocalStaffUserRecord): LocalAuthPublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nama: user.nama,
    roleId: user.roleId,
    aktif: true,
    dibuatPada: user.dibuatPada
  };
}

function isValidPasswordHash(value: string): boolean {
  return /^[a-f0-9]{128}$/i.test(value);
}

function getBootstrapUsers(): LocalAuthBootstrapUser[] {
  return ROLE_SEEDS.map((seed) => ({ ...seed, password: `${seed.username}123` }));
}

export class LocalAuthService implements LocalAuthProvider {
  private readonly sessionSecret: string;
  private readonly sessionTtlMs: number;
  private readonly bootstrapUsers: LocalAuthBootstrapUser[];
  private dummySalt = '';
  private failedLogins = new Map<string, { fails: number; until: number }>();
  private dummyHash: Uint8Array = new Uint8Array(SCRYPT_KEY_LENGTH);

  constructor(
    private readonly persistence: PersistenceRepository,
    options: LocalAuthOptions = {}
  ) {
    const configuredSecret = options.sessionSecret || process.env.SESSION_SECRET;
    if (!configuredSecret && process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is required for local authentication in production.');
    }
    this.sessionSecret = configuredSecret || randomBytes(32).toString('hex');
    this.sessionTtlMs = options.sessionTtlMs || SESSION_TTL_MS;
    this.bootstrapUsers = options.bootstrapUsers || getBootstrapUsers();
  }

  async initialize(): Promise<void> {
    this.dummySalt = randomBytes(16).toString('hex');
    this.dummyHash = await derivePassword(randomBytes(32).toString('hex'), this.dummySalt);

    const existing = await this.persistence.list<LocalStaffUserRecord>('local_auth_users');
    const existingById = new Map(existing.map(({ id, data }) => [id, data]));
    const seenUsernames = new Set<string>();
    const seenEmails = new Set<string>();
    const changes: PersistenceChange[] = [];

    for (const account of this.bootstrapUsers) {
      const username = account.username.trim();
      const email = account.email.trim().toLowerCase();
      const normalizedUsername = username.toLowerCase();
      if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
        throw new Error(`Invalid local staff username for role ${account.roleId}.`);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error(`Invalid local staff email for role ${account.roleId}.`);
      }
      if (seenUsernames.has(normalizedUsername) || seenEmails.has(email)) {
        throw new Error('Local staff bootstrap usernames and emails must be unique.');
      }
      if (!ROLE_SEEDS.some(({ roleId }) => roleId === account.roleId)) {
        throw new Error(`Unsupported local staff role: ${account.roleId}.`);
      }
      seenUsernames.add(normalizedUsername);
      seenEmails.add(email);

      const id = accountId(username);
      const stored = existingById.get(id);
      if (stored) {
        if (stored.roleId !== account.roleId || stored.username.toLowerCase() !== normalizedUsername) {
          throw new Error(`Existing local staff account ${username} conflicts with its configured role.`);
        }
        // Akun lama (sandi dari secret) di-reset sekali ke sandi bawaan; setelah itu dilewati.
        if (stored.passwordSeed === PASSWORD_SEED) continue;
      }
      if (account.password.length < 6 || account.password.length > 128) {
        throw new Error(`Local staff password for ${username} must contain between 6 and 128 characters.`);
      }

      const salt = randomBytes(16).toString('hex');
      const passwordHash = (await derivePassword(account.password, salt)).toString('hex');
      changes.push({
        entity: 'local_auth_users',
        id,
        data: {
          id,
          username,
          email,
          nama: account.nama,
          roleId: account.roleId,
          passwordSalt: salt,
          passwordHash,
          aktif: true,
          dibuatPada: stored?.dibuatPada || new Date().toISOString(),
          passwordSeed: PASSWORD_SEED
        } satisfies LocalStaffUserRecord
      });
    }

    if (changes.length) await this.persistence.commit(changes);
    const now = Date.now();
    const expiredSessions = (await this.persistence.list<LocalAuthSessionRecord>('local_auth_sessions'))
      .filter(({ data }) => !Number.isFinite(data.expiresAt) || data.expiresAt <= now)
      .map(({ id }) => ({ entity: 'local_auth_sessions' as const, id, data: null }));
    if (expiredSessions.length) await this.persistence.commit(expiredSessions);
  }

  async login(identifier: string, password: string): Promise<LocalAuthLoginResult | null> {
    if (typeof identifier !== 'string' || typeof password !== 'string' ||
        identifier.length > 254 || password.length > 128 || !identifier.trim() || !password) {
      return null;
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();
    // shortcut: kunci per akun disimpan di memori isolate ini; batas lintas isolate dipegang rate limit Cloudflare.
    const lock = this.failedLogins.get(normalizedIdentifier);
    if (lock && lock.until > Date.now()) return null;
    const users = await this.persistence.list<LocalStaffUserRecord>('local_auth_users');
    const user = users
      .map(({ data }) => data)
      .find((record) =>
        record.username.toLowerCase() === normalizedIdentifier ||
        record.email.toLowerCase() === normalizedIdentifier
      );
    const salt = user?.passwordSalt || this.dummySalt;
    const expectedHash = user && isValidPasswordHash(user.passwordHash)
      ? Buffer.from(user.passwordHash, 'hex')
      : this.dummyHash;
    const actualHash = await derivePassword(password, salt);
    const passwordMatches = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);

    if (!user || !user.aktif || !passwordMatches) {
      const entry = this.failedLogins.get(normalizedIdentifier);
      const fails = (entry && entry.until === 0 ? entry.fails : 0) + 1;
      this.failedLogins.set(normalizedIdentifier, { fails, until: fails >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
      if (this.failedLogins.size > 5000) this.failedLogins.clear();
      return null;
    }
    this.failedLogins.delete(normalizedIdentifier);
    return this.createSession(user);
  }

  /** Login Google: hanya untuk akun staf aktif yang sudah ada; email wajib sudah diverifikasi Google. */
  async loginWithEmail(email: string): Promise<LocalAuthLoginResult | null> {
    const wanted = email.trim().toLowerCase();
    const users = await this.persistence.list<LocalStaffUserRecord>('local_auth_users');
    const user = users.map(({ data }) => data).find((record) => record.aktif && record.email.toLowerCase() === wanted);
    return user ? this.createSession(user) : null;
  }

  private async createSession(user: LocalStaffUserRecord): Promise<LocalAuthLoginResult> {
    const token = randomBytes(32).toString('base64url');
    const sessionId = this.sessionId(token);
    const now = Date.now();
    const expiresAt = now + this.sessionTtlMs;
    await this.persistence.commit([{
      entity: 'local_auth_sessions',
      id: sessionId,
      data: { userId: user.id, expiresAt, createdAt: new Date(now).toISOString() } satisfies LocalAuthSessionRecord
    }]);

    return {
      token,
      user: asPublicUser(user),
      principal: {
        uid: user.id,
        email: user.email,
        roleId: user.roleId,
        mfaVerified: false,
        authMode: 'local'
      }
    };
  }

  async resolveSession(token: string): Promise<LocalAuthSession | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const sessionId = this.sessionId(token);
    const session = await this.persistence.get<LocalAuthSessionRecord>('local_auth_sessions', sessionId);
    if (!session) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      await this.logout(token);
      return null;
    }

    const user = await this.persistence.get<LocalStaffUserRecord>('local_auth_users', session.userId);
    if (!user?.aktif) return null;
    return {
      user: asPublicUser(user),
      principal: {
        uid: user.id,
        email: user.email,
        roleId: user.roleId,
        mfaVerified: false,
        authMode: 'local'
      }
    };
  }

  async logout(token: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.persistence.commit([{
      entity: 'local_auth_sessions',
      id: this.sessionId(token),
      data: null
    }]);
  }

  private sessionId(token: string): string {
    return createHmac('sha256', this.sessionSecret).update(token).digest('hex');
  }
}
