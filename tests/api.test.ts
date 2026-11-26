// Pengujian black-box API untuk web publik dan aplikasi inti.
// Menjalankan kedua aplikasi Express di dalam proses (tanpa kunci Gemini, sehingga fitur AI memakai mesin aturan).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSecurePatientQrToken } from '../src/server/securePatientQr';

process.env.VERCEL = '1'; // cegah server.ts menjalankan listen() sendiri
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
delete process.env.GEMINI_API_KEY;

type Res = { status: number; body: any; cookie: string };
let core = '';
let pub = '';
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
  const authToken = token === undefined && base === core ? 'test-token' : token;
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
  const { app, publicApp } = await createApps({
    resolvePrincipal: async (token, isSessionCookie) => {
      if (token === 'viewer-token') return { uid: 'viewer', email: 'viewer@test.local', roleId: 'viewer', mfaVerified: true };
      if (token === 'cashier-token') return { uid: 'cashier', email: 'cashier@test.local', roleId: 'kasir', mfaVerified: true };
      if (token.startsWith('role:')) return { uid: token, email: 'role@test.local', roleId: token.slice(5), mfaVerified: true };
      if (token === 'no-mfa-token') return { uid: 'admin', email: 'admin@test.local', roleId: 'super_admin', mfaVerified: false };
      if (token === 'test-token' || token === 'test-session-token' || token.startsWith('emp_')) {
        return { uid: 'admin', email: 'admin@test.local', roleId: 'super_admin', mfaVerified: true };
      }
      return null;
    },
    createSessionCookie: async () => 'test-session-token',
    revokeRefreshTokens: async () => {}
  });
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
  test('security headers mengizinkan kamera/mikrofon self dan unknown /api mengembalikan 404 JSON', async () => {
    const res = await fetch(`${core}/api/v1/health`);
    assert.equal(res.headers.get('permissions-policy'), 'camera=(self), microphone=(self), geolocation=(self)');
    assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
    const unknownPub = await call(pub, 'GET', '/api/auth/me');
    assert.equal(unknownPub.status, 404);
    assert.equal(unknownPub.body?.code, 'NOT_FOUND');
  });

  test('API operasional menolak sesi kosong dan membatasi akses berbasis role dan MFA', async () => {
    assert.equal((await call(core, 'GET', '/api/v1/inventory/stock', undefined, null)).status, 401);
    assert.equal((await call(core, 'GET', '/api/v1/inventory/stock', undefined, 'no-mfa-token')).body?.code, 'MFA_REQUIRED');
    assert.equal((await call(core, 'POST', '/api/v1/inventory/dispense', { items: [] }, 'viewer-token')).status, 403);
  });

  test('kunjungan: pasien wajib terdaftar, nomor antrean mulai 001 per hari per poli', async () => {
    assert.equal((await call(core, 'POST', '/api/v1/appointments', { pasien_id: 'tidak-ada', poli: 'Poli Uji', dokter: 'dr. Uji' })).body?.code, 'PATIENT_NOT_FOUND');
    const patientId = (await call(core, 'GET', '/api/v1/patients?limit=1')).body.data[0].id;
    const kemarin = await call(core, 'POST', '/api/v1/appointments', { pasien_id: patientId, poli: 'Poli Uji', dokter: 'dr. Uji', tanggal: '2026-01-01T08:00:00Z' });
    const hariIni = await call(core, 'POST', '/api/v1/appointments', { pasien_id: patientId, poli: 'Poli Uji', dokter: 'dr. Uji', tanggal: '2026-01-02' });
    assert.equal(kemarin.body.data.nomor_antrian, 'Q-001');
    assert.equal(kemarin.body.data.tanggal, '2026-01-01');
    assert.equal(hariIni.body.data.nomor_antrian, 'Q-001');
    assert.equal((await call(core, 'GET', '/api/v1/patients?page=abc&limit=1')).body.page, 1);
  });

  test('kasir hanya menerima identitas pasien, bukan catatan klinis', async () => {
    const admin = (await call(core, 'GET', '/api/v1/patients?limit=1')).body.data[0];
    await call(core, 'PATCH', `/api/v1/patients/${admin.id}`, { riwayat_penyakit: ['Hipertensi'] });
    const asCashier = (await call(core, 'GET', `/api/v1/patients/${admin.id}`, undefined, 'cashier-token')).body.data;
    assert.equal(asCashier.nama, admin.nama);
    assert.equal(asCashier.riwayat_penyakit, undefined);
    assert.equal((await call(core, 'GET', '/api/v1/patients?limit=1', undefined, 'cashier-token')).body.data[0].riwayat_penyakit, undefined);
    assert.ok((await call(core, 'GET', `/api/v1/patients/${admin.id}`)).body.data.riwayat_penyakit);
    const fullList = (await call(core, 'GET', '/api/v1/patients?limit=1000')).body;
    assert.equal(fullList.limit, 1000);
    assert.equal(fullList.data.find((p: { id: string }) => p.id === admin.id).riwayat_penyakit, undefined);
  });

  test('data modul: simpan, indeks, baca, hapus; kunci liar dan viewer ditolak', async () => {
    const saved = await call(core, 'PUT', '/api/v1/module-data/hospital_billing_ralan', { data: '[{"id":"BIL-1"}]' }, 'cashier-token');
    assert.equal(saved.status, 200);
    const index = (await call(core, 'GET', '/api/v1/module-data', undefined, 'role:dokter')).body.index;
    assert.equal(index.hospital_billing_ralan, saved.body.updatedAt);
    assert.equal((await call(core, 'GET', '/api/v1/module-data/hospital_billing_ralan', undefined, 'role:apoteker')).body.data, '[{"id":"BIL-1"}]');
    const batch = (await call(core, 'GET', '/api/v1/module-data?keys=hospital_billing_ralan,hospital_tidak_ada,rahasia')).body.records;
    assert.deepEqual(Object.keys(batch), ['hospital_billing_ralan']);
    assert.equal((await call(core, 'PUT', '/api/v1/module-data/rahasia', { data: 'x' })).status, 400);
    assert.equal((await call(core, 'PUT', `/api/v1/module-data/${encodeURIComponent('hospital_igd_Penanganan IGD')}`, { data: '[]' })).status, 200);
    assert.equal((await call(core, 'PUT', `/api/v1/module-data/${encodeURIComponent('hospital_a/b')}`, { data: '[]' })).status, 400);
    assert.equal((await call(core, 'PUT', '/api/v1/module-data/hospital_x', { data: 'x' }, 'viewer-token')).status, 403);
    assert.equal((await call(core, 'GET', '/api/v1/module-data', undefined, 'role:it_support')).status, 403);
    assert.equal((await call(core, 'DELETE', '/api/v1/module-data/hospital_billing_ralan', undefined, 'cashier-token')).status, 200);
    assert.equal((await call(core, 'GET', '/api/v1/module-data/hospital_billing_ralan')).status, 404);
    assert.equal((await call(core, 'GET', '/api/v1/module-data')).body.index.hospital_billing_ralan, undefined);
  });

  test('validasi pasien sama untuk POST dan PATCH; dokumen dossier dibatasi ukurannya', async () => {
    const bad = await call(core, 'POST', '/api/v1/patients', { nama: 123, tanggal_lahir: '1990-01-01', jenis_kelamin: 'L', alamat: 'x' });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.field, 'nama');
    assert.equal((await call(core, 'POST', '/api/v1/patients', { nama: 'A', tanggal_lahir: '1990-01-01', jenis_kelamin: 'X', alamat: 'x' })).body.field, 'jenis_kelamin');
    assert.equal((await call(core, 'POST', '/api/v1/patients', { nama: 'A', tanggal_lahir: '1990-01-01', jenis_kelamin: 'L', alamat: 'x', alergi: 'debu' })).body.field, 'alergi');
    const big = await call(core, 'POST', '/api/v1/dossier/documents', { no_rm: 'RM-1', doc_type: 'cppt', title: 'x', data: { isi: 'a'.repeat(900_000) } });
    assert.equal(big.status, 413);
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
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/issue', {
      no_rm: 'RM-260101-0001'
    }, null)).status, 401);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/issue', {
      no_rm: 'RM-260101-0001'
    }, 'no-mfa-token')).status, 403);

    const issued = await call(core, 'POST', '/api/v1/patient-qr/issue', {
      no_rm: 'RM-260101-0001'
    });
    assert.equal(issued.status, 200);
    assert.match(issued.body.qrValue, /^MYITARU1\./);
    assert.equal(issued.body.qrValue.includes('RM-260101-0001'), false);

    const resolved = await call(core, 'POST', '/api/v1/patient-qr/resolve', {
      token: issued.body.qrValue
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.patient.no_rm, 'RM-260101-0001');

    const qrAudit = await call(core, 'GET', '/api/v1/audit/logs?module=Rekam%20Medis');
    assert.ok(qrAudit.body.data.some((entry: { action: string }) => entry.action === 'PATIENT_QR_ISSUED'));
    assert.ok(qrAudit.body.data.some((entry: { action: string }) => entry.action === 'PATIENT_QR_ACCESSED'));

    const changedToken = `${issued.body.qrValue.slice(0, -1)}${issued.body.qrValue.endsWith('A') ? 'B' : 'A'}`;
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/resolve', { token: changedToken })).status, 400);
    assert.equal((await call(core, 'POST', '/api/v1/patient-qr/resolve', { token: 'RM-260101-0001' })).status, 400);

    const validButUnissuedToken = createSecurePatientQrToken('p-001');
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

  test('verifikasi pasien ditolak saat faktor identitas tidak dikonfigurasi', async () => {
    const previousDemoAuth = process.env.ALLOW_INSECURE_DEMO_AUTH;
    delete process.env.ALLOW_INSECURE_DEMO_AUTH;
    let status = 0;
    try {
      status = (await call(pub, 'POST', '/api/patient/verify', {})).status;
    } finally {
      restoreEnv('ALLOW_INSECURE_DEMO_AUTH', previousDemoAuth);
    }
    assert.equal(status, 503);
  });

  test('sesi pasien menggunakan cookie HttpOnly dan dapat dicabut', async () => {
    const issued = await call(pub, 'POST', '/api/patient/verify', {
      no_rm: 'RM-260101-0001',
      tanggal_lahir: '1985-04-23'
    });
    assert.equal(issued.status, 200);
    assert.match(issued.cookie, /myitaru_patient_session=/);
    assert.match(issued.cookie, /HttpOnly/);
    const cookie = issued.cookie.split(';')[0];

    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, null, cookie)).status, 200);
    assert.equal((await call(pub, 'DELETE', '/api/patient/session', undefined, null, cookie)).status, 204);
    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, null, cookie)).status, 401);
  });

  test('pendaftaran daring menerbitkan antrean tanpa sesi atau data rekam medis', async () => {
    const cat = (await call(pub, 'GET', '/api/public/hospital-catalog')).body;
    const d = (cat.doctors ?? cat.data.doctors)[0];
    const appointmentDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const r = await call(pub, 'POST', '/api/patient/appointments', {
      nama: 'Pasien Uji', tanggal_lahir: '1990-05-15', no_hp: '081200000000',
      poli_id: d.poli_id, poli_nama: d.poli, dokter_id: d.id, dokter_nama: d.nama,
      tanggal: appointmentDate, jam_praktek: d.jam, penjamin: 'Umum', keluhan: 'uji',
    });
    assert.equal(r.status, 201);
    assert.ok(r.body?.booking?.nomor_antrian);
    assert.match(r.body?.booking?.kode_booking, /^BK-[0-9A-F]{8}$/);
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

  test('pendaftaran tanpa dokter ditolak', async () => {
    assert.equal((await call(pub, 'POST', '/api/patient/appointments', { nama: 'X', tanggal_lahir: '1990-01-01' })).status, 400);
  });

  test('pendaftaran publik tidak memberi akses ke dosir tanpa sesi pasien', async () => {
    assert.equal((await call(pub, 'GET', '/api/patient/dossier', undefined, null)).status, 401);
  });

  test('endpoint verifikasi pasien membatasi percobaan berulang', async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assert.equal((await call(pub, 'POST', '/api/patient/verify', {})).status, 400);
    }
    const limited = await call(pub, 'POST', '/api/patient/verify', {});
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
    const before = (await call(core, 'GET', '/api/v1/inventory/stock')).body.items;
    const paracetamolBefore = before.find((item: any) => item.kode === 'OBAT-001').stok;

    for (const qty of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const result = await call(core, 'POST', '/api/v1/inventory/dispense', {
        items: [{ kode: 'OBAT-001', qty }]
      });
      assert.equal(result.status, 422);
    }

    const mixed = await call(core, 'POST', '/api/v1/inventory/dispense', {
      items: [{ kode: 'OBAT-001', qty: 1 }, { kode: 'OBAT-002', qty: 81 }]
    });
    assert.equal(mixed.status, 422);
    const after = (await call(core, 'GET', '/api/v1/inventory/stock')).body.items;
    assert.equal(after.find((item: any) => item.kode === 'OBAT-001').stok, paracetamolBefore);
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
      demoAuth: process.env.ALLOW_INSECURE_DEMO_AUTH,
      projectId: process.env.FIREBASE_PROJECT_ID,
      serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      sessionSecret: process.env.SESSION_SECRET,
      authMode: process.env.AUTH_MODE
    };
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_INSECURE_DEMO_AUTH;
    process.env.AUTH_MODE = 'local';
    process.env.SESSION_SECRET = 'production-test-session-secret-0123456789';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
    try {
      await assert.rejects(createApps(), /durable, access-controlled persistence/);
    } finally {
      restoreEnv('NODE_ENV', previousEnv.nodeEnv);
      restoreEnv('ALLOW_INSECURE_DEMO_AUTH', previousEnv.demoAuth);
      restoreEnv('FIREBASE_PROJECT_ID', previousEnv.projectId);
      restoreEnv('FIREBASE_SERVICE_ACCOUNT_JSON', previousEnv.serviceAccount);
      restoreEnv('SESSION_SECRET', previousEnv.sessionSecret);
      restoreEnv('AUTH_MODE', previousEnv.authMode);
    }
  });
});

describe('portal karyawan', () => {
  test('login peran sensitif meminta MFA dan token berfungsi', async () => {
    const previousDemoAuth = process.env.ALLOW_INSECURE_DEMO_AUTH;
    delete process.env.ALLOW_INSECURE_DEMO_AUTH;
    let disabledStatus = 0;
    try {
      disabledStatus = (await call(core, 'POST', '/api/gateway/auth/login', { divisionId: 'sdm-umum' })).status;
    } finally {
      restoreEnv('ALLOW_INSECURE_DEMO_AUTH', previousDemoAuth);
    }
    assert.equal(disabledStatus, 503);

    const login = await call(core, 'POST', '/api/gateway/auth/login', { divisionId: 'sdm-umum', deviceInfo: 'uji' });
    assert.equal(login.body?.mfaRequired, true);
    assert.equal((await call(core, 'POST', '/api/gateway/auth/verify-mfa', { challengeId: login.body.challengeId, otp: '000000' })).status, 401);
    const ok = await call(core, 'POST', '/api/gateway/auth/verify-mfa', { challengeId: login.body.challengeId, otp: '123456' });
    assert.equal(ok.status, 200);
    assert.equal((await call(core, 'GET', '/api/gateway/profile', undefined, ok.body.token)).status, 200);
    assert.equal((await call(core, 'GET', '/api/gateway/profile')).status, 401);
  });
});

describe('role based access aplikasi inti', () => {
  const status = async (role: string, path: string, method = 'GET', body?: unknown) =>
    (await call(core, method, path, body, `role:${role}`)).status;
  const cases: [role: string, path: string, expected: number][] = [
    // admin: semua modul
    ['admin', '/api/v1/audit/logs', 200],
    ['admin', '/api/v1/inventory/stock', 200],
    ['admin', '/api/v1/bed-management/status', 200],
    ['admin', '/api/v1/patients', 200],
    // dokter: medis, bukan farmasi/keuangan/sistem
    ['dokter', '/api/v1/bed-management/status', 200],
    ['dokter', '/api/v1/patients', 200],
    ['dokter', '/api/v1/inventory/stock', 403],
    ['dokter', '/api/v1/audit/logs', 403],
    // perawat: keperawatan
    ['perawat', '/api/v1/bed-management/status', 200],
    ['perawat', '/api/v1/inventory/stock', 403],
    // farmasi: obat dan stok
    ['apoteker', '/api/v1/inventory/stock', 200],
    ['apoteker', '/api/v1/patients', 200],
    ['apoteker', '/api/v1/bed-management/status', 403],
    // lab: modul lab saja, tetap bisa membaca identitas pasien
    ['laboran', '/api/v1/patients', 200],
    ['laboran', '/api/v1/inventory/stock', 403],
    ['laboran', '/api/v1/bed-management/status', 403],
    // kasir: keuangan
    ['kasir', '/api/v1/patients', 200],
    ['kasir', '/api/v1/inventory/stock', 403],
    ['kasir', '/api/v1/bed-management/status', 403],
    // rekam medis
    ['rekam_medis', '/api/v1/patients', 200],
    ['rekam_medis', '/api/v1/inventory/stock', 403],
    // IT tanpa modul layanan pasien tidak melihat data pasien
    ['it_support', '/api/v1/patients', 403]
  ];

  for (const [role, path, expected] of cases) {
    test(`${role} GET ${path} -> ${expected}`, async () => {
      assert.equal(await status(role, path), expected);
    });
  }

  test('menulis data pasien tetap khusus pendaftaran/rekam medis', async () => {
    assert.equal(await status('dokter', '/api/v1/patients', 'POST', { nama: 'Uji' }), 403);
    assert.equal(await status('laboran', '/api/v1/patients', 'POST', { nama: 'Uji' }), 403);
    assert.notEqual(await status('rekam_medis', '/api/v1/patients', 'POST', { nama: 'Uji' }), 403);
  });
});
