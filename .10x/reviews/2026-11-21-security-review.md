# Security Review — cloudflare-migration (2026-11-21)
- **Secret:** tidak ada secret di wrangler.jsonc atau repo; `.dev.vars*` di-gitignore. Startup produksi tetap menolak SESSION_SECRET < 32 karakter.
- **SQL:** identifier tabel dari konstanta `MYSQL_TABLES` setelah `assertEntity`; semua nilai lewat `bind`. Tidak ada injeksi.
- **Isolasi:** Worker publik hanya memuat `publicApp`; API inti 404 (terverifikasi).
- **Auth:** tetap local auth (scrypt, cookie HttpOnly yang dapat dicabut, cek Origin) — tidak berubah.
- **Firebase:** stub melempar error eksplisit; tidak ada fallback diam-diam ke mode tak aman.
- **Diterima:** rate limiter per isolate. Rekomendasi lanjut: Cloudflare Rate Limiting binding / WAF rule untuk /api/auth/login sebelum produksi.
Verdict: tidak ada blocker untuk deploy demo (data dummy).
