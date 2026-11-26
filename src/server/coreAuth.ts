import { randomBytes } from 'node:crypto';
import type express from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { COMMON_MODULES, MODULE_ALIASES, PATIENT_DATA_MODULES, ROLES } from '../data/roles';
import { getDocumentQrScope, readSecurePatientQrToken } from './securePatientQr';
import { LocalAuthUserError } from './localAuth';
import type { LocalAuthLoginResult, LocalAuthSession, LocalAuthUserInput, LocalAuthUserUpdate } from './localAuth';

const SESSION_COOKIE = 'myitaru_core_session';
const LOCAL_SESSION_COOKIE = 'myitaru_local_session';
const GOOGLE_STATE_COOKIE = 'myitaru_google_state';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type CoreAuthMode = 'firebase' | 'local';

export interface CorePrincipal {
  uid: string;
  email: string;
  roleId: string;
  mfaVerified: boolean;
  authMode?: CoreAuthMode;
}

export interface CoreAuthRequest extends express.Request {
  corePrincipal?: CorePrincipal;
}

interface FirebaseAdminServices {
  auth: ReturnType<typeof getAuth>;
  firestore: ReturnType<typeof getFirestore>;
}

export interface CoreAuthOptions {
  authMode?: CoreAuthMode;
  resolvePrincipal?: (token: string, isSessionCookie: boolean) => Promise<CorePrincipal | null>;
  createSessionCookie?: (idToken: string) => Promise<string>;
  revokeRefreshTokens?: (uid: string) => Promise<void>;
  localAuth?: {
    initialize(): Promise<void>;
    changePassword?(token: string, currentPassword: string, newPassword: string): Promise<'OK' | 'INVALID_SESSION' | 'WRONG_PASSWORD' | 'WEAK_PASSWORD'>;
    loginWithEmail?(email: string): Promise<LocalAuthLoginResult | null>;
    login(identifier: string, password: string): Promise<LocalAuthLoginResult | null>;
    resolveSession(token: string): Promise<LocalAuthSession | null>;
    logout(token: string): Promise<void>;
    listUsers(): Promise<LocalAuthSession['user'][]>;
    createUser(input: LocalAuthUserInput): Promise<LocalAuthSession['user']>;
    updateUser(id: string, input: LocalAuthUserUpdate): Promise<LocalAuthSession['user']>;
    deleteUser(id: string): Promise<void>;
  };
}

declare global {
  namespace Express {
    interface Request {
      corePrincipal?: CorePrincipal;
    }
  }
}

function getFirebaseAdminServices(): FirebaseAdminServices {
  let app = getApps()[0];

  if (!app) {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!rawServiceAccount || !projectId) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_PROJECT_ID are required for server authentication.');
    }

    let serviceAccount: Record<string, unknown>;
    try {
      serviceAccount = JSON.parse(rawServiceAccount) as Record<string, unknown>;
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.', { cause: error });
    }

    if (serviceAccount.project_id !== projectId || typeof serviceAccount.private_key !== 'string' || typeof serviceAccount.client_email !== 'string') {
      throw new Error('Firebase service account project_id, private_key, or client_email is invalid.');
    }

    app = initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId,
    });
  }

  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
}

async function loadPrincipal(uid: string, email: string, mfaVerified: boolean): Promise<CorePrincipal | null> {
  const { firestore } = getFirebaseAdminServices();
  const snapshot = await firestore.collection('users').doc(uid).get();
  if (!snapshot.exists) return null;

  const profile = snapshot.data();
  const roleId = profile?.roleId;
  if (profile?.aktif !== true || typeof roleId !== 'string' || !ROLES.some((role) => role.id === roleId)) {
    return null;
  }

  const profileEmail = typeof profile.email === 'string' ? profile.email.toLowerCase() : '';
  if (!profileEmail || profileEmail !== email.toLowerCase()) return null;

  return { uid, email, roleId, mfaVerified };
}

async function verifyFirebaseToken(token: string, isSessionCookie: boolean): Promise<CorePrincipal | null> {
  const { auth } = getFirebaseAdminServices();
  const decoded = isSessionCookie
    ? await auth.verifySessionCookie(token, true)
    : await auth.verifyIdToken(token, true);

  if (!decoded.email || decoded.email_verified !== true) return null;
  const firebaseClaims = decoded.firebase as { sign_in_second_factor?: string } | undefined;
  return loadPrincipal(decoded.uid, decoded.email, Boolean(firebaseClaims?.sign_in_second_factor));
}

function getCookie(req: express.Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isSameOrigin(req: express.Request): boolean {
  const origin = req.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

export function scopeForPath(path: string, req?: express.Request): string | null {
  if (path === '/api/v1/auth/users' || path.startsWith('/api/v1/auth/users/')) return 'user-management';
  if (path === '/api/v1/dossier/document-qr/issue') {
    return getDocumentQrScope(req?.body?.documentType);
  }
  if (path === '/api/v1/patient-qr/redeem' && typeof req?.body?.token === 'string') {
    const claims = readSecurePatientQrToken(req.body.token);
    if (claims?.kind === 'document') return claims.scope || 'rekam-medis';
  }
  if (path === '/api/v1/health' || path === '/api/v1/system/stats' || path.startsWith('/api/v1/health-updates')) return 'dashboard';
  if (path.startsWith('/api/v1/system-data') || path.startsWith('/api/v1/module-data')) return 'data-pasien';
  const isRead = req?.method === 'GET' || req?.method === 'HEAD';
  // Ubah status antrean dipakai poli, farmasi dan kasir, bukan hanya pendaftaran.
  if (path.startsWith('/api/v1/appointments/') && req?.method === 'PATCH') return 'antrean';
  if (path.startsWith('/api/v1/patients') || path.startsWith('/api/v1/appointments')) return isRead ? 'data-pasien' : 'pendaftaran';
  if (path.startsWith('/api/v1/patient-qr') || path.startsWith('/api/v1/patient-notifications')) return 'rekam-medis';
  if (path.startsWith('/api/v1/bed-management')) return 'rawat-inap';
  if (path.startsWith('/api/v1/inventory')) return 'inventory';
  if (path.startsWith('/api/v1/bpjs')) return 'vclaim';
  if (path.startsWith('/api/v1/satusehat')) return 'satu-sehat';
  if (path.startsWith('/api/v1/billing')) return 'kasir';
  if (path.startsWith('/api/v1/dossier')) return 'rekam-medis';
  if (path.startsWith('/api/v1/audit')) return 'audit';
  if (path.startsWith('/api/v1/backup')) return 'backup';
  if (path === '/api/ai/bpjs-audit') return 'bpjs-klaim';
  if (path.startsWith('/api/ai/')) return 'rekam-medis';
  if (path.startsWith('/api/cloudflare')) return 'cloudflare';
  if (path.startsWith('/api/gateway')) return 'sdm';
  return null;
}

export function hasScope(roleId: string, scope: string): boolean {
  if (scope === 'user-management') return ['super_admin', 'admin'].includes(roleId);
  if (roleId === 'super_admin' || COMMON_MODULES.includes(scope)) return true;
  const role = ROLES.find((item) => item.id === roleId);
  if (!role) return false;
  if (scope === 'data-pasien') return role.moduleAccess.some((module) => PATIENT_DATA_MODULES.includes(module));
  if (scope === 'antrean') return ['pendaftaran', 'patient-flow', 'apotek-ralan', 'kasir'].some((module) => role.moduleAccess.includes(module));
  const aliases = MODULE_ALIASES[scope] || [];
  return role.moduleAccess.includes(scope) || aliases.some((alias) => role.moduleAccess.includes(alias));
}

function isWriteDenied(principal: CorePrincipal, method: string, path: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (principal.roleId === 'viewer') return true;
  if (path.startsWith('/api/v1/system-data')) {
    return !['super_admin', 'admin', 'it_support'].includes(principal.roleId);
  }
  if (path.startsWith('/api/v1/backup') || path.startsWith('/api/v1/audit')) {
    return !['super_admin', 'admin', 'it_support'].includes(principal.roleId);
  }
  return false;
}

function setSessionCookie(
  res: express.Response,
  value: string,
  maxAgeSeconds: number,
  cookieName = SESSION_COOKIE
): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`,
  );
}

function sendLocalUserError(error: unknown, res: express.Response): boolean {
  if (!(error instanceof LocalAuthUserError)) return false;
  const status = error.code === 'USER_NOT_FOUND' ? 404 :
    error.code === 'USER_EXISTS' || error.code === 'LAST_ADMIN' ? 409 : 400;
  res.status(status).json({ success: false, code: error.code, message: error.message });
  return true;
}

export function getCoreAuthMode(): CoreAuthMode {
  const configuredMode = process.env.AUTH_MODE || process.env.VITE_AUTH_MODE;
  if (configuredMode === 'local' || configuredMode === 'firebase') return configuredMode;
  if (configuredMode) throw new Error('AUTH_MODE must be either local or firebase.');
  return process.env.VITE_FIREBASE_API_KEY ? 'firebase' : 'local';
}

export function registerCoreAuthentication(
  app: express.Application,
  options: CoreAuthOptions = {},
): void {
  const authMode = options.authMode ||
    (options.resolvePrincipal || options.createSessionCookie || options.revokeRefreshTokens
      ? 'firebase'
      : getCoreAuthMode());
  if (authMode === 'local' && !options.localAuth) {
    throw new Error('Local authentication service must be provided when AUTH_MODE=local.');
  }
  const localAuth = options.localAuth;
  const resolvePrincipal = async (token: string, isSessionCookie: boolean): Promise<CorePrincipal | null> => {
    if (authMode === 'local') return (await localAuth!.resolveSession(token))?.principal || null;
    return (options.resolvePrincipal || verifyFirebaseToken)(token, isSessionCookie);
  };

  if (authMode === 'local') {
    app.post('/api/auth/login', async (req, res, next) => {
      if (!isSameOrigin(req)) {
        return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
      }
      if (typeof req.body?.identifier !== 'string' || typeof req.body?.password !== 'string' ||
          req.body.identifier.length > 254 || req.body.password.length > 128) {
        return res.status(400).json({ success: false, code: 'INVALID_CREDENTIALS' });
      }

      try {
        const result = await localAuth!.login(req.body.identifier, req.body.password);
        if (!result) {
          return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Username/email atau kata sandi tidak valid.' });
        }
        setSessionCookie(res, result.token, SESSION_TTL_MS / 1000, LOCAL_SESSION_COOKIE);
        return res.json({ success: true, authMode: 'local', user: result.user });
      } catch (error) {
        return next(error);
      }
    });


    // Login Google (OAuth code flow). Client ID/secret dari env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET; tanpa itu rute mati.
    const googleOn = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && localAuth!.loginWithEmail);
    const googleRedirect = (req: express.Request) => `https://${req.get('host')}/api/auth/google/callback`;
    app.get('/api/auth/google', (req, res) => {
      if (!googleOn) return res.redirect('/?google=off');
      const state = randomBytes(24).toString('base64url');
      // Lax: cookie state harus ikut saat Google mengarahkan balik (navigasi lintas situs).
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${GOOGLE_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${secure}`);
      const q = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: googleRedirect(req), response_type: 'code',
        scope: 'openid email', state, prompt: 'select_account',
      });
      return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    });
    app.get('/api/auth/google/callback', async (req, res, next) => {
      try {
        const state = getCookie(req, GOOGLE_STATE_COOKIE);
        if (!googleOn || !state || state !== req.query.state || typeof req.query.code !== 'string') {
          return res.redirect('/?google=gagal');
        }
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          body: new URLSearchParams({
            code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: googleRedirect(req), grant_type: 'authorization_code',
          }),
        });
        const { id_token } = (await tokenRes.json()) as { id_token?: string };
        // id_token diterima langsung dari Google lewat TLS dengan client secret, jadi payload boleh dipercaya (tanpa cek tanda tangan).
        const claims = id_token ? JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString()) : null;
        if (!claims || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.email_verified !== true || typeof claims.email !== 'string') {
          return res.redirect('/?google=gagal');
        }
        const result = await localAuth!.loginWithEmail!(claims.email);
        if (!result) return res.redirect('/?google=tidak-terdaftar');
        setSessionCookie(res, result.token, SESSION_TTL_MS / 1000, LOCAL_SESSION_COOKIE);
        return res.redirect('/');
      } catch (error) {
        return next(error);
      }
    });

    app.get('/api/auth/me', async (req, res, next) => {
      const token = getCookie(req, LOCAL_SESSION_COOKIE);
      if (!token) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED' });
      try {
        const session = await localAuth!.resolveSession(token);
        if (!session) {
          setSessionCookie(res, '', 0, LOCAL_SESSION_COOKIE);
          return res.status(401).json({ success: false, code: 'INVALID_SESSION' });
        }
        return res.json({ success: true, authMode: 'local', user: session.user });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/auth/password', async (req, res, next) => {
      if (!isSameOrigin(req)) return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
      const token = getCookie(req, LOCAL_SESSION_COOKIE);
      const { currentPassword, newPassword } = req.body ?? {};
      if (!token) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED' });
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || currentPassword.length > 128) {
        return res.status(400).json({ success: false, code: 'WEAK_PASSWORD' });
      }
      try {
        const result = await localAuth!.changePassword?.(token, currentPassword, newPassword);
        const messages = {
          OK: 'Kata sandi berhasil diganti.',
          INVALID_SESSION: 'Sesi berakhir. Silakan login ulang.',
          WRONG_PASSWORD: 'Kata sandi saat ini salah.',
          WEAK_PASSWORD: 'Kata sandi baru minimal 8 karakter, beda dari yang lama dan bukan sandi bawaan.'
        } as const;
        if (!result) return res.status(404).json({ success: false, code: 'NOT_FOUND' });
        const status = result === 'OK' ? 200 : result === 'INVALID_SESSION' ? 401 : 400;
        return res.status(status).json({ success: result === 'OK', code: result, message: messages[result] });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/auth/logout', async (req, res, next) => {
      if (!isSameOrigin(req)) {
        return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
      }
      try {
        const token = getCookie(req, LOCAL_SESSION_COOKIE);
        if (token) await localAuth!.logout(token);
        setSessionCookie(res, '', 0, LOCAL_SESSION_COOKIE);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    });
  } else {
    app.post('/api/auth/session', async (req, res, next) => {
      if (!isSameOrigin(req)) {
        return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
      }
      if (typeof req.body?.idToken !== 'string' || req.body.idToken.length > 10_000) {
        return res.status(400).json({ success: false, code: 'INVALID_ID_TOKEN' });
      }

      try {
        const principal = await resolvePrincipal(req.body.idToken, false);
        if (!principal) {
          return res.status(401).json({ success: false, code: 'INVALID_IDENTITY' });
        }

        const sessionCookie = options.createSessionCookie
          ? await options.createSessionCookie(req.body.idToken)
          : await getFirebaseAdminServices().auth.createSessionCookie(req.body.idToken, { expiresIn: SESSION_TTL_MS });
        setSessionCookie(res, sessionCookie, SESSION_TTL_MS / 1000);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    });

    app.delete('/api/auth/session', async (req, res, next) => {
      if (!isSameOrigin(req)) {
        return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
      }

      try {
        const token = getCookie(req, SESSION_COOKIE);
        if (token) {
          if (options.revokeRefreshTokens) {
            const principal = await resolvePrincipal(token, true);
            if (principal) await options.revokeRefreshTokens(principal.uid);
          } else {
            const { auth } = getFirebaseAdminServices();
            const decoded = await auth.verifySessionCookie(token, true);
            await auth.revokeRefreshTokens(decoded.uid);
          }
        }
        setSessionCookie(res, '', 0);
        return res.status(204).end();
      } catch (error) {
        if ((error as { code?: string }).code === 'auth/session-cookie-expired' ||
            (error as { code?: string }).code === 'auth/session-cookie-revoked' ||
            (error as { code?: string }).code === 'auth/invalid-session-cookie') {
          setSessionCookie(res, '', 0);
          return res.status(204).end();
        }
        return next(error);
      }
    });
  }

  app.use('/api', async (req: CoreAuthRequest, res, next) => {
    const apiPath = `${req.baseUrl}${req.path}`;
    const publicAuthEndpoint = authMode === 'local'
      ? ['/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/password', '/api/auth/google', '/api/auth/google/callback'].includes(apiPath)
      : apiPath === '/api/auth/session';
    if (publicAuthEndpoint || apiPath === '/api/v1/health') return next();
    const scope = scopeForPath(apiPath, req);
    if (!scope) return res.status(404).json({ success: false, code: 'NOT_FOUND' });

    const cookieName = authMode === 'local' ? LOCAL_SESSION_COOKIE : SESSION_COOKIE;
    const cookieToken = getCookie(req, cookieName);
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const token = cookieToken || (authMode === 'local' ? '' : bearerToken);
    if (!token) {
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED' });
    }
    // CSRF: cookie juga terkirim dari subdomain lain (www) karena SameSite menganggapnya situs yang sama.
    if (cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isSameOrigin(req)) {
      return res.status(403).json({ success: false, code: 'ORIGIN_NOT_ALLOWED' });
    }

    try {
      const principal = await resolvePrincipal(token, Boolean(cookieToken));
      if (!principal) {
        return res.status(401).json({ success: false, code: 'INVALID_SESSION' });
      }

      if (!hasScope(principal.roleId, scope)) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      }
      if (scope !== 'dashboard' && !principal.mfaVerified && principal.authMode !== 'local') {
        return res.status(403).json({ success: false, code: 'MFA_REQUIRED' });
      }
      if (isWriteDenied(principal, req.method, apiPath)) {
        return res.status(403).json({ success: false, code: 'READ_ONLY' });
      }

      req.corePrincipal = principal;
      return next();
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/id-token-expired' ||
          (error as { code?: string }).code === 'auth/id-token-revoked' ||
          (error as { code?: string }).code === 'auth/invalid-id-token' ||
          (error as { code?: string }).code === 'auth/session-cookie-expired' ||
          (error as { code?: string }).code === 'auth/session-cookie-revoked' ||
          (error as { code?: string }).code === 'auth/invalid-session-cookie' ||
          (error as { code?: string }).code === 'auth/user-disabled' ||
          (error as { code?: string }).code === 'auth/user-not-found' ||
          (error as { code?: string }).code === 'auth/argument-error') {
        return res.status(401).json({ success: false, code: 'INVALID_SESSION' });
      }
      return next(error);
    }
  });

  if (authMode === 'local') {
    app.get('/api/v1/auth/users', async (_req, res, next) => {
      try {
        return res.json({ success: true, users: await localAuth!.listUsers() });
      } catch (error) {
        return next(error);
      }
    });

    app.post('/api/v1/auth/users', async (req: CoreAuthRequest, res, next) => {
      if (req.corePrincipal?.roleId !== 'super_admin' && req.body?.roleId === 'super_admin') {
        return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      }
      try {
        const user = await localAuth!.createUser(req.body);
        return res.status(201).json({ success: true, user });
      } catch (error) {
        if (sendLocalUserError(error, res)) return;
        return next(error);
      }
    });

    app.patch('/api/v1/auth/users/:id', async (req: CoreAuthRequest, res, next) => {
      const { id } = req.params;
      const roleId = req.body?.roleId;
      if ((req.corePrincipal?.roleId !== 'super_admin' && roleId === 'super_admin') ||
          (id === req.corePrincipal?.uid && (req.body?.aktif === false ||
            (typeof roleId === 'string' && !['admin', 'super_admin'].includes(roleId))))) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      }
      try {
        if (req.corePrincipal?.roleId !== 'super_admin' &&
            (await localAuth!.listUsers()).some((user) => user.id === id && user.roleId === 'super_admin')) {
          return res.status(403).json({ success: false, code: 'FORBIDDEN' });
        }
        const user = await localAuth!.updateUser(id, req.body);
        return res.json({ success: true, user });
      } catch (error) {
        if (sendLocalUserError(error, res)) return;
        return next(error);
      }
    });

    app.delete('/api/v1/auth/users/:id', async (req: CoreAuthRequest, res, next) => {
      if (req.params.id === req.corePrincipal?.uid) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      }
      try {
        if (req.corePrincipal?.roleId !== 'super_admin' &&
            (await localAuth!.listUsers()).some((user) => user.id === req.params.id && user.roleId === 'super_admin')) {
          return res.status(403).json({ success: false, code: 'FORBIDDEN' });
        }
        await localAuth!.deleteUser(req.params.id);
        return res.json({ success: true });
      } catch (error) {
        if (sendLocalUserError(error, res)) return;
        return next(error);
      }
    });
  }
}

export function assertProductionAuthConfiguration(authMode = getCoreAuthMode()): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ALLOW_INSECURE_DEMO_AUTH === 'true') {
    throw new Error('ALLOW_INSECURE_DEMO_AUTH must not be enabled in production.');
  }
  // Token sesi pasien dan tantangan MFA ditandatangani SESSION_SECRET di semua mode; tanpa itu tiap instance punya kunci acak sendiri.
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
  }
  if (authMode === 'local') return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Firebase Admin credentials are required before production can start.');
  }
}
