# EM — cloudflare-migration
1. D1Adapter + mode d1 (server & client) — 1 jam
2. Migration SQL + unit test node:sqlite — 1 jam
3. worker/index.ts, stub, wrangler.jsonc, skrip npm — 1 jam
4. Build, typecheck, test, wrangler dev smoke, dry-run size — 1 jam
5. QA/security/devops/sre docs — 30 menit
Risiko utama: bundling Express+deps di Workers.
