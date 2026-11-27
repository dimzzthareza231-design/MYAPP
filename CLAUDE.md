# CLAUDE.md

## Tim default: caveman + ponytail

Setiap sesi di repo ini memakai dua skill berikut sejak pesan pertama, tanpa perlu diminta:

- **caveman** (`.claude/skills/caveman/`): gaya balasan. Singkat, jawaban dulu, semua fakta teknis tetap. Bahasa mengikuti pengguna (Indonesia).
- **ponytail** (`.claude/skills/ponytail/`, level `full`): cara menulis kode. Perubahan terkecil yang menyelesaikan tugas secara utuh; pakai yang sudah ada di repo dulu, lalu stdlib/platform, lalu dependensi yang sudah terpasang.
  - Review perubahan: `/ponytail-review`.
  - Audit seluruh repo: `/ponytail-audit`.

Jangan memakai 10x-Team (skill `10x-Team:*`) untuk proyek ini.

Kedua mode **wajib** agar token tidak cepat habis. Saat memakai skill lain (mis. `cloudflare:*`, `superpowers:*`, review), caveman dan ponytail tetap aktif; skill lain hanya menambah, tidak menggantikan. Keduanya hanya mati bila pengguna sendiri bilang "stop caveman", "stop ponytail", atau "normal mode".

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

## Kolaborasi Multi-Agent (`AGENTS.md`)

- **Claude = koordinator.** Ikuti jobdesk, saling koreksi, kejujuran status, dan daftar hal sensitif di `AGENTS.md`. Claude membagi tugas, mengoreksi hasil semua agent, turun langsung pada backend berat, dan satu-satunya yang commit/push.
- **Delegasi otomatis (hemat token):** saat mengerjakan repo, pecah tugas dan serahkan sesuai jobdesk tanpa perlu diminta:
  - UI/UX & frontend ringan → `agy` (implementasi) lalu `gemini` (review UX). Tidak pernah backend.
  - Backend ringan–menengah, test backend, `tsc`/lint, GitHub/CI → `copilot`; Copilot juga me-review `git diff` Claude sebelum commit.
  - Cloudflare (produksi, log, `wrangler.jsonc`, `worker/`, pengaturan akun) → subagent `cloudflare-worker`.
  - Perintah: `npm run agent:light|assist -- --agent=<copilot|gemini|agy> "<tugas>"`, `npm run agent:parallel -- "agy: ..." "copilot: ..."`; verifikasi dengan subagent `verify-runner` atau `npm run agent:check`.
  - Tugas sepele (satu edit kecil, satu pertanyaan) boleh dikerjakan Claude langsung.
- **Satu file, satu pemilik per tugas.** Sebutkan file yang boleh diubah tiap agent di prompt.
- **Hasil agent adalah masukan, bukan kebenaran.** Cek diff dan buktinya, lalu `npm run agent:check` sebelum commit. Jangan menulis lulus/berhasil ke pengguna tanpa bukti; kalau satu agent gagal/timeout, sebutkan di laporan.
- **Hal sensitif** (`AGENTS.md` bagian 4): tanyakan pengguna dulu sebelum Claude atau agent mana pun melakukannya.
