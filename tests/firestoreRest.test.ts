import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, test } from 'node:test';
import { FirestoreRestAdapter, fromFs, toFs } from '../src/server/firestoreRest';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const sa = JSON.stringify({ client_email: 'x@y.iam', private_key: privateKey, project_id: 'proj' });

describe('firestoreRest', () => {
  test('konversi nilai bolak-balik', () => {
    const v = { a: 1, b: 1.5, c: 'x', d: [1, { e: null }], f: true, g: { h: 'i' } };
    assert.deepEqual(fromFs(toFs(v)), v);
  });

  test('commit, get, list lewat REST', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url.includes('oauth2')) return Response.json({ access_token: 't', expires_in: 3600 });
      if (url.endsWith(':commit')) return Response.json({});
      if (url.includes('/pasien/p1')) return Response.json({ fields: { nama: { stringValue: 'Budi' } } });
      if (url.includes('/pasien/none')) return new Response('', { status: 404 });
      return Response.json({ documents: [{ name: 'projects/proj/databases/db/documents/pasien/p1', fields: { nama: { stringValue: 'Budi' } } }] });
    }) as unknown as typeof fetch;
    const db = new FirestoreRestAdapter(sa, 'db', fetcher);
    await db.commit([{ entity: 'patients', id: 'p1', data: { nama: 'Budi' } }, { entity: 'patients', id: 'p2', data: null }]);
    const writes = JSON.parse(calls.find((c) => c.url.endsWith(':commit'))!.body!).writes;
    assert.equal(writes[0].update.name, 'projects/proj/databases/db/documents/pasien/p1');
    assert.equal(writes[1].delete, 'projects/proj/databases/db/documents/pasien/p2');
    assert.deepEqual(await db.get('patients', 'p1'), { nama: 'Budi' });
    assert.equal(await db.get('patients', 'none'), null);
    assert.deepEqual(await db.list('patients'), [{ id: 'p1', data: { nama: 'Budi' } }]);

    calls.length = 0;
    await db.commit(Array.from({ length: 850 }, (_, i) => ({ entity: 'patients' as const, id: `x${i}`, data: null })));
    assert.deepEqual(calls.filter((c) => c.url.endsWith(':commit')).map((c) => JSON.parse(c.body!).writes.length), [400, 400, 50]);
  });
});
