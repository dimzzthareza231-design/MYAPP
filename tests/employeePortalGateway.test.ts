// Pengujian API Gateway Portal Karyawan (/api/gateway/*) dengan autentikasi demo:
// otorisasi Area Admin, pemisahan tugas, dan cache idempotensi per pemanggil.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { registerEmployeePortalGateway } from '../src/server/employeePortalGateway';

process.env.SESSION_SECRET ||= 'test-secret-employee-gateway-0123456789abcdef';
process.env.NODE_ENV = 'test';

let base = '';
let server: http.Server;
const savedDemo = process.env.ALLOW_INSECURE_DEMO_AUTH;

before(async () => {
  process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
  const app = express();
  app.use(express.json());
  registerEmployeePortalGateway(app);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (savedDemo === undefined) delete process.env.ALLOW_INSECURE_DEMO_AUTH;
  else process.env.ALLOW_INSECURE_DEMO_AUTH = savedDemo;
});

async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) as any, headers: res.headers };
}

/** Login demo per divisi; divisi klinis/admin melewati tantangan MFA dengan OTP demo. */
async function login(divisionId: string): Promise<Record<string, string>> {
  const first = await request('POST', '/api/gateway/auth/login', { divisionId });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  let token: string = first.body.token;
  if (first.body.mfaRequired) {
    const mfa = await request('POST', '/api/gateway/auth/verify-mfa', {
      challengeId: first.body.challengeId,
      otp: first.body.demoOtpHint
    });
    assert.equal(mfa.status, 200, JSON.stringify(mfa.body));
    token = mfa.body.token;
  }
  assert.ok(token);
  return { Authorization: `Bearer ${token}` };
}

describe('gateway karyawan: autentikasi', () => {
  test('login demo ditolak saat produksi atau tanpa ALLOW_INSECURE_DEMO_AUTH', async () => {
    process.env.ALLOW_INSECURE_DEMO_AUTH = 'false';
    try {
      const r = await request('POST', '/api/gateway/auth/login', { divisionId: 'humas' });
      assert.equal(r.status, 503);
    } finally {
      process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
    }
  });

  test('rute terlindungi menolak tanpa sesi dan sesi dicabut setelah logout', async () => {
    assert.equal((await request('GET', '/api/gateway/bootstrap')).status, 401);
    const staff = await login('humas');
    assert.equal((await request('GET', '/api/gateway/bootstrap', undefined, staff)).status, 200);
    assert.equal((await request('POST', '/api/gateway/auth/logout', {}, staff)).status, 200);
    assert.equal((await request('GET', '/api/gateway/bootstrap', undefined, staff)).status, 401);
  });
});

describe('gateway karyawan: Area Admin', () => {
  test('staf non-admin tidak dapat mengubah akun, usulan, atau integrasi', async () => {
    const staff = await login('humas');
    assert.equal((await request('GET', '/api/gateway/admin/state', undefined, staff)).status, 403);
    for (const [path, body] of [
      ['/api/gateway/admin/users', { action: 'HRIS_SYNC' }],
      ['/api/gateway/admin/propose-change', { category: 'FEATURE_FLAG', targetKey: 'offline_attendance', proposedValue: false }],
      ['/api/gateway/admin/review-change', { proposalId: 'x', decision: 'APPROVE' }],
      ['/api/gateway/admin/integrations/test', { integrationId: 'x' }]
    ] as const) {
      const r = await request('POST', path, body, staff);
      assert.equal(r.status, 403, `${path} harus ditolak untuk staf non-admin`);
    }
  });

  test('usulan perubahan tidak dapat direview pengusulnya sendiri dan hanya sekali', async () => {
    const proposerAdmin = await login('simrs-ti');
    const reviewerAdmin = await login('spi');

    const proposed = await request('POST', '/api/gateway/admin/propose-change', {
      category: 'FEATURE_FLAG',
      title: 'Uji pemisahan tugas',
      targetKey: 'offline_attendance',
      proposedValue: true,
      justification: 'pengujian'
    }, proposerAdmin);
    assert.equal(proposed.status, 200);
    const proposalId = proposed.body.proposal.id;

    const selfReview = await request('POST', '/api/gateway/admin/review-change', { proposalId, decision: 'APPROVE' }, proposerAdmin);
    assert.equal(selfReview.status, 403);

    const review = await request('POST', '/api/gateway/admin/review-change', { proposalId, decision: 'APPROVE' }, reviewerAdmin);
    assert.equal(review.status, 200);
    assert.equal(review.body.proposal.status, 'APPROVED');

    const again = await request('POST', '/api/gateway/admin/review-change', { proposalId, decision: 'REJECT' }, reviewerAdmin);
    assert.equal(again.status, 409);
  });
});

describe('gateway karyawan: alur persetujuan', () => {
  test('pengaju tidak dapat menyetujui cuti dan tukar shift miliknya sendiri', async () => {
    const staff = await login('humas');
    const other = await login('keuangan');

    const leave = await request('POST', '/api/gateway/leaves', { type: 'Cuti Tahunan', days: 1 }, staff);
    assert.equal(leave.status, 200);
    const leaveId = leave.body.leave.id;
    assert.equal((await request('POST', '/api/gateway/leaves/approve', { leaveId }, staff)).status, 403);
    const approved = await request('POST', '/api/gateway/leaves/approve', { leaveId }, other);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.leave.status, 'Menunggu Verifikasi SDM');

    const swap = await request('POST', '/api/gateway/shifts/swap', {}, staff);
    assert.equal(swap.status, 200);
    const swapId = swap.body.swap.id;
    assert.equal((await request('POST', '/api/gateway/shifts/approve', { swapId }, staff)).status, 403);
    assert.equal((await request('POST', '/api/gateway/shifts/approve', { swapId }, other)).status, 200);
  });
});

describe('gateway karyawan: idempotensi', () => {
  test('replay hanya untuk pemanggil yang sama; pengguna lain dengan kunci sama tidak mendapat respons orang lain', async () => {
    const staff = await login('humas');
    const other = await login('keuangan');
    const key = { 'Idempotency-Key': 'same-key-123' };

    const first = await request('POST', '/api/gateway/leaves', { reason: 'pertama' }, { ...staff, ...key });
    const replay = await request('POST', '/api/gateway/leaves', { reason: 'kedua' }, { ...staff, ...key });
    assert.equal(replay.headers.get('x-idempotent-replay'), 'true');
    assert.equal(replay.body.leave.id, first.body.leave.id);

    const otherUser = await request('POST', '/api/gateway/leaves', { reason: 'orang lain' }, { ...other, ...key });
    assert.equal(otherUser.headers.get('x-idempotent-replay'), null);
    assert.equal(otherUser.body.leave.reason, 'orang lain');
  });

  test('respons login (berisi token) tidak pernah di-cache', async () => {
    const key = { 'Idempotency-Key': 'login-key' };
    const a = await request('POST', '/api/gateway/auth/login', { divisionId: 'humas' }, key);
    const b = await request('POST', '/api/gateway/auth/login', { divisionId: 'keuangan' }, key);
    assert.equal(b.headers.get('x-idempotent-replay'), null);
    assert.notEqual(a.body.session.divisionId, b.body.session.divisionId);
  });
});
