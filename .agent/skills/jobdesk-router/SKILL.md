---
name: jobdesk-router
description: Menjalankan jobdesk Antigravity sesuai AGENTS.md (tugas ringan langsung atau pendampingan kasus berat Claude).
---

# Jobdesk Router (Antigravity)

Gunakan `AGENTS.md` sebagai acuan:
- **Tugas Ringan**: Eksekusi langsung perbaikan bug kecil, UI/UX minor, unit test, typecheck/lint, docs, dan sinkronisasi branch.
- **Kasus Berat**: Bantu Claude dengan audit/riset, menyelesaikan branch tertunda, serta memastikan `npm run typecheck`, `npm test`, dan `npm run build` lulus.
- **Verifikasi**: Jalankan `npm run agent:check` (atau `npm run agent:check -- --build`) sebelum commit/push.
