// Primitif kriptografi berbasis Web Crypto agar berjalan sama di Node 20+, Vercel, dan Cloudflare Workers.

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function importHmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign'
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  return toHex(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Perbandingan waktu-konstan untuk dua string (panjang berbeda langsung gagal tanpa bocor isi). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Kode numerik acak seragam (rejection sampling, tanpa bias modulo). */
export function randomNumericCode(length = 6): string {
  const max = 10 ** length;
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % max).padStart(length, '0');
  }
}

export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
