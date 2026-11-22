# Spec: Migrasi MYITARU (MYAPPv1) ke Cloudflare

**Tanggal:** 2026-11-21 · **Status:** Disetujui pengguna · **Slug:** cloudflare-migration

## Tujuan
Memindahkan hosting web publik + aplikasi inti (saat ini Vercel) dan database (saat ini MySQL) sepenuhnya ke Cloudflare: Workers + Static Assets + D1.

## Batasan
- Semua data saat ini dummy → D1 dibuat kosong, tanpa skrip impor data.
- Jalur Node/Docker/Vercel (MySQL, Firebase, hybrid) tetap berfungsi; tidak dihapus.
- Di Cloudflare hanya `AUTH_MODE=local` + `STORAGE_MODE=d1` (firebase-admin tidak didukung di Workers).

## Desain
1. **Dua Worker, satu kode** (`wrangler.jsonc`, env `public` dan `core`), `APP_TARGET` memilih Express app seperti `api/index.ts` (Vercel).
2. **Satu D1** `myitaru-db`, dibagi kedua Worker.
3. **Frontend** = Workers Static Assets (`dist/public`, `dist/core`), `not_found_handling: single-page-application`, `run_worker_first: ["/api/*"]`.
4. **`D1Adapter`** di `src/server/databaseAdapter.ts` mengimplementasikan `PersistenceRepository`; commit atomik via `db.batch()` dengan `INSERT … ON CONFLICT(id) DO UPDATE`; mode baru `STORAGE_MODE=d1`.
5. **Skema** `migrations/0001_init.sql`: 15 tabel entitas (`id TEXT PK, payload TEXT, updated_at TEXT`) + index `updated_at`; diterapkan dengan `wrangler d1 migrations apply`.
6. **`worker/index.ts`**: `createApps()` → `httpServerHandler` dari `cloudflare:node`. `server.ts` tidak auto-listen saat di Worker.
7. **Alias bundling**: `firebase-admin/*` dan `vite` diarahkan ke stub di build Worker.
8. Client menerima `VITE_STORAGE_MODE=d1`.

## Penanganan error
- D1 gagal → `health().persistentReady=false`, endpoint mengembalikan 503 seperti mode MySQL.
- Startup produksi menolak jalan bila persistence tidak sehat (perilaku yang sudah ada).

## Keterbatasan yang diterima
- Rate limiter in-memory berlaku per isolate (lebih lemah).
- SSE portal pasien dapat terputus; klien harus reconnect.
- Ukuran bundle Worker harus < 3 MB gz (Free) — diukur dengan `wrangler deploy --dry-run`.

## Pengujian
- Unit test `D1Adapter` dengan shim D1 di atas `node:sqlite`.
- `npm test` dan `npm run typecheck` tetap lulus.
- Smoke test `wrangler dev` (D1 lokal): health, login staf, pendaftaran, isolasi API inti dari Worker publik.
- Deploy ke akun Cloudflare dilakukan pengguna (`wrangler login`, `wrangler secret put`).
