import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAuthRateLimit } from '../worker/authRateLimit';

const post = (path: string) => new Request(`https://x.test${path}`, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' } });

describe('checkAuthRateLimit', () => {
  test('menolak login setelah limiter habis, dengan kunci IP + endpoint', async () => {
    const keys: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: keys.length <= 5 }) };
    for (let i = 0; i < 5; i++) assert.equal(await checkAuthRateLimit(post('/api/auth/login'), limiter), undefined);
    const res = await checkAuthRateLimit(post('/api/auth/login'), limiter);
    assert.equal(res?.status, 429);
    assert.equal((await res!.json()).code, 'RATE_LIMITED');
    assert.equal(keys[0], '203.0.113.7:/api/auth/login');
  });

  test('melewatkan endpoint lain, GET, binding kosong, dan error limiter', async () => {
    const deny = { limit: async () => ({ success: false }) };
    assert.equal(await checkAuthRateLimit(post('/api/v1/patients'), deny), undefined);
    assert.equal(await checkAuthRateLimit(new Request('https://x.test/api/auth/login'), deny), undefined);
    assert.equal(await checkAuthRateLimit(post('/api/auth/login')), undefined);
    const broken = { limit: async () => { throw new Error('down'); } };
    assert.equal(await checkAuthRateLimit(post('/api/auth/login'), broken), undefined);
  });
});
