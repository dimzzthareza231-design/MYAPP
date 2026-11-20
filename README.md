# MYITARU — aplikasi klinik dan web publik terpisah

> Draft migrasi keamanan, bukan pernyataan siap produksi atau sertifikasi klinis.
> Jangan gunakan data pasien nyata sebelum uji penerimaan dan peninjauan keamanan selesai.

## Struktur

- `apps/public` → `dist/public`: situs informasi publik mandiri; tidak mengimpor Firebase, dataset pasien, direktori pegawai, atau aplikasi internal.
- `apps/main` → `dist/main`: entry aplikasi terautentikasi; komponen internal tetap di `src/` agar migrasi bertahap.
- `server.ts` + `src/server/` → `dist/server/index.cjs`: API utama. Bundle server tidak dilayani sebagai aset statis.
- `vercel.json`: deployment web publik saja. `Dockerfile`: aplikasi utama dan API saja.

## Instalasi dan pengembangan

Gunakan **Bun 1.4.5** dan `bun.lock` sebagai lockfile kanonik. `package-lock.json` merupakan file pra-migrasi yang tidak digunakan build/CI/Docker; jangan gunakan `npm ci` untuk branch ini. React Quill 2/React 19 masih perlu evaluasi kompatibilitas sebelum penerimaan penuh modul lama.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
bun run dev:public       # localhost:5174
# Terminal terpisah, dengan environment runtime server diatur:
bun run dev:main         # PORT default 3000
bun run build:public    # dist/public saja
bun run build:main      # dist/main saja
bun run build:server    # dist/server saja
bun run test            # setelah build:public
bun run typecheck       # seluruh source aplikasi, termasuk modul warisan
bunx tsc --project tsconfig.security.json
```

Vite membaca `.env.local` untuk nilai `VITE_*`. Server membaca `.env` melalui dotenv atau environment proses; jangan hanya mengisi runtime variable dalam `.env.local`.

## Environment

Web publik hanya membutuhkan `VITE_MAIN_APP_URL` (origin HTTPS aplikasi utama, tanpa path) dan opsional `VITE_PUBLIC_CONTACT`. Jika URL belum diisi, tombol portal dinonaktifkan; tidak ada jadwal atau ketersediaan dokter fiktif.

Aplikasi utama membutuhkan `VITE_FIREBASE_*`. Server membutuhkan `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_DATABASE_ID`, dan `MAIN_APP_ORIGIN`. Project/database frontend dan backend harus sama. Tidak ada fallback ke project Firebase contoh yang di-commit. Web API key bukan admin credential; jangan menaruh service-account private key dalam `VITE_*`.

`PORT` dihormati server. `TRUST_PROXY_HOPS` default 0; ubah hanya jika ada reverse proxy yang benar-benar dipercaya. Rate limiter saat ini per proses, belum terdistribusi.

## Provisioning identitas dan database

1. Pilih project/database **staging**. Aktifkan provider Firebase Authentication dan domain aplikasi utama, lalu verifikasi email pengguna.
2. Tinjau `firestore.rules` dan deploy secara terpisah ke project/database yang tepat. File rules di Git tidak otomatis mengubah rules cloud. Jangan menghubungkan aplikasi ke project dengan rules lama yang permisif.
3. Buat akun admin di Firebase Authentication. Dari Firebase Console/Admin tooling terpercaya, provision `users/{firebaseUid}` dengan `nama`, `email`, `username`, `roleId: 'super_admin'`, dan `aktif: true`. Tidak ada email admin hardcoded atau bootstrap publik.
4. Provision staf/pasien dengan UID Firebase dan role yang tepat. Pasien memakai role `patient` dan `no_rm` yang dipetakan administrator; pengguna tidak boleh menetapkan role atau RM sendiri.
5. Provision master dan data klinik sah secara eksplisit. Tidak ada pasien/dokter/kunjungan contoh yang otomatis diunggah ke database kosong. Data master poli/penjamin dan alur modul lama masih memerlukan migrasi dan UAT.
6. Kunjungan portal pasien membutuhkan `no_rm` konsisten yang berasal dari relasi pasien tepercaya, bukan permintaan pasien.

API memverifikasi token melalui Firebase Auth `accounts:lookup`, memeriksa project, masa berlaku, email terverifikasi, pencabutan (`validSince`), lalu mengambil role dari profil Firestore aktif. Firestore REST memakai ID token pemanggil sehingga Security Rules tetap berlaku. Email body, RM/tanggal lahir, OTP tetap, dan role IndexedDB bukan kredensial.

## Deployment terpisah

**Web publik/Vercel:** gunakan root repo, install `bun install --frozen-lockfile`, build `bun run build:public`, output `dist/public`. Set hanya environment publik. Situs publik tidak mempunyai proxy ke API klinis.

**Aplikasi utama/container:** Dockerfile mendukung build args `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, dan `VITE_FIREBASE_DATABASE_ID`. Nilai tersebut adalah konfigurasi web, bukan rahasia admin. Contoh untuk nilai yang sudah di-export di shell:

```sh
docker build \
  --build-arg VITE_FIREBASE_API_KEY \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN \
  --build-arg VITE_FIREBASE_PROJECT_ID \
  --build-arg VITE_FIREBASE_APP_ID \
  --build-arg VITE_FIREBASE_DATABASE_ID \
  -t myitaru-main:review .
# Review environment runtime sebelum menjalankan container.
# Konfigurasi runtime tidak mengubah bundle Vite yang sudah dibangun.
```

Jalankan image dengan runtime Firebase environment, `MAIN_APP_ORIGIN`, dan reverse proxy HTTPS terpisah. Image berjalan non-root. `.env` tidak disalin ke image. Jangan mempublikasikan seluruh `dist`, root repo, source map, atau bundle server sebagai static hosting.

Merge, deployment, DNS, migrasi data, dan perubahan Firebase cloud rules **tidak dilakukan otomatis** oleh PR ini.

## Fitur yang fail-closed dan keterbatasan

BPJS/SATUSEHAT, pembayaran eksternal, gateway pegawai demo, backup, dan AI klinis belum terverifikasi mengembalikan 410/501 atau layar tidak tersedia, bukan sukses simulasi. Backup/restore nyata, MFA produksi, interoperabilitas dan validasi klinis membutuhkan pekerjaan/akses layanan lanjutan. Kode prototipe lama tetap ada untuk migrasi, tetapi bukan API aktif.

Modul lama yang dapat dibuka menampilkan banner migrasi. Helper browser storage bukan lagi database lintas pengguna, tetapi masih ada pemakaian localStorage langsung di modul lama. Audit mock, persistensi, tanda tangan, billing, audit trail dan seluruh alur wajib selesai sebelum data nyata. Tidak ada klaim lisensi atau kepatuhan Kemenkes.

## Pengujian

Tes API memeriksa penolakan token, akun nonaktif, akses pasien sendiri, role, kegagalan database, rate limit, serta penghentian login/backup demo menggunakan dependency injection. Tes boundary memeriksa source dan output build publik. Tes ini bukan pengganti Firebase Emulator atau integrasi cloud.

CI mewajibkan frozen install, preflight, typecheck API, build publik, tes regresi, build utama, build server, dan **full-project typecheck yang blocking**. Tes Bun dieksekusi oleh Bun runner; `tsconfig.json` mencakup source aplikasi/server dan tidak mencoba memuat tipe `bun:test` tanpa dependensi tipe Bun.

Lihat `docs/RELEASE_CHECKLIST.md` sebelum mempertimbangkan merge/deploy.
