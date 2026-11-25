// Salin semua data D1 -> Firestore (aman diulang: set per dokumen). Jalankan lokal:
//   FIRESTORE_SERVICE_ACCOUNT_JSON="$(cat sa.json)" FIRESTORE_DATABASE_ID=... npx tsx scripts/migrate-d1-to-firestore.ts
// Data D1 diambil lewat wrangler (login Cloudflare Anda sendiri).
import { execFileSync } from 'node:child_process';
import { PERSISTENCE_ENTITIES } from '../src/server/databaseAdapter';
import { FirestoreRestAdapter } from '../src/server/firestoreRest';

const fs = new FirestoreRestAdapter(process.env.FIRESTORE_SERVICE_ACCOUNT_JSON ?? '', process.env.FIRESTORE_DATABASE_ID);
for (const entity of PERSISTENCE_ENTITIES) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'myitaru-db', '--remote', '--env', 'core', '--json',
    '--command', `SELECT id, payload FROM "${entity}"`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const rows = (JSON.parse(out)[0].results ?? []) as Array<{ id: string; payload: string }>;
  for (let i = 0; i < rows.length; i += 200) {
    await fs.commit(rows.slice(i, i + 200).map((r) => ({ entity, id: r.id, data: JSON.parse(r.payload) })));
  }
  console.log(`${entity}: ${rows.length} baris`);
}
