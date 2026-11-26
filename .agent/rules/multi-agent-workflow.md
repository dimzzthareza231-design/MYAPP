---
trigger: always_on
---

# Multi-Agent Collaboration Rule (Antigravity)
Aturan ini selalu aktif sejak pesan pertama tanpa perlu perintah tambahan. Ikuti `AGENTS.md` sebagai acuan bersama.

## Peran Google Antigravity
- **Tugas Ringan**: Eksekusi langsung perbaikan bug kecil, UI/UX minor, penambahan unit test, perbaikan error TypeScript/build, serta pembaruan konfigurasi dan dokumentasi.
- **Kasus Berat**: Bantu Claude dengan melakukan audit/verifikasi, menjalankan test & build, menyelesaikan pekerjaan branch yang tertinggal/gagal, serta memastikan sinkronisasi bersih dengan `origin/main`.
- **Verifikasi Wajib**: Selalu jalankan `npm run typecheck` dan `npm test` (serta `npm run build` bila menyentuh kode aplikasi/build) setelah perubahan terakhir sebelum commit/push.
