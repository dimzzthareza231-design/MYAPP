import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSecurePatientQrToken,
  readSecurePatientQrToken
} from '../src/server/securePatientQr';

const originalSecret = process.env.SESSION_SECRET;

before(() => {
  process.env.SESSION_SECRET = 'test-secret';
});

after(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe('QR pasien terenkripsi', () => {
  test('payload opaque dapat dibaca kembali tanpa mengekspos identitas pasien', () => {
    const token = createSecurePatientQrToken('internal-patient-001', { now: 1_000 });

    assert.match(token, /^MYITARU1\./);
    assert.equal(token.includes('internal-patient-001'), false);
    assert.deepEqual(readSecurePatientQrToken(token, 2_000), {
      version: 1,
      kind: 'patient',
      subject: 'internal-patient-001',
      issuedAt: 1_000
    });
  });

  test('token yang dimodifikasi, kedaluwarsa, atau memakai key lain ditolak', () => {
    const token = createSecurePatientQrToken('patient-1', {
      kind: 'reservation',
      ttlMs: 1_000,
      now: 1_000
    });
    const altered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    assert.equal(readSecurePatientQrToken(altered, 1_500), null);
    assert.equal(readSecurePatientQrToken(token, 2_000), null);
    process.env.SESSION_SECRET = 'other-test-secret';
    assert.equal(readSecurePatientQrToken(token, 1_500), null);
    process.env.SESSION_SECRET = 'test-secret';
  });
});
