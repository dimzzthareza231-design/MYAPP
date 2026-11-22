# Panduan Kontribusi

Terima kasih ingin berkontribusi pada MYITARU. Dengan berpartisipasi, Anda setuju mengikuti [Kode Etik](CODE_OF_CONDUCT.md).

## Penyiapan

```bash
npm ci
cp .env.example .env   # isi nilai yang diperlukan
npm run dev            # web publik :3000, aplikasi inti :3001
```

Untuk menguji di runtime Cloudflare, lihat bagian [Deployment › Cloudflare](README.md#cloudflare-workers--d1).

## Alur kerja

1. Buat branch dari `main`: `feat/...`, `fix/...`, `docs/...`, atau `chore/...`.
2. Gunakan pesan commit bergaya [Conventional Commits](https://www.conventionalcommits.org/), misalnya `fix: tolak QR yang sudah dipakai`.
3. Sebelum membuka pull request, pastikan lolos:
   ```bash
   npm run typecheck
   npm test
   npm run build:core && npm run build:public
   ```
4. Buka pull request ke `main` dan isi template-nya. CI menjalankan pemeriksaan yang sama.

## Aturan penting

- **Jangan pernah memasukkan data pasien nyata, secret, atau kredensial** ke repositori, issue, maupun log.
- Perubahan skema D1 ditulis sebagai file migrasi baru di `migrations/`; jangan mengubah migrasi yang sudah diterapkan.
- Kode server harus tetap berjalan di Node.js **dan** Cloudflare Workers: jangan membuat nilai acak, timer, atau I/O di global scope, dan jangan menambah dependensi `firebase-admin` di jalur yang dipakai Worker.
- Pertahankan file `LICENSE`, `NOTICE`, dan kredit pencipta asli di `AUTHORS.md` (Apache-2.0 Pasal 4). Tambahkan nama Anda di bagian kontributor `AUTHORS.md`.

## Melaporkan bug atau ide

Gunakan [template issue](https://github.com/dimzzthareza231-design/MYAPP/issues/new/choose). Untuk celah keamanan, ikuti [SECURITY.md](SECURITY.md).
