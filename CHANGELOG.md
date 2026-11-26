# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/).

## [Unreleased]

### Ditambahkan
- Konfigurasi kolaborasi multi-agent selalu aktif: `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.agent/rules/multi-agent-workflow.md` — Claude memimpin kasus berat; Gemini CLI, GitHub Copilot CLI, dan Google Antigravity menangani tugas ringan dan verifikasi.
- Agent dispatcher (`scripts/agent-dispatch.mjs`) dengan mode `check`, `light`, `assist`, `auto`, dan `parallel`; slash commands di `.claude/commands/`, `.gemini/commands/`, dan `.github/prompts/`.
- Subagent auto-delegation Claude: `.claude/agents/gemini-worker.md`, `copilot-worker.md`, `verify-runner.md`.
- Pre-push hook (`scripts/hooks/pre-push`) yang memblokir push bila `typecheck` atau `test` gagal; diinstal via `npm run hooks:install` atau otomatis via `npm run prepare`.
- `AUTHORS.md` dengan profil lengkap semua agent AI kontributor (Antigravity, Claude, Copilot, Gemini CLI).
- `mustChangePassword` dipamerkan ke frontend dan banner peringatan kata sandi default di `App.tsx`.
- Deployment di Cloudflare Workers dengan database Cloudflare D1 (`STORAGE_MODE=d1`), dua Worker (`myitaru-public`, `myitaru-core`) dari satu `wrangler.jsonc`.
- `D1Adapter`, migrasi `migrations/0001_init.sql`, dan pengujian adapter di atas SQLite.
- Autentikasi lokal (scrypt, sesi yang dapat dicabut), adapter persistence MySQL/Firebase/hybrid, QR pasien terenkripsi, dan mode operasional SIMK/SIMRS.
- Batas percobaan login lintas isolate lewat Cloudflare Rate Limiting binding `AUTH_LIMITER` (5 percobaan per IP per endpoint per 60 detik).
- Role based access aplikasi inti per bidang: admin semua modul; dokter layanan medis; perawat keperawatan; RMIK rekam medis; farmasi obat dan stok; lab modul laboratorium; kasir keuangan. Ditegakkan di server dan UI.
- Akun lokal opsional `lab` (role `laboran`, `LOCAL_AUTH_LAB_PASSWORD`) dan kartu Laboratorium di halaman login. Modul laboratorium tersedia di mode SIMK.
- Deploy otomatis ke Cloudflare (migrasi D1 + kedua Worker + cek health) setiap push ke `main` lewat GitHub Actions, aktif bila secret repo Cloudflare tersedia.
- Custom domain: web publik di `www.myitaru.my.id`, aplikasi inti di `myitaru.my.id`.
- File komunitas: `CONTRIBUTING.md`, `SECURITY.md`, template issue/PR, Dependabot.

### Diubah
- Konfigurasi runtime Cloudflare memakai Firestore REST (`STORAGE_MODE=firestore`); binding dan migrasi D1 dipertahankan untuk kompatibilitas serta migrasi data lama.

### Diperbaiki
- Daftar pasien dan janji temu kini bisa dibaca semua role yang melayani pasien (scope `data-pasien`); sebelumnya dokter mendapat 403. Menulis data pasien tetap khusus pendaftaran/RMIK.
- Tautan cepat navbar hanya menampilkan modul yang boleh diakses role.
- Rate limit di Workers kini per klien (`cf-connecting-ip`); sebelumnya semua pengunjung berbagi satu kuota karena `req.ip` selalu `127.0.0.1`.
- Token sesi pasien, sesi pegawai, dan tantangan MFA yang kedaluwarsa tidak lagi diterima dari cache.
- Secret token sesi dibuat saat pertama dipakai agar lolos validasi global scope Workers.
- Nama paket `myitaru` dan field `repository` dipulihkan.

## [1.0.0] - 2026

- Rilis awal: web publik pasien dan aplikasi inti SIMK/RME dengan fitur AI (Gemini), deployment Vercel dan Docker.
