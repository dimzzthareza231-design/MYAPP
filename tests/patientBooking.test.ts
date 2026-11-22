// Pengujian booking janji temu & kartu QR aplikasi pasien: identitas pasien wajib berasal dari sesi.
// Berkas terpisah dari api.test.ts agar memiliki instance server (dan bucket rate limit) sendiri.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestDoctor, createTestPatient, createTestPatientSession, type TestPatient } from './helpers/patientFixtures';

process.env.VERCEL = '1'; // cegah server.ts menjalankan listen() sendiri
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
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

async function call(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  cookie?: string
): Promise<Res> {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let sessionToken = '';
let doctor: any;
let patient: TestPatient;
let otherPatient: TestPatient;

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

  patient = await createTestPatient(core, 'test-token', { nama: 'Ny. Pasien Sesi Uji' });
  otherPatient = await createTestPatient(core, 'test-token', { nama: 'Tn. Pasien Lain Uji' });
  sessionToken = createTestPatientSession(patient.no_rm);
  await createTestDoctor(core, 'test-token');
  const catalog = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
  doctor = (catalog.doctors ?? catalog.data.doctors)[0];
});

after(() => servers.forEach((s) => s.close()));

describe('booking janji temu aplikasi pasien', () => {
  test('booking pasien terdaftar tanpa token sesi ditolak 401', async () => {
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      no_rm: patient.no_rm,
      tanggal_lahir: patient.tanggal_lahir,
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
      no_rm: otherPatient.no_rm,
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
    assert.equal(r.body.booking.no_rm, patient.no_rm);
    assert.equal(r.body.booking.nama, patient.nama);
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
    assert.equal(qr.includes(patient.no_rm), false);
    assert.equal(qr.includes('Pasien'), false);
    const ttl = Date.parse(r.body.expires_at) - Date.now();
    assert.ok(ttl > 0 && ttl <= 10 * 60 * 1000);

    const resolved = await call(core, 'POST', '/api/v1/patient-qr/resolve', { token: qr }, 'test-token');
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.patient.no_rm, patient.no_rm);
  });
});

describe('login pasien', () => {
  test('login No. RM + tanggal lahir dan Google ditolak 503 sampai penyedia OTP tersedia', async () => {
    for (const path of ['/api/patient/verify', '/api/patient/google-session']) {
      const r = await call(pub, 'POST', path, { no_rm: patient.no_rm, tanggal_lahir: patient.tanggal_lahir, email: 'x@test.local' });
      assert.equal(r.status, 503);
      assert.equal(r.body?.code, 'PATIENT_LOGIN_UNAVAILABLE');
      assert.equal(r.body?.message, 'Login pasien belum tersedia');
      assert.equal(r.body?.token, undefined);
    }
  });

  test('endpoint simulasi notifikasi pasien sudah dihapus', async () => {
    const r = await call(pub, 'POST', '/api/patient/notifications/test', { type: 'lab_ready' }, sessionToken);
    assert.equal(r.status, 404);
  });
});

describe('dossier pasien hanya dari data tersimpan', () => {
  test('pasien tanpa data klinis menerima array kosong / null, bukan data karangan', async () => {
    const fresh = await createTestPatient(core, 'test-token', { nama: 'Pasien Dossier Kosong' });
    const r = await call(pub, 'GET', '/api/patient/dossier', undefined, createTestPatientSession(fresh.no_rm));
    assert.equal(r.status, 200);
    const d = r.body.dossier;
    assert.equal(d.patient.no_rm, fresh.no_rm);
    assert.deepEqual(d.activeQueues, []);
    assert.deepEqual(d.medications, []);
    assert.deepEqual(d.labRadResults, []);
    assert.deepEqual(d.allergies, []);
    assert.deepEqual(d.problemList, []);
    assert.equal(d.vitalsLatest, null);
    assert.equal(d.clinicalResume, null);
    assert.equal(d.inpatientStay, null);
    assert.deepEqual(d.billing.items, []);
    assert.equal(d.billing.totalBiaya, 0);
    assert.equal(d.billing.status, 'Belum Ada Tagihan');
  });

  test('sesi untuk No. RM yang tidak tersimpan tidak menghasilkan dossier', async () => {
    const r = await call(pub, 'GET', '/api/patient/dossier', undefined, createTestPatientSession('RM-TIDAK-ADA'));
    assert.equal(r.status, 404);
  });
});

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('booking pasien baru dari web publik', () => {
  test('cookie sesi pasien lain tidak dipakai bila tidak ada Bearer maupun No. RM', async () => {
    const cookie = `myitaru_patient_session=${sessionToken}`;
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      nama: 'Pasien Baru Berbagi Perangkat',
      tanggal_lahir: '1995-02-02',
      no_hp: '081200000077'
    }), undefined, cookie);
    assert.equal(r.status, 201);
    assert.notEqual(r.body.booking.no_rm, patient.no_rm);
    assert.equal(r.body.booking.nama, 'Pasien Baru Berbagi Perangkat');

    // Janji temu baru tidak muncul di riwayat pemilik cookie.
    const visits = await call(pub, 'GET', '/api/patient/visits', undefined, sessionToken);
    assert.equal(visits.body.visits.some((v: any) => v.id === r.body.booking.id), false);
  });

  test('cookie sesi tetap dipakai bila No. RM disertakan secara eksplisit', async () => {
    const cookie = `myitaru_patient_session=${sessionToken}`;
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      no_rm: patient.no_rm,
      tanggal: daysFromNow(1)
    }), undefined, cookie);
    assert.equal(r.status, 201);
    assert.equal(r.body.booking.no_rm, patient.no_rm);
  });

  test('kode booking acak dan unik, nomor antrean tetap untuk tampilan', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 2; i += 1) {
      const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
        nama: `Pasien Kode ${i}`, tanggal_lahir: '1990-01-01', no_hp: '08120000010' + i
      }));
      assert.equal(r.status, 201);
      assert.match(r.body.booking.kode_booking, /^[A-HJKMNP-TV-Z2-9]{10}$/);
      assert.match(r.body.booking.nomor_antrian, /^[A-Z0-9]+-\d{3}$/);
      codes.add(r.body.booking.kode_booking);
    }
    assert.equal(codes.size, 2);
  });

  test('dokter yang tidak ada di master tersimpan ditolak', async () => {
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({
      dokter_id: 'D-001', nama: 'X Y', tanggal_lahir: '1990-01-01', no_hp: '081200000000'
    }));
    assert.equal(r.status, 400);
  });
});

describe('riwayat, pembatalan, dan penjadwalan ulang janji temu', () => {
  let ownerToken = '';
  let otherToken = '';
  let appointmentId = '';

  before(async () => {
    const owner = await createTestPatient(core, 'test-token', { nama: 'Pasien Riwayat Uji' });
    const other = await createTestPatient(core, 'test-token', { nama: 'Pasien Bukan Pemilik' });
    ownerToken = createTestPatientSession(owner.no_rm);
    otherToken = createTestPatientSession(other.no_rm);
    const r = await call(pub, 'POST', '/api/patient/appointments', bookingBody({ tanggal: daysFromNow(2) }), ownerToken);
    assert.equal(r.status, 201);
    appointmentId = r.body.booking.id;
  });

  test('riwayat kunjungan wajib sesi dan hanya berisi milik sendiri', async () => {
    assert.equal((await call(pub, 'GET', '/api/patient/visits')).status, 401);
    const own = await call(pub, 'GET', '/api/patient/visits', undefined, ownerToken);
    assert.equal(own.status, 200);
    assert.equal(own.body.visits.length, 1);
    assert.equal(own.body.visits[0].id, appointmentId);
    assert.equal(own.body.visits[0].can_cancel, true);
    assert.equal('no_rm' in own.body.visits[0], false);
    const other = await call(pub, 'GET', '/api/patient/visits', undefined, otherToken);
    assert.deepEqual(other.body.visits, []);
  });

  test('pasien lain tidak dapat membatalkan atau menjadwalkan ulang (404)', async () => {
    assert.equal((await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/cancel`, {})).status, 401);
    assert.equal((await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/cancel`, {}, otherToken)).status, 404);
    assert.equal((await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/reschedule`, {
      tanggal: daysFromNow(3)
    }, otherToken)).status, 404);
  });

  test('jadwal ulang ke tanggal lampau ditolak, ke tanggal mendatang berhasil dan diaudit', async () => {
    const past = await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/reschedule`, {
      tanggal: daysFromNow(-1)
    }, ownerToken);
    assert.equal(past.status, 400);

    const r = await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/reschedule`, {
      tanggal: daysFromNow(4)
    }, ownerToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.appointment.tanggal, daysFromNow(4));
    assert.match(r.body.qr_value, /^MYITARU1\./);

    const logs = await call(core, 'GET', '/api/v1/audit/logs', undefined, 'test-token');
    assert.match(JSON.stringify(logs.body), /PATIENT_APPOINTMENT_RESCHEDULE/);
  });

  test('pembatalan hanya sekali; status selain Menunggu tidak dapat diubah', async () => {
    const r = await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/cancel`, { alasan: 'berhalangan' }, ownerToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.appointment.status, 'Dibatalkan');
    assert.equal(r.body.appointment.can_reschedule, false);

    const again = await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/cancel`, {}, ownerToken);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'APPOINTMENT_NOT_MODIFIABLE');
    const resched = await call(pub, 'POST', `/api/patient/appointments/${appointmentId}/reschedule`, {
      tanggal: daysFromNow(5)
    }, ownerToken);
    assert.equal(resched.status, 409);

    const logs = await call(core, 'GET', '/api/v1/audit/logs', undefined, 'test-token');
    assert.match(JSON.stringify(logs.body), /PATIENT_APPOINTMENT_CANCEL/);
  });

  test('janji temu yang sudah dipanggil petugas tidak dapat dibatalkan pasien', async () => {
    const booked = await call(pub, 'POST', '/api/patient/appointments', bookingBody(), ownerToken);
    assert.equal(booked.status, 201);
    const patched = await call(core, 'PATCH', `/api/v1/appointments/${booked.body.booking.id}`, { status: 'Panggil' }, 'test-token');
    assert.equal(patched.status, 200);
    const r = await call(pub, 'POST', `/api/patient/appointments/${booked.body.booking.id}/cancel`, {}, ownerToken);
    assert.equal(r.status, 409);
  });
});
