// Pengujian black-box API untuk web publik dan aplikasi inti.
// Menjalankan kedua aplikasi Express di dalam proses (tanpa kunci Gemini, sehingga fitur AI memakai mesin aturan).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSecurePatientQrToken } from '../src/server/securePatientQr';
import { FakePrimaryRepository } from './helpers/fakePersistence';
import { createTestPatient, createTestPatientSession } from './helpers/patientFixtures';

process.env.VERCEL = '1'; // cegah server.ts menjalankan listen() sendiri
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
delete process.env.GEMINI_API_KEY;

type Res = { status: number; body: any; cookie: string };
let core = '';
let pub = '';
let createAppsForTest: typeof import('../server').createApps;
let addErrorHandlerForTest: typeof import('../server').addErrorHandler;
const testAuth = {
  resolvePrincipal: async (token: string) => {
    if (token === 'viewer-token') return { uid: 'viewer', email: 'viewer@test.local', roleId: 'viewer', mfaVerified: true };
    if (token === 'cashier-token') return { uid: 'cashier', email: 'cashier@test.local', roleId: 'kasir', mfaVerified: true };
    if (token === 'no-mfa-token') return { uid: 'admin', email: 'admin@test.local', roleId: 'super_admin', mfaVerified: false };
    if (token === 'test-token' || token === 'test-session-token') {
      return { uid: 'admin', email: 'admin@test.local', roleId: 'super_admin', mfaVerified: true };
    }
    return null;
  },
  createSessionCookie: async () => 'test-session-token',
  revokeRefreshTokens: async () => {}
};
const servers: http.Server[] = [];

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
  token?: string | null,
  cookie?: string,
): Promise<Res> {
  const authToken = token === undefined && base !== pub ? 'test-token' : token;
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(path === '/api/auth/session' ? { Origin: base } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null), cookie: res.headers.get('set-cookie') || '' };
}

before(async () => {
  // Diimpor di sini (bukan di atas) agar variabel lingkungan di atas sudah terpasang saat server.ts dimuat.
  const { createApps, addErrorHandler } = await import('../server');
  createAppsForTest = createApps;
  addErrorHandlerForTest = addErrorHandler;
  const { app, publicApp } = await createApps(testAuth);
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
    assert.equal(r.body?.status, 'DEGRADED');
    assert.equal(r.body?.storage?.mode, 'memory');
    assert.equal(r.body?.storage?.persistentReady, false);
  });

  test('API operasional menolak sesi kosong dan membatasi akses berbasis role dan MFA', async () => {
    assert.equal((await call(core, 'GET', '/api/v1/inventory/stock', undefined, null)).status, 401);
    assert.equal((await call(core, 'GET', '/api/v1/inventory/stock', undefined, 'no-mfa-token')).body?.code, 'MFA_REQUIRED');
    assert.equal((await call(core, 'POST', '/api/v1/inventory/dispense', { items: [] }, 'viewer-token')).status, 403);
  });

  test('pertukaran Firebase ID token menerbitkan cookie HttpOnly yang bisa dicabut', async () => {
    const issued = await call(core, 'POST', '/api/auth/session', { idToken: 'test-token' });
    assert.equal(issued.status, 204);
    assert.match(issued.cookie, /myitaru_core_session=test-session-token/);
    assert.match(issued.cookie, /HttpOnly/);
    assert.match(issued.cookie, /SameSite=Strict/);

    const sessionAccess = await call(core, 'GET', '/api/v1/inventory/stock', undefined, null, 'myitaru_core_session=test-session-token');
    assert.equal(sessionAccess.status, 200);
    const revoked = await call(core, 'DELETE', '/api/auth/session', undefined, null, 'myitaru_core_session=test-session-token');
    assert.equal(revoked.status, 204);
    assert.match(revoked.cookie, /Max-Age=0/);
  });

  test('QR pasien opaque hanya diterbitkan dan dibaca melalui sesi staf MFA', async () => {
    const patient = await createTestPatient(core, 'test-token');
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/issue', {
      no_rm: patient.no_rm
    }, null)).status, 401);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/issue', {
      no_rm: patient.no_rm
    }, 'no-mfa-token')).status, 403);

    const issued = await call(core, 'POST', '/api/v1/patient-qr/issue', {
      no_rm: patient.no_rm
    });
    assert.equal(issued.status, 200);
    assert.match(issued.body.qrValue, /^MYITARU1\./);
    assert.equal(issued.body.qrValue.includes(patient.no_rm), false);

    const resolved = await call(core, 'POST', '/api/v1/patient-qr/resolve', {
      token: issued.body.qrValue
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.patient.no_rm, patient.no_rm);

    const qrAudit = await call(core, 'GET', '/api/v1/audit/logs?module=Rekam%20Medis');
    assert.ok(qrAudit.body.data.some((entry: { action: string }) => entry.action === 'PATIENT_QR_ISSUED'));
    assert.ok(qrAudit.body.data.some((entry: { action: string }) => entry.action === 'PATIENT_QR_ACCESSED'));

    const changedToken = `${issued.body.qrValue.slice(0, -1)}${issued.body.qrValue.endsWith('A') ? 'B' : 'A'}`;
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/resolve', { token: changedToken })).status, 400);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/resolve', { token: patient.no_rm })).status, 400);

    const validButUnissuedToken = createSecurePatientQrToken(patient.id);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/resolve', {
      token: validButUnissuedToken
    })).status, 400);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: validButUnissuedToken
    })).status, 400);
  });

  test('QR dokumen diterbitkan dan diverifikasi server tanpa menaruh metadata pada payload', async () => {
    const metadata = {
      documentType: 'surat_keterangan_sakit',
      documentNumber: 'SK-20261121-001',
      title: 'Surat Keterangan Dokter',
      signer: 'dr. Uji MYITARU',
      issuedAt: '21 November 2026',
      facility: 'MYITARU'
    };
    const issued = await call(core, 'POST', '/api/v1/dossier/document-qr/issue', metadata);
    assert.equal(issued.status, 201);
    assert.match(issued.body.qrValue, /^MYITARU1\./);
    assert.equal(issued.body.qrValue.includes(metadata.documentNumber), false);
    assert.equal(typeof issued.body.verificationCode, 'string');

    const verified = await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: issued.body.qrValue
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.kind, 'document');
    assert.equal(verified.body.document.status, 'valid');
    assert.equal(verified.body.document.documentNumber, metadata.documentNumber);
    assert.equal(verified.body.document.verificationCode, issued.body.verificationCode);

    const unissued = createSecurePatientQrToken('unissued-document', { kind: 'document' });
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: unissued
    })).status, 400);

    const audit = await call(core, 'GET', '/api/v1/audit/logs?module=Rekam%20Medis');
    assert.ok(audit.body.data.some((entry: { action: string }) => entry.action === 'DOCUMENT_QR_ISSUED'));
    assert.ok(audit.body.data.some((entry: { action: string }) => entry.action === 'DOCUMENT_QR_VERIFIED'));
  });

  test('izin QR dokumen mengikuti workflow penerbitan dan verifikasi', async () => {
    const cashierDocument = {
      documentType: 'kuitansi_billing',
      documentNumber: 'KW-001',
      title: 'Kuitansi Pembayaran',
      signer: 'Kasir MYITARU',
      issuedAt: '21 November 2026',
      facility: 'MYITARU'
    };
    const issued = await call(core, 'POST', '/api/v1/dossier/document-qr/issue', cashierDocument, 'cashier-token');
    assert.equal(issued.status, 201);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: issued.body.qrValue
    }, 'cashier-token')).status, 200);

    assert.equal((await call(core, 'POST', '/api/v1/dossier/document-qr/issue', {
      ...cashierDocument,
      documentType: 'resume_medis'
    }, 'cashier-token')).status, 403);
  });
});

describe('web publik pasien', () => {
  test('katalog layanan tidak membocorkan kredensial pasien atau identitas internal dokter', async () => {
    const r = await call(pub, 'GET', '/api/public/hospital-catalog');
    assert.equal(r.status, 200);
    assert.ok((r.body?.doctors ?? r.body?.data?.doctors ?? []).length > 0);
    assert.equal(r.body?.demoPatients, undefined);
    assert.equal(r.body.doctors.some((doctor: any) => doctor.email || doctor.nip || doctor.sip || doctor.str), false);
  });

  test('login pasien ditolak 503 sampai penyedia OTP tersedia', async () => {
    const r = await call(pub, 'POST', '/api/patient/verify', { no_rm: 'RM-X', tanggal_lahir: '1990-01-01' });
    assert.equal(r.status, 503);
    assert.equal(r.body?.code, 'PATIENT_LOGIN_UNAVAILABLE');
    const google = await call(pub, 'POST', '/api/patient/google-session', { email: 'pasien@test.local' });
    assert.equal(google.status, 503);
    assert.equal(google.body?.code, 'PATIENT_LOGIN_UNAVAILABLE');
  });

  test('sesi pasien menggunakan cookie dan dapat dicabut', async () => {
    const patient = await createTestPatient(core, 'test-token');
    const cookie = `myitaru_patient_session=${createTestPatientSession(patient.no_rm)}`;

    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, null, cookie)).status, 200);
    const revoked = await call(pub, 'DELETE', '/api/patient/session', undefined, null, cookie);
    assert.equal(revoked.status, 204);
    assert.match(revoked.cookie, /HttpOnly/);
    assert.match(revoked.cookie, /Max-Age=0/);
    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, null, cookie)).status, 401);
  });

  test('pendaftaran daring menerbitkan antrean tanpa sesi atau data rekam medis', async () => {
    const cat = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
    const d = (cat.doctors ?? cat.data.doctors)[0];
    const appointmentDate = new Date().toISOString().slice(0, 10);
    const r = await call(pub, 'POST', '/api/patient/appointments', {
      nama: 'Pasien Uji', tanggal_lahir: '1990-05-15', no_hp: '081200000000',
      poli_id: d.poli_id, poli_nama: d.poli, dokter_id: d.id, dokter_nama: d.nama,
      tanggal: appointmentDate, jam_praktek: d.jam, penjamin: 'Umum', keluhan: 'uji',
    });
    assert.equal(r.status, 201);
    assert.ok(r.body?.booking?.nomor_antrian);
    assert.match(r.body?.booking?.qr_value, /^MYITARU1\./);
    assert.equal(r.body.booking.qr_value.includes(r.body.booking.no_rm), false);
    assert.equal(r.body?.token, undefined);
    assert.equal(r.body?.dossier, undefined);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: 'not-a-secure-qr'
    })).status, 400);

    const expiredToken = createSecurePatientQrToken('expired-reservation', {
      kind: 'reservation',
      ttlMs: 1
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const expired = await call(core, 'POST', '/api/v1/patient-qr/redeem', { token: expiredToken });
    assert.equal(expired.status, 400);
    assert.equal(expired.body?.code, 'INVALID_QR_TOKEN');

    const checkedIn = await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: r.body.booking.qr_value
    });
    assert.equal(checkedIn.status, 200);
    assert.equal(checkedIn.body?.kind, 'reservation');
    assert.equal(checkedIn.body?.patient?.no_rm, r.body.booking.no_rm);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: r.body.booking.qr_value
    })).status, 409);
  });

  test('QR reservasi tidak dapat dipakai sebelum tanggal kunjungan', async () => {
    const cat = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
    const doctor = (cat.doctors ?? cat.data.doctors)[0];
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const booking = await call(pub, 'POST', '/api/patient/appointments', {
      nama: 'Pasien Reservasi Uji',
      tanggal_lahir: '1992-06-10',
      no_hp: '081200000001',
      poli_id: doctor.poli_id,
      poli_nama: doctor.poli,
      dokter_id: doctor.id,
      dokter_nama: doctor.nama,
      tanggal: futureDate,
      jam_praktek: doctor.jam,
      penjamin: 'Umum'
    });
    assert.equal(booking.status, 201);

    const checkIn = await call(core, 'POST', '/api/v1/patient-qr/redeem', {
      token: booking.body.booking.qr_value
    });
    assert.equal(checkIn.status, 409);
    assert.equal(checkIn.body?.code, 'CHECKIN_DATE_MISMATCH');
  });

  test('ringkasan antrean publik hanya agregat tanpa No. RM, nama, atau ID pasien', async () => {
    const forbiddenKeys = ['no_rm', 'pasien_nama', 'pasien_nama_masked', 'nama_pasien', 'pasien_id', 'id_pasien', 'sampleTickets'];
    const collectKeys = (value: unknown, keys = new Set<string>()): Set<string> => {
      if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          collectKeys(v, keys);
        }
      }
      return keys;
    };

    const summary = await call(pub, 'GET', '/api/public/queue-status');
    assert.equal(summary.status, 200);
    assert.equal(summary.body.sampleTickets, undefined);
    assert.ok(Array.isArray(summary.body.poliQueues) && summary.body.poliQueues.length > 0);
    for (const pq of summary.body.poliQueues) {
      assert.deepEqual(Object.keys(pq).sort(), ['id', 'kode', 'nama', 'sedangDipanggil', 'totalMenunggu']);
      assert.equal(typeof pq.totalMenunggu, 'number');
    }
    const summaryKeys = collectKeys(summary.body);
    for (const key of forbiddenKeys) assert.equal(summaryKeys.has(key), false, `kunci terlarang: ${key}`);
    assert.doesNotMatch(JSON.stringify(summary.body), /RM-\d{6}-\d{4}/);

    const catalog = await call(pub, 'GET', '/api/public/hospital-catalog');
    assert.doesNotMatch(JSON.stringify(catalog.body.poliQueues), /RM-\d{6}-\d{4}/);
    assert.equal(catalog.body.emergencyHotline === '1-500-911', false);

    // Pencarian dengan No. RM pasien lain tidak lagi didukung.
    const queuedPatient = await createTestPatient(core, 'test-token');
    const byRm = await call(pub, 'GET', `/api/public/queue-status?q=${encodeURIComponent(queuedPatient.no_rm)}`);
    assert.equal(byRm.status, 200);
    assert.deepEqual(byRm.body.matches, []);
  });

  test('cek antrean publik memerlukan kode tiket lengkap dan tidak mengembalikan identitas pasien', async () => {
    const cat = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
    const doctor = (cat.doctors ?? cat.data.doctors)[0];
    const patientName = 'Pasien Privasi Antrean';
    const booking = await call(pub, 'POST', '/api/patient/appointments', {
      nama: patientName,
      tanggal_lahir: '1991-01-01',
      no_hp: '081200000009',
      poli_id: doctor.poli_id,
      poli_nama: doctor.poli,
      dokter_id: doctor.id,
      dokter_nama: doctor.nama,
      tanggal: new Date().toISOString().slice(0, 10),
      jam_praktek: doctor.jam,
      penjamin: 'Umum'
    });
    assert.equal(booking.status, 201);
    const { nomor_antrian: ticket, no_rm: rm } = booking.body.booking;

    const lookup = await call(pub, 'GET', `/api/public/queue-status?q=${encodeURIComponent(ticket)}`);
    assert.equal(lookup.status, 200);
    assert.ok(lookup.body.matches.length >= 1);
    for (const match of lookup.body.matches) {
      assert.equal(match.nomor_antrian, ticket);
      for (const key of ['no_rm', 'pasien_nama', 'pasien_nama_masked', 'pasien_id', 'id']) {
        assert.equal(key in match, false, `kunci terlarang: ${key}`);
      }
    }
    const raw = JSON.stringify(lookup.body);
    assert.equal(raw.includes(rm), false);
    assert.equal(raw.includes(patientName), false);

    // Pencarian sebagian (mis. hanya prefiks poli) tidak boleh menampilkan tiket pasien lain.
    const partial = await call(pub, 'GET', `/api/public/queue-status?q=${encodeURIComponent(ticket.slice(0, 3))}`);
    assert.deepEqual(partial.body.matches, []);
    const byOwnRm = await call(pub, 'GET', `/api/public/queue-status?q=${encodeURIComponent(rm)}`);
    assert.deepEqual(byOwnRm.body.matches, []);
  });

  test('pendaftaran tanpa dokter ditolak', async () => {
    assert.equal((await call(pub, 'POST', '/api/patient/appointments', { nama: 'X', tanggal_lahir: '1990-01-01' })).status, 400);
  });

  test('pendaftaran publik tidak memberi akses ke dosir tanpa sesi pasien', async () => {
    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, null)).status, 401);
  });

  test('endpoint verifikasi pasien membatasi percobaan berulang', async () => {
    // Batas 10 percobaan per jendela (sebagian sudah dipakai tes sebelumnya).
    let limited = await call(pub, 'POST', '/api/patient/verify', {});
    for (let attempt = 0; attempt < 10 && limited.status !== 429; attempt += 1) {
      assert.equal(limited.status, 503);
      limited = await call(pub, 'POST', '/api/patient/verify', {});
    }
    assert.equal(limited.status, 429);
    assert.equal(limited.body?.code, 'RATE_LIMITED');
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

describe('validasi transaksi dan layanan produksi', () => {
  test('pengeluaran obat menolak kuantitas tidak valid dan tidak menerapkan transaksi parsial', async () => {
    const store = new FakePrimaryRepository().seed('inventory', [
      { id: 'inv-uji-1', kode: 'OBAT-UJI-1', nama: 'Obat Uji 1', kategori: 'Obat Oral', stok: 100, stok_minimum: 10, satuan: 'Tablet', harga_beli: 1, harga_jual: 2, batch: 'B1', expired_date: '2099-12-31', lokasi: 'Gudang Farmasi' },
      { id: 'inv-uji-2', kode: 'OBAT-UJI-2', nama: 'Obat Uji 2', kategori: 'Obat Oral', stok: 80, stok_minimum: 10, satuan: 'Kapsul', harga_beli: 1, harga_jual: 2, batch: 'B2', expired_date: '2099-12-31', lokasi: 'Depo Ralan' }
    ]);
    const { app } = await createAppsForTest(testAuth, { mode: 'mysql', mysql: store });
    addErrorHandlerForTest(app);
    const inv = await listen(app);

    const before = (await call(inv, 'GET', '/api/v1/inventory/stock')).body.items;
    const stockBefore = before.find((item: any) => item.kode === 'OBAT-UJI-1').stok;

    for (const qty of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const result = await call(inv, 'POST', '/api/v1/inventory/dispense', {
        items: [{ kode: 'OBAT-UJI-1', qty }]
      });
      assert.equal(result.status, 422);
    }

    const mixed = await call(inv, 'POST', '/api/v1/inventory/dispense', {
      items: [{ kode: 'OBAT-UJI-1', qty: 1 }, { kode: 'OBAT-UJI-2', qty: 81 }]
    });
    assert.equal(mixed.status, 422);
    const after = (await call(inv, 'GET', '/api/v1/inventory/stock')).body.items;
    assert.equal(after.find((item: any) => item.kode === 'OBAT-UJI-1').stok, stockBefore);
  });

  test('store operasional kosong tanpa persistensi: tidak ada pasien, bed, atau stok contoh', async () => {
    const { app } = await createAppsForTest(testAuth);
    addErrorHandlerForTest(app);
    const fresh = await listen(app);
    assert.deepEqual((await call(fresh, 'GET', '/api/v1/patients')).body.data, []);
    assert.deepEqual((await call(fresh, 'GET', '/api/v1/inventory/stock')).body.items, []);
    assert.deepEqual((await call(fresh, 'GET', '/api/v1/bed-management/status')).body.beds, []);
    assert.deepEqual((await call(fresh, 'GET', '/api/v1/appointments')).body.data, []);
  });

  test('integrasi BPJS, SATUSEHAT, dan indikator kesehatan tidak mengembalikan respons tiruan', async () => {
    assert.equal((await call(core, 'GET', '/api/v1/bpjs/vclaim/peserta/3171012304850001')).body?.code, 'BPJS_VCLAIM_NOT_CONFIGURED');
    assert.equal((await call(core, 'POST', '/api/v1/bpjs/vclaim/sep/generate', { noKartu: '0001' })).status, 503);
    assert.equal((await call(core, 'GET', '/api/v1/bpjs/vclaim/rujukan/X')).status, 503);
    assert.equal((await call(core, 'POST', '/api/v1/satusehat/encounter/sync', {})).body?.code, 'SATUSEHAT_NOT_CONFIGURED');
    assert.equal((await call(core, 'GET', '/api/v1/health-updates')).status, 503);
  });

  test('QRIS, backup, dan Turnstile tidak mengklaim sukses tanpa integrasi nyata', async () => {
    assert.equal((await call(core, 'POST', '/api/v1/billing/qris/callback', { paymentStatus: 'PAID' })).status, 503);
    assert.equal((await call(core, 'POST', '/api/v1/backup/create')).body?.code, 'BACKUP_NOT_CONFIGURED');
    assert.equal((await call(core, 'POST', '/api/cloudflare/verify-turnstile', { token: 'CF_TURNSTILE_DEMO' })).status, 503);
  });

  test('server menolak startup production selama store masih in-memory', async () => {
    const { createApps } = await import('../server');
    const previousEnv = {
      nodeEnv: process.env.NODE_ENV,
      projectId: process.env.FIREBASE_PROJECT_ID,
      serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      sessionSecret: process.env.SESSION_SECRET,
      authMode: process.env.AUTH_MODE
    };
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = 'local';
    process.env.SESSION_SECRET = 'production-test-session-secret-0123456789';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
    try {
      await assert.rejects(createApps(), /durable, access-controlled persistence/);
    } finally {
      restoreEnv('NODE_ENV', previousEnv.nodeEnv);
      restoreEnv('FIREBASE_PROJECT_ID', previousEnv.projectId);
      restoreEnv('FIREBASE_SERVICE_ACCOUNT_JSON', previousEnv.serviceAccount);
      restoreEnv('SESSION_SECRET', previousEnv.sessionSecret);
      restoreEnv('AUTH_MODE', previousEnv.authMode);
    }
  });
});

describe('portal karyawan', () => {
  test('login dan MFA pegawai ditolak 503 sampai integrasi identitas tersedia', async () => {
    const login = await call(core, 'POST', '/api/gateway/auth/login', { divisionId: 'sdm-umum', deviceInfo: 'uji' });
    assert.equal(login.status, 503);
    assert.equal(login.body?.code, 'EMPLOYEE_LOGIN_UNAVAILABLE');
    assert.equal(login.body?.demoOtpHint, undefined);
    const mfa = await call(core, 'POST', '/api/gateway/auth/verify-mfa', { challengeId: 'x', otp: '123456' });
    assert.equal(mfa.status, 503);
    assert.equal((await call(core, 'GET', '/api/gateway/profile')).status, 401);
  });
});
