// Logika login pasien dengan OTP WhatsApp. Tidak bergantung pada Express agar mudah diuji.
//
// Aturan keamanan:
// - Kode 6 digit hanya dikirim ke nomor yang TERDAFTAR pada rekam pasien; nomor dari permintaan
//   tidak pernah dipakai sebagai tujuan kecuali identik dengan nomor terdaftar.
// - Respons permintaan selalu generik (pasien tidak dikenal -> permintaan "umpan" dengan nomor
//   samaran yang deterministik), sehingga tidak membocorkan keberadaan pasien.
// - Hanya HMAC-SHA256(secret, requestId:code) yang disimpan; TTL 5 menit; maks 5 percobaan;
//   sekali pakai; perbandingan waktu-konstan; rate limit per identitas, per nomor tujuan, per IP.
import { hmacSha256Hex, randomId, randomNumericCode, timingSafeEqualString } from './crypto';
import { maskPhone, normalizeIndonesianPhone } from './phone';
import type { OtpSender } from './sender';
import type { OtpKvStore } from './store';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_REQUESTS_PER_TARGET = 3;
export const OTP_MAX_REQUESTS_PER_IP = 10;
export const OTP_MAX_VERIFY_PER_IP = 30;

export interface OtpPatient {
  no_rm: string;
  no_hp: string;
}

export interface OtpPatientDirectory {
  findByRm(noRm: string): OtpPatient | undefined;
  /** Semua pasien yang nomor terdaftarnya (setelah normalisasi) sama dengan e164. */
  findByPhone(e164: string): OtpPatient[];
}

export interface OtpAuditEntry {
  action: 'OTP_REQUEST' | 'OTP_VERIFY';
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  user: string;
  ip: string;
  details: string;
}

export interface OtpServiceDeps {
  store: OtpKvStore;
  sender: OtpSender;
  secret: string;
  patients: OtpPatientDirectory;
  audit?: (entry: OtpAuditEntry) => void | Promise<void>;
  now?: () => number;
}

interface OtpRequestRecord {
  id: string;
  /** null = permintaan umpan (pasien tidak dikenal); verifikasi selalu gagal. */
  no_rm: string | null;
  codeHash: string;
  attempts: number;
  createdAt: number;
  expiresAt: number;
}

interface CounterRecord {
  count: number;
  resetAt: number;
}

export type OtpRequestResult =
  | { kind: 'invalid_input' }
  | { kind: 'rate_limited'; retryAfterSec: number }
  | { kind: 'delivery_failed' }
  | { kind: 'accepted'; requestId: string; maskedPhone: string; expiresInSec: number; resendAfterSec: number };

export type OtpVerifyResult =
  | { kind: 'invalid_input' }
  | { kind: 'rate_limited'; retryAfterSec: number }
  | { kind: 'invalid_or_expired' }
  | { kind: 'wrong_code'; attemptsRemaining: number }
  | { kind: 'locked' }
  | { kind: 'ok'; no_rm: string };

const REQUEST_ID_RE = /^[a-f0-9]{32}$/;
const CODE_RE = new RegExp(`^\\d{${OTP_LENGTH}}$`);

function normalizeRm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase().slice(0, 64) : '';
}

export class OtpLoginService {
  private readonly now: () => number;
  constructor(private readonly deps: OtpServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  private async key(scope: string, value: string): Promise<string> {
    // Kunci penyimpanan memakai HMAC agar No. RM / nomor HP tidak tersimpan mentah di system_data.
    return `otp:${scope}:${(await hmacSha256Hex(this.deps.secret, `${scope}:${value}`)).slice(0, 48)}`;
  }

  private async audit(entry: OtpAuditEntry): Promise<void> {
    try {
      await this.deps.audit?.(entry);
    } catch (error) {
      console.warn('[OTP] audit log failed', error);
    }
  }

  /** Memeriksa semua penghitung dulu; hanya bila semuanya lolos, semuanya dinaikkan. */
  private async consumeCounters(counters: Array<{ key: string; max: number }>): Promise<number | null> {
    const now = this.now();
    const states = await Promise.all(
      counters.map(async (c) => ({ ...c, rec: await this.deps.store.get<CounterRecord>(c.key) }))
    );
    for (const s of states) {
      if (s.rec && s.rec.resetAt > now && s.rec.count >= s.max) {
        return Math.max(1, Math.ceil((s.rec.resetAt - now) / 1000));
      }
    }
    await Promise.all(
      states.map((s) => {
        const active = s.rec && s.rec.resetAt > now ? s.rec : { count: 0, resetAt: now + OTP_RATE_WINDOW_MS };
        const next = { count: active.count + 1, resetAt: active.resetAt };
        return this.deps.store.put(s.key, next, Math.max(1000, next.resetAt - now));
      })
    );
    return null;
  }

  private async decoyMask(identifier: string): Promise<string> {
    const h = await hmacSha256Hex(this.deps.secret, `decoy:${identifier}`);
    const n = parseInt(h.slice(0, 8), 16);
    const digitsAfter8 = 8 + (n % 3); // panjang lokal 11-13 digit, seperti nomor nyata
    const last3 = String(n % 1000).padStart(3, '0');
    return maskPhone(`628${'0'.repeat(digitsAfter8 - 3)}${last3}`);
  }

  async requestOtp(input: { no_rm?: unknown; no_hp?: unknown; ip: string }): Promise<OtpRequestResult> {
    const rmInput = normalizeRm(input.no_rm);
    const phoneInput = rmInput ? null : normalizeIndonesianPhone(input.no_hp);
    if (!rmInput && !phoneInput) return { kind: 'invalid_input' };
    if (rmInput && !/^[A-Z0-9._/-]{3,64}$/.test(rmInput)) return { kind: 'invalid_input' };

    const identifier = rmInput ? `rm:${rmInput}` : `hp:${phoneInput}`;

    // Tentukan pasien & nomor tujuan. Nomor dari permintaan tidak pernah dipakai bila berbeda
    // dengan nomor terdaftar (saat No. RM diisi, no_hp diabaikan sepenuhnya).
    let patient: OtpPatient | undefined;
    let destination: string | null = null;
    let reason = '';
    if (rmInput) {
      patient = this.deps.patients.findByRm(rmInput);
      if (!patient) reason = 'identitas tidak dikenal';
    } else {
      const matches = this.deps.patients.findByPhone(phoneInput!);
      if (matches.length === 1) patient = matches[0];
      else reason = matches.length > 1 ? 'nomor dipakai >1 pasien, perlu No. RM' : 'identitas tidak dikenal';
    }
    if (patient) {
      destination = normalizeIndonesianPhone(patient.no_hp);
      if (!destination) {
        reason = 'pasien tanpa nomor HP valid';
        patient = undefined;
      }
    }

    const ipKey = await this.key('rl-ip', input.ip || 'unknown');
    const idKey = await this.key('rl-id', identifier);
    const destKey = destination ? await this.key('rl-dest', destination) : idKey;
    const cooldownKey = await this.key('cd', destination ?? identifier);

    const cooldown = await this.deps.store.get<{ until: number }>(cooldownKey);
    if (cooldown && cooldown.until > this.now()) {
      return { kind: 'rate_limited', retryAfterSec: Math.max(1, Math.ceil((cooldown.until - this.now()) / 1000)) };
    }
    const counters = [
      { key: ipKey, max: OTP_MAX_REQUESTS_PER_IP },
      { key: idKey, max: OTP_MAX_REQUESTS_PER_TARGET },
      ...(destKey !== idKey ? [{ key: destKey, max: OTP_MAX_REQUESTS_PER_TARGET }] : [])
    ];
    const retryAfter = await this.consumeCounters(counters);
    if (retryAfter !== null) {
      await this.audit({
        action: 'OTP_REQUEST',
        status: 'WARNING',
        user: patient?.no_rm ?? 'anonim',
        ip: input.ip,
        details: 'Permintaan OTP ditolak: batas permintaan terlampaui.'
      });
      return { kind: 'rate_limited', retryAfterSec: retryAfter };
    }

    const now = this.now();
    const requestId = randomId(16);
    const code = randomNumericCode(OTP_LENGTH);
    const record: OtpRequestRecord = {
      id: requestId,
      no_rm: patient ? patient.no_rm : null,
      codeHash: await hmacSha256Hex(this.deps.secret, `${requestId}:${code}`),
      attempts: 0,
      createdAt: now,
      expiresAt: now + OTP_TTL_MS
    };
    await this.deps.store.put(await this.key('req', requestId), record, OTP_TTL_MS);
    await this.deps.store.put(cooldownKey, { until: now + OTP_RESEND_COOLDOWN_MS }, OTP_RESEND_COOLDOWN_MS);

    let maskedPhone: string;
    if (patient && destination) {
      const sent = await this.deps.sender.sendOtp(destination, code);
      if (!sent.ok) {
        await this.deps.store.delete(await this.key('req', requestId));
        await this.deps.store.delete(cooldownKey);
        await this.audit({
          action: 'OTP_REQUEST',
          status: 'FAILED',
          user: patient.no_rm,
          ip: input.ip,
          details: `Pengiriman OTP via ${this.deps.sender.channel} gagal (${sent.error ?? 'unknown'}).`
        });
        return { kind: 'delivery_failed' };
      }
      maskedPhone = maskPhone(destination);
      await this.audit({
        action: 'OTP_REQUEST',
        status: 'SUCCESS',
        user: patient.no_rm,
        ip: input.ip,
        details: `OTP dikirim via ${this.deps.sender.channel} ke ${maskedPhone}${sent.providerMessageId ? ` (msg ${sent.providerMessageId})` : ''}.`
      });
    } else {
      // Permintaan umpan: tidak ada pesan terkirim, respons identik.
      maskedPhone = phoneInput ? maskPhone(phoneInput) : await this.decoyMask(identifier);
      await this.audit({
        action: 'OTP_REQUEST',
        status: 'WARNING',
        user: 'anonim',
        ip: input.ip,
        details: `Permintaan OTP tanpa pengiriman: ${reason}.`
      });
    }

    return {
      kind: 'accepted',
      requestId,
      maskedPhone,
      expiresInSec: OTP_TTL_MS / 1000,
      resendAfterSec: OTP_RESEND_COOLDOWN_MS / 1000
    };
  }

  async verifyOtp(input: { request_id?: unknown; code?: unknown; ip: string }): Promise<OtpVerifyResult> {
    const requestId = typeof input.request_id === 'string' ? input.request_id.trim().toLowerCase() : '';
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (!REQUEST_ID_RE.test(requestId) || !CODE_RE.test(code)) return { kind: 'invalid_input' };

    const retryAfter = await this.consumeCounters([
      { key: await this.key('rl-vip', input.ip || 'unknown'), max: OTP_MAX_VERIFY_PER_IP }
    ]);
    if (retryAfter !== null) return { kind: 'rate_limited', retryAfterSec: retryAfter };

    const reqKey = await this.key('req', requestId);
    const record = await this.deps.store.get<OtpRequestRecord>(reqKey);
    const now = this.now();
    if (!record || record.expiresAt <= now) {
      await this.audit({
        action: 'OTP_VERIFY',
        status: 'FAILED',
        user: 'anonim',
        ip: input.ip,
        details: 'Verifikasi OTP gagal: permintaan tidak ada, sudah dipakai, atau kedaluwarsa.'
      });
      return { kind: 'invalid_or_expired' };
    }
    if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await this.deps.store.delete(reqKey);
      return { kind: 'locked' };
    }

    const expected = await hmacSha256Hex(this.deps.secret, `${requestId}:${code}`);
    const match = timingSafeEqualString(expected, record.codeHash);
    if (match && record.no_rm) {
      // Sekali pakai: hapus sebelum sesi diterbitkan.
      await this.deps.store.delete(reqKey);
      await this.audit({
        action: 'OTP_VERIFY',
        status: 'SUCCESS',
        user: record.no_rm,
        ip: input.ip,
        details: 'Login pasien berhasil dengan OTP WhatsApp.'
      });
      return { kind: 'ok', no_rm: record.no_rm };
    }

    const attempts = record.attempts + 1;
    const remaining = OTP_MAX_VERIFY_ATTEMPTS - attempts;
    if (remaining <= 0) {
      await this.deps.store.delete(reqKey);
    } else {
      await this.deps.store.put(reqKey, { ...record, attempts }, Math.max(1000, record.expiresAt - now));
    }
    await this.audit({
      action: 'OTP_VERIFY',
      status: 'FAILED',
      user: record.no_rm ?? 'anonim',
      ip: input.ip,
      details: remaining <= 0 ? 'Kode OTP salah; permintaan dikunci.' : `Kode OTP salah (sisa ${remaining} percobaan).`
    });
    return remaining <= 0 ? { kind: 'locked' } : { kind: 'wrong_code', attemptsRemaining: remaining };
  }
}
