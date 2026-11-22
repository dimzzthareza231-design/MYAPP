# Status — cloudflare-migration
- Phase: Delivered (live di Cloudflare, 2026-11-22)
- Web publik: https://myitaru-public.myappv1.workers.dev
- Aplikasi inti: https://myitaru-core.myappv1.workers.dev
- D1: myitaru-db (APAC, id 80e76ffa-de80-4bfd-8863-30c640ab007f), migrasi 0001 diterapkan
- Secret: diisi lewat `wrangler secret bulk`; nilai lokal di `.secrets.cloudflare.{core,public}.json` (gitignored)
- Terverifikasi live: health HEALTHY (d1), login admin 200, web publik & katalog 200, API inti 404 dari domain publik
- Perbaikan saat deploy: signedStore membuat secret secara lazy (Workers melarang random di global scope)
