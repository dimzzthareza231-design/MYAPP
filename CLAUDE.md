# CLAUDE.md

## Tim default: caveman + ponytail

Setiap sesi di repo ini memakai dua skill berikut sejak pesan pertama, tanpa perlu diminta:

- **caveman** (`.claude/skills/caveman/`): gaya balasan. Singkat, jawaban dulu, semua fakta teknis tetap. Bahasa mengikuti pengguna (Indonesia).
- **ponytail** (`.claude/skills/ponytail/`, level `full`): cara menulis kode. Perubahan terkecil yang menyelesaikan tugas secara utuh; pakai yang sudah ada di repo dulu, lalu stdlib/platform, lalu dependensi yang sudah terpasang.
  - Review perubahan: `/ponytail-review`.
  - Audit seluruh repo: `/ponytail-audit`.

Jangan memakai 10x-Team (skill `10x-Team:*`) untuk proyek ini.

Kedua mode tetap aktif sampai pengguna bilang "stop caveman", "stop ponytail", atau "normal mode".

## Plugin Cloudflare

Plugin `cloudflare@cloudflare` (skill + MCP `https://mcp.cloudflare.com/mcp`) aktif otomatis lewat `.claude/settings.json`. Login MCP lewat OAuth saat tool Cloudflare pertama dipakai.

## Proyek

MYITARU: web publik pasien + aplikasi inti SIMK/RME. Jalan di Cloudflare Workers + D1 (`wrangler.jsonc`, `worker/`, `migrations/`).

- Tes: `npm test`
- Typecheck: `npm run typecheck`
- Build Cloudflare: `npm run cf:build`
- Deploy: `npm run cf:deploy`

## Aturan repo (permintaan pengguna)

Setiap perubahan yang selesai dan lolos `npm run typecheck` + `npm test` langsung di-commit dan di-push ke branch `main` di GitHub (fast-forward, tanpa force push), lalu pastikan workflow CI hijau. Kalau tes lokal gagal, jangan push.

Cloudflare diurus pengguna sendiri. Job `deploy` di `.github/workflows/ci.yml` hanya jalan bila secret repo `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` terbaca; tanpa itu deploy dilewati dengan peringatan. Jangan deploy dari container (proxy menimpa header `Authorization` saat unggah assets → 401).

## Jangan simpan jejak sesi di repo

- Jangan menulis catatan sesi, spec, atau log kerja agen ke repo (misalnya `.10x/`).
- Pesan commit tanpa baris `Claude-Session:` atau tautan sesi lain.
