#!/usr/bin/env node
// Prints one SQL INSERT for a core staff user (how the first admin is created; there is no bootstrap endpoint).
//   printf '%s' 'the-password' | node scripts/create-user.mjs admin@example.org super_admin "Nama Admin"
//   npx wrangler d1 execute myitaru-core --remote --command "<printed sql>"
// Password is read from stdin. Hash format must match verifyPassword in src/server/coreAuth.ts.
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Workers cap PBKDF2 at 100000 iterations.
export const PBKDF2_ITERATIONS = 100000;

export const ROLE_IDS = [
  'viewer', 'super_admin', 'admin', 'direksi', 'dokter', 'perawat', 'bidan', 'apoteker', 'kasir', 'pendaftaran',
  'rekam_medis', 'laboran', 'radiografer', 'manajemen_mutu', 'rehab_medik', 'gizi', 'it_support',
];

// pbkdf2$<iter>$<saltB64>$<hashB64>, PBKDF2-SHA256, 16-byte salt, 32-byte hash.
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const subtle = (globalThis.crypto ?? webcrypto).subtle;
  const salt = (globalThis.crypto ?? webcrypto).getRandomValues(new Uint8Array(16));
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${Buffer.from(salt).toString('base64')}$${Buffer.from(bits).toString('base64')}`;
}

const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function readStdin() {
  let out = '';
  for await (const chunk of process.stdin) out += chunk;
  return out.replace(/\r?\n$/, '');
}

async function main() {
  const [email, roleId, ...nameParts] = process.argv.slice(2);
  const nama = nameParts.join(' ').trim();
  if (!email || !roleId || !nama) {
    console.error('Usage: node scripts/create-user.mjs <email> <role_id> <name>   (password on stdin)');
    process.exit(2);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  if (!ROLE_IDS.includes(roleId)) throw new Error(`Invalid role_id. One of: ${ROLE_IDS.join(', ')}`);
  if (process.stdin.isTTY) console.error('Type the password, then Enter and Ctrl-D:');
  const password = await readStdin();
  if (password.length < 8 || password.length > 128) throw new Error('Password must be 8-128 characters.');

  const hash = await hashPassword(password);
  const username = email.split('@')[0].toLowerCase();
  const id = webcrypto.randomUUID();
  console.log(
    `INSERT INTO users (id, username, email, nama, role_id, aktif, password_hash, must_change_password) VALUES ` +
      `(${sql(id)}, ${sql(username)}, ${sql(email.toLowerCase())}, ${sql(nama)}, ${sql(roleId)}, 1, ${sql(hash)}, 0);`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
