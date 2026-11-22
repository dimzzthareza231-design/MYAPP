// Akun pasien: profil kontak, akun keluarga (OTP ke nomor terdaftar tanggungan), peralihan akun
// dengan audit wali, penilaian kunjungan sendiri yang selesai, dan pengaduan + akses petugas.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestPatient, createTestPatientSession, type TestPatient } from './helpers/patientFixtures';
import { setOtpSenderForTests } from '../src/server/otp';
import { InMemoryTestOtpSender } from '../src/server/otp/testSender';

process.env.VERCEL = '1';
process.env.SESSION_SECRET = 'test-secret-account';
process.env.NODE_ENV = 'test';
delete process.env.GEMINI_API_KEY;
delete process.env.WHATSAPP_ACCESS_TOKEN;

let core = '';
let pub = '';
const servers: http.Server[] = [];
const sender = new InMemoryTestOtpSender();
let ipCounter = 0;
const freshIp = () => `10.9.0.${++ipCounter}`;

const STAFF_ROLES: Record<string, string> = {
  'test-token': 'super_admin',
  'mutu-token': 'manajemen_mutu',
  'kasir-token': 'kasir'
};

async function listen(app: http.RequestListener): Promise<string> {
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(base: string, method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': freshIp(),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  return { status: res.status, body: await res.json().catch(() => null) as any, headers: res.headers };
}
const pat = (method: string, path: string, token?: string, body?: unknown) => call(pub, method, path, { token, body });
const staff = (method: string, path: string, token = 'test-token', body?: unknown) => call(core, method, path, { token, body });

const toE164 = (local: string) => `62${local.replace(/\D/g, '').replace(/^0/, '')}`;

let guardian: TestPatient;
let child: TestPatient;
let stranger: TestPatient;
const phones = { guardian: '081211110001', child: '081211110002', stranger: '081211110003' };

async function auditLogs(): Promise<any[]> {
  const res = await staff('GET', '/api/v1/audit/logs?module=Patient%20Account&limit=200');
  return res.body.data;
}

before(async () => {
  setOtpSenderForTests(sender);
  const { createApps, addErrorHandler } = await import('../server');
  const { app, publicApp } = await createApps({
    resolvePrincipal: async (token) =>
      STAFF_ROLES[token]
        ? { uid: token, email: `${token}@test.local`, roleId: STAFF_ROLES[token], mfaVerified: true }
        : null,
    createSessionCookie: async () => 'test-session-token',
    revokeRefreshTokens: async () => {}
  });
  addErrorHandler(app);
  addErrorHandler(publicApp);
  core = await listen(app);
  pub = await listen(publicApp);
  guardian = await createTestPatient(core, 'test-token', { nama: 'Wali Uji', no_hp: phones.guardian });
  child = await createTestPatient(core, 'test-token', { nama: 'Anak Uji', no_hp: phones.child, tanggal_lahir: '2015-01-01' });
  stranger = await createTestPatient(core, 'test-token', { nama: 'Orang Lain', no_hp: phones.stranger });
});

after(() => {
  setOtpSenderForTests(undefined);
  servers.forEach((s) => s.close());
});

describe('profil pasien', () => {
  test('wajib sesi; hanya data sendiri', async () => {
    assert.equal((await pat('GET', '/api/patient/profile')).status, 401);
    const res = await pat('GET', '/api/patient/profile', createTestPatientSession(guardian.no_rm));
    assert.equal(res.status, 200);
    assert.equal(res.body.profile.no_rm, guardian.no_rm);
    assert.equal(res.body.profile.no_hp_editable, false);
  });

  test('hanya kolom kontak yang bisa diubah; no_hp read-only; audit tercatat', async () => {
    const token = createTestPatientSession(guardian.no_rm);
    const noHp = await pat('PATCH', '/api/patient/profile', token, { no_hp: '081299999999' });
    assert.equal(noHp.status, 400);
    assert.equal(noHp.body.code, 'NO_HP_READ_ONLY');
    const nama = await pat('PATCH', '/api/patient/profile', token, { nama: 'Ganti Nama' });
    assert.equal(nama.status, 400);
    const badEmail = await pat('PATCH', '/api/patient/profile', token, { email: 'bukan-email' });
    assert.equal(badEmail.status, 422);
    const badKd = await pat('PATCH', '/api/patient/profile', token, { kontak_darurat: { nama: 'Ibu', hubungan: 'Ibu', no_hp: '123' } });
    assert.equal(badKd.status, 422);

    const ok = await pat('PATCH', '/api/patient/profile', token, {
      alamat: 'Jl. Kenanga No. 5',
      email: 'Wali@Contoh.ID',
      kontak_darurat: { nama: 'Ibu Wali', hubungan: 'Ibu', no_hp: '+62 812 1111 0009' }
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.email, 'wali@contoh.id');
    assert.equal(ok.body.profile.kontak_darurat.no_hp, '081211110009');
    assert.equal(ok.body.profile.no_hp, phones.guardian);

    // Data staf ikut berubah, identitas inti tidak.
    const record = await staff('GET', `/api/v1/patients/${guardian.no_rm}`);
    assert.equal(record.body.data.alamat, 'Jl. Kenanga No. 5');
    assert.equal(record.body.data.nama, 'Wali Uji');
    const logs = await auditLogs();
    assert.ok(logs.some((l) => l.action === 'PATIENT_PROFILE_UPDATE' && l.user === guardian.no_rm));
  });
});

describe('akun keluarga', () => {
  let guardianToken = '';
  before(() => {
    guardianToken = createTestPatientSession(guardian.no_rm);
  });

  test('tidak ada endpoint tautan RM+tanggal lahir; OTP dikirim ke nomor TERDAFTAR tanggungan', async () => {
    const res = await pat('POST', '/api/patient/family/link/request', guardianToken, {
      no_rm: child.no_rm,
      hubungan: 'anak',
      tanggal_lahir: child.tanggal_lahir,
      no_hp: phones.guardian
    });
    assert.equal(res.status, 200);
    assert.match(res.body.request_id, /^flr-[a-f0-9]{32}$/);
    assert.equal(sender.sent.at(-1)!.to, toE164(phones.child));
    assert.equal(sender.lastCodeFor(toE164(phones.guardian)), undefined);
    // Belum tertaut sebelum OTP diverifikasi.
    const family = await pat('GET', '/api/patient/family', guardianToken);
    assert.deepEqual(family.body.dependents, []);
    const sw = await pat('POST', `/api/patient/family/switch/${child.no_rm}`, guardianToken);
    assert.equal(sw.status, 403);
  });

  test('No. RM tidak dikenal: respons generik, tanpa pengiriman, verifikasi pasti gagal', async () => {
    const before = sender.sent.length;
    const res = await pat('POST', '/api/patient/family/link/request', guardianToken, { no_rm: 'RM-TIDAK-ADA-01', hubungan: 'anak' });
    assert.equal(res.status, 200);
    assert.equal(sender.sent.length, before);
    const verify = await pat('POST', '/api/patient/family/link/verify', guardianToken, { request_id: res.body.request_id, code: '123456' });
    assert.equal(verify.status, 400);
  });

  test('kode OTP tidak bisa dipakai akun lain; kode benar menautkan', async () => {
    // Cooldown pengiriman ulang 60 detik ke nomor yang sama sudah aktif dari tes sebelumnya;
    // pakai permintaan tes sebelumnya tidak mungkin (request_id tidak disimpan), jadi gunakan tanggungan baru.
    const child2 = await createTestPatient(core, 'test-token', { nama: 'Anak Kedua', no_hp: '081211110004' });
    const req = await pat('POST', '/api/patient/family/link/request', guardianToken, { no_rm: child2.no_rm, hubungan: 'anak' });
    assert.equal(req.status, 200);
    const code = sender.lastCodeFor(toE164('081211110004'))!;
    assert.ok(code);

    const strangerToken = createTestPatientSession(stranger.no_rm);
    const hijack = await pat('POST', '/api/patient/family/link/verify', strangerToken, { request_id: req.body.request_id, code });
    assert.equal(hijack.status, 400);
    assert.equal(hijack.body.code, 'FAMILY_REQUEST_EXPIRED');

    // Request id tautan keluarga tidak berlaku di endpoint login OTP.
    const login = await pat('POST', '/api/patient/otp/verify', undefined, { request_id: req.body.request_id.slice(4), code });
    assert.notEqual(login.status, 200);

    const wrong = await pat('POST', '/api/patient/family/link/verify', guardianToken, {
      request_id: req.body.request_id,
      code: code === '000000' ? '111111' : '000000'
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'OTP_INVALID');

    const ok = await pat('POST', '/api/patient/family/link/verify', guardianToken, { request_id: req.body.request_id, code });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.dependent.no_rm, child2.no_rm);

    const replay = await pat('POST', '/api/patient/family/link/verify', guardianToken, { request_id: req.body.request_id, code });
    assert.equal(replay.status, 400);

    const family = await pat('GET', '/api/patient/family', guardianToken);
    assert.deepEqual(family.body.dependents.map((d: any) => d.no_rm), [child2.no_rm]);
    // Tanggungan melihat walinya (nama disamarkan).
    const childView = await pat('GET', '/api/patient/family', createTestPatientSession(child2.no_rm));
    assert.equal(childView.body.guardians[0].no_rm, guardian.no_rm);
    assert.notEqual(childView.body.guardians[0].nama, 'Wali Uji');

    const logs = await auditLogs();
    assert.ok(logs.some((l) => l.action === 'FAMILY_LINK_VERIFIED' && l.details.includes(child2.no_rm)));

    // Peralihan akun: sesi tanggungan dengan actor=wali tercatat di audit.
    const sw = await pat('POST', `/api/patient/family/switch/${child2.no_rm}`, guardianToken);
    assert.equal(sw.status, 200);
    assert.equal(sw.body.acting_as_guardian, true);
    const actingToken = sw.body.token as string;
    // Token lama dicabut.
    assert.equal((await pat('GET', '/api/patient/profile', guardianToken)).status, 401);
    const profile = await pat('GET', '/api/patient/profile', actingToken);
    assert.equal(profile.body.profile.no_rm, child2.no_rm);
    assert.equal(profile.body.acting_as_guardian, true);
    const switchLog = (await auditLogs()).find((l) => l.action === 'FAMILY_SWITCH' && l.status === 'SUCCESS');
    assert.ok(switchLog);
    assert.equal(switchLog.user, guardian.no_rm);
    assert.equal(switchLog.role, 'wali pasien');
    assert.ok(switchLog.details.includes(`actor=${guardian.no_rm}`));

    // Saat bertindak sebagai wali: tidak boleh mengelola tautan; aksi tercatat atas nama wali.
    const manage = await pat('POST', '/api/patient/family/link/request', actingToken, { no_rm: stranger.no_rm, hubungan: 'lainnya' });
    assert.equal(manage.status, 403);
    const edit = await pat('PATCH', '/api/patient/profile', actingToken, { alamat: 'Alamat Anak Baru' });
    assert.equal(edit.status, 200);
    const editLog = (await auditLogs()).find((l) => l.action === 'PATIENT_PROFILE_UPDATE' && l.details.includes(child2.no_rm));
    assert.equal(editLog.user, guardian.no_rm);
    // Tidak bisa beralih ke pasien yang tidak tertaut.
    assert.equal((await pat('POST', `/api/patient/family/switch/${stranger.no_rm}`, actingToken)).status, 403);

    // Kembali ke akun sendiri.
    const back = await pat('POST', `/api/patient/family/switch/${guardian.no_rm}`, actingToken);
    assert.equal(back.status, 200);
    assert.equal(back.body.acting_as_guardian, false);
    const selfToken = back.body.token as string;
    assert.equal((await pat('GET', '/api/patient/profile', selfToken)).body.profile.no_rm, guardian.no_rm);

    // Lepas tautan -> peralihan ditolak.
    assert.equal((await pat('DELETE', `/api/patient/family/${stranger.no_rm}`, selfToken)).status, 404);
    const del = await pat('DELETE', `/api/patient/family/${child2.no_rm}`, selfToken);
    assert.equal(del.status, 200);
    assert.equal((await pat('POST', `/api/patient/family/switch/${child2.no_rm}`, selfToken)).status, 403);
    guardianToken = selfToken;
  });

  test('tanggungan dapat mencabut akses wali', async () => {
    const child3 = await createTestPatient(core, 'test-token', { nama: 'Anak Ketiga', no_hp: '081211110005' });
    const req = await pat('POST', '/api/patient/family/link/request', guardianToken, { no_rm: child3.no_rm, hubungan: 'orang_tua' });
    const code = sender.lastCodeFor(toE164('081211110005'))!;
    assert.equal((await pat('POST', '/api/patient/family/link/verify', guardianToken, { request_id: req.body.request_id, code })).status, 201);
    const revoke = await pat('DELETE', `/api/patient/family/${guardian.no_rm}`, createTestPatientSession(child3.no_rm));
    assert.equal(revoke.status, 200);
    assert.equal((await pat('POST', `/api/patient/family/switch/${child3.no_rm}`, guardianToken)).status, 403);
  });

  test('menautkan diri sendiri ditolak', async () => {
    const res = await pat('POST', '/api/patient/family/link/request', guardianToken, { no_rm: guardian.no_rm, hubungan: 'anak' });
    assert.equal(res.status, 400);
  });
});

describe('penilaian layanan', () => {
  let ownDone = '';
  let ownWaiting = '';
  let otherDone = '';

  async function createAppointment(noRm: string, status: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 3));
    const res = await staff('POST', '/api/v1/appointments', 'test-token', { no_rm: noRm, poli: 'Poli Umum', dokter: 'dr. Uji' });
    assert.equal(res.status, 201);
    if (status !== 'Menunggu') {
      assert.equal((await staff('PATCH', `/api/v1/appointments/${res.body.data.id}`, 'test-token', { status })).status, 200);
    }
    return res.body.data.id;
  }

  before(async () => {
    ownDone = await createAppointment(stranger.no_rm, 'Selesai');
    ownWaiting = await createAppointment(stranger.no_rm, 'Menunggu');
    otherDone = await createAppointment(guardian.no_rm, 'Selesai');
  });

  test('hanya untuk kunjungan sendiri yang selesai; sekali per kunjungan', async () => {
    const token = createTestPatientSession(stranger.no_rm);
    const pending = await pat('GET', '/api/patient/feedback', token);
    assert.ok(pending.body.pending_visits.some((v: any) => v.appointment_id === ownDone));
    assert.ok(!pending.body.pending_visits.some((v: any) => v.appointment_id === otherDone));

    const other = await pat('POST', '/api/patient/feedback', token, { appointment_id: otherDone, rating: 5, kategori: 'pelayanan' });
    assert.equal(other.status, 404);
    const waiting = await pat('POST', '/api/patient/feedback', token, { appointment_id: ownWaiting, rating: 5, kategori: 'pelayanan' });
    assert.equal(waiting.status, 409);
    assert.equal(waiting.body.code, 'VISIT_NOT_COMPLETED');
    const badRating = await pat('POST', '/api/patient/feedback', token, { appointment_id: ownDone, rating: 6, kategori: 'pelayanan' });
    assert.equal(badRating.status, 422);
    const badCat = await pat('POST', '/api/patient/feedback', token, { rating: 4, kategori: 'xx' });
    assert.equal(badCat.status, 422);

    const ok = await pat('POST', '/api/patient/feedback', token, { appointment_id: ownDone, rating: 4, komentar: 'Ramah', kategori: 'dokter' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.feedback.poli, 'Poli Umum');
    const dup = await pat('POST', '/api/patient/feedback', token, { appointment_id: ownDone, rating: 5, kategori: 'dokter' });
    assert.equal(dup.status, 409);
    const after = await pat('GET', '/api/patient/feedback', token);
    assert.equal(after.body.feedback.length, 1);
    assert.ok(!after.body.pending_visits.some((v: any) => v.appointment_id === ownDone));
  });

  test('batas penilaian harian', async () => {
    const p = await createTestPatient(core, 'test-token', { nama: 'Penilai Banyak', no_hp: '081211110006' });
    const token = createTestPatientSession(p.no_rm);
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      last = (await pat('POST', '/api/patient/feedback', token, { rating: 3, kategori: 'aplikasi' })).status;
    }
    assert.equal(last, 429);
  });

  test('petugas mutu melihat ringkasan; peran lain ditolak', async () => {
    assert.equal((await staff('GET', '/api/v1/patient-feedback', 'kasir-token')).status, 403);
    const res = await staff('GET', '/api/v1/patient-feedback', 'mutu-token');
    assert.equal(res.status, 200);
    assert.ok(res.body.summary.total >= 1);
  });
});

describe('pengaduan pasien', () => {
  test('nomor tiket acak; pasien hanya melihat miliknya; petugas mutu menindaklanjuti', async () => {
    const tokenA = createTestPatientSession(stranger.no_rm);
    const tokenB = createTestPatientSession(child.no_rm);
    assert.equal((await pat('POST', '/api/patient/complaints', undefined, { kategori: 'pelayanan', isi: 'Antrean terlalu lama sekali' })).status, 401);
    assert.equal((await pat('POST', '/api/patient/complaints', tokenA, { kategori: 'pelayanan', isi: 'pendek' })).status, 422);

    const a1 = await pat('POST', '/api/patient/complaints', tokenA, { kategori: 'pelayanan', isi: 'Antrean terlalu lama sekali', kontak_balik: 'a@contoh.id' });
    const a2 = await pat('POST', '/api/patient/complaints', tokenA, { kategori: 'fasilitas', isi: 'Toilet lantai dua rusak' });
    assert.equal(a1.status, 201);
    assert.match(a1.body.ticket_no, /^ADU-\d{6}-[A-Z2-9]{8}$/);
    assert.notEqual(a1.body.ticket_no, a2.body.ticket_no);
    await pat('POST', '/api/patient/complaints', tokenB, { kategori: 'biaya', isi: 'Rincian tagihan tidak jelas' });

    const own = await pat('GET', '/api/patient/complaints', tokenA);
    assert.equal(own.body.complaints.length, 2);
    assert.ok(own.body.complaints.every((c: any) => !('patient_rm' in c) && !('catatan_internal' in c)));

    // Staf: wajib auth + scope mutu.
    assert.equal((await call(core, 'GET', '/api/v1/patient-complaints')).status, 401);
    assert.equal((await staff('GET', '/api/v1/patient-complaints', 'kasir-token')).status, 403);
    assert.equal((await staff('PATCH', `/api/v1/patient-complaints/${a1.body.complaint.id}`, 'kasir-token', { status: 'Diproses' })).status, 403);
    const list = await staff('GET', '/api/v1/patient-complaints?status=Diterima', 'mutu-token');
    assert.equal(list.status, 200);
    assert.ok(list.body.data.length >= 3);

    const bad = await staff('PATCH', `/api/v1/patient-complaints/${a1.body.complaint.id}`, 'mutu-token', { status: 'Hilang' });
    assert.equal(bad.status, 422);
    const upd = await staff('PATCH', `/api/v1/patient-complaints/${a1.body.complaint.id}`, 'mutu-token', {
      status: 'Selesai',
      tanggapan: 'Kami menambah petugas loket pagi.',
      catatan_internal: 'Rapat unit 12/11'
    });
    assert.equal(upd.status, 200);
    const mine = (await pat('GET', '/api/patient/complaints', tokenA)).body.complaints.find((c: any) => c.ticket_no === a1.body.ticket_no);
    assert.equal(mine.status, 'Selesai');
    assert.equal(mine.tanggapan, 'Kami menambah petugas loket pagi.');
    assert.equal(mine.catatan_internal, undefined);
  });
});
