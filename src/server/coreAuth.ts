import type express from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { COMMON_MODULES, MODULE_ALIASES, ROLES } from '../data/roles';
import { getDocumentQrScope, readSecurePatientQrToken } from './securePatientQr';

const SESSION_COOKIE = 'myitaru_core_session';
const LOCAL_SESSION_COOKIE = 'myitaru_local_session';
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
    login(identifier: string, password: string): Promise<{
      token: string;
      user: {
        id: string;
        username: string;
        email: string;
        nama: string;
        roleId: string;
        aktif: true;
        dibuatPada: string;
      };
      principal: CorePrincipal;
    } | null>;
    resolveSession(token: string): Promise<{
      user: {
        id: string;
        username: string;
        email: string;
        nama: string;
        roleId: string;
        aktif: true;
        dibuatPada: string;
      };
      principal: CorePrincipal;
    } | null>;
    logout(token: string): Promise<void>;
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

function scopeForPath(path: string, req?: express.Request): string | null {
  if (path === '/api/v1/dossier/document-qr/issue') {
    return getDocumentQrScope(req?.body?.documentType);
  }
  if (path === '/api/v1/patient-qr/redeem' && typeof req?.body?.token === 'string') {
    const claims = readSecurePatientQrToken(req.body.token);
    if (claims?.kind === 'document') return claims.scope || 'rekam-medis';
  }
  if (path === '/api/v1/health' || path === '/api/v1/system/stats' || path.startsWith('/api/v1/health-updates')) return 'dashboard';
  if (path.startsWith('/api/v1/system-data')) return 'dashboard';
  if (path.startsWith('/api/v1/patients')) return 'pendaftaran';
  if (path.startsWith('/api/v1/appointments')) return 'pendaftaran';
  if (path.startsWith('/api/v1/patient-qr')) return 'rekam-medis';
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

function hasScope(roleId: string, scope: string): boolean {
  if (roleId === 'super_admin' || COMMON_MODULES.includes(scope)) return true;
  const role = ROLES.find((item) => item.id === roleId);
  if (!role) return false;
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
      ? ['/api/auth/login', '/api/auth/me', '/api/auth/logout'].includes(apiPath)
      : apiPath === '/api/auth/session';
    if (publicAuthEndpoint || apiPath === '/api/v1/health') return next();

    const cookieName = authMode === 'local' ? LOCAL_SESSION_COOKIE : SESSION_COOKIE;
    const cookieToken = getCookie(req, cookieName);
    const authorization = req.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const token = cookieToken || (authMode === 'local' ? '' : bearerToken);
    if (!token) {
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED' });
    }

    try {
      const principal = await resolvePrincipal(token, Boolean(cookieToken));
      if (!principal) {
        return res.status(401).json({ success: false, code: 'INVALID_SESSION' });
      }

      const scope = scopeForPath(apiPath, req);
      if (scope && !hasScope(principal.roleId, scope)) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN' });
      }
      if (!scope) {
        return res.status(404).json({ success: false, code: 'NOT_FOUND' });
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
}

export function assertProductionAuthConfiguration(authMode = getCoreAuthMode()): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (authMode === 'local') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      throw new Error('SESSION_SECRET must contain at least 32 characters for production local authentication.');
    }
    return;
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Firebase Admin credentials are required before production can start.');
  }
}
