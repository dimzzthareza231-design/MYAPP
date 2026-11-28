/// <reference types="@cloudflare/workers-types" />
// Web publik. Sengaja hanya punya DB_PUBLIC.
interface Env {
  DB_PUBLIC: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') {
      try {
        await env.DB_PUBLIC.prepare('SELECT 1').first();
        return Response.json({ ok: true });
      } catch {
        return Response.json({ ok: false }, { status: 503 });
      }
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
