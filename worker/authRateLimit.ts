// Batas percobaan login lintas isolate lewat Cloudflare Rate Limiting binding (AUTH_LIMITER di wrangler.jsonc).
// Limiter Express di server.ts tetap jalan sebagai lapis kedua, tapi hitungannya hanya per isolate.
export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/gateway/auth/login',
  '/api/gateway/auth/verify-mfa',
  '/api/patient/verify',
  '/api/patient/google-session'
]);

export async function checkAuthRateLimit(request: Request, limiter?: RateLimiterLike): Promise<Response | undefined> {
  if (!limiter || request.method !== 'POST') return undefined;
  const path = new URL(request.url).pathname;
  if (!AUTH_PATHS.has(path)) return undefined;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const { success } = await limiter.limit({ key: `${ip}:${path}` });
    if (success) return undefined;
  } catch (error) {
    // Gagal terbuka: limiter per isolate di Express masih membatasi.
    console.error('[Worker] AUTH_LIMITER error:', error);
    return undefined;
  }
  return Response.json({ success: false, code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } });
}
