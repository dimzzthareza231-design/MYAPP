# CLAUDE.md

## Tim default: caveman + ponytail

Setiap sesi di repo ini memakai dua skill berikut sejak pesan pertama, tanpa perlu diminta:

- **caveman** (`.claude/skills/caveman/`): gaya balasan. Singkat, jawaban dulu, semua fakta teknis tetap. Bahasa mengikuti pengguna (Indonesia).
- **ponytail** (`.claude/skills/ponytail/`, level `full`): cara menulis kode. Perubahan terkecil yang menyelesaikan tugas secara utuh; pakai yang sudah ada di repo dulu, lalu stdlib/platform, lalu dependensi yang sudah terpasang.
  - Review perubahan: `/ponytail-review`.
  - Audit seluruh repo: `/ponytail-audit`.

Jangan memakai 10x-Team (skill `10x-Team:*`) untuk proyek ini.

Kedua mode tetap aktif sampai pengguna bilang "stop caveman", "stop ponytail", atau "normal mode".

## Proyek

MYITARU: web publik pasien + aplikasi inti SIMK/RME. Jalan di Cloudflare Workers + D1 (`wrangler.jsonc`, `worker/`, `migrations/`).

- Tes: `npm test`
- Typecheck: `npm run typecheck`
- Build Cloudflare: `npm run cf:build`
- Deploy: `npm run cf:deploy`

## Aturan sinkron (permintaan pengguna)

Setiap perubahan yang selesai dan lolos `npm run typecheck` + `npm test` langsung:

1. di-commit dan di-push ke branch `main` di GitHub (fast-forward, tanpa force push), lalu
2. di-deploy ke Cloudflare dengan `npm run cf:deploy` (kedua Worker), lalu cek `/api/v1/health` di Worker inti.

Kalau tes gagal atau deploy gagal, jangan push/deploy setengah jalan; laporkan ke pengguna. Migrasi D1 baru (`migrations/`) dijalankan dengan `npm run cf:migrate` sebelum deploy. Secret baru diisi pengguna sendiri lewat `wrangler secret put`.

## Jangan simpan jejak sesi di repo

- Jangan menulis catatan sesi, spec, atau log kerja agen ke repo (misalnya `.10x/`).
- Pesan commit tanpa baris `Claude-Session:` atau tautan sesi lain.
