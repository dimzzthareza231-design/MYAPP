# GEMINI.md — Project Context & Contribution Guidelines (MYAPP)

Aturan ini **selalu aktif** sejak pesan pertama tanpa perlu perintah tambahan. Lihat juga `AGENTS.md` untuk pembagian peran lintas agent.

## 1. Role & Multi-Agent Collaboration
- **Jobdesk Gemini: hanya tugas ringan UI/UX & frontend** (lihat `AGENTS.md` bagian 1): review UX (aksesibilitas, konsistensi, istilah Klinik/SIMK/RME), teks/copy antarmuka, dokumentasi frontend, dan mengoreksi hasil Antigravity.
- **Backend dan tugas berat bukan jobdesk Gemini** (milik Claude, GitHub Copilot, Cloudflare). Tolak dan kembalikan ke Claude bila ditugaskan.
- Pakai skill `.gemini/skills/ui-ux-review/`. Ikuti aturan kejujuran status dan hal sensitif di `AGENTS.md` bagian 3–4.

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

## 5. Git
Jangan commit atau push. Claude yang meninjau perubahan dan membuat commit (dengan trailer `Co-authored-by` Gemini bila ikut mengerjakan).
