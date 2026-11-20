import type { Request, Response } from 'express';
import { createApps, addErrorHandler } from '../server';

// Satu Vercel Function untuk semua /api/*. APP_TARGET (env project Vercel) memilih API mana yang dibuka:
// 'public' = /api/public + /api/patient, selain itu = API aplikasi inti.
// shortcut: data in-memory direset tiap cold start dan tidak dibagi antar project; pindah ke database untuk data nyata.
const ready = createApps().then(({ app, publicApp }) => {
  const target = process.env.APP_TARGET === 'public' ? publicApp : app;
  addErrorHandler(target);
  return target;
});

export default async function handler(req: Request, res: Response) {
  const target = await ready;
  return target(req, res);
}
