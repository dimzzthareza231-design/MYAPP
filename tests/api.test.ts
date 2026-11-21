// Pengujian black-box API untuk web publik dan aplikasi inti.
// Menjalankan kedua aplikasi Express di dalam proses (tanpa kunci Gemini, sehingga fitur AI memakai mesin aturan).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.VERCEL = '1'; // cegah server.ts menjalankan listen() sendiri
process.env.SESSION_SECRET = 'test-secret';
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  // Diimpor di sini (bukan di atas) agar variabel lingkungan di atas sudah terpasang saat server.ts dimuat.
  const { createApps, addErrorHandler } = await import('../server');
  const { app, publicApp } = await createApps();
  addErrorHandler(app);
  addErrorHandler(publicApp);
  core = await listen(app);
  pub = await listen(publicApp);
});

after(() => servers.forEach((s) => s.close()));

describe('isolasi web publik dan aplikasi inti', () => {
  test('API data pasien inti tidak tersedia di web publik', async () => {
    assert.equal((await call(pub, 'GET', '/api/v1/patients')).status, 404);
  });
  test('API AI tidak tersedia di web publik', async () => {
    assert.equal((await call(pub, 'POST', '/api/ai/analyze', { clinicalNote: 'x' })).status, 404);
  });
  test('API publik tidak tersedia di aplikasi inti', async () => {
    assert.equal((await call(core, 'GET', '/api/public/hospital-catalog')).status, 404);
  });
  test('health check aplikasi inti', async () => {
    const r = await call(core, 'GET', '/api/v1/health');
    assert.equal(r.body?.status, 'HEALTHY');
  });
});

describe('web publik pasien', () => {
  let token = '';

  test('katalog dokter tersedia', async () => {
    const r = await call(pub, 'GET', '/api/public/hospital-catalog');
    assert.equal(r.status, 200);
    assert.ok((r.body?.doctors ?? r.body?.data?.doctors ?? []).length > 0);
  });

  test('pendaftaran daring menerbitkan nomor antrean dan token', async () => {
    const cat = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
    const d = (cat.doctors ?? cat.data.doctors)[0];
    const r = await call(pub, 'POST', '/api/patient/appointments', {
      nama: 'Pasien Uji', tanggal_lahir: '1990-05-15', no_hp: '081200000000',
      poli_id: d.poli_id, poli_nama: d.poli, dokter_id: d.id, dokter_nama: d.nama,
      tanggal: '2026-12-01', jam_praktek: d.jam, penjamin: 'Umum', keluhan: 'uji',
    });
    assert.equal(r.status, 201);
    assert.ok(r.body?.booking?.nomor_antrian);
    token = r.body.token;
  });

  test('pendaftaran tanpa dokter ditolak', async () => {
    assert.equal((await call(pub, 'POST', '/api/patient/appointments', { nama: 'X', tanggal_lahir: '1990-01-01' })).status, 400);
  });

  test('token sah membuka dosir, token palsu ditolak', async () => {
    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, token)).status, 200);
    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, token.slice(0, -2) + 'xx')).status, 401);
  });
});

describe('fitur AI (mesin aturan)', () => {
  test('catatan hipertensi menyarankan ICD-10 I10', async () => {
    const r = await call(core, 'POST', '/api/ai/analyze', { clinicalNote: 'Nyeri dada, tekanan darah 160/100 mmHg, riwayat hipertensi.' });
    assert.equal(r.status, 200);
    assert.match(JSON.stringify(r.body), /I10/);
  });

  test('interaksi warfarin dan asetosal terdeteksi', async () => {
    const r = await call(core, 'POST', '/api/ai/drug-interaction', { medications: ['Warfarin 2 mg', 'Asetosal 80 mg'] });
    assert.match(JSON.stringify(r.body), /WARFARIN/);
  });

  test('nama obat ejaan Indonesia dikenali (Amlodipin + Simvastatin)', async () => {
    const r = await call(core, 'POST', '/api/ai/drug-interaction', { medications: ['Amlodipin 5 mg', 'Simvastatin 40 mg'] });
    assert.match(JSON.stringify(r.body), /SIMVASTATIN/);
  });

  test('audit klaim BPJS kosong dinyatakan invalid', async () => {
    const r = await call(core, 'POST', '/api/ai/bpjs-audit', { diagnosis: '', items: [], sepNo: '' });
    assert.equal(r.body?.status, 'invalid');
  });

  test('audit klaim BPJS lengkap dinyatakan valid', async () => {
    const r = await call(core, 'POST', '/api/ai/bpjs-audit', {
      diagnosis: 'I10', items: [{ nama: 'Konsultasi', harga: 250000 }], totalBill: 250000, sepNo: '0301R0011126V000001',
    });
    assert.equal(r.body?.status, 'valid');
  });

  test('audit dokumen tanpa tanda tangan mencatat kekurangan', async () => {
    const r = await call(core, 'POST', '/api/ai/document-completeness', { documentType: 'Resume Medis', fields: { no_rm: 'RM-1' } });
    assert.match(JSON.stringify(r.body), /Tanda tangan/);
  });
});

describe('portal karyawan', () => {
  test('login peran sensitif meminta MFA dan token berfungsi', async () => {
    const login = await call(core, 'POST', '/api/gateway/auth/login', { divisionId: 'sdm-umum', deviceInfo: 'uji' });
    assert.equal(login.body?.mfaRequired, true);
    assert.equal((await call(core, 'POST', '/api/gateway/auth/verify-mfa', { challengeId: login.body.challengeId, otp: '000000' })).status, 401);
    const ok = await call(core, 'POST', '/api/gateway/auth/verify-mfa', { challengeId: login.body.challengeId, otp: '123456' });
    assert.equal(ok.status, 200);
    assert.equal((await call(core, 'GET', '/api/gateway/profile', undefined, ok.body.token)).status, 200);
    assert.equal((await call(core, 'GET', '/api/gateway/profile')).status, 401);
  });
});
