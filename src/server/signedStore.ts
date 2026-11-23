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
  // Cache menyimpan waktu kedaluwarsa: tanpa ini token yang terbit di instance ini tidak pernah kedaluwarsa.
  const cache = new Map<string, { data: T; exp: number }>();
  // shortcut: pencabutan token hanya berlaku di instance ini; pakai database untuk revoke global.
  const revoked = new Map<string, number>();
  let nextSweepAt = 0;

  // Membuang entri kedaluwarsa agar cache/revoked tidak tumbuh tanpa batas pada proses yang berjalan lama.
  function sweep(now: number): void {
    if (now < nextSweepAt) return;
    nextSweepAt = now + Math.min(ttlMs, 60 * 1000);
    for (const [token, entry] of cache) if (entry.exp < now) cache.delete(token);
    for (const [token, exp] of revoked) if (exp < now) revoked.delete(token);
  }

  function verify(token: string): { data: T; exp: number } | undefined {
    if (!token.startsWith(prefix)) return undefined;
    const [body, sig] = token.slice(prefix.length).split('.');
    if (!body || !sig) return undefined;
    const sigBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(sign(body));
    // Bandingkan panjang byte, bukan karakter: timingSafeEqual melempar RangeError bila panjang buffer berbeda.
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return undefined;
    try {
      const { exp, data } = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
      if (typeof exp !== 'number' || exp < Date.now()) return undefined;
      return { data: { ...data, [tokenField]: token } as T, exp };
    } catch {
      return undefined;
    }
  }

  return {
    /** Menerbitkan token untuk `data`, menuliskannya ke data[tokenField], dan mengembalikan token. */
    issue(data: T): string {
      const now = Date.now();
      sweep(now);
      const exp = now + ttlMs;
      const payload = { ...data, [tokenField]: null };
      const body = Buffer.from(JSON.stringify({ exp, data: payload })).toString('base64url');
      const token = `${prefix}${body}.${sign(body)}`;
      (data as any)[tokenField] = token;
      cache.set(token, { data, exp });
      return token;
    },
    get(token: string): T | undefined {
      if (!token || revoked.has(token)) return undefined;
      const now = Date.now();
      const hit = cache.get(token);
      if (hit) {
        if (hit.exp >= now) return hit.data;
        cache.delete(token);
        return undefined;
      }
      const verified = verify(token);
      if (!verified) return undefined;
      sweep(now);
      cache.set(token, verified);
      return verified.data;
    },
    has(token: string): boolean {
      return this.get(token) !== undefined;
    },
    delete(token: string): void {
      const exp = cache.get(token)?.exp ?? verify(token)?.exp ?? Date.now() + ttlMs;
      cache.delete(token);
      revoked.set(token, exp);
    },
    get size(): number {
      return cache.size;
    }
  };
}
