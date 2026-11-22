# ADR-001: Hosting di Cloudflare Workers (Express via httpServerHandler) dengan D1

**Status:** Accepted · **Date:** 2026-11-21 · **Feature:** cloudflare-migration · **Author:** 10x-Team (Architect + Staff Engineer)

## Context
MYITARU berjalan di Vercel (dua project, satu Vercel Function) dengan MySQL/Firestore. Pengguna ingin seluruh hosting dan database pindah ke Cloudflare. API adalah Express ~2.7k baris (`server.ts`); semua persistence lewat `PersistenceRepository` berbentuk tabel dokumen (id + payload JSON). Data saat ini dummy.

## Decision
Jalankan Express apa adanya di Cloudflare Workers memakai `httpServerHandler` (`cloudflare:node`, Node.js compat), sajikan frontend lewat Workers Static Assets, dan tambahkan `D1Adapter` (`STORAGE_MODE=d1`). Dua Worker (public/core) dari satu `wrangler.jsonc` berbagi satu D1.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Cloudflare Containers + Dockerfile | Hampir tanpa ubah kode | Berbayar; MySQL tetap di luar Cloudflare | Database tidak benar-benar pindah |
| Tulis ulang API ke Hono | Paling native untuk Workers | Menulis ulang seluruh route | Biaya tinggi, hasil sama |
| Workers + MySQL via Hyperdrive | Tanpa adapter baru | MySQL tetap di-host di luar | Bukan migrasi database penuh |

## Consequences
### Positive
- Satu kode tetap jalan di Node/Docker/Vercel dan Cloudflare.
- Tanpa server/DB yang harus dikelola; tier gratis cukup untuk demo.
### Negative
- Mode firebase/hybrid dan `AUTH_MODE=firebase` tidak tersedia di Cloudflare.
- Rate limiter in-memory per isolate.
### Risks
- Ukuran bundle Worker (mitigasi: alias stub `firebase-admin`, `vite`; ukur dengan dry-run).
- Perbedaan perilaku Node http di Workers (mitigasi: smoke test `wrangler dev`).

## Dependencies
- Wrangler ≥4, compatibility_date ≥ 2025-09-01 (http.server).
- Membatasi: penambahan fitur yang memakai firebase-admin di server harus punya jalur non-Firebase untuk Cloudflare.
