/// <reference types="@cloudflare/workers-types" />
// Aplikasi inti. Hanya /api/* sampai ke sini; sisanya dilayani assets.
interface Env {
  DB_CORE: D1Database;
  DB_HR: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') {
      try {
        await env.DB_CORE.prepare('SELECT 1').first();
        await env.DB_HR.prepare('SELECT 1').first();
        return Response.json({ ok: true });
      } catch {
        return Response.json({ ok: false }, { status: 503 });
      }
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
