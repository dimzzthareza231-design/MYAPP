# Desain: Pemisahan Web Publik, Aplikasi Karyawan, dan Aplikasi Inti

Tanggal: 2026-11-28
Status: draf, menunggu persetujuan pemilik

## 1. Maksud dan alasan

MYITARU saat ini satu SPA (`src/App.tsx`) yang memuat tiga produk sekaligus:

- **Web publik** untuk pasien dan umum (`/`, `/portal`, `/mobile/*`).
- **Aplikasi karyawan** (`/portal-karyawan`, `/app`, `/app-karyawan`, `/karyawan/mobile/*`).
- **Aplikasi inti** klinis dan manajemen (`/staff/login`, `/dashboard`, `/modul/*`).

Semua modul di-import secara eager, sehingga pengunjung publik ikut mengunduh seluruh
kode inti dan data tiruan pasien (`seedData`). Usaha pemisahan sebelumnya berantakan
dan sudah dihapus pemilik di commit `4a6583d`. Pekerjaan ini mulai dari nol.

Tujuannya agar ketiga produk benar-benar terpisah: dibangun, diuji, dan di-deploy
sendiri-sendiri, dan secara struktur **tidak mungkin** saling meng-import.

## 2. Tujuan, bukan-tujuan, anti-tujuan

**Tujuan (langkah 1 ini):**

- Tiga aplikasi frontend berdiri sendiri dalam satu repo (monorepo npm workspaces).
- Satu paket kode bersama yang kecil dan eksplisit.
- Tiap aplikasi bisa `dev` dan `build` sendiri, menghasilkan bundle statis sendiri.
- Bundle publik dan karyawan tidak berisi modul inti, `seedData`, atau context inti.
- Pemeriksaan otomatis yang gagal jika satu aplikasi meng-import aplikasi lain.
- Repo kembali bisa di-build (import yang putus akibat `4a6583d` diperbaiki).

**Bukan tujuan langkah 1 (dikerjakan langkah berikutnya):**

- Memecah `server.ts` / API menjadi layanan terpisah.
- Menambah autentikasi di API, memperbaiki login karyawan (OTP tetap `123456`),
  memperketat `firestore.rules`, memisah project Firebase.
- Pipeline CI/CD dan konfigurasi domain produksi.
- Perubahan tampilan atau fitur.

**Anti-tujuan (gagal walau secara teknis jalan):**

- Kode bersama tumbuh menjadi "tempat sampah" yang diam-diam membawa logika inti
  ke publik (contoh: memindah `HospitalContext` utuh ke shared).
- Aplikasi publik atau karyawan masih bisa meng-import file aplikasi inti lewat
  path relatif `../../`.
- Fitur yang sekarang berfungsi hilang tanpa disebut.

## 3. Batasan

- Stack tetap: React 19, Vite, TypeScript, Tailwind, react-router-dom, Express (`server.ts`).
- Repo memakai `package-lock.json`; workspaces memakai **npm**. `bun.lock` dihapus agar
  satu sumber kebenaran lockfile.
- API tetap satu proses `server.ts` di langkah ini; ketiga aplikasi memanggilnya lewat `/api`.
- Bahasa UI dan nama domain bisnis tetap Indonesia.

## 4. Pendekatan yang dipertimbangkan

- **A. Monorepo, tiga proyek terpisah** (`apps/publik`, `apps/karyawan`, `apps/inti`,
  `packages/shared`). Tiap app punya `package.json`, config Vite, build sendiri.
  Batas dijaga oleh struktur paket. Perubahan struktur besar.
- **B. Satu proyek, tiga entry Vite.** Tiga HTML → `dist/publik|karyawan|inti`, kode di
  `src/apps/*`. Batas hanya dijaga aturan lint; mudah dilanggar.

**Dipilih: A** (keputusan pemilik). Alasan: masalah utama sebelumnya adalah kode yang
saling terkait; A membuat keterkaitan itu gagal di-build, bukan sekadar peringatan.

## 5. Desain

### 5.1 Struktur folder

```
/
├─ package.json            # root: "workspaces": ["apps/*", "packages/*"], skrip agregat
├─ tsconfig.base.json      # opsi TS bersama
├─ server.ts               # API (tetap di root pada langkah 1)
├─ src/server/*            # layanan API yang sudah ada, tidak dipindah
├─ apps/
│  ├─ publik/              # web publik pasien
│  │  ├─ package.json      # name: @myitaru/publik
│  │  ├─ index.html
│  │  ├─ vite.config.ts
│  │  └─ src/ (main.tsx, App.tsx, pages/, components/, data/)
│  ├─ karyawan/            # aplikasi karyawan
│  │  └─ (struktur sama, name: @myitaru/karyawan)
│  └─ inti/                # aplikasi inti
│     └─ (struktur sama, name: @myitaru/inti; isi hampir semua src/ lama)
├─ packages/
│  ├─ shared/              # name: @myitaru/shared
│  │  └─ src/ (ui/, lib/, utils/, types/)
│  └─ katalog/             # name: @myitaru/katalog — data master statis
│     └─ src/ (poliklinik, dokter, divisi karyawan, governance)
├─ scripts/check-boundaries.mjs
└─ database/               # tidak berubah
```

Folder `src/` lama di root dihapus setelah isinya dipindah (kecuali `src/server/`,
yang tetap untuk `server.ts`).

### 5.2 Pembagian kode

**apps/publik**

- `Portal/PublicHospitalPortal`, `Mobile/PatientMobileApp`, `Portal/ClinicBrand`
  (bagian yang dipakai publik), `Common/CloudflareTurnstile`.
- `data/hospitalPublicCatalog` dipecah: katalog statis (poli, dokter, layanan, jadwal)
  tetap di publik; ketergantungan ke `seedData` dibuang.
- `lib/fcm` (hanya dipakai aplikasi pasien).
- Auth pasien ringan baru (`PatientSessionContext`) menggantikan pemakaian `AuthContext`
  inti di `PatientMobileApp`. Ia memakai endpoint yang sudah ada (`/api/patient/*`) dan
  Firebase Auth untuk login Google; tanpa roles, `moduleRegistry`, atau `activityLogger`.
- Rute: `/`, `/portal`, `/mobile/*`.

**apps/karyawan**

- `Employee/EmployeePortal`, `EmployeeAdminArea`, `EmployeeAppLanding`, `EmployeeMobileApp`,
  `data/employeePortalCatalog`.
- `EmployeePortal` saat ini memakai `useHospital`. Diganti dengan data brand/identitas
  klinik dari shared (lihat 5.3), bukan `HospitalContext`.
- Rute baru, karena app berdiri di host sendiri: `/` (portal), `/admin/*` bila ada,
  `/unduh` (landing aplikasi, dulu `/app` dan `/app-karyawan`), `/mobile/*`.

**apps/inti**

- Semua komponen, context, data, hooks, utils lain dari `src/` lama.
- `/` mengarah ke `/dashboard` bila login, selain itu ke `/staff/login` (rute publik dan
  karyawan dihapus dari inti).
- Modul di `/modul/*` dimuat dengan `React.lazy` agar bundle awal kecil.
- `seedData` tetap di inti (data demo), tidak di-import dari `main.tsx` secara global
  bila bisa dipindah ke titik pemakaiannya.
- Manifest PWA "App Pasien" dipindah ke publik; inti tidak punya manifest pasien.

**packages/shared** (kecil dan eksplisit; hanya yang benar-benar dipakai ≥2 app)

- `ui/BrandLogo`: menerima data lewat props (`name`, `logoUrl`, dsb.), tidak lagi
  memanggil `useHospital`.
- `ui/ErrorBoundary`, `ui/pwa/*` (`OfflineIndicator`, `PWAInstallButton`) dan
  `hooks/usePWAInstall`.
- `utils/storage`.
- `lib/firebaseClient`: inisialisasi Firebase. Di langkah 1 **tetap membaca
  `firebase-applet-config.json`** (termasuk `firestoreDatabaseId`) seperti sekarang,
  agar login Google dan FCM tidak putus. Pindah ke `VITE_FIREBASE_*` dan pemisahan
  project Firebase adalah langkah berikutnya. Tiap app memanggilnya hanya bila perlu.
  *(Keputusan Claude, dari review.)*
- `brand`: identitas klinik statis (nama, logo, alamat, kontak) + URL antar-app.
- `types` yang dipakai lintas app.

**packages/katalog** *(keputusan Claude, dari review)*

- Data master statis yang dipakai server dan app: `MASTER_POLIKLINIK`, `SEMUA_DOKTER`
  (dipisah dari generator pasien di `seedData`), isi `employeePortalCatalog`
  (`HOSPITAL_DIVISIONS`, `GOVERNANCE_FRAMEWORKS`).
- Dipakai oleh `src/server/*`, publik, karyawan, dan inti. Satu sumber, sehingga ID
  dokter/poli di app publik sama dengan yang diperiksa server saat booking.
- Tanpa React, tanpa data pasien. Generator pasien tiruan tetap di `apps/inti`.
- `src/server/*` meng-import `@myitaru/katalog`, tidak pernah `apps/*`.

Aturan: shared **tidak boleh** meng-import apa pun dari `apps/*`, dan tidak boleh berisi
context React yang menyimpan data domain (pasien, kunjungan, pegawai).

### 5.3 Tautan antar-aplikasi

Tiap app tahu URL app lain hanya lewat env:
`VITE_PUBLIK_URL`, `VITE_KARYAWAN_URL`, `VITE_INTI_URL`. Default dev:
`http://localhost:5173`, `:5174`, `:5175`. Helper di `@myitaru/shared/brand`.
Contoh: tombol "Login Staf" di publik → `${VITE_INTI_URL}/staff/login`.

### 5.3a Rute lama dan PWA *(keputusan Claude, dari review)*

- App publik memuat stub redirect untuk rute lama: `/portal-karyawan*`, `/app`,
  `/app-karyawan`, `/karyawan/mobile*` → `${VITE_KARYAWAN_URL}` (path setara), dan
  `/staff/login`, `/dashboard`, `/modul/*` → `${VITE_INTI_URL}` (path sama). Query string
  dipertahankan. QR lama dan tautan hardcode tetap jalan.
- Tautan hardcode (`ClinicBrand`: `https://myitaru.ai.studio/portal-karyawan`, QR di
  `EmployeeAppLanding`) diganti dengan helper URL dari 5.3.
- PWA:
  - publik: manifest "App Pasien", `start_url: /mobile`, scope `/`, cache hanya bundle
    publik + runtime cache `/api/public`. `firebase-messaging-sw.js` ikut ke publik.
  - karyawan: manifest sendiri, perilaku install dan sinkron absensi offline dipertahankan.
  - inti: tanpa service worker.

### 5.4 Dev dan build

- `npm run dev` di root: menjalankan `server.ts` (API, port 3000) dan ketiga Vite dev
  server (5173 publik, 5174 karyawan, 5175 inti) sekaligus. Tiap Vite mem-proxy `/api` ke
  `localhost:3000`.
- `server.ts` tidak lagi memasang Vite middleware. Di produksi ia hanya melayani API;
  melayani file statis aplikasi tidak lagi tugasnya (lihat 5.5).
- `npm run build` di root: build `shared` (typecheck), lalu `apps/publik`, `apps/karyawan`,
  `apps/inti` (masing-masing ke `apps/<app>/dist`), lalu bundle `server.ts` ke
  `dist/server.cjs`.
- Skrip per app: `npm run dev -w @myitaru/publik`, `npm run build -w @myitaru/inti`, dst.
- `typecheck` root menjalankan `tsc --noEmit` per workspace.

### 5.5 Deploy (minimal, agar tidak rusak)

- `vercel.json` root dihapus. Ditulis catatan di README: buat 3 project Vercel dengan
  *Root Directory* `apps/publik`, `apps/karyawan`, `apps/inti`, masing-masing berisi
  `vercel.json` sendiri (SPA rewrite ke `index.html`).
- `Dockerfile` hanya membangun dan menjalankan API (`dist/server.cjs`).
- Domain dan CI menyusul di langkah berikutnya.

### 5.6 Perbaikan build yang rusak

Import ke file yang terhapus di `4a6583d` diperbaiki dengan cara paling kecil:
hapus pemakaian bila fiturnya tidak penting, atau tulis ulang versi minimal bila dibutuhkan.

- `lib/moduleSync` (dipakai `AuthContext`), `data/operatingModes` (`TopNavbar`),
  `Bridging/DemoDataBadge` (`BridgingHub`), `utils/jakartaDate` dan `AboutCopyrightModal`
  (`PublicHospitalPortal`), 10 gambar `.webp` (pakai `.jpg` yang masih ada).
- `package.json`: `check-deployment.mjs` → `.js`; skrip `prepare`/`hooks:install` yang
  merujuk `scripts/hooks/pre-push` (terhapus) dibuang; skrip `cf:*`, `vercel-build:*`,
  dan `test` yang merujuk file hilang dibuang.

### 5.7 Penjaga batas

`scripts/check-boundaries.mjs`, dijalankan oleh `npm run check:boundaries` dan sebagai
langkah pertama `npm run build`:

1. Gagal bila file di `apps/X` meng-import path yang keluar dari `apps/X` selain
   `@myitaru/shared` atau paket npm.
2. Gagal bila `packages/shared` meng-import `apps/*`.
3. Setelah build: gagal bila `apps/publik/dist` atau `apps/karyawan/dist` berisi penanda
   modul inti (mis. string `seedData`, `moduleRegistry`, nama modul `/modul/`), daftar
   penanda didefinisikan di skrip.

## 6. Kriteria selesai

- `npm install` dan `npm run build` sukses dari repo bersih.
- `npm run dev` membuka tiga app di tiga port; tiap rute yang tercantum di 5.2 tampil
  seperti sebelumnya (diperiksa dengan Playwright, screenshot per rute utama).
- `npm run check:boundaries` lulus, dan gagal bila sengaja ditambah import lintas app.
- Ukuran bundle awal publik dan karyawan jauh lebih kecil dari bundle tunggal sekarang
  (angka dicatat di ringkasan PR).
- `typecheck` lulus per workspace, atau error yang tersisa dicatat jelas sebagai
  error lama yang sudah ada sebelum perubahan.

## 7. Diserahkan ke pembangun

- Nama dan lokasi persis file di dalam `apps/*/src` (selama pembagian di 5.2 diikuti).
- Cara menjalankan beberapa proses dev sekaligus (mis. `concurrently` atau skrip Node).
- Detail isi `PatientSessionContext` selama perilaku login pasien sekarang tetap jalan.
- Pilihan per import putus di 5.6: hapus atau tulis ulang minimal.
- Konfigurasi Tailwind per app (boleh preset bersama di shared).
