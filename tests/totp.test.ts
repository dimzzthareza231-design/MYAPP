import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  constantTimeEqual,
  generateTotp,
  generateTotpSecret,
  verifyTotp
} from '../src/server/totp';
import { createMfaSecretBox, generateRecoveryCodes } from '../src/server/mfaSecretBox';

const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

describe('TOTP RFC 6238', () => {
  test('vektor uji RFC 6238 (SHA1, 8 digit)', async () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130']
    ];
    for (const [seconds, expected] of vectors) {
      assert.equal(await generateTotp(RFC_SECRET, { timeMs: seconds * 1000, digits: 8 }), expected, `T=${seconds}`);
    }
  });

  test('base32 bolak-balik dan kompatibel dengan RFC 4648', () => {
    assert.equal(base32Encode(RFC_SECRET), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.deepEqual(base32Decode('gezd gnbv-gy3tqojqgezdgnbvgy3tqojq'), RFC_SECRET);
    assert.equal(base32Decode('not*base32'), null);
    const secret = generateTotpSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.notEqual(secret, generateTotpSecret());
    assert.equal(base32Decode(secret)?.length, 20);
  });

  test('menerima jendela ±1 langkah dan menolak di luar jendela', async () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1_700_000_000_000;
    for (const offset of [-1, 0, 1]) {
      const code = await generateTotp(secret, { timeMs: now + offset * 30_000 });
      assert.notEqual(await verifyTotp(secret, code, { timeMs: now }), null, `offset ${offset}`);
    }
    for (const offset of [-2, 2]) {
      const code = await generateTotp(secret, { timeMs: now + offset * 30_000 });
      assert.equal(await verifyTotp(secret, code, { timeMs: now }), null, `offset ${offset}`);
    }
    assert.equal(await verifyTotp(secret, '12345', { timeMs: now }), null);
    assert.equal(await verifyTotp(secret, 'abcdef', { timeMs: now }), null);
  });

  test('menolak replay kode pada langkah yang sudah dipakai', async () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1_700_000_000_000;
    const code = await generateTotp(secret, { timeMs: now });
    const step = await verifyTotp(secret, code, { timeMs: now });
    assert.equal(step, Math.floor(now / 30_000));
    assert.equal(await verifyTotp(secret, code, { timeMs: now, lastUsedStep: step! }), null);
    // Kode langkah sebelumnya juga ditolak setelah langkah yang lebih baru dipakai.
    const previous = await generateTotp(secret, { timeMs: now - 30_000 });
    assert.equal(await verifyTotp(secret, previous, { timeMs: now, lastUsedStep: step! }), null);
    const next = await generateTotp(secret, { timeMs: now + 30_000 });
    assert.equal(await verifyTotp(secret, next, { timeMs: now + 30_000, lastUsedStep: step! }), step! + 1);
  });

  test('perbandingan waktu konstan dan URI otpauth', () => {
    assert.equal(constantTimeEqual('123456', '123456'), true);
    assert.equal(constantTimeEqual('123456', '123457'), false);
    assert.equal(constantTimeEqual('123456', '1234567'), false);
    const uri = buildOtpauthUri({ secret: 'ABC', issuer: 'MYITARU SIMK', accountName: 'admin@myitaru.local' });
    assert.match(uri, /^otpauth:\/\/totp\/MYITARU%20SIMK:admin%40myitaru\.local\?/);
    const params = new URL(uri).searchParams;
    assert.equal(params.get('secret'), 'ABC');
    assert.equal(params.get('issuer'), 'MYITARU SIMK');
    assert.equal(params.get('digits'), '6');
    assert.equal(params.get('period'), '30');
  });
});

describe('penyimpanan rahasia MFA', () => {
  test('enkripsi AES-GCM terikat data terkait dan kunci', async () => {
    const box = createMfaSecretBox('secret-box-test-secret-with-enough-length');
    const ciphertext = await box.encrypt('GEZDGNBVGY3TQOJQ', 'active:user-1');
    assert.doesNotMatch(ciphertext, /GEZDGNBVGY3TQOJQ/);
    assert.equal(await box.decrypt(ciphertext, 'active:user-1'), 'GEZDGNBVGY3TQOJQ');
    assert.equal(await box.decrypt(ciphertext, 'active:user-2'), null);
    assert.equal(await createMfaSecretBox('another-secret-value-for-the-test').decrypt(ciphertext, 'active:user-1'), null);
    assert.equal(await box.decrypt('v1.bad.data', 'active:user-1'), null);
  });

  test('kode pemulihan di-hash dan dicocokkan tanpa memedulikan format', async () => {
    const box = createMfaSecretBox('secret-box-test-secret-with-enough-length');
    const codes = generateRecoveryCodes(10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(code, /^[a-z2-7]{5}-[a-z2-7]{5}$/);
    const hashes = await Promise.all(codes.map((code) => box.hashRecoveryCode('user-1', code)));
    assert.ok(hashes.every((hash) => !codes.some((code) => hash.includes(code.replace('-', '')))));
    assert.equal(await box.matchRecoveryCode('user-1', codes[3].toUpperCase().replace('-', ' '), hashes), 3);
    assert.equal(await box.matchRecoveryCode('user-2', codes[3], hashes), -1);
    assert.equal(await box.matchRecoveryCode('user-1', 'aaaaa-aaaaa', hashes), -1);
  });
});
