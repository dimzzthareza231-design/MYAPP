import type { Request } from 'express';

// Di Cloudflare Workers, Express menerima request lewat jembatan loopback, jadi req.ip selalu 127.0.0.1.
// IP asli ada di cf-connecting-ip, yang ditulis ulang oleh edge Cloudflare. Di luar Workers header itu bisa dipalsukan, jadi tidak dipakai.
export function clientIp(req: Pick<Request, 'ip' | 'headers' | 'socket'>): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (process.env.CLOUDFLARE_WORKER === '1' && typeof cfIp === 'string' && cfIp) return cfIp;
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
