import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createSignedStore } from '../src/server/signedStore';
import { clientIp } from '../src/server/clientIp';

describe('signedStore', () => {
  test('token kedaluwarsa ditolak walau masih di cache', async () => {
    const store = createSignedStore<{ token: string | null; n: number }>('t_', 'token', 20);
    const token = store.issue({ token: null, n: 1 });
    assert.equal(store.get(token)?.n, 1);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(store.get(token), undefined);
  });
});

describe('clientIp', () => {
  const req = { ip: '127.0.0.1', headers: { 'cf-connecting-ip': '203.0.113.7' }, socket: {} } as any;

  test('di Workers memakai cf-connecting-ip', () => {
    process.env.CLOUDFLARE_WORKER = '1';
    try {
      assert.equal(clientIp(req), '203.0.113.7');
    } finally {
      delete process.env.CLOUDFLARE_WORKER;
    }
  });

  test('di luar Workers header diabaikan agar tidak bisa dipalsukan', () => {
    assert.equal(clientIp(req), '127.0.0.1');
  });
});

describe('signedStore prefix', () => {
  test('token tidak bisa dipindah ke store dengan prefix lain', () => {
    const a = createSignedStore<{ token: string | null }>('a_', 'token', 60000);
    const b = createSignedStore<{ token: string | null }>('b_', 'token', 60000);
    const token = a.issue({ token: null });
    assert.equal(b.get('b_' + token.slice(2)), undefined);
  });
});
