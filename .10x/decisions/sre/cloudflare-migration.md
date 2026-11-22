# SRE — cloudflare-migration
- Observability Workers diaktifkan (`observability.enabled`); log via `wrangler tail --env core`.
- Health: `GET /api/v1/health` di Worker inti → `status: HEALTHY`, `storage.mode: d1`. Startup gagal → 503 `STARTUP_FAILED` (cek log; penyebab umum: migrasi belum diterapkan atau SESSION_SECRET < 32 karakter).
- Runbook 3 pagi: 1) `wrangler tail` 2) cek /api/v1/health 3) `wrangler d1 migrations list myitaru-db --remote --env core` 4) `wrangler rollback` bila regresi deploy.
- SLO/alert belum ditetapkan (aplikasi belum produksi, data dummy).
