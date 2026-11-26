# Pencipta & Kontributor MYITARU

## Pencipta Asli & Arsitek Utama (*Original Creator & Lead Developer*)
* **Nama Lengkap:** Dimas Pangestu Putra Alifia
* **NIM / Program Studi:** 22111016 — Jurusan Rekam Medis dan Informatika Kesehatan (RMIK)
* **Institusi:** Institut Tarumanagara
* **Tahun Pembuatan:** 2026
* **Peran:** Perancang Arsitektur Sistem (SIMK), Desain Database, RBAC, Rekam Medis Elektronik (RME), & Antarmuka Pengguna.

---

## Kontributor Pengembangan Lanjutan (Setelah Hibah)
*(Silakan tambahkan nama pengembang berikutnya di bawah baris ini tanpa menghapus kredit Pencipta Asli di atas)*

### AI Agents & Automation Contributors

* **Google Antigravity** _(AI Coding Agent — Google DeepMind)_
  * **Identitas Commit:** `Google Antigravity <gemini-cli@google.com>`
  * **Peran:** Verifikasi & rekonsiliasi branch agent lain, perbaikan bug terisolasi (`fix(auth): expose mustChangePassword`, `fix: Modal a11y`), konfigurasi multi-agent workflow (`AGENTS.md`, dispatcher `agent-dispatch.mjs`), pemeliharaan CI/CD gate (pre-push hook), serta pendamping Claude pada kasus berat (audit, typecheck, build).
  * **Konfigurasi:** `.agent/rules/`, `.agent/skills/jobdesk-router/`

* **Claude (Anthropic)** _(AI Coding Agent — Lead Kasus Berat)_
  * **Identitas Commit:** `claude-code <noreply@anthropic.com>`
  * **Peran:** Lead arsitektur dan perubahan inti sistem; memanggil subagent (`gemini-worker`, `copilot-worker`, `verify-runner`) secara otomatis.
  * **Konfigurasi:** `CLAUDE.md`, `.claude/agents/`, `.claude/commands/`

* **GitHub Copilot** _(AI Coding Agent — Microsoft/GitHub)_
  * **Identitas Commit:** `GitHub Copilot <noreply@github.com>`
  * **Peran:** Penulisan dan perbaikan unit test, perbaikan bug kecil, review lint/typecheck, pendamping kasus berat bersama Claude.
  * **Konfigurasi:** `.github/copilot-instructions.md`, `.github/prompts/`

* **Gemini CLI** _(AI Coding Agent — Google)_
  * **Identitas Commit:** `gemini-cli <gemini-cli@google.com>`
  * **Peran:** Riset codebase, audit, tugas ringan (UI minor, docs, konfigurasi), pendamping kasus berat bersama Claude.
  * **Konfigurasi:** `GEMINI.md`, `.gemini/commands/`
