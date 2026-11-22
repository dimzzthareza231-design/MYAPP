# Senior Engineer — cloudflare-migration
- D1Adapter menerima binding D1Database lewat konstruktor (dapat diuji dengan shim).
- Factory: mode d1 mengambil binding dari options.d1 (Worker mengisi dari env.DB).
- worker/index.ts: import { env } from 'cloudflare:workers'; createApps({}, { mode: 'd1', d1: env.DB }).
- Guard auto-listen: lewati bila process.env.CLOUDFLARE_WORKER ada.
