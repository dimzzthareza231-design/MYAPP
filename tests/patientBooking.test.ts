// Pengujian booking janji temu & kartu QR aplikasi pasien: identitas pasien wajib berasal dari sesi.
// Berkas terpisah dari api.test.ts agar memiliki instance server (dan bucket rate limit) sendiri.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.VERCEL = '1'; // cegah server.ts menjalankan listen() sendiri
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
delete process.env.GEMINI_API_KEY;

type Res = { status: number; body: any };
let core = '';
let pub = '';
const servers: http.Server[] = [];

async function listen(app: http.RequestListener): Promise<string> {
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(base: string, method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let sessionToken = '';
let doctor: any;

function bookingBody(extra: Record<string, unknown> = {}) {
  return {
    poli_id: doctor.poli_id,
    poli_nama: doctor.poli,
    dokter_id: doctor.id,
    dokter_nama: doctor.nama,
    tanggal: new Date().toISOString().slice(0, 10),
    jam_praktek: doctor.jam,
    penjamin: 'Umum',
    keluhan: 'uji',
    ...extra
  };
}

before(async () => {
  const { createApps, addErrorHandler } = await import('../server');
  const { app, publicApp } = await createApps({
    resolvePrincipal: async (token) =>
      token === 'test-token'
        ? { uid: 'admin', email: 'admin@test.local', roleId: 'super_admin', mfaVerified: true }
        : null,
    createSessionCookie: async () => 'test-session-token',
    revokeRefreshTokens: async () => {}
  });
  addErrorHandler(app);
  addErrorHandler(publicApp);
  core = await listen(app);
  pub = await listen(publicApp);

  const verified = await call(pub, 'POST', '/api/patient/verify', {
    no_rm: 'RM-260101-0001',
    tanggal_lahir: '1985-04-23'
  });
  assert.equal(verified.status, 200);
  sessionToken = verified.body.token;
  const catalog = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
  doctor = (catalog.doctors ?? catalog.data.doctors)[0];
});

after(() => servers.forEach((s) => s.close()));

describe('booking janji temu aplikasi pasien', () => {
  test('booking pasien terdaftar tanpa token sesi ditolak 401', async () => {
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      no_rm: 'RM-260101-0001',
      tanggal_lahir: '1985-04-23',
      no_hp: '081200000000'
    }));
    assert.equal(r.status, 401);
    assert.equal(r.body?.code, 'PATIENT_SESSION_REQUIRED');
  });

  test('token sesi tidak valid ditolak 401', async () => {
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody(), 'pat_invalid-token');
    assert.equal(r.status, 401);
  });

  test('token sesi untuk No. RM pasien lain ditolak 403', async () => {
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      no_rm: 'RM-260102-0002',
      nama: 'Pasien Lain'
    }), sessionToken);
    assert.equal(r.status, 403);
    assert.equal(r.body?.code, 'PATIENT_IDENTITY_MISMATCH');
  });

  test('booking dengan token memakai identitas dari sesi, bukan dari body', async () => {
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      nama: 'Nama Palsu',
      tanggal_lahir: '2000-01-01'
    }), sessionToken);
    assert.equal(r.status, 201);
    assert.equal(r.body.booking.no_rm, 'RM-260101-0001');
    assert.equal(r.body.booking.nama, 'Ny. Siti Rahmawati');
    assert.match(r.body.booking.qr_value, /^MYITARU1\./);

    const dossier = await call(pub, 'GET', '/api/patient/dossier', undefined, sessionToken);
    assert.equal(dossier.status, 200);
    assert.ok(dossier.body.dossier.activeQueues.some(
      (q: any) => q.nomor_antrian === r.body.booking.nomor_antrian
    ));
  });
});

describe('kartu QR pasien', () => {
  test('QR kartu pasien wajib sesi', async () => {
    assert.equal((await call(pub, 'POST', '/api/patient/qr-card')).status, 401);
  });

  test('QR kartu pasien opaque, berumur pendek, dan dapat dibaca petugas', async () => {
    const r = await call(pub, 'POST', '/api/patient/qr-card', undefined, sessionToken);
    assert.equal(r.status, 200);
    const qr: string = r.body.qr_value;
    assert.match(qr, /^MYITARU1\./);
    assert.equal(qr.includes('RM-260101-0001'), false);
    assert.equal(qr.includes('Siti'), false);
    const ttl = Date.parse(r.body.expires_at) - Date.now();
    assert.ok(ttl > 0 && ttl <= 10 * 60 * 1000);

    const resolved = await call(core, 'POST', '/api/v1/patient-qr/resolve', { token: qr }, 'test-token');
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.patient.no_rm, 'RM-260101-0001');
  });
});
