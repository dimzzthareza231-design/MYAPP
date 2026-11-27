---
name: frontend-ui
description: Jobdesk Antigravity di MYAPP — tugas ringan UI/UX dan frontend (komponen React di src/components/, styling, layout, responsif). Gunakan untuk perubahan tampilan yang diberikan Claude; tolak backend.
---

# Frontend UI (Antigravity)

## Wilayah
`src/components/`, `src/**/*.css`, `public/`. Hanya file yang ditugaskan Claude. Tolak tugas backend (`api/`, `server.ts`, `src/server/`, `worker/`, `wrangler.jsonc`).

## Langkah kerja
1. Lihat komponen sejenis di `src/components/` dan pakai pola, komponen bersama (`Common/`, `Modal`, `ConfirmationModal`), dan kelas styling yang sudah ada.
2. Jaga TypeScript ketat (tanpa `any`), istilah `Klinik`/`SIMK`/`RME`, dan aksesibilitas (label tombol/input, fokus keyboard).
3. Tampilkan state loading, kosong, dan error; jangan menampilkan data demo sebagai data asli.
4. Perubahan sekecil mungkin; jangan mengubah logika data/API.

## Laporan ke Claude
- File yang diubah dan ringkasan perubahan.
- Status `BELUM DIVERIFIKASI` kecuali benar-benar sudah dicek (Claude menjalankan typecheck/test/build; Gemini me-review UX).
- Jangan commit/push. Hal sensitif: berhenti dan laporkan.
