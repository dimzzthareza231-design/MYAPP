# MYITARU — aplikasi klinik dan web publik terpisah

> Draft migrasi keamanan, bukan pernyataan siap produksi atau sertifikasi klinis.
> Jangan gunakan data pasien nyata sebelum uji penerimaan dan peninjauan keamanan selesai.

## Struktur dan batas deployment

- `apps/public`: situs informasi publik mandiri; tidak mengimpor Firebase, direktori pegawai, dataset pasien, atau aplikasi internal. Output `dist/public`.
- `apps/main`: entry aplikasi terautentikasi; komponen internal tetap di `src/` agar migrasi tidak memindahkan seluruh modul sekaligus. Output `dist/main`.
- `server.ts` dan `src/server/{app,middleware,security,firestoreRepository}.ts`: API utama. Output `dist/server/index.cjs`; direktori ini **tidak** dilayani sebagai aset publik.
- `vercel.json`: hanya deployment web publik. Dockerfile: aplikasi utama + API, bukan situs publik.

## Instalasi reproducible

Gunakan **Bun 1.4.5**. `bun.lock` yang sudah tersedia dan sesuai manifest adalah lockfile kanonik. `package-lock.json` adalah file warisan pra-migrasi, tidak digunakan build/CI/Docker; **jangan gunakan `npm ci`** untuk branch ini. React Quill 2 masih memiliki ketidakcocokan peer React 19 dan harus dievaluasi/diganti sebelum penerimaan penuh modul lama.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
bun run dev:public     # situs publik di localhost:5174
# terminal terpisah, environment runtime server harus diatur:
bun run dev:main       # aplikasi utama/API, PORT default 3000
bun run build:public  # hanya situs publik
bun run build:main    # hanya klien internal
bun run build:server  # hanya API
bun run test          # setelah build:public
bunx tsc --project tsconfig.security.json
```

Vite membaca `.env.local` untuk nilai `VITE_*`; server membaca `.env` melalui dotenv atau environment proses. Isi nilai runtime dalam `.env`/konfigurasi host, bukan hanya `.env.local`.

## Konfigurasi tanpa memasukkan rahasia ke web publik

Situs publik hanya membutuhkan `VITE_MAIN_APP_URL` (origin HTTPS aplikasi utama, tanpa path) dan opsional `VITE_PUBLIC_CONTACT`. Bila belum diisi, tombol portal dinonaktifkan; tidak ada URL layanan atau jadwal dokter fiktif. Jangan mengisi kontak produksi sembarangan. `VITE_PUBLIC_SITE_URL` disediakan untuk konfigurasi tautan balik lanjutan.

Aplikasi utama membutuhkan konfigurasi Firebase web `VITE_FIREBASE_*`. Server membutuhkan `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_DATABASE_ID` dan `MAIN_APP_ORIGIN`. Project/database frontend dan backend harus sama. Firebase web API key bukan admin credential; jangan pernah menaruh service-account private key dalam variabel `VITE_*`.

`PORT` dihormati server. `TRUST_PROXY_HOPS` default 0; ubah hanya jika ada reverse proxy yang benar-benar dipercaya. Rate limiter saat ini per proses, bukan kuota terdistribusi.

## Provisioning identitas dan Firestore

1. Pilih project/database staging milik Anda. Aktifkan provider Firebase Authentication yang akan dipakai, verifikasi email, dan izinkan domain aplikasi utama di Firebase Auth.
2. Tinjau `firestore.rules` lalu deploy secara terpisah ke project/database yang benar. Perubahan rules di Git **tidak berarti rules cloud sudah diubah**. Jangan menghubungkan aplikasi ke project lama dengan rules permisif.
3. Buat akun administrator melalui Firebase Authentication. Dengan Firebase Console/Admin tooling terpercaya, buat `users/{firebaseUid}` berisi `nama`, `email`, `username`, `roleId: 'super_admin'`, `aktif: true`. Tidak ada email administrator hardcoded atau bootstrap publik.
4. Provision akun staf/pasien dengan UID Firebase, role yang sesuai, dan status aktif. Untuk pasien gunakan role `patient` serta `no_rm` yang dipetakan administrator. Akun tidak boleh menetapkan role atau No. RM-nya sendiri.
5. Buat data master klinik yang sah secara eksplisit. Tidak ada pasien, dokter, atau kunjungan contoh yang otomatis diunggah ke database kosong. Koleksi master dan alur modul lama masih perlu migrasi/UAT.
6. Kunjungan yang akan terlihat di portal pasien perlu `no_rm` yang konsisten dengan pasien terkait; jangan mempercayai nilai dari permintaan pasien.

API memverifikasi ID token melalui Firebase Auth `accounts:lookup`, memeriksa project, masa berlaku, email terverifikasi dan pencabutan (`validSince`), lalu mengambil role dari profil Firestore aktif. Akses Firestore REST menggunakan ID token pemanggil sehingga Security Rules tetap berlaku. Sesi berdasarkan email body, No. RM/tanggal lahir, OTP tetap, dan role di IndexedDB tidak dipercaya.

## Deployment terpisah

- **Web publik/Vercel:** root repo, install `bun install --frozen-lockfile`, build `bun run build:public`, output `dist/public`. Set hanya environment publik yang diperlukan. Tidak ada proxy ke API klinis di situs publik.
- **Aplikasi utama/container:** build Dockerfile, jalankan dengan runtime environment di atas, arahkan origin HTTPS terpisah melalui reverse proxy. Konfigurasi `VITE_FIREBASE_*` harus tersedia **saat build**; `.env` tidak disalin ke image. Runtime environment tidak mengubah bundle Vite yang sudah dibangun. Konfigurasikan build environment melalui mekanisme CI/container builder Anda sebelum penggunaan nyata.
- Jangan menerbitkan seluruh `dist`, root repo, source map, atau bundle server sebagai static hosting.
- Deployment, DNS, migrasi data, dan perubahan cloud rules tidak dilakukan otomatis oleh PR ini.

## Fitur yang sengaja fail-closed

BPJS/SATUSEHAT, pembayaran eksternal, gateway pegawai demo, backup, dan AI klinis yang belum diverifikasi mengembalikan 410/501 atau layar tidak tersedia, bukan status sukses palsu. Backup nyata, restore, MFA produksi, interoperabilitas, dan validasi klinis memerlukan implementasi/akses layanan lanjutan. Kode prototipe lama tetap ada untuk migrasi, tetapi tidak didaftarkan sebagai API aktif.

Modul klinis lama yang masih dapat dibuka memakai banner migrasi. Browser storage helper tidak lagi menjadi database lintas pengguna, tetapi masih ada pemakaian localStorage langsung di beberapa modul lama. Semua modul tersebut memerlukan audit alur, penghapusan mock, persistensi, audit trail yang kuat, dan UAT sebelum data nyata. Perbaikan ini bukan klaim kepatuhan atau lisensi Kemenkes.

## Pengujian dan CI

`tests/api.test.ts` menguji penolakan token, akun nonaktif, batas pasien sendiri, role, kegagalan database, rate limiting, serta penghentian login/backup demo dengan dependency injection. `tests/boundaries.test.ts` menguji pemisahan source/build publik dan beberapa regresi keamanan. Tes tersebut tidak memakai data atau kredensial produksi dan **tidak menggantikan pengujian Firebase Emulator atau integrasi cloud**.

Workflow PR menjalankan frozen install, typecheck bagian API baru, build publik, tes, build utama dan server. Full-project typecheck modul warisan dilaporkan pada job terpisah non-blocking; hasilnya harus tetap ditinjau. Lihat `docs/RELEASE_CHECKLIST.md` sebelum mempertimbangkan merge/deploy.
