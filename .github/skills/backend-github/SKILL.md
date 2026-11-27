---
name: backend-github
description: Jobdesk GitHub Copilot di MYAPP — backend ringan-menengah (api/, server.ts, src/server/, test backend), perbaikan tsc/lint, review git diff, dan pengelolaan repo GitHub (PR, issue, Actions/CI). Gunakan untuk tugas backend atau GitHub yang diberikan Claude.
---

# Backend & GitHub (Copilot)

## Wilayah
`api/`, `server.ts`, `src/server/`, `tests/` (non-UI), `.github/`. Jangan ubah UI (`src/components/`) atau `wrangler.jsonc`/`worker/`.

## Langkah kerja
1. Baca kode dan test terkait sebelum mengubah. Ikuti pola yang sudah ada; perubahan sekecil mungkin.
2. Data pasien: jangan log atau tampilkan PHI; pakai helper `src/server/scrubPhi.ts` bila mengembalikan error.
3. Jangan menjalankan `npm`/`npx` (izin shell npm belum diberikan); Claude yang menjalankan `npm run typecheck` dan `npm test`. Perintah git baca (`git status`, `git diff`, `git log`) boleh.
4. Review diff: `git diff` lalu laporkan bug nyata dengan `path:baris`, maks 5 poin.
5. GitHub: `gh pr list|view`, `gh run list|view --log-failed`, `gh issue list|view`. Membuat/menutup PR atau issue hanya bila Claude meminta.

## Laporan ke Claude
- Status: `BELUM DIVERIFIKASI` (Claude memverifikasi) atau `GAGAL` dengan error relevan.
- File yang diubah.
- Jangan commit/push. Hal sensitif (secret, data pasien, auth, produksi): berhenti dan laporkan.
