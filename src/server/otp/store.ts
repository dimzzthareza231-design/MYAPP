// Penyimpanan kunci-nilai berumur (TTL) untuk permintaan OTP dan penghitung rate limit.
// Produksi: PersistenceOtpStore memakai adapter persistensi yang sama dengan aplikasi (D1/MySQL,
// entitas `system_data`), sehingga konsisten di semua instance Worker/serverless.
// MemoryOtpStore hanya untuk pengujian/dev lokal: data hilang saat proses berhenti dan tidak dibagi antar-instance.
import type { PersistenceRepository } from '../databaseAdapter';

export interface OtpKvStore {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Envelope<T> {
  kind: 'otp_kv';
  value: T;
  expiresAt: number;
}

export class MemoryOtpStore implements OtpKvStore {
  private readonly map = new Map<string, Envelope<unknown>>();
  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value as T;
  }

  async put<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.map.set(key, { kind: 'otp_kv', value, expiresAt: this.now() + ttlMs });
    if (this.map.size > 10_000) {
      const now = this.now();
      for (const [k, v] of this.map) if (v.expiresAt <= now) this.map.delete(k);
    }
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/**
 * Catatan: adapter persistensi tidak menyediakan compare-and-swap, jadi penghitung percobaan
 * bisa sedikit terlampaui bila banyak permintaan paralel tiba di instance berbeda pada milidetik
 * yang sama. Dengan ruang kode 10^6 dan batas 5 percobaan, risikonya tetap sangat kecil.
 * Baris kedaluwarsa dihapus saat dibaca.
 */
export class PersistenceOtpStore implements OtpKvStore {
  constructor(private readonly persistence: PersistenceRepository, private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | null> {
    const env = await this.persistence.get<Envelope<T>>('system_data', key);
    if (!env || env.kind !== 'otp_kv') return null;
    if (typeof env.expiresAt !== 'number' || env.expiresAt <= this.now()) {
      await this.delete(key).catch(() => undefined);
      return null;
    }
    return env.value;
  }

  async put<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const env: Envelope<T> = { kind: 'otp_kv', value, expiresAt: this.now() + ttlMs };
    await this.persistence.commit([{ entity: 'system_data', id: key, data: env }]);
  }

  async delete(key: string): Promise<void> {
    await this.persistence.commit([{ entity: 'system_data', id: key, data: null }]);
  }
}
