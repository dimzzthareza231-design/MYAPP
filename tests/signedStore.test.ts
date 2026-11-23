import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createSignedStore } from '../src/server/signedStore';

process.env.SESSION_SECRET ||= 'test-session-secret-for-signed-store-0123456789';

interface DemoSession {
  token: string;
  userId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('signed store (token sesi bertanda tangan)', () => {
  test('menerbitkan token yang bisa dibaca kembali dan menuliskan token ke data', () => {
    const store = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const session: DemoSession = { token: '', userId: 'U-1' };
    const token = store.issue(session);
    assert.ok(token.startsWith('tst_'));
    assert.equal(session.token, token);
    assert.equal(store.get(token)?.userId, 'U-1');
    assert.equal(store.has(token), true);
  });

  test('token dari instance lain (tanpa cache) diverifikasi lewat tanda tangan', () => {
    const issuer = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const otherInstance = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const token = issuer.issue({ token: '', userId: 'U-2' });
    const restored = otherInstance.get(token);
    assert.equal(restored?.userId, 'U-2');
    assert.equal(restored?.token, token);
  });

  test('token kedaluwarsa ditolak juga di instance yang menerbitkannya (regresi cache)', async () => {
    const store = createSignedStore<DemoSession>('tst_', 'token', 30);
    const token = store.issue({ token: '', userId: 'U-3' });
    assert.equal(store.has(token), true);
    await sleep(60);
    assert.equal(store.get(token), undefined);
    assert.equal(store.has(token), false);
  });

  test('token yang dicabut tidak dapat dipakai lagi', () => {
    const store = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const token = store.issue({ token: '', userId: 'U-4' });
    store.delete(token);
    assert.equal(store.get(token), undefined);
  });

  test('tanda tangan palsu atau prefix lain ditolak', () => {
    const store = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const token = store.issue({ token: '', userId: 'U-5' });
    const [body] = token.slice(4).split('.');
    assert.equal(store.get(`tst_${body}.AAAA`), undefined);
    assert.equal(store.get(token.replace('tst_', 'xxx_')), undefined);
    assert.equal(store.get(''), undefined);
    assert.equal(store.get('tst_'), undefined);
  });

  test('tanda tangan multibyte dengan panjang karakter sama tidak melempar RangeError', () => {
    const store = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const token = store.issue({ token: '', userId: 'U-6' });
    const [body, sig] = token.slice(4).split('.');
    const forged = `tst_${body}.${'é'.repeat(sig.length)}`;
    assert.doesNotThrow(() => store.get(forged));
    assert.equal(store.get(forged), undefined);
  });

  test('body yang dimanipulasi (mis. exp diperpanjang) ditolak', () => {
    const store = createSignedStore<DemoSession>('tst_', 'token', 60_000);
    const token = store.issue({ token: '', userId: 'U-7' });
    const [, sig] = token.slice(4).split('.');
    const tampered = Buffer.from(JSON.stringify({ exp: Date.now() + 10 ** 9, data: { userId: 'ADMIN' } })).toString('base64url');
    assert.equal(createSignedStore<DemoSession>('tst_', 'token', 60_000).get(`tst_${tampered}.${sig}`), undefined);
  });
});
