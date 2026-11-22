// Unit test modul OTP: normalisasi nomor, kedaluwarsa, rate limit per target, hash-only storage,
// payload WhatsApp Cloud API, dan pemilihan pengirim dari env.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryOtpStore,
  OtpLoginService,
  OTP_TTL_MS,
  WhatsAppCloudSender,
  createOtpSenderFromEnv,
  maskPhone,
  normalizeIndonesianPhone,
  resolveOtpSecret,
  setOtpSenderForTests,
  type OtpKvStore
} from '../src/server/otp';
import { InMemoryTestOtpSender } from '../src/server/otp/testSender';

process.env.NODE_ENV = 'test';

function setup() {
  let clock = 1_700_000_000_000;
  const inner = new MemoryOtpStore(() => clock);
  const writes: string[] = [];
  const store: OtpKvStore = {
    get: (k) => inner.get(k),
    put: async (k, v, ttl) => {
      writes.push(JSON.stringify({ k, v }));
      return inner.put(k, v, ttl);
    },
    delete: (k) => inner.delete(k)
  };
  const sender = new InMemoryTestOtpSender();
  const service = new OtpLoginService({
    store,
    sender,
    secret: 'unit-secret',
    now: () => clock,
    patients: {
      findByRm: (rm) => (rm === 'RM-1' ? { no_rm: 'RM-1', no_hp: '0812 3456 7890' } : undefined),
      findByPhone: (e164) => (e164 === '6281234567890' ? [{ no_rm: 'RM-1', no_hp: '0812 3456 7890' }] : [])
    }
  });
  return { service, sender, writes, advance: (ms: number) => (clock += ms) };
}

describe('normalisasi nomor Indonesia', () => {
  test('08xx / +62 / 62 / 8xx -> E.164', () => {
    for (const raw of ['081234567890', '+62 812-3456-7890', '6281234567890', '81234567890', '0062 812 3456 7890']) {
      assert.equal(normalizeIndonesianPhone(raw), '6281234567890', raw);
    }
  });
  test('menolak nomor tidak valid', () => {
    for (const raw of ['', '-', '12345', '0212345678', 'abc0812345678', '0812345']) {
      assert.equal(normalizeIndonesianPhone(raw), null, raw);
    }
  });
  test('masking', () => {
    assert.equal(maskPhone('6281234567890'), '08*******890');
  });
});

describe('OtpLoginService', () => {
  test('kode kedaluwarsa setelah 5 menit', async () => {
    const { service, sender, advance } = setup();
    const req = await service.requestOtp({ no_rm: 'RM-1', ip: '1.1.1.1' });
    assert.equal(req.kind, 'accepted');
    const code = sender.lastCodeFor('6281234567890')!;
    advance(OTP_TTL_MS + 1000);
    const res = await service.verifyOtp({ request_id: (req as any).requestId, code, ip: '1.1.1.1' });
    assert.equal(res.kind, 'invalid_or_expired');
  });

  test('hanya hash yang disimpan, bukan kode', async () => {
    const { service, sender, writes } = setup();
    await service.requestOtp({ no_rm: 'RM-1', ip: '1.1.1.1' });
    const code = sender.lastCodeFor('6281234567890')!;
    const all = writes.join('\n');
    assert.ok(!all.includes(`"${code}"`) && !all.includes(`:${code}`), 'kode mentah tidak boleh tersimpan');
    assert.ok(!all.includes('6281234567890'), 'nomor mentah tidak boleh jadi kunci/isi');
  });

  test('maks 3 permintaan per target per 15 menit (setelah cooldown 60 dtk)', async () => {
    const { service, advance } = setup();
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await service.requestOtp({ no_rm: 'RM-1', ip: `2.2.2.${i}` })).kind, 'accepted');
      advance(61_000);
    }
    const fourth = await service.requestOtp({ no_hp: '081234567890', ip: '2.2.2.9' });
    assert.equal(fourth.kind, 'rate_limited');
    advance(15 * 60 * 1000);
    assert.equal((await service.requestOtp({ no_rm: 'RM-1', ip: '2.2.2.10' })).kind, 'accepted');
  });

  test('gagal kirim -> delivery_failed dan permintaan dihapus', async () => {
    const { service, sender } = setup();
    sender.failNext = true;
    const res = await service.requestOtp({ no_rm: 'RM-1', ip: '3.3.3.3' });
    assert.equal(res.kind, 'delivery_failed');
    // Cooldown dilepas agar pasien bisa langsung mencoba lagi.
    assert.equal((await service.requestOtp({ no_rm: 'RM-1', ip: '3.3.3.3' })).kind, 'accepted');
  });
});

describe('WhatsAppCloudSender', () => {
  test('mengirim template autentikasi dengan kode di body dan tombol salin kode', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new WhatsAppCloudSender({
      accessToken: 'tok',
      phoneNumberId: '12345',
      templateName: 'otp_login',
      templateLang: 'id',
      apiVersion: 'v23.0',
      fetchImpl: fakeFetch
    });
    const res = await sender.sendOtp('6281234567890', '123456');
    assert.deepEqual(res, { ok: true, providerMessageId: 'wamid.X' });
    assert.equal(captured!.url, 'https://graph.facebook.com/v23.0/12345/messages');
    assert.equal((captured!.init.headers as Record<string, string>).Authorization, 'Bearer tok');
    const body = JSON.parse(String(captured!.init.body));
    assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.to, '6281234567890');
    assert.equal(body.template.name, 'otp_login');
    assert.equal(body.template.language.code, 'id');
    assert.deepEqual(body.template.components, [
      { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '123456' }] }
    ]);
  });

  test('galat API dilaporkan tanpa membocorkan isi respons', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { code: 131026, message: 'secret detail' } }), { status: 400 })) as unknown as typeof fetch;
    const sender = new WhatsAppCloudSender({
      accessToken: 't', phoneNumberId: '1', templateName: 'x', templateLang: 'id', apiVersion: 'v23.0', fetchImpl: fakeFetch
    });
    assert.deepEqual(await sender.sendOtp('6281234567890', '000000'), { ok: false, error: 'HTTP_400_131026' });
  });
});

describe('konfigurasi', () => {
  test('tanpa env WhatsApp lengkap -> tidak ada pengirim (endpoint 503)', () => {
    assert.equal(createOtpSenderFromEnv({}), null);
    assert.equal(createOtpSenderFromEnv({ WHATSAPP_ACCESS_TOKEN: 'a', WHATSAPP_PHONE_NUMBER_ID: '1' }), null);
    const sender = createOtpSenderFromEnv({
      WHATSAPP_ACCESS_TOKEN: 'a', WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_OTP_TEMPLATE: 'otp'
    });
    assert.ok(sender instanceof WhatsAppCloudSender);
    assert.equal(resolveOtpSecret({}), null);
    assert.equal(resolveOtpSecret({ SESSION_SECRET: 'abcdefghijkl' }), 'abcdefghijkl');
  });

  test('pengirim uji tidak bisa dipasang di luar NODE_ENV=test', () => {
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(() => setOtpSenderForTests(new InMemoryTestOtpSender()));
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });
});
