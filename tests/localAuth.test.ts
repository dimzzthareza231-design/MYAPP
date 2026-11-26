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
    const crossSiteWrite = await fetch(`${baseUrl}/api/v1/inventory/test`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://www.myitaru.my.id' }
    });
    assert.equal(crossSiteWrite.status, 403);
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

  test('CRUD pengguna lokal dibatasi admin, menolak eskalasi role, dan tidak membocorkan hash sandi', async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/auth/users`);
    assert.equal(unauthenticated.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ identifier: 'admin', password: 'LocalTestPassword!2026' })
    });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(cookie.startsWith('myitaru_local_session='));

    const list = await fetch(`${baseUrl}/api/v1/auth/users`, { headers: { Cookie: cookie } });
    assert.equal(list.status, 200);
    const listedUsers = (await list.json()) as { users: Array<{ id: string }> };
    assert.equal(listedUsers.users.length, 1);
    const selfDelete = await fetch(`${baseUrl}/api/v1/auth/users/${encodeURIComponent(listedUsers.users[0].id)}`, {
      method: 'DELETE',
      headers: { Origin: baseUrl, Cookie: cookie }
    });
    assert.equal(selfDelete.status, 403);

    const create = await fetch(`${baseUrl}/api/v1/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: cookie },
      body: JSON.stringify({
        username: 'perawat1',
        email: 'perawat1@myitaru.local',
        nama: 'Perawat Uji',
        roleId: 'perawat',
        password: 'NurseSecure!2026',
        aktif: true
      })
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as { user: Record<string, unknown> };
    assert.equal(created.user.password, undefined);
    assert.equal(created.user.passwordHash, undefined);
    assert.equal(created.user.username, 'perawat1');

    const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ identifier: 'perawat1', password: 'NurseSecure!2026' })
    });
    const staffCookie = (staffLogin.headers.get('set-cookie') || '').split(';')[0];
    const forbiddenList = await fetch(`${baseUrl}/api/v1/auth/users`, { headers: { Cookie: staffCookie } });
    assert.equal(forbiddenList.status, 403);

    const duplicate = await fetch(`${baseUrl}/api/v1/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: cookie },
      body: JSON.stringify({
        username: 'perawat1',
        email: 'another@myitaru.local',
        nama: 'Perawat Lain',
        roleId: 'perawat',
        password: 'NurseSecure!2026'
      })
    });
    assert.equal(duplicate.status, 409);

    const escalation = await fetch(`${baseUrl}/api/v1/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: cookie },
      body: JSON.stringify({
        username: 'admin2',
        email: 'admin2@myitaru.local',
        nama: 'Admin Kedua',
        roleId: 'super_admin',
        password: 'NurseSecure!2026'
      })
    });
    assert.equal(escalation.status, 403);

    const invalid = await fetch(`${baseUrl}/api/v1/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: cookie },
      body: JSON.stringify({})
    });
    assert.equal(invalid.status, 400);

    const userId = created.user.id as string;
    const update = await fetch(`${baseUrl}/api/v1/auth/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: cookie },
      body: JSON.stringify({ aktif: false })
    });
    assert.equal(update.status, 200);
    assert.equal((await localAuth.login('perawat1', 'NurseSecure!2026')), null);

    const remove = await fetch(`${baseUrl}/api/v1/auth/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Origin: baseUrl, Cookie: cookie }
    });
    assert.equal(remove.status, 200);

  });

  test('tidak dapat menghapus satu-satunya admin aktif', async () => {
    const [admin] = await persistence.list<Record<string, unknown>>('local_auth_users');
    await assert.rejects(localAuth.deleteUser(admin.id), { code: 'LAST_ADMIN' });
  });
});

describe('akun bawaan per role', () => {
  test('production tidak membuat akun dengan sandi bawaan dan mewajibkan bootstrap admin', async () => {
    const saved = process.env.NODE_ENV;
    const savedBootstrap = process.env.LOCAL_AUTH_BOOTSTRAP_USERS_JSON;
    process.env.NODE_ENV = 'production';
    delete process.env.LOCAL_AUTH_BOOTSTRAP_USERS_JSON;
    try {
      const store = new MemoryPersistenceRepository();
      const service = new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) });
      await assert.rejects(service.initialize(), /LOCAL_AUTH_BOOTSTRAP_USERS_JSON/);
      assert.equal((await store.list('local_auth_users')).length, 0);
      assert.equal(await service.login('admin', 'admin123'), null);
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved;
      if (savedBootstrap === undefined) delete process.env.LOCAL_AUTH_BOOTSTRAP_USERS_JSON;
      else process.env.LOCAL_AUTH_BOOTSTRAP_USERS_JSON = savedBootstrap;
    }
  });

  test('production mengganti seed lama dengan bootstrap kuat dan menonaktifkan role lain', async () => {
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const store = new MemoryPersistenceRepository();
      await new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) }).initialize();
      process.env.NODE_ENV = 'production';
      const service = new LocalAuthService(store, {
        sessionSecret: 'x'.repeat(32),
        bootstrapUsers: [{
          username: 'admin',
          email: 'admin@myitaru.local',
          nama: 'Administrator',
          roleId: 'admin',
          password: 'Strong!Bootstrap-Password2026'
        }]
      });
      await service.initialize();
      assert.equal(await service.login('admin', 'admin123'), null);
      assert.equal((await service.login('admin', 'Strong!Bootstrap-Password2026'))?.principal.roleId, 'admin');
      assert.equal(await service.login('dokter', 'dokter123'), null);
      const dokter = (await store.list<Record<string, unknown>>('local_auth_users')).find(({ data }) => data.username === 'dokter');
      assert.ok(dokter);
      const disabled = await store.get<Record<string, unknown>>('local_auth_users', dokter.id);
      assert.equal(disabled?.aktif, false);
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved;
    }
  });

  test('akun lama dengan sandi lain di-reset sekali ke sandi bawaan', async () => {
    const store = new MemoryPersistenceRepository();
    await new LocalAuthService(store, {
      sessionSecret: 'x'.repeat(32),
      bootstrapUsers: [{ username: 'admin', email: 'admin@myitaru.local', nama: 'Admin', roleId: 'admin', password: 'Sandi-Lama-Panjang-2025' }]
    }).initialize();
    const [old] = await store.list<Record<string, unknown>>('local_auth_users');
    await store.commit([{ entity: 'local_auth_users', id: old.id, data: { ...old.data, passwordSeed: undefined } }]);

    const service = new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) });
    await service.initialize();
    assert.equal(await service.login('admin', 'Sandi-Lama-Panjang-2025'), null);
    assert.equal((await service.login('admin', 'admin123'))?.principal.roleId, 'admin');
    const reset = await store.get<Record<string, unknown>>('local_auth_users', old.id);
    assert.equal(reset?.dibuatPada, old.data.dibuatPada);
  });
});

describe('ganti kata sandi', () => {
  test('sandi baru berlaku, sandi lama ditolak, dan restart tidak me-reset ke bawaan', async () => {
    const store = new MemoryPersistenceRepository();
    const service = new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) });
    await service.initialize();
    const session = await service.login('kasir', 'kasir123');
    assert.ok(session);
    assert.equal(await service.changePassword(session.token, 'salah', 'SandiBaru-2026'), 'WRONG_PASSWORD');
    assert.equal(await service.changePassword(session.token, 'kasir123', 'pendek'), 'WEAK_PASSWORD');
    assert.equal(await service.changePassword(session.token, 'kasir123', 'SandiBaru-2026'), 'OK');

    const restarted = new LocalAuthService(store, { sessionSecret: 'x'.repeat(32) });
    await restarted.initialize();
    assert.equal(await restarted.login('kasir', 'kasir123'), null);
    assert.equal((await restarted.login('kasir', 'SandiBaru-2026'))?.principal.roleId, 'kasir');
  });
});

describe('lockout per akun', () => {
  test('5 password salah mengunci akun, password benar pun ditolak', async () => {
    for (let i = 0; i < 5; i++) assert.equal(await localAuth.login('admin', 'salah-' + i), null);
    assert.equal(await localAuth.login('admin', 'LocalTestPassword!2026'), null);
  });
});
