#!/usr/bin/env node
// Pasang git hooks lokal agar semua agent wajib lulus verifikasi sebelum push.
import { mkdirSync, copyFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const hooksDir = join(root, '.git', 'hooks');
const srcDir = join(root, 'scripts', 'hooks');

if (!existsSync(hooksDir)) {
  console.error('[hooks:install] .git/hooks tidak ditemukan. Jalankan di dalam repo git.');
  process.exit(1);
}

for (const hook of ['pre-push']) {
  const src = join(srcDir, hook);
  const dest = join(hooksDir, hook);
  copyFileSync(src, dest);
  try { chmodSync(dest, 0o755); } catch {}
  console.log(`[hooks:install] Installed: .git/hooks/${hook}`);
}
console.log('[hooks:install] Selesai. Semua push dari agent mana pun kini wajib lulus npm run agent:check.');
