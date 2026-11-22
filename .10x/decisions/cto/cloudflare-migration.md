# CTO — cloudflare-migration
- Build: migrasi platform ke Cloudflare (Workers + Static Assets + D1); tidak beli solusi lain.
- [DISCOVERED] Stack: React 19 + Vite, Express (server.ts), persistence adapter (mysql/firebase/hybrid/memory), deploy Vercel, opsi Docker.
- Arah: satu kode multi-target; Cloudflare = AUTH_MODE=local + STORAGE_MODE=d1.
