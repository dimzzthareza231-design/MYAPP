// TOTP (RFC 6238, HMAC-SHA1) tanpa dependensi tambahan.
// Hanya memakai Web Crypto (crypto.subtle / crypto.getRandomValues) agar berjalan sama di Node 20 dan
// Cloudflare Workers. Tidak ada nilai acak yang dibuat di global scope (dilarang di Workers):
// semua pembangkitan acak terjadi saat fungsi dipanggil.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_SECRET_BYTES = 20;

function webCrypto(): Crypto {
  const instance = globalThis.crypto;
  if (!instance?.subtle || typeof instance.getRandomValues !== 'function') {
    throw new Error('Web Crypto API is not available in this runtime.');
  }
  return instance;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  webCrypto().getRandomValues(bytes);
  return bytes;
}

export function base32Encode(bytes: Uint8Array): string {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

/** Menerima huruf besar/kecil, spasi, tanda hubung, dan padding '='. Mengembalikan null bila tidak valid. */
export function base32Decode(input: string): Uint8Array | null {
  const normalized = input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!normalized || /[^A-Z2-7]/.test(normalized)) return null;
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  return Uint8Array.from(output);
}

/** Rahasia TOTP baru (160 bit, sesuai rekomendasi RFC 4226) dalam base32 tanpa padding. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/** Perbandingan string dengan waktu konstan terhadap isi (panjang tetap dibandingkan). */
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export function totpStep(timeMs = Date.now(), periodSeconds = TOTP_PERIOD_SECONDS): number {
  return Math.floor(timeMs / 1000 / periodSeconds);
}

async function hotp(secret: Uint8Array, counter: number, digits: number): Promise<string> {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('TOTP counter is invalid.');
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const subtle = webCrypto().subtle;
  const key = await subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await subtle.sign('HMAC', key, message as BufferSource));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export interface TotpOptions {
  timeMs?: number;
  periodSeconds?: number;
  digits?: number;
}

export async function generateTotp(secret: Uint8Array | string, options: TotpOptions = {}): Promise<string> {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  if (!key?.length) throw new Error('TOTP secret is invalid.');
  return hotp(key, totpStep(options.timeMs, options.periodSeconds), options.digits ?? TOTP_DIGITS);
}

export interface TotpVerifyOptions extends TotpOptions {
  /** Jumlah langkah toleransi sebelum/sesudah langkah saat ini (bawaan ±1). */
  window?: number;
  /** Langkah terakhir yang sudah dipakai; langkah <= nilai ini ditolak (proteksi replay). */
  lastUsedStep?: number;
}

/**
 * Memverifikasi kode TOTP. Mengembalikan langkah (time step) yang cocok, atau null.
 * Semua langkah dalam jendela selalu dihitung dan dibandingkan dengan waktu konstan.
 */
export async function verifyTotp(
  secret: Uint8Array | string,
  code: string,
  options: TotpVerifyOptions = {}
): Promise<number | null> {
  const digits = options.digits ?? TOTP_DIGITS;
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  if (!key?.length || typeof code !== 'string') return null;
  const normalizedCode = code.replace(/\s/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(normalizedCode)) return null;

  const window = Math.max(0, Math.min(options.window ?? 1, 10));
  const current = totpStep(options.timeMs, options.periodSeconds);
  const lastUsedStep = Number.isFinite(options.lastUsedStep) ? options.lastUsedStep as number : -1;
  let matched: number | null = null;
  for (let step = current - window; step <= current + window; step += 1) {
    if (step < 0) continue;
    const expected = await hotp(key, step, digits);
    const equal = constantTimeEqual(expected, normalizedCode);
    if (equal && step > lastUsedStep && matched === null) matched = step;
  }
  return matched;
}

export function buildOtpauthUri(params: { secret: string; issuer: string; accountName: string }): string {
  const issuer = params.issuer.trim() || 'MYITARU';
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(params.accountName)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
