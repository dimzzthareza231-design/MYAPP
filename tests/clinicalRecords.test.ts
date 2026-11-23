// Rute klinis inti (SOAP RME, e-resep, tagihan kasir) diuji end-to-end lewat Express
// terhadap D1Adapter di atas SQLite sungguhan (node:sqlite + migrations/0001_init.sql).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1DatabaseLike, D1PreparedStatementLike, PersistenceFactoryOptions } from '../src/server/databaseAdapter';

process.env.VERCEL = '1';
process.env.SESSION_SECRET = 'clinical-records-test-secret';
process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
delete process.env.GEMINI_API_KEY;

const ROLE_TOKENS: Record<string, string> = {
  'dokter-token': 'dokter',
  'perawat-token': 'perawat',
  'apoteker-token': 'apoteker',
  'kasir-token': 'kasir',
  'pendaftaran-token': 'pendaftaran',
  'admin-token': 'super_admin'
};

const auth = {
  resolvePrincipal: async (token: string) => {
    const roleId = ROLE_TOKENS[token];
    return roleId ? { uid: roleId, email: `${roleId}@test.local`, roleId, mfaVerified: true } : null;
  }
};

function createD1Shim(db: DatabaseSync, control: { failWrites: boolean }): D1DatabaseLike {
  const prepare = (query: string, values: unknown[] = []): D1PreparedStatementLike => ({
    bind: (...next) => prepare(query, next),
    first: async <T>() => (db.prepare(query).get(...(values as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(query).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(query).run(...(values as never[]))
  });
  return {
    prepare: (query) => prepare(query),
    batch: async (statements) => {
      if (control.failWrites) throw new Error('simulated D1 outage');
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

const servers: http.Server[] = [];
async function startApp(options: PersistenceFactoryOptions): Promise<string> {
  const { createApps, addErrorHandler } = await import('../server');
  const { app } = await createApps(auth, options);
  addErrorHandler(app);
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

after(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function call(base: string, method: string, path: string, token: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

const soapPayload = {
  kunjungan_id: 'KJ-TEST-001',
  no_rm: 'RM-TEST-0001',
  pasien_nama: 'Pasien Fiktif Uji',
  subjective: { keluhan_utama: 'Pusing sejak dua hari' },
  objective: { tanda_vital: { tekanan_darah: '150/95' } },
  assessment: { diagnosis_primer: { code: 'I10', name: 'Hipertensi esensial' } },
  plan: { edukasi: 'Diet rendah garam' },
  ai_governance_status: 'HUMAN_VERIFIED'
};

const prescriptionPayload = {
  id: 'RXP-TEST-001',
  kunjungan_id: 'KJ-TEST-001',
  no_rm: 'RM-TEST-0001',
  nama_pasien: 'Pasien Fiktif Uji',
  dokter_penulis: 'dr. Uji Coba',
  kode_icd10: 'I10',
  items: [{ id: 'IT-1', nama_obat: 'Amlodipin 5 mg', jumlah: 30, signa: '1 x 1' }],
  total_biaya_obat: 15000,
  jasa_embalase: 2000,
  total_tagihan: 17000
};

const billingPayload = {
  id: 'BIL-TEST-001',
  kunjunganId: 'KJ-TEST-001',
  noRm: 'RM-TEST-0001',
  namaPasien: 'Pasien Fiktif Uji',
  tipeLayanan: 'Rawat Jalan',
  status: 'Belum Lunas',
  items: [
    { id: 'I-1', kategori: 'Konsultasi', deskripsi: 'Konsultasi dokter', jumlah: 1, hargaSatuan: 100000, total: 100000 },
    { id: 'I-2', kategori: 'Farmasi', deskripsi: 'Obat resep', jumlah: 1, hargaSatuan: 17000, total: 17000 }
  ],
  subtotal: 117000,
  diskonTotal: 0,
  pajak: 0,
  biayaAdministrasi: 10000,
  totalTagihan: 127000,
  uangMukaDeposit: 0,
  sisaTagihan: 127000,
  jumlahDibayar: 0,
  kembalian: 0,
  metodePembayaran: 'Tunai'
};

describe('persistensi klinis inti pada D1', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const control = { failWrites: false };
  const d1 = createD1Shim(db, control);
  let base = '';
  let soapId = '';

  before(async () => {
    base = await startApp({ mode: 'd1', d1 });
  });

  test('SOAP dibuat, diperbarui, difinalisasi DPJP lalu terkunci', async () => {
    const created = await call(base, 'POST', '/api/v1/dossier/soap', 'perawat-token', soapPayload, { 'X-Storage-Mode': 'd1' });
    assert.equal(created.status, 201);
    assert.equal(created.body.storageMode, 'd1');
    assert.equal(created.body.data.version, 1);
    assert.equal(created.body.data.created_by, 'perawat@test.local');
    soapId = created.body.data.id;

    const stored = db.prepare('SELECT payload FROM emr_soap WHERE id = ?').get(soapId) as { payload: string };
    assert.equal(JSON.parse(stored.payload).assessment.diagnosis_primer.code, 'I10');

    const stale = await call(base, 'PUT', `/api/v1/dossier/soap/${soapId}`, 'perawat-token', { ...soapPayload, version: 7 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'VERSION_CONFLICT');

    const nurseFinal = await call(base, 'PUT', `/api/v1/dossier/soap/${soapId}`, 'perawat-token', { ...soapPayload, status: 'Final' });
    assert.equal(nurseFinal.status, 403);
    assert.equal(nurseFinal.body.code, 'DPJP_SIGNATURE_REQUIRED');

    const finalized = await call(base, 'PUT', `/api/v1/dossier/soap/${soapId}`, 'dokter-token', { ...soapPayload, status: 'Final', version: 1 });
    assert.equal(finalized.status, 200);
    assert.equal(finalized.body.data.version, 2);
    assert.equal(finalized.body.data.ai_governance_status, 'FINAL');
    assert.equal(finalized.body.data.finalized_by, 'dokter@test.local');

    const locked = await call(base, 'PUT', `/api/v1/dossier/soap/${soapId}`, 'dokter-token', soapPayload);
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'SOAP_FINALIZED');

    const byVisit = await call(base, 'GET', '/api/v1/dossier/soap?kunjungan_id=KJ-TEST-001', 'dokter-token');
    assert.equal(byVisit.status, 200);
    assert.equal(byVisit.body.total, 1);
  });

  test('e-resep ditulis DPJP dan dilayani farmasi lewat scope masing-masing', async () => {
    const created = await call(base, 'POST', '/api/v1/dossier/prescriptions', 'dokter-token', prescriptionPayload);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.id, 'RXP-TEST-001');
    assert.equal(created.body.data.status, 'Menunggu Telaah');
    assert.match(created.body.data.no_resep, /^RX-/);

    const duplicate = await call(base, 'POST', '/api/v1/dossier/prescriptions', 'dokter-token', prescriptionPayload);
    assert.equal(duplicate.status, 409);

    // Apoteker tidak memiliki scope rekam-medis; dokter tidak memiliki scope inventory.
    assert.equal((await call(base, 'GET', '/api/v1/dossier/prescriptions', 'apoteker-token')).status, 403);
    assert.equal((await call(base, 'PUT', '/api/v1/inventory/prescriptions/RXP-TEST-001', 'dokter-token', prescriptionPayload)).status, 403);

    const queue = await call(base, 'GET', '/api/v1/inventory/prescriptions?status=Menunggu%20Telaah', 'apoteker-token');
    assert.equal(queue.status, 200);
    assert.equal(queue.body.total, 1);

    const tampered = await call(base, 'PUT', '/api/v1/inventory/prescriptions/RXP-TEST-001', 'apoteker-token', {
      ...queue.body.data[0], no_rm: 'RM-LAIN'
    });
    assert.equal(tampered.status, 422);
    assert.equal(tampered.body.code, 'PRESCRIPTION_IDENTITY_IMMUTABLE');

    const dispensed = await call(base, 'PUT', '/api/v1/inventory/prescriptions/RXP-TEST-001', 'apoteker-token', {
      ...queue.body.data[0], status: 'Selesai Terlayani'
    });
    assert.equal(dispensed.status, 200);
    assert.equal(dispensed.body.data.updated_by, 'apoteker@test.local');

    const afterDone = await call(base, 'PUT', '/api/v1/inventory/prescriptions/RXP-TEST-001', 'apoteker-token', dispensed.body.data);
    assert.equal(afterDone.status, 409);
    const doctorEdit = await call(base, 'PUT', '/api/v1/dossier/prescriptions/RXP-TEST-001', 'dokter-token', prescriptionPayload);
    assert.equal(doctorEdit.status, 409);
    assert.equal(doctorEdit.body.code, 'PRESCRIPTION_IN_PHARMACY');
  });

  test('tagihan dibuat, dilunasi kasir, lalu terkunci', async () => {
    const created = await call(base, 'POST', '/api/v1/billing/invoices', 'kasir-token', billingPayload);
    assert.equal(created.status, 201);
    assert.match(created.body.data.noBilling, /^BIL-/);

    const mismatch = await call(base, 'PUT', '/api/v1/billing/invoices/BIL-TEST-001', 'kasir-token', { ...billingPayload, subtotal: 1 });
    assert.equal(mismatch.status, 422);
    assert.equal(mismatch.body.code, 'BILLING_SUBTOTAL_MISMATCH');

    const unsettled = await call(base, 'PUT', '/api/v1/billing/invoices/BIL-TEST-001', 'kasir-token', { ...billingPayload, status: 'Lunas' });
    assert.equal(unsettled.status, 422);

    const paid = await call(base, 'PUT', '/api/v1/billing/invoices/BIL-TEST-001', 'kasir-token', {
      ...created.body.data, status: 'Lunas', sisaTagihan: 0, jumlahDibayar: 127000, noKwitansi: 'KW-TEST-1'
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.paid_by, 'kasir@test.local');

    const locked = await call(base, 'PUT', '/api/v1/billing/invoices/BIL-TEST-001', 'kasir-token', paid.body.data);
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'BILLING_LOCKED');

    assert.equal((await call(base, 'GET', '/api/v1/billing/invoices', 'dokter-token')).status, 403);
  });

  test('kegagalan tulis D1 mengembalikan 503 dan tidak mengubah store', async () => {
    control.failWrites = true;
    try {
      const failed = await call(base, 'POST', '/api/v1/billing/invoices', 'kasir-token', { ...billingPayload, id: 'BIL-TEST-FAIL' });
      assert.equal(failed.status, 503);
      assert.equal(failed.body.code, 'PERSISTENCE_UNAVAILABLE');
    } finally {
      control.failWrites = false;
    }
    assert.equal((await call(base, 'GET', '/api/v1/billing/invoices/BIL-TEST-FAIL', 'kasir-token')).status, 404);
  });

  test('data klinis dan jejak audit tetap ada setelah aplikasi dibuat ulang', async () => {
    const restarted = await startApp({ mode: 'd1', d1 });
    const soap = await call(restarted, 'GET', `/api/v1/dossier/soap/${soapId}`, 'dokter-token');
    assert.equal(soap.status, 200);
    assert.equal(soap.body.data.status, 'Final');
    assert.equal(soap.body.data.version, 2);

    const rx = await call(restarted, 'GET', '/api/v1/inventory/prescriptions/RXP-TEST-001', 'apoteker-token');
    assert.equal(rx.body.data.status, 'Selesai Terlayani');

    const bill = await call(restarted, 'GET', '/api/v1/billing/invoices/BIL-TEST-001', 'kasir-token');
    assert.equal(bill.body.data.status, 'Lunas');

    const logs = await call(restarted, 'GET', '/api/v1/audit/logs?limit=200', 'admin-token');
    const actions = new Set((logs.body.data as Array<{ action: string }>).map((entry) => entry.action));
    for (const action of ['CREATE_SOAP', 'FINALIZE_SOAP', 'CREATE_PRESCRIPTION', 'DISPENSE_PRESCRIPTION', 'CREATE_BILLING', 'SETTLE_BILLING']) {
      assert.ok(actions.has(action), `audit ${action} tersimpan`);
    }
  });
});

describe('validasi dan kontrol akses rute klinis (mode memory)', () => {
  let base = '';
  before(async () => {
    base = await startApp({ mode: 'memory' });
  });

  test('payload tidak valid ditolak', async () => {
    const unknown = await call(base, 'POST', '/api/v1/dossier/soap', 'dokter-token', { ...soapPayload, injected: true });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.code, 'UNKNOWN_FIELD');

    const { no_rm: _omitted, ...withoutRm } = soapPayload;
    const missing = await call(base, 'POST', '/api/v1/dossier/soap', 'dokter-token', withoutRm);
    assert.equal(missing.status, 400);
    assert.equal(missing.body.field, 'no_rm');

    const emptyRx = await call(base, 'POST', '/api/v1/dossier/prescriptions', 'dokter-token', { ...prescriptionPayload, items: [] });
    assert.equal(emptyRx.status, 422);

    const negative = await call(base, 'POST', '/api/v1/billing/invoices', 'kasir-token', { ...billingPayload, totalTagihan: -5 });
    assert.equal(negative.status, 422);
  });

  test('peran non-klinis tidak dapat menulis SOAP atau resep', async () => {
    const clerk = await call(base, 'POST', '/api/v1/dossier/soap', 'pendaftaran-token', soapPayload);
    assert.equal(clerk.status, 403);
    assert.equal(clerk.body.code, 'CLINICAL_ROLE_REQUIRED');
    const nurseRx = await call(base, 'POST', '/api/v1/dossier/prescriptions', 'perawat-token', prescriptionPayload);
    assert.equal(nurseRx.status, 403);
  });

  test('mode penyimpanan klien yang berbeda ditolak', async () => {
    const mismatch = await call(base, 'GET', '/api/v1/dossier/soap', 'dokter-token', undefined, { 'X-Storage-Mode': 'd1' });
    assert.equal(mismatch.status, 503);
    assert.equal(mismatch.body.code, 'STORAGE_MODE_MISMATCH');
  });
});

describe('fail-closed saat penyimpanan persisten tidak siap', () => {
  test('rute klinis menolak baca dan tulis', async () => {
    const db = new DatabaseSync(':memory:'); // tanpa migrasi: health check D1 gagal
    const base = await startApp({ mode: 'd1', d1: createD1Shim(db, { failWrites: false }) });
    const read = await call(base, 'GET', '/api/v1/dossier/soap', 'dokter-token');
    assert.equal(read.status, 503);
    assert.equal(read.body.code, 'PERSISTENCE_UNAVAILABLE');
    const write = await call(base, 'POST', '/api/v1/billing/invoices', 'kasir-token', billingPayload);
    assert.equal(write.status, 503);
  });
});
