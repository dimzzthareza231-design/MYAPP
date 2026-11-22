# Security — cloudflare-migration
Lihat reviews/2026-11-21-security-review.md. Tidak ada temuan blocker.
- Secret via `wrangler secret`; `.dev.vars*` dan `.wrangler/` di-gitignore; `.env.cloudflare` hanya nilai VITE_ publik.
- Isolasi API: Worker publik 404 untuk /api/v1 dan /api/auth/login (terverifikasi).
- Nama tabel hanya dari peta konstanta + assertEntity; nilai selalu di-bind (tanpa injeksi SQL).
- Risiko diterima: rate limiter per isolate (brute force login lebih lemah daripada satu proses).
