import crypto from 'crypto';

// Token bertanda tangan HMAC yang membawa datanya sendiri, jadi tetap valid di instance serverless lain.
// Map lokal tetap dipakai sebagai cache agar perubahan dalam satu instance (mis. konteks ABAC) bertahan.
// SESSION_SECRET wajib diisi di produksi; fallback acak hanya berlaku selama satu proses (dev lokal).
// Dihitung saat pertama dipakai: Cloudflare Workers melarang membuat nilai acak di global scope.
let secret: string | undefined;
const sign = (body: string) => {
  secret ??= process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
};

/**
 * @param prefix awalan token (mis. 'pat_')
 * @param tokenField nama field di data yang berisi token itu sendiri
 */
export function createSignedStore<T extends object>(prefix: string, tokenField: keyof T, ttlMs: number) {
  const cache = new Map<string, T>();
  // shortcut: pencabutan token hanya berlaku di instance ini; pakai database untuk revoke global.
  const revoked = new Set<string>();

  function verify(token: string): T | undefined {
    if (!token.startsWith(prefix)) return undefined;
    const [body, sig] = token.slice(prefix.length).split('.');
    if (!body || !sig) return undefined;
    const expected = sign(body);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return undefined;
    try {
      const { exp, data } = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
      if (typeof exp !== 'number' || exp < Date.now()) return undefined;
      return { ...data, [tokenField]: token } as T;
    } catch {
      return undefined;
    }
  }

  return {
    /** Menerbitkan token untuk `data`, menuliskannya ke data[tokenField], dan mengembalikan token. */
    issue(data: T): string {
      const payload = { ...data, [tokenField]: null };
      const body = Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs, data: payload })).toString('base64url');
      const token = `${prefix}${body}.${sign(body)}`;
      (data as any)[tokenField] = token;
      if (cache.size > 5000) for (const key of cache.keys()) if (!verify(key)) cache.delete(key);
      cache.set(token, data);
      return token;
    },
    get(token: string): T | undefined {
      if (!token || revoked.has(token)) return undefined;
      // Selalu verifikasi ulang agar token kedaluwarsa ditolak walau masih ada di cache.
      const data = verify(token);
      if (!data) {
        cache.delete(token);
        return undefined;
      }
      const hit = cache.get(token);
      if (hit) return hit;
      cache.set(token, data);
      return data;
    },
    has(token: string): boolean {
      return this.get(token) !== undefined;
    },
    delete(token: string): void {
      cache.delete(token);
      revoked.add(token);
    },
    get size(): number {
      return cache.size;
    }
  };
}
