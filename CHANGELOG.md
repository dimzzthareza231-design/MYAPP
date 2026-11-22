# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/).

## [Unreleased]

### Ditambahkan
- Deployment di Cloudflare Workers dengan database Cloudflare D1 (`STORAGE_MODE=d1`), dua Worker (`myitaru-public`, `myitaru-core`) dari satu `wrangler.jsonc`.
- `D1Adapter`, migrasi `migrations/0001_init.sql`, dan pengujian adapter di atas SQLite.
- Autentikasi lokal (scrypt, sesi yang dapat dicabut), adapter persistence MySQL/Firebase/hybrid, QR pasien terenkripsi, dan mode operasional SIMK/SIMRS.
- File komunitas: `CONTRIBUTING.md`, `SECURITY.md`, template issue/PR, Dependabot.

### Diperbaiki
- Secret token sesi dibuat saat pertama dipakai agar lolos validasi global scope Workers.
- Nama paket `myitaru` dan field `repository` dipulihkan.

## [1.0.0] - 2026

- Rilis awal: web publik pasien dan aplikasi inti SIMK/RME dengan fitur AI (Gemini), deployment Vercel dan Docker.
