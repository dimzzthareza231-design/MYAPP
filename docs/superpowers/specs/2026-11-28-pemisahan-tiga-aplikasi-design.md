# Desain: Pemisahan Web Publik, Aplikasi Staf, dan Aplikasi Inti

Tanggal: 2026-11-28
Status: draf, menunggu persetujuan pemilik

## 1. Maksud dan alasan

MYITARU saat ini satu SPA (`src/App.tsx`) dan satu server Express (`server.ts`) yang
memuat tiga produk sekaligus:

- **Web publik** untuk pasien dan umum (`/`, `/portal`, `/mobile/*`).
- **Aplikasi staf/karyawan** (`/portal-karyawan`, `/app`, `/app-karyawan`, `/karyawan/mobile/*`).
- **Aplikasi inti** klinis dan manajemen (`/staff/login`, `/dashboard`, `/modul/*`).

Semua modul di-import secara eager, sehingga pengunjung publik ikut mengunduh seluruh
kode inti dan data tiruan pasien (`seedData`). Semua data API disimpan di memori satu
proses dan dipakai bersama oleh ketiga produk. Usaha pemisahan sebelumnya berantakan
dan sudah dihapus pemilik di commit `4a6583d`. Pekerjaan ini mulai dari nol.

Tujuannya agar ketiga produk benar-benar terpisah: kode, API, database, build, dan
deploy masing-masing sendiri, sehingga bisa dikerjakan teratur dan tidak kembali
berantakan.

## 2. Tujuan, bukan-tujuan, anti-tujuan

**Tujuan (langkah 1 ini):**

- Tiga aplikasi berdiri sendiri dalam satu repo (monorepo npm workspaces).
- Tiga Cloudflare Worker, satu per aplikasi, masing-masing melayani frontend **dan**
  API miliknya sendiri.
- **Tiga database D1, satu per Worker** (keputusan pemilik). Tidak ada Worker yang
  punya binding ke database Worker lain.
- Pertukaran data lintas aplikasi hanya lewat API internal yang sempit (service binding).
- Satu paket kode bersama yang kecil dan eksplisit, dan satu paket data master statis.
- Bundle publik dan staf tidak berisi modul inti, `seedData`, atau context inti.
- Pemeriksaan otomatis yang gagal jika satu aplikasi meng-import aplikasi lain.
- Repo kembali bisa di-build (import yang putus akibat `4a6583d` diperbaiki).

**Bukan tujuan langkah 1 (langkah berikutnya):**

- Memperbaiki autentikasi di level aplikasi: login karyawan tanpa password dan OTP
  tetap `123456`, `google-session` yang percaya email dari body, rate limit login RM+DOB.
- Memperketat `firestore.rules`, memisah project Firebase, pindah config Firebase ke env.
- Pipeline CI/CD.
- Perubahan tampilan atau fitur.

**Anti-tujuan (gagal walau secara teknis jalan):**

- Kode bersama tumbuh menjadi "tempat sampah" yang diam-diam membawa logika inti
  ke publik (contoh: memindah `HospitalContext` utuh ke shared).
- Satu aplikasi bisa meng-import file aplikasi lain lewat path relatif `../../`.
- Satu Worker membaca atau menulis database Worker lain secara langsung.
- Fitur yang sekarang berfungsi hilang tanpa disebut.

## 3. Batasan

- Stack tetap: React 19, Vite, TypeScript, Tailwind, react-router-dom, Express.
- Hosting **full Cloudflare** (keputusan pemilik): Workers + Static Assets, D1,
  service binding, Cloudflare Access.
- Repo memakai `package-lock.json`; workspaces memakai **npm**. `bun.lock` dihapus.
- Bahasa UI dan nama domain bisnis tetap Indonesia.
- Data masih data demo. Sebelum data pasien sungguhan masuk, pemilik perlu memastikan
  kewajiban lokasi penyimpanan rekam medis (UU PDP, regulasi RME Kemenkes).

## 4. Pendekatan yang dipertimbangkan

**Struktur kode**

- **A. Monorepo, tiga proyek terpisah.** Batas dijaga oleh struktur paket.
- **B. Satu proyek, tiga entry Vite.** Batas hanya dijaga aturan lint.

**Dipilih: A** (keputusan pemilik): keterkaitan antar-app gagal di-build, bukan sekadar
peringatan.

**API dan database**

- **Satu Worker API bersama** dengan tiga binding D1. Lebih sedikit pemindahan kode,
  tapi satu Worker tetap memegang semua database, jadi batas data hanya disiplin kode.
- **Tiap Worker aplikasi punya API dan D1 sendiri** (dipilih). Sesuai permintaan pemilik
  "3 database untuk masing-masing worker". Batas data dijaga oleh binding: Worker publik
  secara fisik tidak bisa menyentuh D1 inti.

## 5. Desain

### 5.1 Domain dan zona

Semua di zona `myitaru.my.id` (aktif, paket Free, dicek 2026-11-28).

| Aplikasi | Worker | Domain | D1 |
|---|---|---|---|
| Web publik | `myitaru-publik` | `www.myitaru.my.id` | `myitaru-publik-db` |
| Aplikasi staf | `myitaru-staf` | `www.staf.myitaru.my.id` | `myitaru-staf-db` |
| Aplikasi inti | `myitaru-inti` | `myitaru.my.id` | `myitaru-inti-db` |

Catatan: `www.staf.myitaru.my.id` dua tingkat di bawah zona. Sertifikat Universal SSL
gratis hanya menutup satu tingkat (`*.myitaru.my.id`). Custom Domain Worker biasanya
menerbitkan sertifikat sendiri untuk hostname itu; ini diverifikasi saat deploy
pertama. Bila gagal, `staf.myitaru.my.id` dipakai sebagai domain utama dan
`www.staf.myitaru.my.id` di-redirect ke sana (dilaporkan ke pemilik).

### 5.2 Struktur folder

```
/
├─ package.json            # "workspaces": ["apps/*", "packages/*"], skrip agregat
├─ tsconfig.base.json
├─ apps/
│  ├─ publik/              # @myitaru/publik
│  │  ├─ index.html, vite.config.ts, wrangler.jsonc
│  │  ├─ src/              # frontend React
│  │  ├─ worker/           # entry Worker + API publik (Express) + akses D1
│  │  └─ migrations/       # skema D1 myitaru-publik-db
│  ├─ staf/                # @myitaru/staf (struktur sama)
│  └─ inti/                # @myitaru/inti (struktur sama)
├─ packages/
│  ├─ shared/              # @myitaru/shared: ui, lib, utils, types (frontend)
│  └─ katalog/             # @myitaru/katalog: data master statis
├─ scripts/check-boundaries.mjs
├─ database/               # DDL MySQL lama, referensi saja, tidak berubah
└─ docs/
```

Folder `src/` dan `server.ts` lama di root dihapus setelah isinya dipindah.

### 5.3 Pembagian kode frontend

**apps/publik**

- `Portal/PublicHospitalPortal`, `Mobile/PatientMobileApp`, `Portal/ClinicBrand`
  (bagian publik), `Common/CloudflareTurnstile`, `lib/fcm`.
- `data/hospitalPublicCatalog` tanpa ketergantungan ke `seedData`; data poli/dokter
  diambil dari `@myitaru/katalog`.
- Auth pasien ringan baru (`PatientSessionContext`) menggantikan `AuthContext` inti di
  `PatientMobileApp`; memakai `/api/patient/*` dan Firebase Auth untuk login Google.
- Rute: `/`, `/portal`, `/mobile/*`.

**apps/staf**

- `Employee/EmployeePortal`, `EmployeeAdminArea`, `EmployeeAppLanding`, `EmployeeMobileApp`.
- `useHospital` di `EmployeePortal` diganti data brand dari `@myitaru/shared`.
- Rute: `/` (portal), `/unduh` (landing aplikasi, dulu `/app` dan `/app-karyawan`),
  `/mobile/*`.

**apps/inti**

- Semua komponen, context, data, hooks, utils lain dari `src/` lama.
- `/` → `/dashboard` bila login, selain itu `/staff/login`.
- Modul di `/modul/*` dimuat dengan `React.lazy`.
- Data demo (`seedData`) tetap di inti.

**packages/shared** (hanya yang dipakai ≥2 app)

- `ui/BrandLogo` (props, tanpa `useHospital`), `ui/ErrorBoundary`, `ui/pwa/*`,
  `hooks/usePWAInstall`, `utils/storage`, `brand` (identitas klinik statis + URL antar-app),
  `types` lintas app.
- `lib/firebaseClient`: di langkah 1 tetap membaca `firebase-applet-config.json`
  (termasuk `firestoreDatabaseId`) agar login Google dan FCM tidak putus.
- Tidak boleh meng-import `apps/*`; tidak boleh berisi context React dengan data domain.

**packages/katalog**

- Data master statis: `MASTER_POLIKLINIK`, `SEMUA_DOKTER` (dipisah dari generator pasien
  `seedData`), `HOSPITAL_DIVISIONS`, `GOVERNANCE_FRAMEWORKS`.
- Tanpa React, tanpa data pasien. Dipakai frontend dan API ketiga app, jadi ID poli dan
  dokter sama di mana pun.

### 5.4 Pembagian API dan database

Kode API sekarang (`server.ts`, `src/server/*`) dipecah per app. Tiap app menjalankan
Express di Worker-nya (`nodejs_compat`), dengan data di D1 miliknya.

| App | Rute API | Asal kode | Isi D1 |
|---|---|---|---|
| publik | `/api/public/*`, `/api/patient/*` | `patientPortalService.ts` | akun portal pasien, sesi `pat_`, token FCM, notifikasi pasien, booking dari portal |
| staf | `/api/gateway/*` | `employeePortalGateway.ts` | pengguna staf, sesi, RBAC, absensi, audit keamanan gateway, analitik landing |
| inti | `/api/v1/*`, `/api/ai/*`, `/api/cloudflare/*` | `server.ts`, `aiIntelligenceEngine.ts` | pasien, kunjungan/appointment, bed, inventori, dokumen, audit log, backup |

Skema awal tiap D1 ditulis sebagai migrasi di `apps/<app>/migrations/`, diturunkan dari
struktur record yang sekarang ada di memori (dan, bila cocok, dari
`database/schemas/database_portal.sql` untuk publik). Data contoh yang sekarang
di-hardcode di array memori menjadi migrasi seed.

**Data lintas app (API internal):**

- Publik membutuhkan data inti (sekarang `patientPortalService` langsung membaca
  `patientsStore` dan `appointmentsStore`). Diganti dengan service binding
  `publik → inti` ke rute internal `/internal/publik/*` di Worker inti, misalnya:
  verifikasi pasien (RM + tanggal lahir), dossier pasien, buat appointment, status antrean.
- Inti mengirim notifikasi pasien lewat service binding `inti → publik`
  (`/internal/inti/notifications`), menggantikan `/api/v1/patient-notifications/dispatch`
  yang sekarang terbuka.
- Staf → inti hanya bila memang ada pemakaian sekarang; jika tidak ada, tidak dibuat.
- Rute `/internal/*` hanya menerima request lewat service binding (tidak bisa diakses dari
  domain publik), dan hanya dari pemanggil yang terdaftar.
- Daftar rute internal final ditentukan saat memecah kode, dengan prinsip: sekecil
  mungkin, hanya field yang dibutuhkan.

**Stream notifikasi** (`patientPortalService.ts`, heartbeat `setInterval`) dijalankan di
Durable Object kecil milik Worker publik agar koneksi bertahan.

**Secret** (via `wrangler secret`, tidak di repo): `GEMINI_API_KEY` (inti),
`FCM_SERVER_KEY` (publik), `CLOUDFLARE_TURNSTILE_SECRET_KEY` (publik). Fallback Turnstile
ke secret uji dan token `CF_TURNSTILE_DEMO` dihapus; tanpa secret, verifikasi gagal.
Callback QRIS tetap dicatat sebagai lubang untuk langkah 2.

### 5.5 Rute lama dan PWA

- Worker publik memuat redirect untuk rute lama: `/portal-karyawan*`, `/app`,
  `/app-karyawan`, `/karyawan/mobile*` → `https://www.staf.myitaru.my.id` (path setara);
  `/staff/login`, `/dashboard`, `/modul/*` → `https://myitaru.my.id` (path sama). Query
  string dipertahankan.
- Tautan hardcode (`ClinicBrand`: `https://myitaru.ai.studio/portal-karyawan`, QR di
  `EmployeeAppLanding`) diganti dengan helper URL dari `@myitaru/shared/brand`.
- URL antar-app lewat env `VITE_PUBLIK_URL`, `VITE_STAF_URL`, `VITE_INTI_URL`.
- PWA: publik punya manifest "App Pasien" (`start_url: /mobile`) dan
  `firebase-messaging-sw.js`; staf punya manifest sendiri dan sinkron absensi offline tetap
  jalan; inti tanpa service worker.

### 5.6 Keamanan langkah 1

- **Cloudflare Access** di depan `myitaru.my.id` (inti), termasuk `/api/*`, dengan
  kebijakan email staf. Menutup API inti yang sekarang terbuka sebelum auth aplikasi
  diperbaiki. *(Usulan Claude; pemilik bisa menunda.)* `www.staf.myitaru.my.id` tidak
  dipasang Access karena dipakai dari aplikasi mobile karyawan.
- Batas data dijaga oleh binding D1 dan rute internal (5.4).

### 5.7 Dev dan build

- `npm run dev`: tiga `wrangler dev` (atau Vite dev + Worker lokal) dengan D1 lokal dan
  service binding antar-app. Port: publik 8787, staf 8788, inti 8789.
- `npm run build`: `check:boundaries` → typecheck → build tiap app (frontend Vite +
  bundle Worker).
- `npm run db:migrate:local` / `npm run db:migrate` per app.
- `npm run deploy`: deploy inti, lalu staf, lalu publik (urutan karena service binding).
- Skrip per app: `npm run dev -w @myitaru/publik`, dst.

**Dihapus:** `vercel.json`, `Dockerfile`, `.dockerignore`, `.env.cloudflare`,
`scripts/check-deployment.js`, skrip `package.json` yang merujuk file hilang
(`prepare`/`hooks:install`, `cf:*` lama, `vercel-build:*`, `test`), dependency
tidak terpakai (`mysql2`, `pg`, `drizzle-*`).

### 5.8 Perbaikan build yang rusak

Import ke file yang terhapus di `4a6583d` diperbaiki dengan cara paling kecil (hapus
pemakaian, atau versi minimal bila dibutuhkan): `lib/moduleSync`, `data/operatingModes`,
`Bridging/DemoDataBadge`, `utils/jakartaDate`, `AboutCopyrightModal`, 10 gambar `.webp`
(pakai `.jpg` yang ada).

### 5.9 Penjaga batas

`scripts/check-boundaries.mjs` (`npm run check:boundaries`, langkah pertama build):

1. Gagal bila file di `apps/X` meng-import path di luar `apps/X` selain paket
   `@myitaru/*` di `packages/` atau paket npm.
2. Gagal bila `packages/*` meng-import `apps/*`.
3. Gagal bila `wrangler.jsonc` suatu app punya binding D1 selain database miliknya.
4. Setelah build: gagal bila bundle publik atau staf berisi penanda modul inti
   (mis. `seedData`, `moduleRegistry`, `/modul/`).

## 6. Kriteria selesai

- `npm install` dan `npm run build` sukses dari repo bersih.
- `wrangler deploy --dry-run` lulus untuk ketiga Worker.
- Migrasi D1 lokal ketiga database berjalan.
- Lewat dev lokal: tiap rute di 5.3 tampil seperti sebelumnya (Playwright, screenshot
  per rute utama); `/api/v1/patients` di Worker publik → 404;
  `/api/public/hospital-catalog` di publik berhasil; login pasien RM + tanggal lahir di
  publik berhasil lewat API internal inti; data tetap ada setelah Worker di-restart.
- `npm run check:boundaries` lulus, dan gagal bila sengaja ditambah import lintas app.
- Ukuran bundle awal publik dan staf dicatat, jauh lebih kecil dari bundle tunggal sekarang.
- Deploy produksi dan pembuatan D1/Access di akun Cloudflare dilakukan **setelah** pemilik
  mengonfirmasi, karena itu mengubah layanan yang live.

## 7. Diserahkan ke pembangun

- Nama dan lokasi persis file di dalam `apps/*`.
- Detail skema tabel D1 selama mencakup data yang sekarang ada di memori.
- Detail rute `/internal/*` mengikuti prinsip di 5.4.
- Isi `PatientSessionContext` selama perilaku login pasien sekarang tetap jalan.
- Pilihan per import putus di 5.8.
- Konfigurasi Tailwind per app (boleh preset bersama).
- Cara menjalankan beberapa proses dev sekaligus.
