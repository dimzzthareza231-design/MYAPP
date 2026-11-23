// Endpoint MFA TOTP untuk autentikasi staf lokal (AUTH_MODE=local).
// Didaftarkan oleh registerCoreAuthentication sebelum middleware otorisasi /api, sehingga setiap
// handler memeriksa sesi cookie sendiri. Pesan untuk pengguna dalam bahasa Indonesia.
import type express from 'express';
import type { LocalAuthMfaFailure, LocalAuthProvider, LocalAuthRequestContext } from './localAuth';

export interface LocalMfaRouteHelpers {
  sessionCookieName: string;
  sessionTtlSeconds: number;
  getCookie(req: express.Request, name: string): string | null;
  setSessionCookie(res: express.Response, value: string, maxAgeSeconds: number, cookieName: string): void;
  isSameOrigin(req: express.Request): boolean;
}

/** Endpoint auth lokal yang boleh diakses tanpa sesi penuh. */
export const LOCAL_MFA_PUBLIC_ENDPOINTS = ['/api/auth/mfa/verify'];

/**
 * IP klien untuk penguncian per akun+IP. Di Cloudflare, header cf-connecting-ip ditetapkan oleh edge.
 * Di Node tanpa proxy header itu dapat dipalsukan, tetapi penghitung per akun tetap membatasi percobaan.
 */
export function localAuthContext(req: express.Request): LocalAuthRequestContext {
  const cfIp = req.headers['cf-connecting-ip'];
  const ip = (typeof cfIp === 'string' && cfIp.length <= 64 ? cfIp : '') || req.ip || req.socket?.remoteAddress || 'unknown';
  return { ip };
}

export function lockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam ${minutes} menit.`;
}

function sendFailure(res: express.Response, failure: LocalAuthMfaFailure | { status: 'expired' }): express.Response {
  switch (failure.status) {
    case 'unauthenticated':
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Sesi tidak valid. Silakan login kembali.' });
    case 'unavailable':
      return res.status(503).json({ success: false, code: 'MFA_UNAVAILABLE', message: 'MFA belum dapat diaktifkan: SESSION_SECRET server belum dikonfigurasi.' });
    case 'already_enabled':
      return res.status(409).json({ success: false, code: 'MFA_ALREADY_ENABLED', message: 'MFA sudah aktif untuk akun ini.' });
    case 'not_enabled':
      return res.status(409).json({ success: false, code: 'MFA_NOT_ENABLED', message: 'MFA belum aktif untuk akun ini.' });
    case 'enrollment_expired':
      return res.status(410).json({ success: false, code: 'MFA_ENROLLMENT_EXPIRED', message: 'Pendaftaran MFA kedaluwarsa. Mulai ulang pendaftaran.' });
    case 'policy':
      return res.status(403).json({ success: false, code: 'MFA_REQUIRED_BY_POLICY', message: 'Kebijakan fasilitas mewajibkan MFA untuk peran ini; MFA tidak dapat dinonaktifkan.' });
    case 'invalid':
      return res.status(401).json({ success: false, code: 'INVALID_MFA_CODE', message: 'Kode autentikator atau kode pemulihan tidak valid.' });
    case 'expired':
      return res.status(401).json({ success: false, code: 'MFA_CHALLENGE_EXPIRED', message: 'Tantangan MFA sudah tidak berlaku. Silakan login kembali.' });
    case 'locked':
      res.setHeader('Retry-After', String(failure.retryAfterSeconds));
      return res.status(429).json({ success: false, code: 'ACCOUNT_LOCKED', message: lockedMessage(failure.retryAfterSeconds) });
  }
}

function readProof(body: unknown): { code?: string; recoveryCode?: string } | null {
  if (!body || typeof body !== 'object') return null;
  const { code, recoveryCode } = body as Record<string, unknown>;
  const proof: { code?: string; recoveryCode?: string } = {};
  if (typeof code === 'string' && code.length <= 16) proof.code = code;
  if (typeof recoveryCode === 'string' && recoveryCode.length <= 32) proof.recoveryCode = recoveryCode;
  return proof.code || proof.recoveryCode ? proof : null;
}

export function registerLocalMfaRoutes(
  app: express.Application,
  localAuth: LocalAuthProvider,
  helpers: LocalMfaRouteHelpers
): void {
  const sameOrigin: express.RequestHandler = (req, res, next) => {
    if (!helpers.isSameOrigin(req)) return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
    return next();
  };
  const noStore: express.RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
  const sessionToken = (req: express.Request) => helpers.getCookie(req, helpers.sessionCookieName) || '';

  // Langkah kedua login: tantangan MFA bertanda tangan + kode TOTP atau kode pemulihan -> sesi.
  app.post('/api/auth/mfa/verify', sameOrigin, noStore, async (req, res, next) => {
    const challengeToken = req.body?.challengeToken;
    const proof = readProof(req.body);
    if (typeof challengeToken !== 'string' || challengeToken.length > 1024 || !proof) {
      return res.status(400).json({ success: false, code: 'INVALID_MFA_REQUEST', message: 'Kode autentikator wajib diisi.' });
    }
    try {
      const result = await localAuth.verifyMfaChallenge(challengeToken, proof, localAuthContext(req));
      if (result.status !== 'ok') return sendFailure(res, result);
      helpers.setSessionCookie(res, result.token, helpers.sessionTtlSeconds, helpers.sessionCookieName);
      return res.json({
        success: true,
        authMode: 'local',
        user: result.user,
        mfa: {
          enrollmentRequired: false,
          recoveryCodeUsed: result.recoveryCodeUsed,
          recoveryCodesRemaining: result.recoveryCodesRemaining
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/mfa/status', noStore, async (req, res, next) => {
    try {
      const status = await localAuth.getMfaStatus(sessionToken(req));
      if (!status) return sendFailure(res, { status: 'unauthenticated' });
      return res.json({ success: true, mfa: status });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/mfa/enroll', sameOrigin, noStore, async (req, res, next) => {
    try {
      const result = await localAuth.beginMfaEnrollment(sessionToken(req));
      if (result.status !== 'ok') return sendFailure(res, result);
      return res.json({ success: true, secret: result.secret, otpauthUri: result.otpauthUri, expiresAt: result.expiresAt });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/mfa/enroll/confirm', sameOrigin, noStore, async (req, res, next) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || code.length > 16) {
      return res.status(400).json({ success: false, code: 'INVALID_MFA_REQUEST', message: 'Kode autentikator wajib diisi.' });
    }
    try {
      const result = await localAuth.confirmMfaEnrollment(sessionToken(req), code, localAuthContext(req));
      if (result.status !== 'ok') return sendFailure(res, result);
      return res.json({ success: true, recoveryCodes: result.recoveryCodes });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/mfa/disable', sameOrigin, noStore, async (req, res, next) => {
    const proof = readProof(req.body);
    if (!proof) {
      return res.status(400).json({ success: false, code: 'INVALID_MFA_REQUEST', message: 'Kode autentikator atau kode pemulihan wajib diisi.' });
    }
    try {
      const result = await localAuth.disableMfa(sessionToken(req), proof, localAuthContext(req));
      if (result.status !== 'ok') return sendFailure(res, result);
      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/mfa/recovery-codes', sameOrigin, noStore, async (req, res, next) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || code.length > 16) {
      return res.status(400).json({ success: false, code: 'INVALID_MFA_REQUEST', message: 'Kode autentikator wajib diisi.' });
    }
    try {
      const result = await localAuth.regenerateRecoveryCodes(sessionToken(req), code, localAuthContext(req));
      if (result.status !== 'ok') return sendFailure(res, result);
      return res.json({ success: true, recoveryCodes: result.recoveryCodes });
    } catch (error) {
      return next(error);
    }
  });
}
