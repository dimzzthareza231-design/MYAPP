# GEMINI.md — Project Context & Contribution Guidelines (MYAPP)

Aturan ini **selalu aktif** sejak pesan pertama tanpa perlu perintah tambahan. Lihat juga `AGENTS.md` untuk pembagian peran lintas agent.

## 1. Role & Multi-Agent Collaboration
- **Tugas Ringan**: Tangani langsung sejak awal sesi (perbaikan bug kecil, UI minor, unit test, typecheck/lint, docs/konfigurasi).
- **Kasus Berat**: Bantu **Claude** (sebagai lead) dalam riset codebase, verifikasi regresi, sinkronisasi branch, serta memastikan `npm run typecheck`, `npm test`, dan `npm run build` lulus.

## 2. Project Overview
**MYAPP (MYITARU)** is a Clinic Management Information System (Sistem Informasi Manajemen Kesehatan / SIMK) and Electronic Medical Record (RME) web application designed for clinical workflows, patient management, authentication, and PWA deployment.

## 3. Tech Stack & Repository Structure
- **Primary Language:** TypeScript (99.7%)
- **Backend & Runtime:** Cloudflare Workers (`worker/`), Node.js / Express serverless API (`api/`)
- **Database & Storage:** Database schemas & migrations (`database/`, `migrations/`), Firestore REST integration (`scripts/`)
- **Frontend & Testing:** Web App & PWA (`src/`, `public/`), Automated tests (`tests/`)
- **Infrastructure & CI/CD:** Docker configuration, GitHub Actions workflows (`.github/`)

## 4. Coding & Domain Conventions
- **Domain Terminology:** Always use clinic terminology (`Klinik`, `SIMK`, `RME`) instead of hospital terminology (`Rumah Sakit`, `SIMRS`).
- **Type Safety:** Maintain strict TypeScript typing across `src/`, `worker/`, and `api/` without introducing `any` unless strictly justified.
- **Database & Migrations:** Do not alter existing applied migration files in `migrations/` directly; create new incremental migration scripts for schema updates.
- **Security:** Never hardcode API keys, Cloudflare account IDs, database credentials, or secrets in tracked files.

## 5. Mandatory Git Commit & Co-Author Rules
Whenever you create, execute, or suggest a `git commit` in this repository, you **MUST** follow these exact rules:

1. Use **Conventional Commits** format for the subject line (e.g., `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`).
2. Leave **one blank line** after the commit message body/subject.
3. Append the following `Co-authored-by` trailer at the **very end** of every commit message without exception:

```text
Co-authored-by: gemini-cli <gemini-cli@google.com>
```
