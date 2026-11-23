// Pengujian rute portal pasien (web publik) pada data non-demo: privasi pencarian antrean,
// otorisasi dispatch notifikasi, dan penomoran antrean per tanggal.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  registerPatientPortalRoutes,
  type ServerAppointmentRecord,
  type ServerPatientRecord
} from '../src/server/patientPortalService';
import { MASTER_POLIKLINIK, SEMUA_DOKTER } from '../src/data/seedData';

process.env.SESSION_SECRET ||= 'test-secret-patient-portal-0123456789abcdef';
process.env.NODE_ENV = 'test';

const doctor = SEMUA_DOKTER.find((d) =>
  MASTER_POLIKLINIK.some((p) => p.id === d.poli_id) && (d.pasien_terlayani || 0) + 5 < (d.kuota || 30)
)!;
const poli = MASTER_POLIKLINIK.find((p) => p.id === doctor.poli_id)!;

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const patient: ServerPatientRecord = {
  id: 'p-test-1',
  no_rm: 'RM-990001-0001',
  nik: '3171000000000001',
  nama: 'Budi Santoso',
  tanggal_lahir: '1990-05-17',
  jenis_kelamin: 'L',
  alamat: 'Jakarta',
  no_hp: '081234567890',
  golongan_darah: 'O',
  penjamin: 'Umum',
  status: 'Rawat Jalan',
  created_at: new Date().toISOString()
};

const existingDate = isoDate(3);
const appointment: ServerAppointmentRecord = {
  id: 'apt-test-1',
  pasien_id: patient.id,
  pasien_nama: patient.nama,
  no_rm: patient.no_rm,
  poli: poli.nama,
  dokter: doctor.nama,
  tanggal: existingDate,
  jam_praktek: '08:00 - 13:00 WIB',
  nomor_antrian: `${poli.kode}-007`,
  status: 'Menunggu',
  tipe: 'Rawat Jalan',
  created_at: new Date().toISOString()
};

let base = '';
let server: http.Server;
const appointmentsStore: ServerAppointmentRecord[] = [appointment];
const savedEnv = {
  demo: process.env.ALLOW_INSECURE_DEMO_AUTH,
  dispatch: process.env.PATIENT_NOTIFY_DISPATCH_TOKEN
};

before(async () => {
  process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
  process.env.PATIENT_NOTIFY_DISPATCH_TOKEN = 'dispatch-secret-for-tests';
  const app = express();
  app.use(express.json());
  registerPatientPortalRoutes(app, {
    patientsStore: [patient],
    appointmentsStore,
    bedsStore: [],
    qrTokensStore: [],
    useDemoData: false
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const [name, value] of [['ALLOW_INSECURE_DEMO_AUTH', savedEnv.demo], ['PATIENT_NOTIFY_DISPATCH_TOKEN', savedEnv.dispatch]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

describe('portal pasien: pencarian status antrean publik', () => {
  test('tidak mengirim contoh tiket berisi No. RM pada data non-demo', async () => {
    const r = await request('GET', '/api/public/queue-status');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sampleTickets, []);
  });

  test('potongan kueri tidak dapat dipakai untuk mengenumerasi No. RM', async () => {
    for (const q of ['RM', '0001', poli.kode]) {
      const r = await request('GET', `/api/public/queue-status?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.matches.length, 0, `kueri "${q}" tidak boleh mengembalikan pasien`);
    }
  });

  test('nomor antrean persis ditemukan tanpa membuka No. RM', async () => {
    const r = await request('GET', `/api/public/queue-status?q=${encodeURIComponent(appointment.nomor_antrian)}`);
    assert.equal(r.body.matches.length, 1);
    assert.equal(r.body.matches[0].no_rm, '');
    assert.notEqual(r.body.matches[0].pasien_nama_masked, patient.nama);
  });

  test('No. RM persis (sudah diketahui penanya) tetap ditemukan', async () => {
    const r = await request('GET', `/api/public/queue-status?q=${encodeURIComponent(patient.no_rm.toLowerCase())}`);
    assert.equal(r.body.matches.length, 1);
    assert.equal(r.body.matches[0].no_rm, patient.no_rm);
  });
});

describe('portal pasien: dispatch notifikasi klinis', () => {
  const payload = { no_rm: patient.no_rm, type: 'lab_ready', hasil: 'Hasil palsu', pemeriksaan: 'Palsu' };

  test('ditolak tanpa token dispatch (endpoint publik tanpa autentikasi staf)', async () => {
    const r = await request('POST', '/api/v1/patient-notifications/dispatch', payload);
    assert.equal(r.status, 403);
    const wrong = await request('POST', '/api/v1/patient-notifications/dispatch', payload, { 'X-Dispatch-Token': 'salah' });
    assert.equal(wrong.status, 403);
  });

  test('diterima dengan token dispatch yang dikonfigurasi', async () => {
    const r = await request('POST', '/api/v1/patient-notifications/dispatch',
      { no_rm: patient.no_rm, type: 'queue_call' },
      { 'X-Dispatch-Token': 'dispatch-secret-for-tests' });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(appointmentsStore.find((a) => a.id === appointment.id)?.status, 'Panggil');
    appointment.status = 'Menunggu';
  });
});

describe('portal pasien: sesi dan simulasi notifikasi', () => {
  test('verifikasi RM + tanggal lahir menerbitkan sesi yang bisa dicabut', async () => {
    const bad = await request('POST', '/api/patient/verify', { no_rm: patient.no_rm, tanggal_lahir: '1990-01-01' });
    assert.equal(bad.status, 401);

    const ok = await request('POST', '/api/patient/verify', { no_rm: patient.no_rm.toLowerCase(), tanggal_lahir: patient.tanggal_lahir });
    assert.equal(ok.status, 200);
    const auth = { Authorization: `Bearer ${ok.body.token}` };

    const dossier = await request('GET', '/api/patient/dossier', undefined, auth);
    assert.equal(dossier.status, 200);
    assert.equal(dossier.body.dossier.patient.no_rm, patient.no_rm);

    const simulation = await request('POST', '/api/patient/notifications/test', { type: 'queue_call' }, auth);
    assert.equal(simulation.status, 403, 'simulasi tidak boleh mengubah antrean nyata di luar mode demo');
    assert.equal(appointmentsStore.find((a) => a.id === appointment.id)?.status, 'Menunggu');

    const logout = await fetch(`${base}/api/patient/session`, { method: 'DELETE', headers: auth });
    assert.equal(logout.status, 204);
    assert.equal((await request('GET', '/api/patient/dossier', undefined, auth)).status, 401);
  });
});

describe('portal pasien: penomoran antrean booking online', () => {
  const bookingFor = (tanggal: string) => ({
    nama: 'Pasien Baru Uji',
    tanggal_lahir: '1995-02-03',
    no_hp: '081298765432',
    poli_id: poli.id,
    dokter_id: doctor.id,
    tanggal
  });

  test('nomor antrean dihitung per tanggal kunjungan, bukan dari seluruh riwayat', async () => {
    const otherDay = await request('POST', '/api/patient/appointments', bookingFor(isoDate(5)));
    assert.equal(otherDay.status, 201, JSON.stringify(otherDay.body));
    assert.equal(otherDay.body.booking.nomor_antrian, `${poli.kode}-002`);

    const sameDay = await request('POST', '/api/patient/appointments', bookingFor(existingDate));
    assert.equal(sameDay.status, 201);
    assert.equal(sameDay.body.booking.nomor_antrian, `${poli.kode}-008`);
  });

  test('No. RM pasien baru tidak bentrok dengan pasien yang sudah ada', async () => {
    const a = await request('POST', '/api/patient/appointments', bookingFor(isoDate(6)));
    const b = await request('POST', '/api/patient/appointments', bookingFor(isoDate(6)));
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.body.booking.no_rm, b.body.booking.no_rm);
    assert.notEqual(a.body.booking.nomor_antrian, b.body.booking.nomor_antrian);
  });
});
