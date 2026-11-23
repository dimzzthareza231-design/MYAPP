import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryPersistenceRepository } from '../src/server/databaseAdapter';
import { registerCoreAuthentication } from '../src/server/coreAuth';
import { LocalAuthService } from '../src/server/localAuth';
import { generateTotp } from '../src/server/totp';

const SESSION_SECRET = 'local-auth-mfa-test-session-secret-with-length';
const PASSWORD = 'LocalTestPassword!2026';
const servers: http.Server[] = [];

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startApp(options: { requireMfa?: boolean } = {}) {
  const clock = { now: Date.parse('2026-11-23T08:00:00.000Z') };
  const persistence = new MemoryPersistenceRepository();
  const localAuth = new LocalAuthService(persistence, {
    sessionSecret: SESSION_SECRET,
    requireMfa: options.requireMfa ?? false,
    now: () => clock.now,
    bootstrapUsers: [
      { username: 'admin', email: 'admin@myitaru.local', nama: 'Administrator Uji', roleId: 'admin', password: PASSWORD },
      { username: 'dokter', email: 'dokter@myitaru.local', nama: 'Dokter Uji', roleId: 'dokter', password: PASSWORD }
    ]
  });
  await localAuth.initialize();
  const app = express();
  app.use(express.json());
  registerCoreAuthentication(app, { authMode: 'local', localAuth });
  app.get('/api/v1/system/stats', (_req, res) => res.json({ success: true }));
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, ...headers },
    body: JSON.stringify(body)
  });
  const get = (path: string, cookie: string) => fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  const cookieOf = (response: Response) => (response.headers.get('set-cookie') || '').split(';')[0];
  const login = (identifier: string, ip = '203.0.113.10', password = PASSWORD) =>
    post('/api/auth/login', { identifier, password }, { 'cf-connecting-ip': ip });

  return { clock, persistence, baseUrl, post, get, cookieOf, login };
}

async function enroll(ctx: Awaited<ReturnType<typeof startApp>>, cookie: string) {
  const start = await ctx.post('/api/auth/mfa/enroll', {}, { Cookie: cookie });
  assert.equal(start.status, 200);
  const { secret, otpauthUri } = await start.json() as { secret: string; otpauthUri: string };
  assert.match(otpauthUri, /^otpauth:\/\/totp\//);
  const code = await generateTotp(secret, { timeMs: ctx.clock.now });
  const confirm = await ctx.post('/api/auth/mfa/enroll/confirm', { code }, { Cookie: cookie });
  assert.equal(confirm.status, 200);
  const { recoveryCodes } = await confirm.json() as { recoveryCodes: string[] };
  return { secret, recoveryCodes, code };
}

describe('MFA TOTP autentikasi staf lokal', () => {
  test('LOCAL_AUTH_REQUIRE_MFA memaksa admin mendaftar sebelum akses API lain', async () => {
    const ctx = await startApp({ requireMfa: true });
    const login = await ctx.login('admin');
    assert.equal(login.status, 200);
    const body = await login.json() as { mfa: { enrollmentRequired: boolean } };
    assert.equal(body.mfa.enrollmentRequired, true);
    const cookie = ctx.cookieOf(login);

    const blocked = await ctx.get('/api/v1/system/stats', cookie);
    assert.equal(blocked.status, 403);
    assert.equal(((await blocked.json()) as { code: string }).code, 'MFA_ENROLLMENT_REQUIRED');
    const me = await ctx.get('/api/auth/me', cookie);
    assert.equal(((await me.json()) as { mfa: { enrollmentRequired: boolean } }).mfa.enrollmentRequired, true);

    const wrong = await ctx.post('/api/auth/mfa/enroll/confirm', { code: '000000' }, { Cookie: cookie });
    assert.equal(wrong.status, 410); // belum ada pendaftaran tertunda
    const { secret, recoveryCodes } = await enroll(ctx, cookie);
    assert.equal(recoveryCodes.length, 10);
    assert.equal((await ctx.get('/api/v1/system/stats', cookie)).status, 200);

    // Rahasia disimpan terenkripsi, kode pemulihan hanya sebagai hash.
    const [stored] = await ctx.persistence.list<Record<string, unknown>>('local_auth_mfa');
    const serialized = JSON.stringify(stored.data);
    assert.ok(!serialized.includes(secret));
    assert.ok(recoveryCodes.every((code) => !serialized.includes(code)));
    assert.equal(stored.data.enabled, true);

    // Pengguna lain (bukan admin) tidak dipaksa.
    const doctor = await ctx.login('dokter');
    assert.equal(((await doctor.json()) as { mfa: { enrollmentRequired: boolean } }).mfa.enrollmentRequired, false);
    assert.equal((await ctx.get('/api/v1/system/stats', ctx.cookieOf(doctor))).status, 200);

    // Kebijakan melarang admin menonaktifkan MFA.
    ctx.clock.now += 30_000;
    const disable = await ctx.post('/api/auth/mfa/disable', { code: await generateTotp(secret, { timeMs: ctx.clock.now }) }, { Cookie: cookie });
    assert.equal(disable.status, 403);
    assert.equal(((await disable.json()) as { code: string }).code, 'MFA_REQUIRED_BY_POLICY');
  });

  test('login dengan MFA aktif memerlukan tantangan + TOTP, menolak replay, lalu menerbitkan sesi', async () => {
    const ctx = await startApp();
    const first = await ctx.login('dokter');
    const firstCookie = ctx.cookieOf(first);
    const { secret, code: enrollmentCode } = await enroll(ctx, firstCookie);

    const login = await ctx.login('dokter');
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('set-cookie'), null);
    const body = await login.json() as { mfaRequired: boolean; challengeToken: string; user?: unknown };
    assert.equal(body.mfaRequired, true);
    assert.equal(body.user, undefined);
    assert.match(body.challengeToken, /^mfa_/);

    // Token tantangan bukan sesi.
    assert.equal((await ctx.get('/api/v1/system/stats', `myitaru_local_session=${body.challengeToken}`)).status, 401);

    // Kode yang sudah dipakai saat konfirmasi pendaftaran tidak boleh dipakai ulang.
    const replay = await ctx.post('/api/auth/mfa/verify', { challengeToken: body.challengeToken, code: enrollmentCode });
    assert.equal(replay.status, 401);
    assert.equal(((await replay.json()) as { code: string }).code, 'INVALID_MFA_CODE');

    ctx.clock.now += 30_000;
    const code = await generateTotp(secret, { timeMs: ctx.clock.now });
    const tampered = await ctx.post('/api/auth/mfa/verify', { challengeToken: `${body.challengeToken}x`, code });
    assert.equal(tampered.status, 401);
    assert.equal(((await tampered.json()) as { code: string }).code, 'MFA_CHALLENGE_EXPIRED');

    const verify = await ctx.post('/api/auth/mfa/verify', { challengeToken: body.challengeToken, code });
    assert.equal(verify.status, 200);
    const cookie = ctx.cookieOf(verify);
    assert.match(cookie, /^myitaru_local_session=/);
    assert.equal((await ctx.get('/api/v1/system/stats', cookie)).status, 200);

    // Kode yang sama ditolak pada login berikutnya (anti-replay).
    const again = await ctx.login('dokter');
    const { challengeToken } = await again.json() as { challengeToken: string };
    assert.equal((await ctx.post('/api/auth/mfa/verify', { challengeToken, code })).status, 401);

    // Tantangan kedaluwarsa setelah 5 menit.
    ctx.clock.now += 6 * 60_000;
    const late = await ctx.post('/api/auth/mfa/verify', { challengeToken, code: await generateTotp(secret, { timeMs: ctx.clock.now }) });
    assert.equal(((await late.json()) as { code: string }).code, 'MFA_CHALLENGE_EXPIRED');

    // Sesi lama (sebelum MFA aktif) yang lain dicabut saat pendaftaran; sesi pendaftar tetap.
    assert.equal((await ctx.get('/api/auth/me', firstCookie)).status, 200);
  });

  test('kode pemulihan hanya berlaku sekali dan dapat dibuat ulang dengan TOTP', async () => {
    const ctx = await startApp();
    const cookie = ctx.cookieOf(await ctx.login('dokter'));
    const { secret, recoveryCodes } = await enroll(ctx, cookie);

    const challenge = async () => ((await (await ctx.login('dokter')).json()) as { challengeToken: string }).challengeToken;
    const useRecovery = await ctx.post('/api/auth/mfa/verify', { challengeToken: await challenge(), recoveryCode: recoveryCodes[0] });
    assert.equal(useRecovery.status, 200);
    const useRecoveryBody = await useRecovery.json() as { mfa: { recoveryCodeUsed: boolean; recoveryCodesRemaining: number } };
    assert.equal(useRecoveryBody.mfa.recoveryCodeUsed, true);
    assert.equal(useRecoveryBody.mfa.recoveryCodesRemaining, 9);

    const reuse = await ctx.post('/api/auth/mfa/verify', { challengeToken: await challenge(), recoveryCode: recoveryCodes[0] });
    assert.equal(reuse.status, 401);

    const status = await ctx.get('/api/auth/mfa/status', cookie);
    assert.equal(((await status.json()) as { mfa: { recoveryCodesRemaining: number } }).mfa.recoveryCodesRemaining, 9);

    // Pembuatan ulang menolak kode pemulihan, menerima TOTP, dan membatalkan kode lama.
    assert.equal((await ctx.post('/api/auth/mfa/recovery-codes', { code: recoveryCodes[1] }, { Cookie: cookie })).status, 401);
    ctx.clock.now += 30_000;
    const regenerate = await ctx.post('/api/auth/mfa/recovery-codes', { code: await generateTotp(secret, { timeMs: ctx.clock.now }) }, { Cookie: cookie });
    assert.equal(regenerate.status, 200);
    const fresh = ((await regenerate.json()) as { recoveryCodes: string[] }).recoveryCodes;
    assert.equal(fresh.length, 10);
    assert.equal((await ctx.post('/api/auth/mfa/verify', { challengeToken: await challenge(), recoveryCode: recoveryCodes[1] })).status, 401);
    assert.equal((await ctx.post('/api/auth/mfa/verify', { challengeToken: await challenge(), recoveryCode: fresh[0] })).status, 200);

    // Menonaktifkan MFA memerlukan kode saat ini; setelah itu login kembali tanpa tantangan.
    assert.equal((await ctx.post('/api/auth/mfa/disable', { code: '123456' }, { Cookie: cookie })).status, 401);
    ctx.clock.now += 30_000;
    const disable = await ctx.post('/api/auth/mfa/disable', { code: await generateTotp(secret, { timeMs: ctx.clock.now }) }, { Cookie: cookie });
    assert.equal(disable.status, 200);
    const plain = await ctx.login('dokter');
    assert.match(ctx.cookieOf(plain), /^myitaru_local_session=/);
    assert.equal(((await plain.json()) as { mfaRequired?: boolean }).mfaRequired, undefined);
  });

  test('mengunci percobaan kata sandi gagal per akun+IP lalu membuka setelah jeda', async () => {
    const ctx = await startApp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await ctx.login('dokter', '198.51.100.7', 'wrong-password')).status, 401);
    }
    const locked = await ctx.login('dokter', '198.51.100.7');
    assert.equal(locked.status, 429);
    assert.equal(((await locked.json()) as { code: string }).code, 'ACCOUNT_LOCKED');
    assert.ok(Number(locked.headers.get('retry-after')) > 0);

    // Akun tak dikenal diperlakukan sama (tidak membocorkan keberadaan akun).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await ctx.login('tidak-ada', '198.51.100.7', 'wrong-password')).status, 401);
    }
    assert.equal((await ctx.login('tidak-ada', '198.51.100.7', 'wrong-password')).status, 429);

    // IP lain masih bisa masuk; setelah jeda penguncian, IP semula juga.
    assert.equal((await ctx.login('dokter', '198.51.100.8')).status, 200);
    ctx.clock.now += 15 * 60_000 + 1000;
    assert.equal((await ctx.login('dokter', '198.51.100.7')).status, 200);
  });

  test('mengunci percobaan kode MFA gagal dan batas per akun lintas IP', async () => {
    const ctx = await startApp();
    const cookie = ctx.cookieOf(await ctx.login('dokter'));
    const { secret } = await enroll(ctx, cookie);
    const challenge = async (ip: string) =>
      ((await (await ctx.login('dokter', ip)).json()) as { challengeToken: string }).challengeToken;

    const token = await challenge('192.0.2.1');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      statuses.push((await ctx.post('/api/auth/mfa/verify', { challengeToken: token, code: '000000' }, { 'cf-connecting-ip': '192.0.2.1' })).status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
    ctx.clock.now += 30_000;
    const valid = await generateTotp(secret, { timeMs: ctx.clock.now });
    const locked = await ctx.post('/api/auth/mfa/verify', { challengeToken: token, code: valid }, { 'cf-connecting-ip': '192.0.2.1' });
    assert.equal(locked.status, 429);

    // Batas per akun (10) berlaku walau penyerang berganti IP.
    const other = await challenge('192.0.2.2');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await ctx.post('/api/auth/mfa/verify', { challengeToken: other, code: '000000' }, { 'cf-connecting-ip': `192.0.2.${10 + attempt}` });
    }
    const accountLocked = await ctx.post('/api/auth/mfa/verify', { challengeToken: other, code: valid }, { 'cf-connecting-ip': '192.0.2.99' });
    assert.equal(accountLocked.status, 429);

    ctx.clock.now += 15 * 60_000 + 1000;
    const recovered = await ctx.post('/api/auth/mfa/verify', {
      challengeToken: await challenge('192.0.2.99'),
      code: await generateTotp(secret, { timeMs: ctx.clock.now })
    }, { 'cf-connecting-ip': '192.0.2.99' });
    assert.equal(recovered.status, 200);
  });
});
