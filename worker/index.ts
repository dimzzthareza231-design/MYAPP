// Entry Cloudflare Worker: menjalankan Express app yang sama dengan Node/Vercel lewat httpServerHandler-style routing.
// APP_TARGET (var per env di wrangler.jsonc) memilih API: 'public' = /api/public + /api/patient, selain itu = API inti.
import http from 'node:http';
import { env } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApps, addErrorHandler } from '../server';
import type { D1DatabaseLike } from '../src/server/databaseAdapter';
import { publicSpaStatus } from '../src/server/spaRoutes';

const PORT = 8080;
let ready: Promise<void> | undefined;

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

async function start(): Promise<void> {
  const { app, publicApp } = await createApps({}, { mode: 'd1', d1: env.DB as D1DatabaseLike });
  const target = process.env.APP_TARGET === 'public' ? publicApp : app;
  addErrorHandler(target);
  await new Promise<void>((resolve) => http.createServer(target).listen(PORT, resolve));
}

/**
 * Web publik memakai `not_found_handling: "none"`: file statis yang ada dilayani langsung oleh
 * Cloudflare, sedangkan path lain sampai ke Worker. Navigasi ke rute SPA yang dikenal mendapat
 * index.html dengan 200; path tak dikenal tetap mendapat SPA (merender halaman 404) dengan status 404.
 */
async function servePublicSpa(request: Request): Promise<Response> {
  const assets = env.ASSETS as AssetsBinding | undefined;
  if (!assets || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const url = new URL(request.url);
  // Tanpa header kondisional klien agar tidak mendapat 304 tanpa isi.
  const shell = await assets.fetch(new Request(new URL('/', url)));
  const headers = new Headers(shell.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  const status = publicSpaStatus(url.pathname);
  if (status === 404) headers.set('X-Robots-Tag', 'noindex');
  return new Response(request.method === 'HEAD' ? null : shell.body, { status, headers });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (process.env.APP_TARGET === 'public' && pathname !== '/api' && !pathname.startsWith('/api/')) {
      return servePublicSpa(request);
    }
    // Retry startup on the next request if it failed (e.g. migration not applied yet).
    ready ??= start().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    try {
      await ready;
    } catch (error) {
      console.error('[Worker] startup failed:', error);
      return Response.json({ success: false, code: 'STARTUP_FAILED' }, { status: 503 });
    }
    return handleAsNodeRequest(PORT, request);
  }
};
