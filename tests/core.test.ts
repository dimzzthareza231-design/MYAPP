import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app';
import { openLocalDatabases } from '../src/server/localD1';
import { totpCode } from '../src/server/coreAuth';
import { hashPassword } from '../scripts/create-user.mjs';

const db = openLocalDatabases(':memory:');
const srv = createApp(db).listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
after(() => srv.close());

const PASSWORD = 'correct horse battery';
async function addUser(id: string, roleId: string) {
  await db.core
    .prepare('INSERT INTO users (id, username, email, nama, role_id, password_hash) VALUES (?,?,?,?,?,?)')
    .bind(id, id, `${id}@test.invalid`, `User ${id}`, roleId, await hashPassword(PASSWORD))
    .run();
}

const post = (path: string, body: unknown, cookie = '') =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });

// Password login, then TOTP enrollment with the secret the server hands out. Returns the session cookie.
async function login(identifier: string): Promise<string> {
  const r = await post('/api/auth/login', { identifier, password: PASSWORD });
  assert.equal(r.status, 200);
  const challenge = (await r.json()) as { mfaFlow: string; secretKey: string; challengeToken: string; userId: string };
  assert.equal(challenge.mfaFlow, 'enrollment');
  const code = await totpCode(challenge.secretKey, Math.floor(Date.now() / 30_000));
  const done = await post('/api/auth/mfa/complete', { challengeToken: challenge.challengeToken, userId: challenge.userId, code });
  assert.equal(done.status, 200);
  assert.equal(((await done.json()) as { success: boolean }).success, true);
  const cookie = done.headers.get('set-cookie') || '';
  assert.match(cookie, /^myitaru_session=[A-Za-z0-9_-]{43};.*HttpOnly; Secure; SameSite=Lax/);
  return cookie.split(';')[0];
}

let doctorCookie = '';

test('login rejects a wrong password and accepts the right one', async () => {
  await addUser('doc1', 'dokter');
  await addUser('view1', 'viewer');
  const bad = await post('/api/auth/login', { identifier: 'doc1', password: 'wrong-password' });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  doctorCookie = await login('doc1@test.invalid');
});

test('session cookie gates /api/v1/records/pasien', async () => {
  assert.equal((await fetch(`${base}/api/v1/records/pasien`)).status, 401);
  const r = await fetch(`${base}/api/v1/records/pasien`, { headers: { cookie: doctorCookie } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 200);
});

test('non-clinical role gets 403 on pasien', async () => {
  const viewerCookie = await login('view1');
  const r = await fetch(`${base}/api/v1/records/pasien`, { headers: { cookie: viewerCookie } });
  assert.equal(r.status, 403);
});

test('system-data compare-and-swap returns 409 on a stale version', async () => {
  const put = (version: number) =>
    fetch(`${base}/api/v1/system-data/test_key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: doctorCookie },
      body: JSON.stringify({ value: { v: version }, version }),
    });
  assert.deepEqual(await (await put(0)).json(), { version: 1 });
  assert.deepEqual(await (await put(1)).json(), { version: 2 });
  const stale = await put(1);
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { value: { v: 1 }, version: 2 });
});

test('audit_log rejects UPDATE', async () => {
  const row = await db.core.prepare('SELECT COUNT(*) AS n FROM audit_log').first<{ n: number }>();
  assert.ok(Number(row?.n) > 0, 'logins should have written audit rows');
  await assert.rejects(db.core.prepare("UPDATE audit_log SET actor = 'x'").run(), /append-only/);
});
