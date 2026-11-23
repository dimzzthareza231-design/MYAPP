// Enkripsi rahasia MFA saat disimpan (AES-256-GCM) dan hash kode pemulihan (HMAC-SHA256).
// Kunci diturunkan dari SESSION_SECRET dengan HKDF-SHA256 melalui Web Crypto, sehingga berjalan
// di Node 20 maupun Cloudflare Workers. Kunci diturunkan saat pertama dipakai (bukan di global scope).
import { base32Encode, constantTimeEqual, randomBytes } from './totp';

const CIPHERTEXT_VERSION = 'v1';
const HKDF_SALT = 'MYITARU key derivation v1';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface MfaSecretBox {
  encrypt(plaintext: string, associatedData: string): Promise<string>;
  decrypt(ciphertext: string, associatedData: string): Promise<string | null>;
  hashRecoveryCode(userId: string, code: string): Promise<string>;
  matchRecoveryCode(userId: string, code: string, hashes: readonly string[]): Promise<number>;
}

/** Format kode pemulihan: xxxxx-xxxxx (base32, 50 bit). */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string | null {
  if (typeof code !== 'string' || code.length > 32) return null;
  const normalized = code.replace(/[\s-]/g, '').toLowerCase();
  return /^[a-z2-7]{10}$/.test(normalized) ? normalized : null;
}

export function createMfaSecretBox(secret: string): MfaSecretBox {
  if (!secret) throw new Error('MFA secret box requires a non-empty secret.');
  const encoder = new TextEncoder();
  let keys: Promise<{ aes: CryptoKey; recovery: CryptoKey }> | undefined;

  const deriveKeys = () => {
    keys ??= (async () => {
      const subtle = globalThis.crypto.subtle;
      const master = await subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
      const hkdf = (info: string) => ({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode(HKDF_SALT),
        info: encoder.encode(info)
      });
      const aes = await subtle.deriveKey(
        hkdf('local-auth-mfa/aes-256-gcm'),
        master,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      const recovery = await subtle.deriveKey(
        hkdf('local-auth-mfa/recovery-code-hmac'),
        master,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign']
      );
      return { aes, recovery };
    })();
    return keys;
  };

  const hashRecoveryCode = async (userId: string, code: string): Promise<string> => {
    const normalized = normalizeRecoveryCode(code) ?? '';
    const { recovery } = await deriveKeys();
    const mac = await globalThis.crypto.subtle.sign('HMAC', recovery, encoder.encode(`${userId}:${normalized}`));
    return toHex(new Uint8Array(mac));
  };

  return {
    async encrypt(plaintext, associatedData) {
      const { aes } = await deriveKeys();
      const iv = randomBytes(12);
      const ciphertext = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(associatedData) },
        aes,
        encoder.encode(plaintext)
      );
      return `${CIPHERTEXT_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
    },
    async decrypt(ciphertext, associatedData) {
      if (typeof ciphertext !== 'string') return null;
      const [version, ivPart, dataPart, extra] = ciphertext.split('.');
      if (version !== CIPHERTEXT_VERSION || !ivPart || !dataPart || extra !== undefined) return null;
      const iv = fromBase64Url(ivPart);
      const data = fromBase64Url(dataPart);
      if (!iv || iv.length !== 12 || !data) return null;
      try {
        const { aes } = await deriveKeys();
        const plaintext = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(associatedData) },
          aes,
          data as BufferSource
        );
        return new TextDecoder().decode(plaintext);
      } catch {
        return null;
      }
    },
    hashRecoveryCode,
    async matchRecoveryCode(userId, code, hashes) {
      if (!normalizeRecoveryCode(code)) return -1;
      const candidate = await hashRecoveryCode(userId, code);
      let matchedIndex = -1;
      hashes.forEach((hash, index) => {
        if (constantTimeEqual(hash, candidate) && matchedIndex === -1) matchedIndex = index;
      });
      return matchedIndex;
    }
  };
}
