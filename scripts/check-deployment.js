import { readFileSync, existsSync } from 'node:fs';
if (!globalThis.Bun) throw new Error('Gunakan Bun 1.4.5 dan bun.lock, bukan package-lock.json warisan.');
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const locked = Bun.JSONC.parse(readFileSync('bun.lock', 'utf8')).workspaces[''];
for (const group of ['dependencies', 'devDependencies']) {
  const a = manifest[group] || {}, b = locked[group] || {};
  if (JSON.stringify(Object.entries(a).sort()) !== JSON.stringify(Object.entries(b).sort())) throw new Error(`${group} tidak sinkron dengan bun.lock`);
}
for (const path of ['apps/main/index.html', 'apps/public/index.html', 'server.ts', 'firestore.rules']) {
  if (!existsSync(path)) throw new Error(`File wajib tidak ditemukan: ${path}`);
}
console.log('Manifest cocok dengan bun.lock. Build utama, publik, dan server memiliki output terpisah.');
