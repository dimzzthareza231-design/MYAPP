// Master layanan (poliklinik & dokter) tersimpan, katalog publik yang dibangun darinya,
// dispatch notifikasi pasien di belakang autentikasi staf, dan status 404 untuk path tak dikenal.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestPatient, createTestPatientSession } from './helpers/patientFixtures';
import { isKnownPublicSpaPath } from '../src/server/spaRoutes';

process.env.VERCEL = '1';
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.HOSPITAL_NAME = 'Klinik Uji Sejahtera';
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
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  const { createApps, addErrorHandler } = await import('../server');
  const { app, publicApp } = await createApps({
    resolvePrincipal: async (token) => {
      if (token === 'admin-token') return { uid: 'a', email: 'admin@test.local', roleId: 'admin', mfaVerified: true };
      if (token === 'reg-token') return { uid: 'r', email: 'reg@test.local', roleId: 'pendaftaran', mfaVerified: true };
      if (token === 'cashier-token') return { uid: 'k', email: 'kasir@test.local', roleId: 'kasir', mfaVerified: true };
      if (token === 'super-token') return { uid: 's', email: 'super@test.local', roleId: 'super_admin', mfaVerified: true };
      return null;
    },
    createSessionCookie: async () => 'x',
    revokeRefreshTokens: async () => {}
  });
  addErrorHandler(app);
  addErrorHandler(publicApp);
  core = await listen(app);
  pub = await listen(publicApp);
});

after(() => servers.forEach((s) => s.close()));

describe('master poliklinik & dokter', () => {
  test('katalog publik kosong tanpa data tersimpan dan memakai HOSPITAL_NAME', async () => {
    const r = await call(pub, 'GET', '/api/public/hospital-catalog');
    assert.equal(r.status, 200);
    assert.equal(r.body.hospitalName, 'Klinik Uji Sejahtera');
    assert.deepEqual(r.body.doctors, []);
    assert.deepEqual(r.body.poliklinik, []);
    assert.doesNotMatch(JSON.stringify(r.body), /MYITARU SIMK/);
  });

  test('API master wajib sesi staf, tidak ada di web publik, dan tulis hanya admin', async () => {
    assert.equal((await call(core, 'GET', '/api/v1/master/doctors')).status, 401);
    assert.equal((await call(pub, 'GET', '/api/v1/master/doctors')).status, 404);
    assert.equal((await call(core, 'GET', '/api/v1/master/doctors', undefined, 'cashier-token')).status, 403);
    assert.equal((await call(core, 'GET', '/api/v1/master/doctors', undefined, 'reg-token')).status, 200);
    const denied = await call(core, 'POST', '/api/v1/master/poliklinik', { kode: 'UMM', nama: 'Poli Umum' }, 'reg-token');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'READ_ONLY');
  });

  test('admin mengelola poliklinik & dokter; katalog dan booking memakai data tersimpan', async () => {
    const bad = await call(core, 'POST', '/api/v1/master/poliklinik', { kode: 'x', nama: '' }, 'admin-token');
    assert.equal(bad.status, 422);

    const poli = await call(core, 'POST', '/api/v1/master/poliklinik', { kode: 'umm', nama: 'Poli Umum' }, 'admin-token');
    assert.equal(poli.status, 201);
    assert.equal(poli.body.data.kode, 'UMM');
    assert.equal((await call(core, 'POST', '/api/v1/master/poliklinik', { kode: 'UMM', nama: 'Duplikat' }, 'admin-token')).status, 409);

    assert.equal((await call(core, 'POST', '/api/v1/master/doctors', {
      nama: 'dr. Tanpa Poli', spesialis: 'Umum', poli_id: 'pol-tidak-ada', hari: 'Senin', jam: '08:00 - 12:00'
    }, 'admin-token')).status, 422);

    const doctor = await call(core, 'POST', '/api/v1/master/doctors', {
      nama: 'dr. Dokter Tersimpan', spesialis: 'Dokter Umum', poli_id: poli.body.data.id,
      hari: 'Senin - Jumat', jam: '08:00 - 12:00', kuota: 1, nip: 'NIP-INTERNAL', sip: 'SIP-INTERNAL'
    }, 'admin-token');
    assert.equal(doctor.status, 201);

    const catalog = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
    assert.equal(catalog.poliklinik.length, 1);
    assert.equal(catalog.doctors.length, 1);
    assert.equal(catalog.doctors[0].poli, 'Poli Umum');
    assert.equal(catalog.doctors[0].kuota_tersisa, 1);
    assert.doesNotMatch(JSON.stringify(catalog), /NIP-INTERNAL|SIP-INTERNAL/);

    const booking = {
      nama: 'Pasien Master Uji', tanggal_lahir: '1990-01-01', no_hp: '081200000055',
      poli_id: poli.body.data.id, dokter_id: doctor.body.data.id,
      tanggal: new Date().toISOString().slice(0, 10)
    };
    const first = await call(pub, 'POST', '/api/patient/appointments', booking);
    assert.equal(first.status, 201);
    assert.equal(first.body.booking.nomor_antrian, 'UMM-001');
    const full = await call(pub, 'POST', '/api/patient/appointments', { ...booking, no_hp: '081200000056' });
    assert.equal(full.status, 409);

    // Dokter dinonaktifkan: hilang dari katalog dan booking ditolak.
    assert.equal((await call(core, 'PATCH', `/api/v1/master/doctors/${doctor.body.data.id}`, { aktif: false, kuota: 5 }, 'admin-token')).status, 200);
    assert.equal((await call(pub, 'GET', '/api/public/hospital-catalog')).body.doctors.length, 0);
    assert.equal((await call(pub, 'POST', '/api/patient/appointments', { ...booking, no_hp: '081200000057' })).status, 400);

    // Poliklinik yang masih dipakai dokter tidak dapat dihapus.
    assert.equal((await call(core, 'DELETE', `/api/v1/master/poliklinik/${poli.body.data.id}`, undefined, 'admin-token')).status, 409);
    assert.equal((await call(core, 'DELETE', `/api/v1/master/doctors/${doctor.body.data.id}`, undefined, 'admin-token')).status, 200);
    assert.equal((await call(core, 'DELETE', `/api/v1/master/poliklinik/${poli.body.data.id}`, undefined, 'admin-token')).status, 200);

    const logs = await call(core, 'GET', '/api/v1/audit/logs', undefined, 'super-token');
    assert.match(JSON.stringify(logs.body), /MASTER_DOCTOR_CREATE/);
  });
});

describe('dispatch notifikasi pasien', () => {
  test('tidak tersedia di web publik dan wajib sesi staf di aplikasi inti', async () => {
    const patient = await createTestPatient(core, 'super-token');
    const body = { no_rm: patient.no_rm, type: 'lab_ready', lab_order_id: 'LAB-1', pemeriksaan: 'Darah Lengkap' };
    assert.equal((await call(pub, 'POST', '/api/v1/patient-notifications/dispatch', body)).status, 404);
    assert.equal((await call(core, 'POST', '/api/v1/patient-notifications/dispatch', body)).status, 401);
    assert.equal((await call(core, 'POST', '/api/v1/patient-notifications/dispatch', body, 'cashier-token')).status, 403);

    const ok = await call(core, 'POST', '/api/v1/patient-notifications/dispatch', body, 'super-token');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);

    const notifications = await call(pub, 'GET', '/api/patient/notifications', undefined, createTestPatientSession(patient.no_rm));
    assert.equal(notifications.status, 200);
    assert.equal(notifications.body.notifications[0].lab_order_id, 'LAB-1');
  });
});

describe('path tidak dikenal', () => {
  test('API tak dikenal menghasilkan 404 JSON', async () => {
    const r = await call(pub, 'GET', '/api/tidak-ada');
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 'NOT_FOUND');
  });

  test('rute SPA publik yang dikenal 200, lainnya 404', () => {
    for (const path of ['/', '/portal', '/mobile', '/mobile/beranda', '/dokter', '/dokter/dr-a', '/kebijakan-privasi', '/faq/']) {
      assert.equal(isKnownPublicSpaPath(path), true, path);
    }
    for (const path of ['/tidak-ada', '/admin', '/mobile-x', '/wp-login.php']) {
      assert.equal(isKnownPublicSpaPath(path), false, path);
    }
  });
});
