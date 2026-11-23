import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { CorePrincipal } from './coreAuth';
import type { PersistenceChange, PersistenceRepository } from './databaseAdapter';
import { createMfaSecretBox, generateRecoveryCodes, type MfaSecretBox } from './mfaSecretBox';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from './totp';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_PENDING_ENROLLMENT_TTL_MS = 10 * 60 * 1000;
const MFA_ISSUER = 'MYITARU SIMK';
const RECOVERY_CODE_COUNT = 10;
/** Peran yang wajib mendaftarkan MFA saat LOCAL_AUTH_REQUIRE_MFA=true. */
export const MFA_ENFORCED_ROLES: readonly string[] = ['super_admin', 'admin', 'it_support'];

type AttemptKind = 'password' | 'mfa';

export interface LocalAuthLockoutPolicy {
  /** Kegagalan maksimum per akun+IP dalam satu jendela sebelum dikunci. */
  perSourceMax: number;
  /** Kegagalan maksimum per akun (semua IP) dalam satu jendela sebelum dikunci. */
  perAccountMax: Record<AttemptKind, number>;
  windowMs: number;
  lockMs: number;
}

const DEFAULT_LOCKOUT_POLICY: LocalAuthLockoutPolicy = {
  perSourceMax: 5,
  perAccountMax: { password: 20, mfa: 10 },
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000
};
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
}

interface LocalAuthSessionRecord {
  userId: string;
  expiresAt: number;
  createdAt: string;
  /** true bila sesi diterbitkan setelah verifikasi TOTP/kode pemulihan atau setelah konfirmasi pendaftaran MFA. */
  mfaVerified?: boolean;
}

interface LocalAuthMfaRecord {
  userId: string;
  enabled: boolean;
  /** Rahasia TOTP aktif, terenkripsi AES-256-GCM. */
  secretEnc?: string;
  /** Rahasia TOTP yang menunggu konfirmasi pendaftaran, terenkripsi. */
  pendingSecretEnc?: string;
  pendingExpiresAt?: number;
  /** Langkah TOTP terakhir yang diterima; kode pada langkah <= nilai ini ditolak (anti-replay). */
  lastUsedStep: number;
  /** Hash HMAC-SHA256 kode pemulihan sekali pakai yang belum dipakai. */
  recoveryCodeHashes: string[];
  enabledAt?: string;
  updatedAt: string;
}

interface LocalAuthAttemptRecord {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

export interface LocalAuthRequestContext {
  /** Alamat IP klien, dipakai untuk penguncian per akun+IP. */
  ip?: string;
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

export type LocalAuthAuthenticateResult =
  | ({ status: 'ok'; mfaEnrollmentRequired: boolean } & LocalAuthLoginResult)
  | { status: 'mfa_required'; challengeToken: string; expiresAt: number }
  | { status: 'invalid' }
  | { status: 'locked'; retryAfterSeconds: number };

export type LocalAuthMfaVerifyResult =
  | ({ status: 'ok'; recoveryCodeUsed: boolean; recoveryCodesRemaining: number } & LocalAuthLoginResult)
  | { status: 'expired' }
  | { status: 'invalid' }
  | { status: 'locked'; retryAfterSeconds: number };

export type LocalAuthMfaFailure =
  | { status: 'unauthenticated' }
  | { status: 'unavailable' }
  | { status: 'already_enabled' }
  | { status: 'not_enabled' }
  | { status: 'enrollment_expired' }
  | { status: 'policy' }
  | { status: 'invalid' }
  | { status: 'locked'; retryAfterSeconds: number };

export interface LocalAuthMfaStatus {
  available: boolean;
  enabled: boolean;
  /** Kebijakan mewajibkan MFA untuk akun ini (LOCAL_AUTH_REQUIRE_MFA dan peran admin). */
  required: boolean;
  /** Sesi ini harus menyelesaikan pendaftaran MFA sebelum mengakses API lain. */
  enrollmentRequired: boolean;
  recoveryCodesRemaining: number;
}

export interface LocalAuthProvider {
  initialize(): Promise<void>;
  login(identifier: string, password: string): Promise<LocalAuthLoginResult | null>;
  authenticate(identifier: string, password: string, context?: LocalAuthRequestContext): Promise<LocalAuthAuthenticateResult>;
  verifyMfaChallenge(
    challengeToken: string,
    proof: { code?: string; recoveryCode?: string },
    context?: LocalAuthRequestContext
  ): Promise<LocalAuthMfaVerifyResult>;
  resolveSession(token: string): Promise<LocalAuthSession | null>;
  logout(token: string): Promise<void>;
  getMfaStatus(token: string): Promise<LocalAuthMfaStatus | null>;
  beginMfaEnrollment(token: string): Promise<{ status: 'ok'; secret: string; otpauthUri: string; expiresAt: number } | LocalAuthMfaFailure>;
  confirmMfaEnrollment(token: string, code: string, context?: LocalAuthRequestContext): Promise<{ status: 'ok'; recoveryCodes: string[] } | LocalAuthMfaFailure>;
  disableMfa(token: string, proof: { code?: string; recoveryCode?: string }, context?: LocalAuthRequestContext): Promise<{ status: 'ok' } | LocalAuthMfaFailure>;
  regenerateRecoveryCodes(token: string, code: string, context?: LocalAuthRequestContext): Promise<{ status: 'ok'; recoveryCodes: string[] } | LocalAuthMfaFailure>;
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
  /** Bawaan: LOCAL_AUTH_REQUIRE_MFA === 'true'. */
  requireMfa?: boolean;
  lockout?: Partial<LocalAuthLockoutPolicy>;
  /** Sumber waktu (ms) untuk pengujian. */
  now?: () => number;
}

const ROLE_SEEDS = [
  { username: 'admin', email: process.env.LOCAL_AUTH_ADMIN_EMAIL?.trim() || 'admin@myitaru.local', nama: 'Administrator SIMK', roleId: 'admin', passwordEnv: 'LOCAL_AUTH_ADMIN_PASSWORD' },
  { username: 'dokter', email: 'dokter@myitaru.local', nama: 'Dokter MYITARU', roleId: 'dokter', passwordEnv: 'LOCAL_AUTH_DOKTER_PASSWORD' },
  { username: 'perawat', email: 'perawat@myitaru.local', nama: 'Perawat MYITARU', roleId: 'perawat', passwordEnv: 'LOCAL_AUTH_PERAWAT_PASSWORD' },
  { username: 'rmik', email: 'rmik@myitaru.local', nama: 'Perekam Medis MYITARU', roleId: 'rekam_medis', passwordEnv: 'LOCAL_AUTH_RMIK_PASSWORD' },
  { username: 'apoteker', email: 'apoteker@myitaru.local', nama: 'Apoteker MYITARU', roleId: 'apoteker', passwordEnv: 'LOCAL_AUTH_APOTEKER_PASSWORD' },
  { username: 'kasir', email: 'kasir@myitaru.local', nama: 'Kasir MYITARU', roleId: 'kasir', passwordEnv: 'LOCAL_AUTH_KASIR_PASSWORD' }
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
  return ROLE_SEEDS.flatMap(({ passwordEnv, ...account }) => {
    const password = process.env[passwordEnv];
    if (!password) return [];
    if (password.length < 12 || password.length > 128) {
      throw new Error(`${passwordEnv} must contain between 12 and 128 characters.`);
    }
    return [{ ...account, password }];
  });
}

export class LocalAuthService implements LocalAuthProvider {
  private readonly sessionSecret: string;
  private readonly sessionTtlMs: number;
  private readonly bootstrapUsers: LocalAuthBootstrapUser[];
  private readonly secretConfigured: boolean;
  private readonly requireMfa: boolean;
  private readonly lockout: LocalAuthLockoutPolicy;
  private readonly now: () => number;
  private mfaBox?: MfaSecretBox;
  private dummySalt = '';
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
    this.secretConfigured = Boolean(configuredSecret);
    this.requireMfa = options.requireMfa ?? process.env.LOCAL_AUTH_REQUIRE_MFA === 'true';
    if (this.requireMfa && !this.secretConfigured) {
      throw new Error('LOCAL_AUTH_REQUIRE_MFA=true requires SESSION_SECRET so MFA secrets stay decryptable across restarts.');
    }
    this.lockout = {
      ...DEFAULT_LOCKOUT_POLICY,
      ...options.lockout,
      perAccountMax: { ...DEFAULT_LOCKOUT_POLICY.perAccountMax, ...options.lockout?.perAccountMax }
    };
    this.now = options.now || Date.now;
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
      if (account.password.length < 12 || account.password.length > 128) {
        throw new Error(`Local staff passwords must contain between 12 and 128 characters.`);
      }
      if (seenUsernames.has(normalizedUsername) || seenEmails.has(email)) {
        throw new Error('Local staff bootstrap usernames and emails must be unique.');
      }
      if (!['admin', 'dokter', 'perawat', 'rekam_medis', 'apoteker', 'kasir'].includes(account.roleId)) {
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
        continue;
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
          dibuatPada: new Date().toISOString()
        } satisfies LocalStaffUserRecord
      });
    }

    if (changes.length) await this.persistence.commit(changes);
    const persistedUsers = await this.persistence.list<LocalStaffUserRecord>('local_auth_users');
    const provisionedRoles = new Set(persistedUsers.filter(({ data }) => data.aktif).map(({ data }) => data.roleId));
    const missingRoles = ROLE_SEEDS
      .filter(({ roleId }) => !provisionedRoles.has(roleId))
      .map(({ roleId, passwordEnv }) => ({ roleId, passwordEnv }));

    if (process.env.NODE_ENV === 'production' && missingRoles.length) {
      throw new Error(`Local authentication requires provisioned accounts for all staff roles. Configure: ${missingRoles.map(({ passwordEnv }) => passwordEnv).join(', ')}.`);
    }
    if (persistedUsers.length === 0) {
      console.warn('[Auth:local] No local staff accounts are provisioned; set role-specific LOCAL_AUTH_*_PASSWORD values before logging in.');
    }

    const now = this.now();
    const expiredSessions = (await this.persistence.list<LocalAuthSessionRecord>('local_auth_sessions'))
      .filter(({ data }) => !Number.isFinite(data.expiresAt) || data.expiresAt <= now)
      .map(({ id }) => ({ entity: 'local_auth_sessions' as const, id, data: null }));
    if (expiredSessions.length) await this.persistence.commit(expiredSessions);

    const staleAttempts = (await this.persistence.list<LocalAuthAttemptRecord>('local_auth_attempts'))
      .filter(({ data }) => data.lockedUntil <= now && data.windowStartedAt + this.lockout.windowMs <= now)
      .map(({ id }) => ({ entity: 'local_auth_attempts' as const, id, data: null }));
    if (staleAttempts.length) await this.persistence.commit(staleAttempts);
  }

  /** Kompatibilitas lama: mengembalikan sesi hanya bila login selesai tanpa langkah MFA. */
  async login(identifier: string, password: string): Promise<LocalAuthLoginResult | null> {
    const result = await this.authenticate(identifier, password);
    if (result.status !== 'ok') return null;
    const { token, user, principal } = result;
    return { token, user, principal };
  }

  async authenticate(
    identifier: string,
    password: string,
    context: LocalAuthRequestContext = {}
  ): Promise<LocalAuthAuthenticateResult> {
    if (typeof identifier !== 'string' || typeof password !== 'string' ||
        identifier.length > 254 || password.length > 128 || !identifier.trim() || !password) {
      return { status: 'invalid' };
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();
    const users = await this.persistence.list<LocalStaffUserRecord>('local_auth_users');
    const user = users
      .map(({ data }) => data)
      .find((record) =>
        record.username.toLowerCase() === normalizedIdentifier ||
        record.email.toLowerCase() === normalizedIdentifier
      );
    // Akun tidak dikenal dikunci dengan cara yang sama agar keberadaan akun tidak bocor.
    const accountKey = user ? `user:${user.id}` : `identifier:${normalizedIdentifier}`;
    const lockedFor = await this.lockRemaining('password', accountKey, context.ip);
    if (lockedFor > 0) return { status: 'locked', retryAfterSeconds: Math.ceil(lockedFor / 1000) };

    const salt = user?.passwordSalt || this.dummySalt;
    const expectedHash = user && isValidPasswordHash(user.passwordHash)
      ? Buffer.from(user.passwordHash, 'hex')
      : this.dummyHash;
    const actualHash = await derivePassword(password, salt);
    const passwordMatches = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);

    if (!user || !user.aktif || !passwordMatches) {
      await this.recordFailure('password', accountKey, context.ip);
      return { status: 'invalid' };
    }
    await this.clearFailures('password', accountKey, context.ip);

    const mfa = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', user.id);
    if (mfa?.enabled && mfa.secretEnc) {
      const expiresAt = this.now() + MFA_CHALLENGE_TTL_MS;
      return { status: 'mfa_required', challengeToken: this.issueChallenge(user.id, expiresAt), expiresAt };
    }

    const session = await this.createSession(user, false);
    return { status: 'ok', ...session, mfaEnrollmentRequired: Boolean(session.principal.mfaEnrollmentRequired) };
  }

  async verifyMfaChallenge(
    challengeToken: string,
    proof: { code?: string; recoveryCode?: string },
    context: LocalAuthRequestContext = {}
  ): Promise<LocalAuthMfaVerifyResult> {
    const userId = this.readChallenge(challengeToken);
    if (!userId) return { status: 'expired' };
    const user = await this.persistence.get<LocalStaffUserRecord>('local_auth_users', userId);
    const mfa = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', userId);
    if (!user?.aktif || !mfa?.enabled || !mfa.secretEnc) return { status: 'expired' };

    const accountKey = `user:${user.id}`;
    const lockedFor = await this.lockRemaining('mfa', accountKey, context.ip);
    if (lockedFor > 0) return { status: 'locked', retryAfterSeconds: Math.ceil(lockedFor / 1000) };

    const verified = await this.verifyProof(user.id, mfa, proof, true);
    if (!verified) {
      const retryAfter = await this.recordFailure('mfa', accountKey, context.ip);
      return retryAfter > 0
        ? { status: 'locked', retryAfterSeconds: Math.ceil(retryAfter / 1000) }
        : { status: 'invalid' };
    }
    await this.clearFailures('mfa', accountKey, context.ip);

    const session = await this.createSession(user, true);
    return {
      status: 'ok',
      ...session,
      recoveryCodeUsed: verified.method === 'recovery',
      recoveryCodesRemaining: verified.record.recoveryCodeHashes.length
    };
  }

  async resolveSession(token: string): Promise<LocalAuthSession | null> {
    const resolved = await this.resolveSessionRecord(token);
    if (!resolved) return null;
    return { user: asPublicUser(resolved.user), principal: this.principalFor(resolved.user, resolved.session) };
  }

  async logout(token: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.persistence.commit([{
      entity: 'local_auth_sessions',
      id: this.sessionId(token),
      data: null
    }]);
  }

  async getMfaStatus(token: string): Promise<LocalAuthMfaStatus | null> {
    const resolved = await this.resolveSessionRecord(token);
    if (!resolved) return null;
    const mfa = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', resolved.user.id);
    const principal = this.principalFor(resolved.user, resolved.session);
    return {
      available: this.secretConfigured,
      enabled: Boolean(mfa?.enabled),
      required: this.isMfaRequiredFor(resolved.user.roleId),
      enrollmentRequired: Boolean(principal.mfaEnrollmentRequired),
      recoveryCodesRemaining: mfa?.enabled ? mfa.recoveryCodeHashes.length : 0
    };
  }

  async beginMfaEnrollment(token: string) {
    const resolved = await this.resolveSessionRecord(token);
    if (!resolved) return { status: 'unauthenticated' } as const;
    if (!this.secretConfigured) return { status: 'unavailable' } as const;
    const { user } = resolved;
    const existing = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', user.id);
    if (existing?.enabled) return { status: 'already_enabled' } as const;

    const secret = generateTotpSecret();
    const expiresAt = this.now() + MFA_PENDING_ENROLLMENT_TTL_MS;
    const record: LocalAuthMfaRecord = {
      userId: user.id,
      enabled: false,
      pendingSecretEnc: await this.box().encrypt(secret, `pending:${user.id}`),
      pendingExpiresAt: expiresAt,
      lastUsedStep: existing?.lastUsedStep ?? -1,
      recoveryCodeHashes: [],
      updatedAt: new Date(this.now()).toISOString()
    };
    await this.persistence.commit([{ entity: 'local_auth_mfa', id: user.id, data: record }]);
    return {
      status: 'ok',
      secret,
      otpauthUri: buildOtpauthUri({ secret, issuer: MFA_ISSUER, accountName: user.email || user.username }),
      expiresAt
    } as const;
  }

  async confirmMfaEnrollment(token: string, code: string, context: LocalAuthRequestContext = {}) {
    const resolved = await this.resolveSessionRecord(token);
    if (!resolved) return { status: 'unauthenticated' } as const;
    if (!this.secretConfigured) return { status: 'unavailable' } as const;
    const { user, sessionId, session } = resolved;
    const record = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', user.id);
    if (record?.enabled) return { status: 'already_enabled' } as const;
    if (!record?.pendingSecretEnc || !record.pendingExpiresAt || record.pendingExpiresAt <= this.now()) {
      return { status: 'enrollment_expired' } as const;
    }

    const accountKey = `user:${user.id}`;
    const lockedFor = await this.lockRemaining('mfa', accountKey, context.ip);
    if (lockedFor > 0) return { status: 'locked', retryAfterSeconds: Math.ceil(lockedFor / 1000) } as const;

    const secret = await this.box().decrypt(record.pendingSecretEnc, `pending:${user.id}`);
    const step = secret
      ? await verifyTotp(secret, code, { timeMs: this.now(), lastUsedStep: record.lastUsedStep })
      : null;
    if (step === null) {
      const retryAfter = await this.recordFailure('mfa', accountKey, context.ip);
      return retryAfter > 0
        ? { status: 'locked', retryAfterSeconds: Math.ceil(retryAfter / 1000) } as const
        : { status: 'invalid' } as const;
    }
    await this.clearFailures('mfa', accountKey, context.ip);

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const enabledRecord: LocalAuthMfaRecord = {
      userId: user.id,
      enabled: true,
      secretEnc: await this.box().encrypt(secret!, `active:${user.id}`),
      lastUsedStep: step,
      recoveryCodeHashes: await Promise.all(recoveryCodes.map((item) => this.box().hashRecoveryCode(user.id, item))),
      enabledAt: new Date(this.now()).toISOString(),
      updatedAt: new Date(this.now()).toISOString()
    };
    await this.persistence.commit([
      { entity: 'local_auth_mfa', id: user.id, data: enabledRecord },
      { entity: 'local_auth_sessions', id: sessionId, data: { ...session, mfaVerified: true } satisfies LocalAuthSessionRecord },
      ...(await this.otherSessionRevocations(user.id, sessionId))
    ]);
    return { status: 'ok', recoveryCodes } as const;
  }

  async disableMfa(token: string, proof: { code?: string; recoveryCode?: string }, context: LocalAuthRequestContext = {}) {
    const resolved = await this.resolveSessionRecord(token);
    if (!resolved) return { status: 'unauthenticated' } as const;
    const { user, sessionId, session } = resolved;
    const record = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', user.id);
    if (!record?.enabled || !record.secretEnc) return { status: 'not_enabled' } as const;
    if (this.isMfaRequiredFor(user.roleId)) return { status: 'policy' } as const;

    const accountKey = `user:${user.id}`;
    const lockedFor = await this.lockRemaining('mfa', accountKey, context.ip);
    if (lockedFor > 0) return { status: 'locked', retryAfterSeconds: Math.ceil(lockedFor / 1000) } as const;
    const verified = await this.verifyProof(user.id, record, proof, true);
    if (!verified) {
      const retryAfter = await this.recordFailure('mfa', accountKey, context.ip);
      return retryAfter > 0
        ? { status: 'locked', retryAfterSeconds: Math.ceil(retryAfter / 1000) } as const
        : { status: 'invalid' } as const;
    }
    await this.clearFailures('mfa', accountKey, context.ip);

    await this.persistence.commit([
      { entity: 'local_auth_mfa', id: user.id, data: null },
      { entity: 'local_auth_sessions', id: sessionId, data: { ...session, mfaVerified: false } satisfies LocalAuthSessionRecord },
      ...(await this.otherSessionRevocations(user.id, sessionId))
    ]);
    return { status: 'ok' } as const;
  }

  async regenerateRecoveryCodes(token: string, code: string, context: LocalAuthRequestContext = {}) {
    const resolved = await this.resolveSessionRecord(token);
    if (!resolved) return { status: 'unauthenticated' } as const;
    const { user } = resolved;
    const record = await this.persistence.get<LocalAuthMfaRecord>('local_auth_mfa', user.id);
    if (!record?.enabled || !record.secretEnc) return { status: 'not_enabled' } as const;

    const accountKey = `user:${user.id}`;
    const lockedFor = await this.lockRemaining('mfa', accountKey, context.ip);
    if (lockedFor > 0) return { status: 'locked', retryAfterSeconds: Math.ceil(lockedFor / 1000) } as const;
    // Membuat kode pemulihan baru selalu memerlukan kode TOTP dari aplikasi autentikator.
    const verified = await this.verifyProof(user.id, record, { code }, false);
    if (!verified) {
      const retryAfter = await this.recordFailure('mfa', accountKey, context.ip);
      return retryAfter > 0
        ? { status: 'locked', retryAfterSeconds: Math.ceil(retryAfter / 1000) } as const
        : { status: 'invalid' } as const;
    }
    await this.clearFailures('mfa', accountKey, context.ip);

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const updated: LocalAuthMfaRecord = {
      ...verified.record,
      recoveryCodeHashes: await Promise.all(recoveryCodes.map((item) => this.box().hashRecoveryCode(user.id, item))),
      updatedAt: new Date(this.now()).toISOString()
    };
    await this.persistence.commit([{ entity: 'local_auth_mfa', id: user.id, data: updated }]);
    return { status: 'ok', recoveryCodes } as const;
  }

  // ---------------------------------------------------------------------------

  private box(): MfaSecretBox {
    this.mfaBox ??= createMfaSecretBox(this.sessionSecret);
    return this.mfaBox;
  }

  private isMfaRequiredFor(roleId: string): boolean {
    return this.requireMfa && MFA_ENFORCED_ROLES.includes(roleId);
  }

  private principalFor(user: LocalStaffUserRecord, session: Pick<LocalAuthSessionRecord, 'mfaVerified'>): CorePrincipal {
    const mfaVerified = session.mfaVerified === true;
    return {
      uid: user.id,
      email: user.email,
      roleId: user.roleId,
      mfaVerified,
      authMode: 'local',
      mfaEnrollmentRequired: this.isMfaRequiredFor(user.roleId) && !mfaVerified
    };
  }

  private async createSession(
    user: LocalStaffUserRecord,
    mfaVerified: boolean,
    extraChanges: PersistenceChange[] = []
  ): Promise<LocalAuthLoginResult> {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const session: LocalAuthSessionRecord = {
      userId: user.id,
      expiresAt: now + this.sessionTtlMs,
      createdAt: new Date(now).toISOString(),
      mfaVerified
    };
    await this.persistence.commit([
      ...extraChanges,
      { entity: 'local_auth_sessions', id: this.sessionId(token), data: session }
    ]);
    return { token, user: asPublicUser(user), principal: this.principalFor(user, session) };
  }

  private async resolveSessionRecord(token: string): Promise<{
    sessionId: string;
    session: LocalAuthSessionRecord;
    user: LocalStaffUserRecord;
  } | null> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const sessionId = this.sessionId(token);
    const session = await this.persistence.get<LocalAuthSessionRecord>('local_auth_sessions', sessionId);
    if (!session) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= this.now()) {
      await this.logout(token);
      return null;
    }
    const user = await this.persistence.get<LocalStaffUserRecord>('local_auth_users', session.userId);
    if (!user?.aktif) return null;
    return { sessionId, session, user };
  }

  private async otherSessionRevocations(userId: string, keepSessionId: string): Promise<PersistenceChange[]> {
    const sessions = await this.persistence.list<LocalAuthSessionRecord>('local_auth_sessions');
    return sessions
      .filter(({ id, data }) => data.userId === userId && id !== keepSessionId)
      .map(({ id }) => ({ entity: 'local_auth_sessions' as const, id, data: null }));
  }

  /**
   * Memverifikasi kode TOTP atau kode pemulihan. Mengembalikan catatan MFA yang sudah diperbarui
   * (langkah terakhir untuk anti-replay, atau kode pemulihan yang dipakai dihapus) tanpa menyimpannya.
   */
  private async verifyProof(
    userId: string,
    record: LocalAuthMfaRecord,
    proof: { code?: string; recoveryCode?: string },
    allowRecoveryCode: boolean
  ): Promise<{ method: 'totp' | 'recovery'; record: LocalAuthMfaRecord } | null> {
    const updatedAt = new Date(this.now()).toISOString();
    if (typeof proof.code === 'string' && proof.code) {
      const secret = record.secretEnc ? await this.box().decrypt(record.secretEnc, `active:${userId}`) : null;
      if (!secret) return null;
      const step = await verifyTotp(secret, proof.code, { timeMs: this.now(), lastUsedStep: record.lastUsedStep });
      if (step === null) return null;
      const updated = { ...record, lastUsedStep: step, updatedAt };
      await this.persistence.commit([{ entity: 'local_auth_mfa', id: userId, data: updated }]);
      return { method: 'totp', record: updated };
    }
    if (allowRecoveryCode && typeof proof.recoveryCode === 'string' && proof.recoveryCode) {
      const index = await this.box().matchRecoveryCode(userId, proof.recoveryCode, record.recoveryCodeHashes);
      if (index < 0) return null;
      const updated = {
        ...record,
        recoveryCodeHashes: record.recoveryCodeHashes.filter((_, itemIndex) => itemIndex !== index),
        updatedAt
      };
      await this.persistence.commit([{ entity: 'local_auth_mfa', id: userId, data: updated }]);
      return { method: 'recovery', record: updated };
    }
    return null;
  }

  private issueChallenge(userId: string, expiresAt: number): string {
    const body = Buffer.from(JSON.stringify({
      purpose: 'local-mfa',
      uid: userId,
      exp: expiresAt,
      nonce: randomBytes(12).toString('base64url')
    })).toString('base64url');
    return `mfa_${body}.${this.challengeSignature(body)}`;
  }

  private readChallenge(token: string): string | null {
    if (typeof token !== 'string' || token.length > 1024 || !token.startsWith('mfa_')) return null;
    const [body, signature, extra] = token.slice(4).split('.');
    if (!body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(this.challengeSignature(body));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (claims.purpose !== 'local-mfa' || typeof claims.uid !== 'string' ||
          typeof claims.exp !== 'number' || claims.exp <= this.now()) {
        return null;
      }
      return claims.uid;
    } catch {
      return null;
    }
  }

  private challengeSignature(body: string): string {
    return createHmac('sha256', this.sessionSecret).update(`local-mfa-challenge:${body}`).digest('base64url');
  }

  private attemptIds(kind: AttemptKind, accountKey: string, ip?: string): { source: string; account: string } {
    const digest = (value: string) => createHmac('sha256', this.sessionSecret).update(`local-auth-attempt:${value}`).digest('hex');
    return {
      source: digest(`${kind}:source:${accountKey}:${ip || 'unknown'}`),
      account: digest(`${kind}:account:${accountKey}`)
    };
  }

  /** Sisa waktu penguncian (ms) untuk kombinasi akun+IP atau akun; 0 bila tidak terkunci. */
  private async lockRemaining(kind: AttemptKind, accountKey: string, ip?: string): Promise<number> {
    const ids = this.attemptIds(kind, accountKey, ip);
    const now = this.now();
    const [source, account] = await Promise.all([
      this.persistence.get<LocalAuthAttemptRecord>('local_auth_attempts', ids.source),
      this.persistence.get<LocalAuthAttemptRecord>('local_auth_attempts', ids.account)
    ]);
    return Math.max(0, (source?.lockedUntil ?? 0) - now, (account?.lockedUntil ?? 0) - now);
  }

  /** Mencatat kegagalan; mengembalikan sisa waktu penguncian bila batas tercapai. */
  private async recordFailure(kind: AttemptKind, accountKey: string, ip?: string): Promise<number> {
    const ids = this.attemptIds(kind, accountKey, ip);
    const now = this.now();
    const limits: Array<[string, number]> = [
      [ids.source, this.lockout.perSourceMax],
      [ids.account, this.lockout.perAccountMax[kind]]
    ];
    const changes: PersistenceChange[] = [];
    let lockedFor = 0;
    for (const [id, max] of limits) {
      const existing = await this.persistence.get<LocalAuthAttemptRecord>('local_auth_attempts', id);
      const windowExpired = !existing || existing.windowStartedAt + this.lockout.windowMs <= now;
      const record: LocalAuthAttemptRecord = windowExpired
        ? { failures: 0, windowStartedAt: now, lockedUntil: existing?.lockedUntil ?? 0 }
        : { ...existing };
      record.failures += 1;
      if (record.failures >= max) {
        record.lockedUntil = Math.max(record.lockedUntil, now + this.lockout.lockMs);
      }
      lockedFor = Math.max(lockedFor, record.lockedUntil - now);
      changes.push({ entity: 'local_auth_attempts', id, data: record });
    }
    await this.persistence.commit(changes);
    return Math.max(0, lockedFor);
  }

  private async clearFailures(kind: AttemptKind, accountKey: string, ip?: string): Promise<void> {
    const ids = this.attemptIds(kind, accountKey, ip);
    const [source, account] = await Promise.all([
      this.persistence.get<LocalAuthAttemptRecord>('local_auth_attempts', ids.source),
      this.persistence.get<LocalAuthAttemptRecord>('local_auth_attempts', ids.account)
    ]);
    const changes: PersistenceChange[] = [];
    if (source) changes.push({ entity: 'local_auth_attempts', id: ids.source, data: null });
    if (account) changes.push({ entity: 'local_auth_attempts', id: ids.account, data: null });
    if (changes.length) await this.persistence.commit(changes);
  }

  private sessionId(token: string): string {
    return createHmac('sha256', this.sessionSecret).update(token).digest('hex');
  }
}
