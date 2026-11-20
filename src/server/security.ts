import type { Request } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface Identity { uid: string; email: string; token: string; }
export const ADMIN_ROLES = ['super_admin', 'admin'] as const;
export const STAFF_ROLES = [...ADMIN_ROLES, 'direksi', 'dokter', 'perawat', 'bidan', 'apoteker', 'kasir', 'pendaftaran', 'rekam_medis', 'laboran', 'radiografer', 'manajemen_mutu', 'gizi', 'rehab_medik', 'it_support'];
export const CLINICAL_ROLES = [...ADMIN_ROLES, 'dokter', 'perawat', 'bidan', 'rekam_medis'];

export function bearer(req: Pick<Request, 'headers'>): string {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/.test(header) || header.length > 20000) throw new HttpError(401, 'Token Firebase diperlukan.');
  return header.slice(7);
}

// Verification is delegated to Firebase Auth, not to an unverified JWT decode.
// The decoded claims are additionally bound to the configured Firebase project.
export function firebaseVerifier(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch) {
  return async (token: string): Promise<Identity> => {
    const project = env.FIREBASE_PROJECT_ID;
    const key = env.FIREBASE_WEB_API_KEY;
    if (!project || !key) throw new HttpError(503, 'Autentikasi server belum dikonfigurasi.');
    let claims: any;
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }
    catch { throw new HttpError(401, 'Token tidak valid.'); }
    if (claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 || typeof claims.iat !== 'number' || claims.iat > Date.now() / 1000 + 30) throw new HttpError(401, 'Token tidak valid atau kedaluwarsa.');
    let response: Response;
    try {
      response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(8000),
      });
    } catch { throw new HttpError(503, 'Verifikasi identitas sementara tidak tersedia.'); }
    if (response.status === 429 || response.status >= 500) throw new HttpError(503, 'Verifikasi identitas sementara tidak tersedia.');
    if (!response.ok) throw new HttpError(401, 'Token Firebase ditolak.');
    const account = (await response.json() as any).users?.[0];
    if (!account || account.localId !== claims.sub || account.disabled || !account.emailVerified || !account.email || claims.email !== account.email || claims.iat < Number(account.validSince || 0)) throw new HttpError(401, 'Identitas belum terverifikasi atau sesi dicabut.');
    return { uid: account.localId, email: account.email, token };
  };
}

export function requireRole(role: string, allowed: readonly string[]) {
  if (!allowed.includes(role)) throw new HttpError(403, 'Hak akses tidak mencukupi.');
}
