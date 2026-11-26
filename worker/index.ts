// Entry Cloudflare Worker: menjalankan Express app yang sama dengan Node/Vercel lewat httpServerHandler-style routing.
// APP_TARGET (var per env di wrangler.jsonc) memilih API: 'public' = /api/public + /api/patient, selain itu = API inti.
import http from 'node:http';
import { DurableObject, env } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApps, addErrorHandler } from '../server';
import type { D1DatabaseLike } from '../src/server/databaseAdapter';
import { FirestoreRestAdapter } from '../src/server/firestoreRest';
import { checkAuthRateLimit, type RateLimiterLike } from './authRateLimit';

const PORTS = { core: 8080, public: 8081 } as const;
type Target = keyof typeof PORTS;
const ownTarget: Target = process.env.APP_TARGET === 'public' ? 'public' : 'core';
let ready: Promise<void> | undefined;

async function start(): Promise<void> {
  // STORAGE_MODE=firestore (var) memindahkan semua data ke Firestore; selain itu tetap D1.
  const persistence = process.env.STORAGE_MODE === 'firestore'
    ? { mode: 'firestore' as const, firestore: new FirestoreRestAdapter(process.env.FIRESTORE_SERVICE_ACCOUNT_JSON ?? '', process.env.FIRESTORE_DATABASE_ID) }
    : { mode: 'd1' as const, d1: env.DB as D1DatabaseLike };
  const { app, publicApp } = await createApps({}, persistence);
  // Kedua app berbagi satu salinan data; Durable Object melayani web publik dan aplikasi inti sekaligus.
  for (const [target, express] of [['core', app], ['public', publicApp]] as const) {
    addErrorHandler(express);
    await new Promise<void>((resolve) => http.createServer(express).listen(PORTS[target], resolve));
  }
}

async function serve(request: Request, target: Target): Promise<Response> {
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
  return handleAsNodeRequest(PORTS[target], request);
}

// Satu instance memegang data rumah sakit di memori. Isolate Worker biasa tidak berbagi memori,
// sehingga tiap isolate punya salinan basi (pasien dobel, RM dobel, stok minus, update saling timpa).
export class CoreState extends DurableObject {
  fetch(request: Request): Promise<Response> {
    // Header ditimpa Worker depan (lihat bawah), jadi tidak bisa dipalsukan browser.
    return serve(request, request.headers.get(TARGET_HEADER) === 'public' ? 'public' : 'core');
  }
}

const TARGET_HEADER = 'x-myitaru-app';

interface CoreStateNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, _env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const limiter = env.AUTH_LIMITER as RateLimiterLike | undefined;
    const rateLimitRequest = request.clone();
    const limited = await checkAuthRateLimit(request, limiter);
    if (limited) return limited;
    let response: Response;
    const coreState = env.CORE_STATE as CoreStateNamespace | undefined;
    if (coreState) {
      const forwarded = new Request(request);
      forwarded.headers.set(TARGET_HEADER, ownTarget);
      response = await coreState.get(coreState.idFromName('myitaru')).fetch(forwarded);
    } else {
      // Tanpa binding CORE_STATE: jalan per isolate seperti sebelumnya.
      response = await serve(request, ownTarget);
      // Startup jalan terus walau request pemicunya dibatalkan browser; tanpa ini login berikutnya ikut 503.
      if (ready) ctx.waitUntil(ready.catch(() => undefined));
    }

    return await checkAuthRateLimit(rateLimitRequest, limiter, response) || response;
  }
};
