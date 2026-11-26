import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAuthRateLimit } from '../worker/authRateLimit';

const post = (path: string, body?: unknown) => new Request(`https://x.test${path}`, {
  method: 'POST',
  headers: { 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

describe('checkAuthRateLimit', () => {
  test('hanya menghitung kegagalan login dan mengunci per IP + identifier', async () => {
    const keys: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: keys.length <= 5 }) };
    const login = post('/api/auth/login', { identifier: 'Admin@Example.test', password: 'secret' });
    assert.equal(await checkAuthRateLimit(login, limiter, new Response(null, { status: 200 })), undefined);
    assert.equal(keys.length, 0);
    for (let i = 0; i < 5; i++) {
      assert.equal(await checkAuthRateLimit(login, limiter, new Response(null, { status: 401 })), undefined);
    }
    const res = await checkAuthRateLimit(login, limiter, new Response(null, { status: 401 }));
    assert.equal(res?.status, 429);
    assert.equal((await res!.json()).code, 'RATE_LIMITED');
    assert.equal(keys[0], '203.0.113.7:/api/auth/login:admin@example.test');
  });

  test('booking tetap dibatasi sebelum request diproses', async () => {
    const keys: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) };
    const res = await checkAuthRateLimit(post('/api/patient/appointments'), limiter);
    assert.equal(res?.status, 429);
    assert.equal(keys[0], '203.0.113.7:/api/patient/appointments');
  });

  test('kode TOTP membatasi kegagalan per IP dan user', async () => {
    const keys: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: true }) };
    const request = post('/api/auth/mfa/complete', { challengeToken: 'challenge', userId: 'staff-1', code: '000000' });
    assert.equal(await checkAuthRateLimit(request, limiter, new Response(null, { status: 200 })), undefined);
    assert.equal(keys.length, 0);
    await checkAuthRateLimit(request, limiter, new Response(null, { status: 401 }));
    assert.equal(keys[0], '203.0.113.7:/api/auth/mfa/complete:staff-1');
  });

  test('melewatkan endpoint lain, GET, binding kosong, dan error limiter', async () => {
    const deny = { limit: async () => ({ success: false }) };
    assert.equal(await checkAuthRateLimit(post('/api/v1/patients'), deny), undefined);
    assert.equal(await checkAuthRateLimit(new Request('https://x.test/api/auth/login'), deny), undefined);
    assert.equal(await checkAuthRateLimit(post('/api/auth/login')), undefined);
    const broken = { limit: async () => { throw new Error('down'); } };
    assert.equal(await checkAuthRateLimit(post('/api/auth/login', { identifier: 'admin' }), broken, new Response(null, { status: 401 })), undefined);
  });
});
