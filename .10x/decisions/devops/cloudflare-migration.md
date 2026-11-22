# DevOps — cloudflare-migration
- Deploy: `npm run cf:deploy` (build Vite mode cloudflare → wrangler deploy public → core). Langkah awal di README › Deployment › Cloudflare.
- Ukuran bundle (dry-run): core 975 KiB gz, public 783 KiB gz (< 3 MB Free).
- Rollback: `wrangler rollback --env <public|core>` ke versi sebelumnya; migrasi D1 hanya maju (tulis migrasi baru untuk membalik). D1 Time Travel untuk pemulihan data titik-waktu.
- CI belum diubah (.github tetap); deploy otomatis via CI di luar cakupan.

- Live 2026-11-22: deploy pertama gagal (validasi global scope: randomBytes di signedStore) → diperbaiki lazy; deploy ulang sukses.
