# DBA — cloudflare-migration
- D1 (SQLite): tabel dokumen `id TEXT PK (1..128)`, `payload TEXT CHECK json_valid`, `updated_at TEXT` ISO-8601 ms; index updated_at untuk `list` (ORDER BY updated_at DESC, rowid DESC).
- Upsert: `INSERT … ON CONFLICT(id) DO UPDATE`; commit multi-perubahan = satu `db.batch()` (transaksional).
- Tidak ada sync_outbox (hanya untuk hybrid). Data awal: kosong; akun staf dibuat dari secret.
- Migrasi: `npm run cf:migrate` (remote) / `cf:migrate:local`. Skema baru = file migrasi baru, jangan ubah 0001.
- Catatan skala: `list` membaca seluruh tabel (sama seperti MySQL); D1 maks 10 GB/DB.
