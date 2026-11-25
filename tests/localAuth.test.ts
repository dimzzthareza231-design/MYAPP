import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryPersistenceRepository } from '../src/server/databaseAdapter';
import { registerCoreAuthentication } from '../src/server/coreAuth';
import { LocalAuthService } from '../src/server/localAuth';

const persistence = new MemoryPersistenceRepository();
const localAuth = new LocalAuthService(persistence, {
  sessionSecret: 'local-auth-test-session-secret-with-sufficient-length',
  bootstrapUsers: [{
    username: 'admin',
    email: 'admin@myitaru.local',
    nama: 'Administrator Uji',
    roleId: 'admin',
    password: 'LocalTestPassword!2026'
  }]
});
const app = express();
let baseUrl = '';
let server: http.Server;

before(async () => {
  await localAuth.initialize();
  app.use(express.json());
  registerCoreAuthentication(app, { authMode: 'local', localAuth });
  app.get('/api/v1/inventory/test', (_req, res) => res.json({ success: true }));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe('autentikasi staf lokal', () => {
  test('menyimpan hash scrypt, bukan kata sandi mentah', async () => {
    const stored = await persistence.get<Record<string, unknown>>(
      'local_auth_users',
      (await persistence.list('local_auth_users'))[0].id
    );
    assert.ok(stored);
    assert.notEqual(stored.passwordHash, 'LocalTestPassword!2026');
    assert.notEqual(stored.passwordSalt, undefined);
    assert.equal(stored.password, undefined);
  });

  test('login menerbitkan cookie HttpOnly dan sesi dapat dibaca serta dicabut', async () => {
    const invalid = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ identifier: 'admin', password: 'wrong-password' })
    });
    assert.equal(invalid.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ identifier: 'admin', password: 'LocalTestPassword!2026' })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json() as { user: Record<string, unknown>; authMode: string };
    const setCookie = login.headers.get('set-cookie') || '';
    assert.match(setCookie, /myitaru_local_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.equal(loginBody.authMode, 'local');
    assert.equal(loginBody.user.passwordHash, undefined);
    const cookie = setCookie.split(';')[0];

    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as { user: { roleId: string } }).user.roleId, 'admin');

    const protectedRead = await fetch(`${baseUrl}/api/v1/inventory/test`, { headers: { Cookie: cookie } });
    assert.equal(protectedRead.status, 200);
    const bearerOnly = await fetch(`${baseUrl}/api/v1/inventory/test`, {
      headers: { Authorization: `Bearer ${cookie.split('=')[1]}` }
    });
    assert.equal(bearerOnly.status, 401);

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Origin: baseUrl, Cookie: cookie }
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  });

  test('menolak login tanpa same-origin dan mempertahankan sesi server lintas instans', async () => {
    const rejectedOrigin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://attacker.invalid' },
      body: JSON.stringify({ identifier: 'admin', password: 'LocalTestPassword!2026' })
    });
    assert.equal(rejectedOrigin.status, 403);

    const session = await localAuth.login('admin@myitaru.local', 'LocalTestPassword!2026');
    assert.ok(session);
    const restartedService = new LocalAuthService(persistence, {
      sessionSecret: 'local-auth-test-session-secret-with-sufficient-length',
      bootstrapUsers: []
    });
    await restartedService.initialize();
    assert.equal((await restartedService.resolveSession(session.token))?.principal.roleId, 'admin');
  });

  test('loginWithEmail hanya untuk email staf aktif yang terdaftar', async () => {
    assert.equal(await localAuth.loginWithEmail('orang-asing@gmail.com'), null);
    assert.equal((await localAuth.loginWithEmail('ADMIN@myitaru.local'))?.principal.roleId, 'admin');
  });
});

describe('akun bawaan per role', () => {
  const required = ['ADMIN', 'DOKTER', 'PERAWAT', 'RMIK', 'APOTEKER', 'KASIR'];
  const withEnv = async (vars: Record<string, string | undefined>, run: () => Promise<void>) => {
    const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
    Object.assign(process.env, vars);
    for (const [key, value] of Object.entries(vars)) if (value === undefined) delete process.env[key];
    try { await run(); } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
  const passwords = Object.fromEntries(required.map((role) => [`LOCAL_AUTH_${role}_PASSWORD`, `Uji-${role}-Sandi-2026`]));

  test('produksi tetap start tanpa sandi lab; akun lab dibuat bila sandinya diisi', async () => {
    await withEnv({ ...passwords, NODE_ENV: 'production', LOCAL_AUTH_LAB_PASSWORD: undefined }, async () => {
      const store = new MemoryPersistenceRepository();
      await new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) }).initialize();
      assert.equal((await store.list('local_auth_users')).length, 6);
    });
    await withEnv({ ...passwords, NODE_ENV: 'production', LOCAL_AUTH_LAB_PASSWORD: 'Uji-LAB-Sandi-2026' }, async () => {
      const store = new MemoryPersistenceRepository();
      const service = new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) });
      await service.initialize();
      assert.equal((await service.login('lab', 'Uji-LAB-Sandi-2026'))?.principal.roleId, 'laboran');
    });
  });
});

describe('lockout per akun', () => {
  test('5 password salah mengunci akun, password benar pun ditolak', async () => {
    for (let i = 0; i < 5; i++) assert.equal(await localAuth.login('admin', 'salah-' + i), null);
    assert.equal(await localAuth.login('admin', 'LocalTestPassword!2026'), null);
  });
});
