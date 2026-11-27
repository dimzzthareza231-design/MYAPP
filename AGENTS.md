# AGENTS.md — Multi-Agent Collaboration Guidelines (MYAPP / MYITARU)

Dokumen ini adalah acuan bersama (**always-on**) bagi seluruh agent yang bekerja di repositori **MYAPP (MYITARU)**: **Claude** (koordinator), **GitHub Copilot CLI**, **Google Antigravity**, **Gemini CLI**, dan **Cloudflare** (`cloudflare-worker`).

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
| **Claude** (koordinator) | Penalaran mendalam, perubahan lintas modul | Membagi & mengoordinasi tugas tim, turun langsung pada tugas berat (arsitektur, keamanan/auth, migrasi D1/Firestore, refactor besar), integrasi akhir, verifikasi, commit/push |
| **GitHub Copilot CLI** | Ekosistem **GitHub** (`gh`, repo, PR, CI/Actions, issue) | Pengelolaan repo GitHub, review diff, analisis CI gagal, perbaikan error `tsc`/lint, unit test terisolasi |
| **Gemini CLI** | Ekosistem **Google** (Gemini, Firebase/Firestore, Google Cloud); konteks besar (`gemini-3.5-flash-lite`) | Riset/pemetaan codebase read-only, urusan Firebase/Firestore, ringkasan file/log besar, cek terminologi Klinik/SIMK/RME, dokumentasi |
| **Antigravity** (`agy`) | Ekosistem **Google**; agent editor, kuat di frontend | Perubahan UI/UX kecil di `src/components/`, penyesuaian tampilan, test komponen |
| **Cloudflare** (`cloudflare-worker`) | Ekosistem **Cloudflare** (`wrangler`: Workers, D1, Durable Objects, DNS, log) | Cek status/health produksi, log worker, status migrasi D1, `wrangler.jsonc`, diagnosa deploy gagal. Deploy, migrasi remote, secret, dan DNS hanya dengan persetujuan pengguna |

Anggota Cloudflare dipanggil lewat subagent `.claude/agents/cloudflare-worker.md` (bukan dispatcher, karena Cloudflare tidak punya CLI agent AI). Claude memanggil pendamping lain lewat subagent `.claude/agents/*` atau `npm run agent:assist|light -- --agent=<gemini|copilot|agy> "<tugas>"` (`assist` = read-only/plan, `light` = boleh edit) dan `npm run agent:parallel -- "gemini: <riset>" "copilot: <test>" "agy: <UI>"` (awalan memilih agent; tanpa awalan dibagi round-robin). Pendamping tidak pernah commit/push/deploy; Claude meninjau setiap diff dan menjalankan verifikasi sebelum commit.

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
