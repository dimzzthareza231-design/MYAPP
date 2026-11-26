# AGENTS.md — Multi-Agent Collaboration Guidelines (MYAPP / MYITARU)

Dokumen ini adalah acuan bersama (**always-on**) bagi seluruh agent yang bekerja di repositori **MYAPP (MYITARU)**: **Claude**, **GitHub Copilot CLI**, **Google Antigravity**, dan **Gemini CLI**.

## 1. Pembagian Peran & Routing Tugas

### Kasus Berat / Kompleks
Mencakup: perubahan arsitektur, refactor lintas banyak file/modul, alur keamanan/autentikasi/kriptografi, migrasi skema D1/Firestore, serta debugging kompleks lintas frontend–backend–worker.
- **Lead**: **Claude** (`CLAUDE.md`) merancang dan memimpin eksekusi perubahan inti.
- **Pendamping**: **GitHub Copilot CLI**, **Antigravity**, dan **Gemini CLI** membantu:
  - Riset codebase, penelusuran bug, dan pengecekan regresi.
  - Penulisan/perbaikan unit test, perbaikan error TypeScript, dan verifikasi build.
  - Menyelesaikan atau merekonsiliasi pekerjaan branch yang tertunda terhadap `main`.

### Tugas Ringan / Harian (Selalu Aktif Tanpa Perintah)
Mencakup: perbaikan bug terisolasi, penyesuaian UI/UX kecil, penambahan unit test, perbaikan error `tsc`/lint, pembaruan dokumentasi/konfigurasi, dan sinkronisasi branch kecil.
- Ditangani langsung oleh **GitHub Copilot CLI**, **Antigravity**, dan **Gemini CLI** sejak pesan pertama tanpa perlu instruksi tambahan.

## 2. Konvensi Teknis & Domain (Wajib Semua Agent)
- **Terminologi Domain**: Selalu gunakan istilah klinik (`Klinik`, `SIMK`, `RME`), bukan `Rumah Sakit` atau `SIMRS`.
- **Type Safety**: Pertahankan TypeScript ketat di `src/`, `worker/`, dan `api/` tanpa `any` kecuali benar-benar diperlukan.
- **Database & Migrasi**: Jangan mengubah file migrasi yang sudah diterapkan di `migrations/` secara langsung; buat file migrasi baru yang inkremental.
- **Keamanan**: Jangan pernah melakukan hardcode API key, Cloudflare account ID, kredensial database, atau secret di file yang dilacak Git.
- **Kebersihan Repo**: Jangan menyimpan catatan sesi, spec sementara, atau log kerja agent (seperti `.10x/`) ke dalam repo.

## 3. Alur Git, Verifikasi & Commit
1. Sebelum push atau saat mengambil alih pekerjaan di branch lain, sinkronkan dengan `main` (`git pull --rebase origin main`). Jangan lakukan force-push ke `main`.
2. Sebelum commit/push, wajib jalankan dan pastikan lulus:
   - `npm run typecheck`
   - `npm test`
   - (Untuk perubahan frontend/worker/build) `npm run build`
3. Format commit wajib **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`), diikuti **1 baris kosong**, lalu trailer `Co-authored-by` sesuai identitas agent masing-masing.
