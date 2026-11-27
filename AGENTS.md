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
- Saat Claude bekerja, Claude mendelegasikannya otomatis ke **GitHub Copilot CLI**, **Antigravity**, atau **Gemini CLI** sesuai tabel di bawah (tugas sepele boleh dikerjakan Claude langsung). Bila pengguna memanggil salah satu pendamping sendiri, pendamping itu mengerjakannya langsung tanpa instruksi tambahan.

### Pembagian per Kemampuan Agent
| Agent | Kekuatan | Tugas yang diberikan |
|---|---|---|
| **Claude** (lead) | Penalaran mendalam, perubahan lintas modul | Arsitektur, keamanan/auth, migrasi D1/Firestore, refactor besar, integrasi akhir, verifikasi, commit/push |
| **GitHub Copilot CLI** | Terintegrasi GitHub (`gh`, PR, CI, issue) | Review diff, analisis CI gagal, perbaikan error `tsc`/lint, unit test terisolasi |
| **Gemini CLI** | Konteks besar, cepat & murah (`gemini-3.5-flash-lite`) | Riset/pemetaan codebase read-only, ringkasan file/log besar, cek terminologi Klinik/SIMK/RME, dokumentasi |
| **Antigravity** (`agy`) | Agent editor, kuat di frontend | Perubahan UI/UX kecil di `src/components/`, penyesuaian tampilan, test komponen |

Claude memanggil pendamping lewat subagent `.claude/agents/*` atau `npm run agent:assist|light -- --agent=<gemini|copilot|agy> "<tugas>"` (`assist` = read-only/plan, `light` = boleh edit) dan `npm run agent:parallel -- "gemini: <riset>" "copilot: <test>" "agy: <UI>"` (awalan memilih agent; tanpa awalan dibagi round-robin). Pendamping tidak pernah commit/push/deploy; Claude meninjau setiap diff dan menjalankan verifikasi sebelum commit.

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
