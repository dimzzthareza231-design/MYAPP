// Entry Cloudflare Worker: menjalankan Express app yang sama dengan Node/Vercel lewat httpServerHandler-style routing.
// APP_TARGET (var per env di wrangler.jsonc) memilih API: 'public' = /api/public + /api/patient, selain itu = API inti.
import http from 'node:http';
import { env } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApps, addErrorHandler } from '../server';
import type { D1DatabaseLike } from '../src/server/databaseAdapter';

const PORT = 8080;
let ready: Promise<void> | undefined;

async function start(): Promise<void> {
  const { app, publicApp } = await createApps({}, { mode: 'd1', d1: env.DB as D1DatabaseLike });
  const target = process.env.APP_TARGET === 'public' ? publicApp : app;
  addErrorHandler(target);
  await new Promise<void>((resolve) => http.createServer(target).listen(PORT, resolve));
}

export default {
  async fetch(request: Request): Promise<Response> {
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
