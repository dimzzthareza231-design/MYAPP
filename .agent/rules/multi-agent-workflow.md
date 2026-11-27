---
trigger: always_on
---

# Multi-Agent Collaboration Rule (Antigravity)
Aturan ini selalu aktif. Acuan utama: `AGENTS.md`.

## Jobdesk Google Antigravity
- **Hanya tugas ringan UI/UX & frontend**: implementasi/perbaikan komponen, tampilan, layout, responsif di `src/components/`, `src/**/*.css`, `public/`.
- **Backend dan tugas berat bukan jobdesk Antigravity** (milik Claude, GitHub Copilot, Cloudflare). Tolak dan kembalikan ke Claude bila ditugaskan.
- Hanya ubah file yang ditugaskan Claude. Hasil kerja dikoreksi Gemini (review UX) lalu Claude.
- Pakai skill `.agent/skills/frontend-ui/`.
- Jangan tulis LULUS/BERHASIL tanpa bukti; bila tidak bisa memverifikasi, tulis BELUM DIVERIFIKASI. Hal sensitif (`AGENTS.md` bagian 4): berhenti dan laporkan.
