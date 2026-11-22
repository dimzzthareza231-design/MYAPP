// Pengujian pembayaran online tagihan pasien (Xendit + PayPal). Panggilan ke provider di-mock lewat
// globalThis.fetch; permintaan ke server uji lokal tetap diteruskan ke fetch asli.
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

process.env.VERCEL = '1';
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

import { MemoryPersistenceRepository } from '../src/server/databaseAdapter';
import { issuePatientSession } from '../src/server/patientPortalService';
import { registerPaymentRoutes } from '../src/server/payments';
import { PayPalProvider } from '../src/server/payments/paypalProvider';

const realFetch = globalThis.fetch;
const servers: http.Server[] = [];

interface ProviderCall { url: string; method: string; headers: Record<string, string>; body: any }
let providerCalls: ProviderCall[] = [];
let xenditStatus = 'REQUIRES_ACTION';

function installProviderMock() {
  providerCalls = [];
  globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
    const headers = Object.fromEntries(Object.entries((init.headers || {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
    providerCalls.push({ url, method: init.method || 'GET', headers, body });

    if (url === 'https://api.xendit.co/v3/payment_requests' && init.method === 'POST') {
      const actions = body.channel_code.endsWith('_VIRTUAL_ACCOUNT')
        ? [{ type: 'PRESENT_TO_CUSTOMER', descriptor: 'VIRTUAL_ACCOUNT_NUMBER', value: '8808123456789' }]
        : body.channel_code === 'QRIS'
          ? [{ type: 'PRESENT_TO_CUSTOMER', descriptor: 'QR_STRING', value: '00020101021226QRISDATA' }]
          : [{ type: 'REDIRECT_CUSTOMER', descriptor: 'WEB_URL', value: 'https://ewallet.example/checkout' },
             { type: 'REDIRECT_CUSTOMER', descriptor: 'DEEPLINK_URL', value: 'gojek://pay/abc' }];
      return Response.json({
        payment_request_id: `pr-${body.reference_id}`,
        reference_id: body.reference_id,
        status: 'REQUIRES_ACTION',
        request_amount: body.request_amount,
        currency: body.currency,
        channel_code: body.channel_code,
        channel_properties: body.channel_properties,
        actions
      }, { status: 201 });
    }
    if (url.startsWith('https://api.xendit.co/v3/payment_requests/')) {
      return Response.json({ payment_request_id: url.split('/').pop(), status: xenditStatus, request_amount: 150000, currency: 'IDR' });
    }
    if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'pp-token', expires_in: 3600 });
    if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
      return Response.json({ verification_status: body.transmission_sig === 'good-sig' && body.webhook_id === 'WH-1' ? 'SUCCESS' : 'FAILURE' });
    }
    if (url.endsWith('/v2/checkout/orders') && init.method === 'POST') {
      return Response.json({ id: 'ORDER-1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1' }] }, { status: 200 });
    }
    return new Response('not mocked', { status: 599 });
  }) as typeof fetch;
}

afterEach(() => { globalThis.fetch = realFetch; });

const XENDIT_ENV = {
  XENDIT_SECRET_KEY: 'xnd_development_test',
  XENDIT_CALLBACK_TOKEN: 'callback-token-uji'
};
const PAYPAL_ENV = {
  PAYPAL_CLIENT_ID: 'client', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_ENV: 'sandbox',
  PAYPAL_WEBHOOK_ID: 'WH-1', PAYPAL_CURRENCY: 'USD', PAYPAL_IDR_PER_UNIT: '16000'
};

async function startApp(env: Record<string, string | undefined>) {
  const persistence = new MemoryPersistenceRepository();
  const audits: Array<{ action: string; status: string }> = [];
  const app = express();
  app.use(express.json());
  registerPaymentRoutes(app, { persistence, env, createAuditLog: (entry) => audits.push(entry) });
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await persistence.commit([
    { entity: 'billings', id: 'bill-a', data: { id: 'bill-a', noBilling: 'INV-A', noRm: 'RM-0001', status: 'Belum Lunas', totalTagihan: 150000, sisaTagihan: 150000, jumlahDibayar: 0, items: [{ nama: 'Konsultasi', subtotal: 150000 }] } },
    { entity: 'billings', id: 'bill-b', data: { id: 'bill-b', noBilling: 'INV-B', noRm: 'RM-0002', status: 'Belum Lunas', totalTagihan: 90000, sisaTagihan: 90000, jumlahDibayar: 0, items: [] } },
    { entity: 'billings', id: 'bill-lunas', data: { id: 'bill-lunas', noBilling: 'INV-C', noRm: 'RM-0001', status: 'Lunas', totalTagihan: 50000, sisaTagihan: 0, jumlahDibayar: 50000, items: [] } }
  ]);
  return { base, persistence, audits };
}

async function call(base: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await realFetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

const tokenA = () => ({ Authorization: `Bearer ${issuePatientSession('RM-0001', 'otp')}` });

after(() => servers.forEach((s) => s.close()));

describe('pembayaran online: provider belum dikonfigurasi', () => {
  test('channels kosong dan create 503', async () => {
    const { base } = await startApp({});
    const channels = await call(base, 'GET', '/api/patient/payments/channels', undefined, tokenA());
    assert.equal(channels.status, 200);
    assert.deepEqual(channels.body.channels, []);
    assert.equal(channels.body.configured, false);
    const created = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'QRIS' }, tokenA());
    assert.equal(created.status, 503);
    assert.equal(created.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
  });

  test('PayPal tanpa kurs/mata uang settlement dianggap tidak tersedia (IDR tidak didukung PayPal)', async () => {
    const { PAYPAL_IDR_PER_UNIT: _r, ...noRate } = PAYPAL_ENV;
    assert.equal(PayPalProvider.fromEnv(noRate).isConfigured(), false);
    assert.equal(PayPalProvider.fromEnv({ ...PAYPAL_ENV, PAYPAL_CURRENCY: 'IDR' }).isConfigured(), false);
    assert.equal(PayPalProvider.fromEnv(PAYPAL_ENV).isConfigured(), true);
  });
});

describe('pembayaran online: Xendit', () => {
  test('sesi pasien wajib', async () => {
    const { base } = await startApp(XENDIT_ENV);
    assert.equal((await call(base, 'GET', '/api/patient/payments/channels')).status, 401);
    assert.equal((await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'QRIS' })).status, 401);
  });

  test('channels: kanal tidak didukung (Bank DKI, Bank Jateng, QRIS Tap) tidak ditawarkan', async () => {
    const { base } = await startApp({ ...XENDIT_ENV, PAYMENT_CHANNELS: 'VA_BCA,QRIS,VA_BANK_DKI' });
    const res = await call(base, 'GET', '/api/patient/payments/channels', undefined, tokenA());
    assert.deepEqual(res.body.channels.map((c: any) => c.id).sort(), ['QRIS', 'VA_BCA']);
    const unavailable = res.body.unavailable.map((c: any) => c.id);
    for (const id of ['VA_BANK_DKI', 'VA_BANK_JATENG', 'QRIS_TAP']) assert.ok(unavailable.includes(id), id);
  });

  test('nominal selalu dari tagihan server, bukan dari klien; idempoten per tagihan+kanal', async () => {
    installProviderMock();
    const { base } = await startApp(XENDIT_ENV);
    const res = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'VA_BCA', amount: 1, request_amount: 1 }, tokenA());
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.payment.amount, 150000);
    assert.equal(res.body.payment.instructions.kind, 'virtual_account');
    assert.equal(res.body.payment.instructions.va_number, '8808123456789');
    assert.ok(res.body.payment.expires_at);

    const create = providerCalls.find((c) => c.method === 'POST')!;
    assert.equal(create.body.request_amount, 150000);
    assert.equal(create.body.currency, 'IDR');
    assert.equal(create.body.channel_code, 'BCA_VIRTUAL_ACCOUNT');
    assert.equal(create.headers['api-version'], '2024-11-11');
    assert.ok(create.headers['idempotency-key']);
    assert.equal(create.headers.authorization, `Basic ${btoa('xnd_development_test:')}`);

    const again = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'VA_BCA' }, tokenA());
    assert.equal(again.status, 201);
    assert.equal(again.body.payment.id, res.body.payment.id);
    assert.equal(providerCalls.filter((c) => c.method === 'POST').length, 1);
  });

  test('tagihan pasien lain ditolak (404) tanpa memanggil provider', async () => {
    installProviderMock();
    const { base } = await startApp(XENDIT_ENV);
    const res = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-b', channel: 'QRIS' }, tokenA());
    assert.equal(res.status, 404);
    assert.equal(providerCalls.length, 0);
    const lunas = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-lunas', channel: 'QRIS' }, tokenA());
    assert.equal(lunas.status, 409);
    const unsupported = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'VA_BANK_JATENG' }, tokenA());
    assert.equal(unsupported.status, 422);
  });

  test('status pembayaran pasien lain tidak bisa dibaca', async () => {
    installProviderMock();
    const { base } = await startApp(XENDIT_ENV);
    const created = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'QRIS' }, tokenA());
    assert.equal(created.body.payment.instructions.qr_string, '00020101021226QRISDATA');
    const other = await call(base, 'GET', `/api/patient/payments/${created.body.payment.id}`, undefined, {
      Authorization: `Bearer ${issuePatientSession('RM-0002', 'otp')}`
    });
    assert.equal(other.status, 404);
  });

  test('webhook dengan token salah/tanpa token -> 401', async () => {
    const { base } = await startApp(XENDIT_ENV);
    const payload = { event: 'payment.capture', data: { payment_request_id: 'pr-x', status: 'SUCCEEDED' } };
    assert.equal((await call(base, 'POST', '/api/payments/webhook/xendit', payload)).status, 401);
    assert.equal((await call(base, 'POST', '/api/payments/webhook/xendit', payload, { 'x-callback-token': 'salah' })).status, 401);
  });

  test('webhook payment.capture menandai tagihan lunas secara idempoten', async () => {
    installProviderMock();
    const { base, persistence, audits } = await startApp(XENDIT_ENV);
    const created = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'EWALLET_GOPAY' }, tokenA());
    assert.equal(created.status, 201);
    assert.equal(created.body.payment.instructions.kind, 'redirect');
    assert.equal(created.body.payment.instructions.deeplink, 'gojek://pay/abc');
    const paymentId = created.body.payment.id;
    const payload = {
      event: 'payment.capture',
      data: { payment_id: 'py-1', reference_id: paymentId, payment_request_id: `pr-${paymentId}`, status: 'SUCCEEDED', request_amount: 150000, currency: 'IDR' }
    };
    const headers = { 'x-callback-token': XENDIT_ENV.XENDIT_CALLBACK_TOKEN };
    for (let i = 0; i < 2; i += 1) {
      const res = await call(base, 'POST', '/api/payments/webhook/xendit', payload, headers);
      assert.equal(res.status, 200);
    }
    const bill = await persistence.get<any>('billings', 'bill-a');
    assert.equal(bill.status, 'Lunas');
    assert.equal(bill.sisaTagihan, 0);
    assert.equal(bill.jumlahDibayar, 150000, 'pembayaran tidak boleh tercatat dua kali');
    const payment = await persistence.get<any>('payments', paymentId);
    assert.equal(payment.status, 'PAID');
    assert.ok(payment.paid_at);
    assert.deepEqual(payment.raw_webhook, payload);
    assert.equal(audits.filter((a) => a.action === 'PAYMENT_PAID').length, 1);

    const status = await call(base, 'GET', `/api/patient/payments/${paymentId}`, undefined, tokenA());
    assert.equal(status.body.payment.status, 'PAID');
    assert.equal(status.body.payment.instructions, undefined);
  });

  test('webhook dengan nominal berbeda tidak menandai tagihan lunas', async () => {
    installProviderMock();
    const { base, persistence } = await startApp(XENDIT_ENV);
    const created = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'QRIS' }, tokenA());
    const paymentId = created.body.payment.id;
    const res = await call(base, 'POST', '/api/payments/webhook/xendit', {
      event: 'payment.capture',
      data: { reference_id: paymentId, payment_request_id: `pr-${paymentId}`, status: 'SUCCEEDED', request_amount: 1000, currency: 'IDR' }
    }, { 'x-callback-token': XENDIT_ENV.XENDIT_CALLBACK_TOKEN });
    assert.equal(res.status, 200);
    assert.equal((await persistence.get<any>('billings', 'bill-a')).status, 'Belum Lunas');
    assert.equal((await persistence.get<any>('payments', paymentId)).status, 'PENDING');
  });
});

describe('pembayaran online: PayPal', () => {
  test('konversi IDR ke mata uang settlement dan webhook tanpa tanda tangan valid -> 401', async () => {
    installProviderMock();
    const { base, persistence } = await startApp(PAYPAL_ENV);
    const created = await call(base, 'POST', '/api/patient/payments', { bill_id: 'bill-a', channel: 'PAYPAL' }, tokenA());
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.payment.amount, 150000);
    assert.equal(created.body.payment.charge_currency, 'USD');
    assert.equal(created.body.payment.charge_amount, 9.38);
    assert.equal(created.body.payment.instructions.kind, 'redirect');
    const order = providerCalls.find((c) => c.url.endsWith('/v2/checkout/orders'))!;
    assert.deepEqual(order.body.purchase_units[0].amount, { currency_code: 'USD', value: '9.38' });

    const paymentId = created.body.payment.id;
    const event = {
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAP-1', custom_id: paymentId, status: 'COMPLETED', amount: { currency_code: 'USD', value: '9.38' }, supplementary_data: { related_ids: { order_id: 'ORDER-1' } } }
    };
    const sigHeaders = (sig: string) => ({
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
      'paypal-transmission-id': 't-1', 'paypal-transmission-sig': sig, 'paypal-transmission-time': new Date().toISOString()
    });
    assert.equal((await call(base, 'POST', '/api/payments/webhook/paypal', event)).status, 401);
    assert.equal((await call(base, 'POST', '/api/payments/webhook/paypal', event, sigHeaders('bad-sig'))).status, 401);
    assert.equal((await persistence.get<any>('billings', 'bill-a')).status, 'Belum Lunas');
    assert.equal((await call(base, 'POST', '/api/payments/webhook/paypal', event, sigHeaders('good-sig'))).status, 200);
    assert.equal((await persistence.get<any>('billings', 'bill-a')).status, 'Lunas');
  });
});

describe('pembayaran online: terpasang di createApps', () => {
  test('rute pembayaran tersedia di web publik', async () => {
    delete process.env.XENDIT_SECRET_KEY;
    delete process.env.PAYPAL_CLIENT_ID;
    const { createApps, addErrorHandler } = await import('../server');
    const { publicApp } = await createApps({
      resolvePrincipal: async () => null,
      createSessionCookie: async () => 'x',
      revokeRefreshTokens: async () => {}
    });
    addErrorHandler(publicApp);
    const server = http.createServer(publicApp);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    assert.equal((await call(base, 'GET', '/api/patient/payments/channels')).status, 401);
    const res = await call(base, 'GET', '/api/patient/payments/channels', undefined, tokenA());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.channels, []);
    assert.equal((await call(base, 'POST', '/api/patient/payments', { bill_id: 'x', channel: 'QRIS' }, tokenA())).status, 503);
    assert.equal((await call(base, 'POST', '/api/payments/webhook/xendit', {})).status, 401);
  });
});
