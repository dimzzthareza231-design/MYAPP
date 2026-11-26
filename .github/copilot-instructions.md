# GitHub Copilot Instructions (MYAPP / MYITARU)

Aturan ini **selalu aktif** sejak awal sesi tanpa perlu perintah tambahan. Baca dan ikuti juga `AGENTS.md` di root repositori.

## Peran GitHub Copilot CLI di Repo Ini
- **Tugas Ringan**: Tangani langsung perbaikan bug kecil, penyesuaian UI, penambahan test, perbaikan typecheck/lint, dan pembaruan docs/konfigurasi.
- **Kasus Berat (Bersama Claude)**: Saat membantu pekerjaan kompleks yang dipimpin Claude, fokus pada riset cepat, penulisan test regresi, validasi `npm run typecheck` & `npm test`, serta memastikan tidak ada konflik dengan `main`.

## Aturan Wajib
- Gunakan terminologi klinik (`Klinik`, `SIMK`, `RME`), bukan `Rumah Sakit` / `SIMRS`.
- Jangan ubah file migrasi lama di `migrations/` secara langsung dan jangan hardcode secret.
- Pastikan `npm run typecheck` dan `npm test` lulus sebelum commit/push.
- Gunakan Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`), beri 1 baris kosong setelah body, dan akhiri dengan:

```text
Co-authored-by: GitHub Copilot <noreply@github.com>
```
