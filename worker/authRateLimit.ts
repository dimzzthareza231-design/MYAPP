// Batas percobaan login lintas isolate lewat Cloudflare Rate Limiting binding (AUTH_LIMITER di wrangler.jsonc).
// Limiter Express di server.ts tetap jalan sebagai lapis kedua, tapi hitungannya hanya per isolate.
export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/mfa/complete',
  '/api/gateway/auth/login',
  '/api/gateway/auth/verify-mfa',
  '/api/patient/verify',
  '/api/patient/google-session',
  // Booking publik tanpa login: tanpa batas lintas isolate bisa dipakai membanjiri data pasien/antrean.
  '/api/patient/appointments'
]);

export async function checkAuthRateLimit(
  request: Request,
  limiter?: RateLimiterLike,
  response?: Response
): Promise<Response | undefined> {
  if (!limiter || request.method !== 'POST') return undefined;
  const path = new URL(request.url).pathname.toLowerCase().replace(/\/+$/, '');
  if (!AUTH_PATHS.has(path)) return undefined;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const isBooking = path === '/api/patient/appointments';
  if (isBooking ? response !== undefined : !response || ![400, 401].includes(response.status)) return undefined;
  try {
    let identifier = '';
    if (!isBooking) {
      try {
        const body = await request.clone().json() as Record<string, unknown>;
        const value = path === '/api/auth/login'
          ? body.identifier
          : path === '/api/auth/mfa/complete'
            ? body.userId
          : path === '/api/gateway/auth/verify-mfa'
            ? body.challengeId
            : body.identifier || body.divisionId || body.no_rm || body.email;
        if (typeof value === 'string') identifier = value.trim().toLowerCase();
      } catch {
        identifier = '<invalid>';
      }
    }
    const { success } = await limiter.limit({ key: `${ip}:${path}${identifier ? `:${identifier}` : ''}` });
    if (success) return undefined;
  } catch (error) {
    // Gagal terbuka; LocalAuthService still applies per-IP/per-identifier lockout.
    console.error('[Worker] AUTH_LIMITER error:', error);
    return undefined;
  }
  return Response.json({ success: false, code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } });
}
