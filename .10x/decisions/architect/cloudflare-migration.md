# Architect — cloudflare-migration
Lihat ADR-001 dan spec 2026-11-21.
- Komponen: worker/index.ts (entry), D1Adapter, migrations/0001_init.sql, wrangler.jsonc (env public/core), stub alias.
- Batas: Worker publik hanya publicApp; Worker inti hanya app (createApps sudah memisahkan).
- Failure modes: D1 down → 503 + DEGRADED; bundle terlalu besar → deploy gagal; SSE putus → reconnect klien.
