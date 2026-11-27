# AGENTS.md — Multi-Agent Collaboration Guidelines (MYAPP / MYITARU)

Dokumen ini adalah acuan bersama (**always-on**) bagi seluruh agent yang bekerja di repositori **MYAPP (MYITARU)**: **Claude** (koordinator), **GitHub Copilot CLI**, **Google Antigravity**, **Gemini CLI**, dan **Cloudflare** (`cloudflare-worker`). Bila file instruksi khusus agent (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.agent/rules/`) bertentangan dengan dokumen ini, ikuti dokumen ini.

## 1. Jobdesk (tidak boleh tumpang tindih)

| Agent | Ekosistem | Jobdesk | Wilayah file | Skill |
|---|---|---|---|---|
| **Claude** (koordinator) | — | Membagi tugas, mengoreksi hasil semua agent, turun langsung pada backend berat (arsitektur, keamanan/auth, data/storage, migrasi, refactor lintas modul), verifikasi akhir, satu-satunya yang commit/push | Lintas repo (bila ditugaskan sendiri) | `caveman` + `ponytail` **wajib selalu aktif**; skill lain boleh ditambahkan tanpa mematikan keduanya |
| **GitHub Copilot CLI** | GitHub | Backend ringan–menengah (`api/`, `server.ts`, `src/server/`), test backend, perbaikan `tsc`/lint, pengelolaan repo GitHub (PR, issue, Actions/CI), review diff Claude | `api/`, `server.ts`, `src/server/`, `tests/` (non-UI), `.github/` | `.github/skills/backend-github/` |
| **Cloudflare** (`cloudflare-worker`) | Cloudflare | Infrastruktur & produksi: `wrangler.jsonc`, `worker/`, health/log produksi, deploy gagal, pengaturan akun Cloudflare | `wrangler.jsonc`, `worker/`, dashboard/akun Cloudflare | `cloudflare:*` (plugin Cloudflare), `caveman`, `ponytail` |
| **Antigravity** (`agy`) | Google | **Hanya tugas ringan UI/UX & frontend**: implementasi/perbaikan komponen, tampilan, layout, responsif | `src/components/`, `src/**/*.css`, `public/` | `.agent/skills/frontend-ui/` |
| **Gemini CLI** | Google | **Hanya tugas ringan UI/UX & frontend**: review UX (aksesibilitas, konsistensi, istilah Klinik/SIMK/RME), teks/copy antarmuka, dokumentasi frontend; mengoreksi hasil Antigravity | Teks/label UI dan dokumentasi; edit komponen hanya bila Claude menugaskan file yang tidak sedang dikerjakan Antigravity | `.gemini/skills/ui-ux-review/` |

Aturan pembagian:
- **Backend dan tugas berat tidak pernah diberikan ke Gemini atau Antigravity**; itu milik Claude, Copilot, dan Cloudflare.
- **Satu file, satu pemilik per tugas.** Claude menyebut file yang boleh diubah tiap agent; agent lain tidak menyentuh file itu sampai tugasnya selesai.
- Tugas sepele (satu edit kecil, satu pertanyaan) boleh dikerjakan Claude langsung.

## 2. Saling mengoreksi

| Hasil kerja dari | Dikoreksi oleh |
|---|---|
| Antigravity (UI) | Gemini (review UX), lalu Claude |
| Gemini (teks/UI) | Antigravity (kecocokan tampilan), lalu Claude |
| Copilot (backend/CI) | Claude |
| Claude (backend berat) | Copilot (review `git diff`) |
| Cloudflare (infra/akun) | Claude; perubahan CI juga dicek Copilot |

Claude menjalankan `npm run agent:check` (typecheck + test; `-- --build` untuk perubahan frontend/worker) setelah koreksi dan sebelum commit.

## 3. Kejujuran status (wajib semua agent)
- Jangan menulis **LULUS / BERHASIL / SELESAI** kecuali sudah diverifikasi, dan sertakan buktinya (perintah yang dijalankan + hasil/exit code, atau file yang diperiksa).
- Bila tidak bisa memverifikasi (mis. tidak punya akses shell), tulis **BELUM DIVERIFIKASI** dan sebutkan apa yang perlu dicek.
- Laporkan kegagalan apa adanya, termasuk error lengkap yang relevan.

## 4. Hal sensitif — berhenti dan beri tahu pengguna dulu
Semua agent boleh membaca/menulis file di komputer pengguna bila diperlukan untuk jobdesk-nya, **kecuali** hal berikut yang wajib dikonfirmasi pengguna lebih dulu:
- Secret, token, API key, password, kredensial (membuat, mengubah, menampilkan, menghapus).
- Data pasien/RME/PHI (membaca, mengekspor, mengubah, menghapus).
- Produksi: deploy/rollback di luar CI, migrasi atau query tulis ke database remote, perubahan DNS/domain/route, perubahan akses/izin akun.
- Menghapus data, resource, branch, atau file di luar wilayah tugasnya; `git push --force`; perubahan yang menimbulkan biaya.
- Perubahan alur autentikasi/otorisasi dan aturan keamanan.

## 5. Cara Claude memanggil anggota tim
- Cloudflare: subagent `.claude/agents/cloudflare-worker.md`.
- Copilot/Gemini/Antigravity: `npm run agent:light|assist -- --agent=<copilot|gemini|agy> "<tugas>"` (`light` = boleh edit, `assist` = read-only) atau `npm run agent:parallel -- "copilot: <backend>" "agy: <UI>" "gemini: <review UX>"`. Dispatcher menolak tugas backend/berat yang diarahkan ke Gemini/Antigravity.
- Pendamping tidak pernah commit/push; Claude meninjau setiap diff sebelum commit.

## 6. Konvensi Teknis & Domain (Wajib Semua Agent)
- **Terminologi Domain**: Selalu gunakan istilah klinik (`Klinik`, `SIMK`, `RME`), bukan `Rumah Sakit` atau `SIMRS`.
- **Type Safety**: Pertahankan TypeScript ketat di `src/`, `worker/`, dan `api/` tanpa `any` kecuali benar-benar diperlukan.
- **Database & Migrasi**: Jangan mengubah file migrasi yang sudah diterapkan di `migrations/` secara langsung; buat file migrasi baru yang inkremental.
- **Keamanan**: Jangan pernah melakukan hardcode API key, Cloudflare account ID, kredensial database, atau secret di file yang dilacak Git.
- **Kebersihan Repo**: Jangan menyimpan catatan sesi, spec sementara, atau log kerja agent (seperti `.10x/`) ke dalam repo.

## 7. Alur Git, Verifikasi & Commit (dijalankan Claude)
1. Sinkronkan dengan `main` (`git pull --rebase origin main`) sebelum push. Jangan force-push ke `main`.
2. Sebelum commit/push, wajib lulus: `npm run typecheck`, `npm test`, dan `npm run build` untuk perubahan frontend/worker/build.
3. Format commit **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`), 1 baris kosong, lalu trailer `Co-authored-by` untuk setiap agent yang ikut mengerjakan perubahan itu:
   - `Co-authored-by: GitHub Copilot <noreply@github.com>`
   - `Co-authored-by: gemini-cli <dimzzthareza231@gmail.com>`
   - `Co-authored-by: Google Antigravity <dimzzthareza231@gmail.com>`
