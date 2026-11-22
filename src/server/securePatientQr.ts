import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'MYITARU1.';
const TOKEN_AAD = Buffer.from('MYITARU1', 'utf8');

export interface SecurePatientQrClaims {
  version: 1;
  kind: 'patient' | 'reservation' | 'document';
  subject: string;
  issuedAt: number;
  expiresAt?: number;
  scope?: SecurePatientQrScope;
}

export type SecurePatientQrScope =
  | 'rekam-medis'
  | 'laboratorium'
  | 'radiologi'
  | 'kasir'
  | 'sdm'
  | 'mutu'
  | 'vclaim'
  | 'apotek-ralan';

const VALID_SCOPES: SecurePatientQrScope[] = [
  'rekam-medis', 'laboratorium', 'radiologi', 'kasir', 'sdm', 'mutu', 'vclaim', 'apotek-ralan'
];

const DOCUMENT_TYPE_SCOPES: Record<string, SecurePatientQrScope> = {
  hasil_laboratorium: 'laboratorium',
  hasil_radiologi: 'radiologi',
  kuitansi_billing: 'kasir',
  profil_sdm: 'sdm',
  laporan_insiden: 'mutu',
  sep_bpjs: 'vclaim',
  resep_obat: 'apotek-ralan'
};

export function getDocumentQrScope(documentType: unknown): SecurePatientQrScope {
  return typeof documentType === 'string'
    ? DOCUMENT_TYPE_SCOPES[documentType] || 'rekam-medis'
    : 'rekam-medis';
}

export function isSecurePatientQrConfigured(): boolean {
  return Boolean(process.env.MYITARU_QR_SECRET || process.env.SESSION_SECRET);
}

function getEncryptionKey(): Buffer {
  const secret = process.env.MYITARU_QR_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('MYITARU_QR_SECRET or SESSION_SECRET must be configured before issuing patient QR codes.');

  return Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('MYITARU key derivation v1', 'utf8'),
    Buffer.from('patient-qr/aes-256-gcm', 'utf8'),
    32
  ));
}

export function createSecurePatientQrToken(
  subject: string,
  options: {
    kind?: SecurePatientQrClaims['kind'];
    scope?: SecurePatientQrScope;
    ttlMs?: number;
    now?: number;
  } = {}
): string {
  if (!subject.trim() || subject.length > 128) {
    throw new Error('Workflow QR subject is invalid.');
  }
  if (options.ttlMs !== undefined && (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0)) {
    throw new Error('Patient QR expiration must be a positive integer duration.');
  }

  const now = options.now ?? Date.now();
  const claims: SecurePatientQrClaims = {
    version: 1,
    kind: options.kind || 'patient',
    subject,
    issuedAt: now,
    ...(options.ttlMs === undefined ? {} : { expiresAt: now + options.ttlMs }),
    ...(options.kind === 'document' ? { scope: options.scope || 'rekam-medis' } : {})
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(claims), 'utf8'),
    cipher.final()
  ]);
  const tokenData = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  return `${TOKEN_PREFIX}${tokenData}`;
}

export function readSecurePatientQrToken(token: string, now = Date.now()): SecurePatientQrClaims | null {
  if (token.length > 2048 || !token.startsWith(TOKEN_PREFIX)) return null;
  const encoded = token.slice(TOKEN_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;

  const data = Buffer.from(encoded, 'base64url');
  if (data.toString('base64url') !== encoded || data.length < 29) return null;

  try {
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const claims = JSON.parse(plaintext) as Partial<SecurePatientQrClaims>;

    if (claims.version !== 1 ||
        (claims.kind !== 'patient' && claims.kind !== 'reservation' && claims.kind !== 'document') ||
        (claims.scope !== undefined &&
          (claims.kind !== 'document' || !VALID_SCOPES.includes(claims.scope))) ||
        typeof claims.subject !== 'string' || !claims.subject.trim() || claims.subject.length > 128 ||
        !Number.isSafeInteger(claims.issuedAt) || (claims.issuedAt as number) > now + 5 * 60 * 1000) {
      return null;
    }
    if (claims.expiresAt !== undefined &&
        (!Number.isSafeInteger(claims.expiresAt) || (claims.expiresAt as number) <= now)) {
      return null;
    }

    return claims as SecurePatientQrClaims;
  } catch {
    return null;
  }
}
