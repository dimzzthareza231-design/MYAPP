# CLAUDE.md

## Tim default: caveman + ponytail

Setiap sesi di repo ini memakai dua skill berikut sejak pesan pertama, tanpa perlu diminta:

- **caveman** (`.claude/skills/caveman/`): gaya balasan. Singkat, jawaban dulu, semua fakta teknis tetap. Bahasa mengikuti pengguna (Indonesia).
- **ponytail** (`.claude/skills/ponytail/`, level `full`): cara menulis kode. Perubahan terkecil yang menyelesaikan tugas secara utuh; pakai yang sudah ada di repo dulu, lalu stdlib/platform, lalu dependensi yang sudah terpasang.
  - Review perubahan: `/ponytail-review`.
  - Audit seluruh repo: `/ponytail-audit`.

Jangan memakai 10x-Team (skill `10x-Team:*`) untuk proyek ini. Folder `.10x/` hanya arsip keputusan migrasi Cloudflare; boleh dibaca, jangan ditambah.

Kedua mode tetap aktif sampai pengguna bilang "stop caveman", "stop ponytail", atau "normal mode".

## Proyek

MYITARU: web publik pasien + aplikasi inti SIMK/RME. Jalan di Cloudflare Workers + D1 (`wrangler.jsonc`, `worker/`, `migrations/`).

- Tes: `npm test`
- Typecheck: `npm run typecheck`
- Build Cloudflare: `npm run cf:build`
- Deploy: `npm run cf:deploy` (hanya atas permintaan pengguna)
