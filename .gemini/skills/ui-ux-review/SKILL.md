---
name: ui-ux-review
description: Jobdesk Gemini di MYAPP — review UI/UX frontend (aksesibilitas, konsistensi tampilan, istilah Klinik/SIMK/RME), teks/copy antarmuka, dokumentasi frontend, dan koreksi hasil Antigravity. Hanya tugas ringan frontend; tolak backend.
---

# UI/UX Review (Gemini)

## Wilayah
Komponen di `src/components/` (baca), teks/label antarmuka, dokumentasi frontend. Edit komponen hanya pada file yang ditugaskan Claude. Tolak tugas backend (`api/`, `server.ts`, `src/server/`, `worker/`).

## Checklist review
1. Aksesibilitas: tombol/ikon punya label (`aria-label`/teks), input punya `<label>`, kontras cukup, bisa dipakai dengan keyboard (fokus terlihat).
2. Konsistensi: pola komponen dan kelas styling sama dengan komponen sejenis di repo.
3. Istilah: `Klinik`, `SIMK`, `RME` — bukan `Rumah Sakit`/`SIMRS`. Bahasa Indonesia yang jelas untuk pasien dan petugas.
4. State: loading, kosong, dan error ditampilkan; tidak ada data demo yang tampil sebagai data asli.
5. Responsif: tidak terpotong di layar sempit (~375px).

## Laporan ke Claude
- Temuan dengan `path:baris` dan usulan perbaikan singkat.
- Bila mengedit: daftar file yang diubah, status `BELUM DIVERIFIKASI` (Gemini tidak menjalankan typecheck/test; Claude yang memverifikasi).
- Jangan commit/push. Hal sensitif: berhenti dan laporkan.
