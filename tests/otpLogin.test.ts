// Login pasien via OTP WhatsApp: alur HTTP lengkap dengan pengirim uji in-memory (tanpa jaringan).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestPatient, type TestPatient } from './helpers/patientFixtures';
import { setOtpSenderForTests } from '../src/server/otp';
import { InMemoryTestOtpSender } from '../src/server/otp/testSender';

process.env.VERCEL = '1'; // cegah server.ts menjalankan listen(); juga membuat x-real-ip dipercaya
process.env.SESSION_SECRET = 'test-secret-otp';
process.env.NODE_ENV = 'test';
delete process.env.GEMINI_API_KEY;
delete process.env.WHATSAPP_ACCESS_TOKEN;

type Res = { status: number; body: any; headers: Headers };
let core = '';
let pub = '';
const servers: http.Server[] = [];
const sender = new InMemoryTestOtpSender();
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter}`;

async function listen(app: http.RequestListener): Promise<string> {
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(path: string, body: unknown, ip = freshIp(), token?: string): Promise<Res> {
  const res = await fetch(pub + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': ip,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

const patients: Record<string, TestPatient> = {};
const phones = {
  a: '0812-1111-2222',
  b: '+62 813 3333 4444',
  c: '081255556666',
  d: '081277778888',
  e: '081299990000',
  f: '0811-2020-3030',
  g: '0811-4040-5050'
};

before(async () => {
  setOtpSenderForTests(sender);
  const { createApps, addErrorHandler } = await import('../server');
  const { app, publicApp } = await createApps({
    resolvePrincipal: async (token) =>
      token === 'test-token' ? { uid: 'admin', email: 'admin@test.local', roleId: 'super_admin', mfaVerified: true } : null,
    createSessionCookie: async () => 'test-session-token',
    revokeRefreshTokens: async () => {}
  });
  addErrorHandler(app);
  addErrorHandler(publicApp);
  core = await listen(app);
  pub = await listen(publicApp);
  for (const [key, no_hp] of Object.entries(phones)) {
    patients[key] = await createTestPatient(core, 'test-token', { nama: `Pasien OTP ${key}`, no_hp });
  }
});

after(() => {
  setOtpSenderForTests(undefined);
  servers.forEach((s) => s.close());
});

describe('OTP WhatsApp login pasien', () => {
  test('503 PATIENT_LOGIN_UNAVAILABLE bila WhatsApp belum dikonfigurasi', async () => {
    setOtpSenderForTests(null);
    try {
      const req = await call('/api/patient/otp/request', { no_rm: patients.a.no_rm });
      assert.equal(req.status, 503);
      assert.equal(req.body.code, 'PATIENT_LOGIN_UNAVAILABLE');
      const ver = await call('/api/patient/otp/verify', { request_id: 'a'.repeat(32), code: '123456' });
      assert.equal(ver.status, 503);
      assert.equal(ver.body.code, 'PATIENT_LOGIN_UNAVAILABLE');
    } finally {
      setOtpSenderForTests(sender);
    }
  });

  test('request + verify dengan No. RM menerbitkan sesi otp (sekali pakai)', async () => {
    const req = await call('/api/patient/otp/request', { no_rm: patients.a.no_rm.toLowerCase() });
    assert.equal(req.status, 200);
    assert.equal(req.body.success, true);
    assert.match(req.body.request_id, /^[a-f0-9]{32}$/);
    assert.equal(req.body.masked_phone, '08*******222');
    assert.equal(req.body.expires_in, 300);
    assert.equal(req.body.resend_after, 60);
    const code = sender.lastCodeFor('6281211112222');
    assert.match(code ?? '', /^\d{6}$/);
    assert.ok(!JSON.stringify(req.body).includes(code!), 'kode tidak boleh ada di respons');

    const ver = await call('/api/patient/otp/verify', { request_id: req.body.request_id, code });
    assert.equal(ver.status, 200);
    assert.equal(ver.body.success, true);
    assert.equal(ver.body.dossier.patient.no_rm, patients.a.no_rm);
    assert.equal(ver.body.dossier.authMethod, 'otp');
    assert.ok(ver.body.token.startsWith('pat_'));
    const cookie = ver.headers.get('set-cookie') ?? '';
    assert.match(cookie, /myitaru_patient_session=/);
    assert.match(cookie, /HttpOnly/);

    const dossier = await call('/api/patient/dossier', undefined, freshIp(), ver.body.token);
    assert.equal(dossier.status, 200);
    assert.equal(dossier.body.dossier.patient.no_rm, patients.a.no_rm);

    // Logout mencabut token yang sama juga untuk rute pembayaran (resolver sesi bersama).
    const otherReq = await call('/api/patient/otp/request', { no_rm: patients.g.no_rm });
    const otherVer = await call('/api/patient/otp/verify', {
      request_id: otherReq.body.request_id,
      code: sender.lastCodeFor('6281140405050')
    });
    const bills = (t: string) => fetch(`${pub}/api/patient/payments/bills`, { headers: { Authorization: `Bearer ${t}` } });
    assert.notEqual((await bills(otherVer.body.token)).status, 401);
    await fetch(`${pub}/api/patient/session`, { method: 'DELETE', headers: { Authorization: `Bearer ${otherVer.body.token}` } });
    assert.equal((await bills(otherVer.body.token)).status, 401);

    const reuse = await call('/api/patient/otp/verify', { request_id: req.body.request_id, code });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.body.code, 'OTP_EXPIRED');

    const audit = await fetch(`${core}/api/v1/audit/logs?module=Patient%20Portal%20Auth&limit=200`, {
      headers: { Authorization: 'Bearer test-token' }
    }).then((r) => r.json() as Promise<any>);
    const actions = audit.data.map((l: any) => `${l.action}:${l.status}`);
    assert.ok(actions.includes('OTP_REQUEST:SUCCESS'));
    assert.ok(actions.includes('OTP_VERIFY:SUCCESS'));
    assert.ok(!JSON.stringify(audit.data).includes('6281211112222'), 'audit tidak memuat nomor lengkap');
  });

  test('login dengan No. HP terdaftar (format +62) berhasil', async () => {
    const req = await call('/api/patient/otp/request', { no_hp: '081333334444' });
    assert.equal(req.status, 200);
    assert.equal(req.body.masked_phone, '08*******444');
    const code = sender.lastCodeFor('6281333334444');
    const ver = await call('/api/patient/otp/verify', { request_id: req.body.request_id, code });
    assert.equal(ver.status, 200);
    assert.equal(ver.body.dossier.patient.no_rm, patients.b.no_rm);
  });

  test('no_hp di permintaan diabaikan: kode hanya ke nomor terdaftar', async () => {
    const before = sender.sent.length;
    const req = await call('/api/patient/otp/request', { no_rm: patients.c.no_rm, no_hp: '089912345678' });
    assert.equal(req.status, 200);
    assert.equal(sender.sent.length, before + 1);
    assert.equal(sender.sent.at(-1)!.to, '6281255556666');
    assert.equal(sender.lastCodeFor('6289912345678'), undefined);
    assert.equal(req.body.masked_phone, '08*******666');
  });

  test('kode salah: sisa percobaan berkurang lalu terkunci setelah 5 kali', async () => {
    const req = await call('/api/patient/otp/request', { no_rm: patients.d.no_rm });
    const code = sender.lastCodeFor('6281277778888')!;
    const wrong = code === '000000' ? '111111' : '000000';
    const ip = freshIp();
    for (let remaining = 4; remaining >= 1; remaining -= 1) {
      const res = await call('/api/patient/otp/verify', { request_id: req.body.request_id, code: wrong }, ip);
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'OTP_INVALID');
      assert.equal(res.body.attempts_remaining, remaining);
    }
    const locked = await call('/api/patient/otp/verify', { request_id: req.body.request_id, code: wrong }, ip);
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'OTP_LOCKED');
    const afterLock = await call('/api/patient/otp/verify', { request_id: req.body.request_id, code }, ip);
    assert.equal(afterLock.status, 400);
    assert.equal(afterLock.body.code, 'OTP_EXPIRED');
  });

  test('pasien tidak dikenal: respons generik identik, tanpa pengiriman', async () => {
    const before = sender.sent.length;
    const known = await call('/api/patient/otp/request', { no_rm: patients.e.no_rm });
    const unknown = await call('/api/patient/otp/request', { no_rm: 'RM-999999-9999' });
    const unknownPhone = await call('/api/patient/otp/request', { no_hp: '085700001111' });
    assert.equal(sender.sent.length, before + 1);
    for (const res of [unknown, unknownPhone]) {
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.body).sort(), Object.keys(known.body).sort());
      assert.equal(res.body.message, known.body.message);
      assert.match(res.body.masked_phone, /^08\*+\d{3}$/);
    }
    // Nomor samaran deterministik agar permintaan berulang tidak membedakan pasien fiktif.
    const again = await call('/api/patient/otp/request', { no_rm: 'rm-999999-9999' }, freshIp());
    assert.equal(again.status, 429); // cooldown 60 dtk berlaku sama seperti pasien nyata
    const verify = await call('/api/patient/otp/verify', { request_id: unknown.body.request_id, code: '123456' });
    assert.equal(verify.status, 400);
    assert.equal(verify.body.code, 'OTP_INVALID');
  });

  test('rate limit: cooldown kirim ulang per nomor dan batas per IP', async () => {
    const first = await call('/api/patient/otp/request', { no_rm: patients.f.no_rm });
    assert.equal(first.status, 200);
    // Sumber berbeda (No. HP) ke nomor tujuan yang sama tetap kena cooldown.
    const again = await call('/api/patient/otp/request', { no_hp: phones.f });
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'OTP_RATE_LIMITED');
    assert.ok(Number(again.headers.get('retry-after')) > 0);

    const ip = freshIp();
    for (let i = 0; i < 10; i += 1) {
      const res = await call('/api/patient/otp/request', { no_rm: `RM-IPTEST-${i}` }, ip);
      assert.equal(res.status, 200);
    }
    const blocked = await call('/api/patient/otp/request', { no_rm: 'RM-IPTEST-X' }, ip);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'OTP_RATE_LIMITED');
  });

  test('input tidak valid ditolak 400', async () => {
    assert.equal((await call('/api/patient/otp/request', {})).status, 400);
    assert.equal((await call('/api/patient/otp/request', { no_hp: '12345' })).status, 400);
    assert.equal((await call('/api/patient/otp/verify', { request_id: 'x', code: '12' })).status, 400);
  });
});
