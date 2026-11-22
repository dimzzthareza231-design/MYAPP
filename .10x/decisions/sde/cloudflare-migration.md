# SDE — cloudflare-migration
Dibangun:
- `D1Adapter` + `STORAGE_MODE=d1` (src/server/databaseAdapter.ts); interface D1 struktural (`D1DatabaseLike`).
- `migrations/0001_init.sql` (15 tabel + index updated_at).
- `worker/index.ts` (handleAsNodeRequest, startup lazy + retry), `worker/cloudflare.d.ts`, stub `worker/stubs/{firebase-admin,vite}.ts`.
- `wrangler.jsonc` (env public/core), `.env.cloudflare`, skrip `cf:*`, README bagian Cloudflare.
- server.ts: guard `CLOUDFLARE_WORKER`; local auth menerima d1. Client menerima `VITE_STORAGE_MODE=d1`.
Deviasi dari rencana:
- Pakai `handleAsNodeRequest` (bukan `httpServerHandler`) karena createApps() async.
- Tambah override `iconv-lite@^0.7.3`: versi 0.4 (body-parser) gagal di-bundle untuk Workers (field browser `./lib/streams: false`). Berlaku juga untuk jalur Node; seluruh test tetap lulus.
Tech debt:
- `database_id` di wrangler.jsonc masih UUID nol sampai `wrangler d1 create`.
- Deklarasi tipe minimal untuk modul `cloudflare:*` (shortcut, lihat komentar).
