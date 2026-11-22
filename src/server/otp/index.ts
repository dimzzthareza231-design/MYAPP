// Titik masuk modul OTP pasien (WhatsApp Cloud API).
import { createOtpSenderFromEnv, type OtpSender } from './sender';

export * from './phone';
export * from './sender';
export * from './store';
export * from './service';
export { randomId } from './crypto';

let testSenderOverride: OtpSender | null | undefined;

/**
 * HANYA UNTUK PENGUJIAN: memasang pengirim pengganti (mis. InMemoryTestOtpSender).
 * Melempar galat di luar NODE_ENV=test sehingga tidak bisa dipakai di produksi.
 * `undefined` mengembalikan ke pemilihan berbasis env.
 */
export function setOtpSenderForTests(sender: OtpSender | null | undefined): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setOtpSenderForTests hanya boleh dipakai saat NODE_ENV=test.');
  }
  testSenderOverride = sender;
}

/** Pengirim aktif, atau null bila WhatsApp belum dikonfigurasi (endpoint -> 503). */
export function resolveOtpSender(env: Record<string, string | undefined> = process.env): OtpSender | null {
  if (testSenderOverride !== undefined && env.NODE_ENV === 'test') return testSenderOverride;
  return createOtpSenderFromEnv(env);
}

/** Rahasia HMAC untuk hash OTP & kunci penyimpanan. OTP_HASH_SECRET, atau SESSION_SECRET sebagai cadangan. */
export function resolveOtpSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.OTP_HASH_SECRET?.trim() || env.SESSION_SECRET?.trim();
  return secret && secret.length >= 8 ? secret : null;
}
