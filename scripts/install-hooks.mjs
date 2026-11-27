#!/usr/bin/env node
// Pasang git hooks lokal agar semua agent wajib lulus verifikasi sebelum push.
import { mkdirSync, copyFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const gitDir = join(root, '.git');
const hooksDir = join(gitDir, 'hooks');
const srcDir = join(root, 'scripts', 'hooks');

if (!existsSync(gitDir)) {
  console.log('[hooks:install] Direktori .git tidak ditemukan; pemasangan git hook dilewati.');
  process.exit(0);
}

if (!existsSync(hooksDir)) {
  mkdirSync(hooksDir, { recursive: true });
}

for (const hook of ['pre-push']) {
  const src = join(srcDir, hook);
  const dest = join(hooksDir, hook);
  copyFileSync(src, dest);
  try { chmodSync(dest, 0o755); } catch {}
  console.log(`[hooks:install] Installed: .git/hooks/${hook}`);
}
console.log('[hooks:install] Selesai. Semua push dari agent mana pun kini wajib lulus npm run agent:check.');
