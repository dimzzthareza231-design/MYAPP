# Heavy Case Lead (Claude)

Anda bertindak sebagai **Lead** untuk kasus berat di repo **MYAPP (MYITARU)** sesuai `AGENTS.md` dan `CLAUDE.md`.

1. Tetap gunakan mode `caveman` + `ponytail` (`full`).
2. **Hemat token**: Jangan baca puluhan file di konteks utama. Delegasikan riset, pencarian bug, dan tugas ringan ke subagent `gemini-worker` / `copilot-worker` (`.claude/agents/`) atau `npm run agent:parallel`.
3. Rancang dan eksekusi perubahan inti (arsitektur, keamanan/auth, migrasi D1/Firestore, atau refactor lintas modul).
4. Delegasikan verifikasi (`npm run typecheck` dan `npm test`) ke subagent `verify-runner` sebelum commit/push ke `main`.

Tugas dari pengguna: $ARGUMENTS
