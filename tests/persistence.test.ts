import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createPersistenceRepository,
  HybridAdapter,
  MemoryPersistenceRepository,
  type CloudPersistenceRepository,
  type OutboxEntry,
  type PersistenceChange,
  type PersistenceEntity,
  type PersistenceHealth,
  type PersistenceRepository,
  type PrimaryPersistenceRepository,
  type StoredRecord
} from '../src/server/databaseAdapter';

class FakePrimaryRepository implements PrimaryPersistenceRepository {
  readonly mode = 'mysql' as const;
  private readonly records = new Map<PersistenceEntity, Map<string, unknown>>();
  private readonly outbox: OutboxEntry[] = [];
  private nextOutboxId = 1;

  constructor(private readonly online = true) {
    for (const entity of [
      'patients', 'registrations', 'queues', 'emr_soap', 'prescriptions',
      'billings', 'qr_tokens', 'audit_logs', 'beds', 'inventory',
      'documents', 'bookings', 'system_data'
    ] as const) {
      this.records.set(entity, new Map());
    }
  }

  async health(): Promise<PersistenceHealth> {
    return {
      mode: this.mode,
      mysqlConnected: this.online,
      firebaseConnected: false,
      persistentReady: this.online,
      pendingSync: this.outbox.length
    };
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    if (!this.online) throw new Error('simulated MySQL outage');
    return (this.records.get(entity)?.get(id) as T | undefined) ?? null;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    if (!this.online) throw new Error('simulated MySQL outage');
    return [...(this.records.get(entity) || new Map())].map(([id, data]) => ({
      id,
      data: structuredClone(data) as T
    }));
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    if (!this.online) throw new Error('simulated MySQL outage');
    for (const change of changes) {
      const entityRecords = this.records.get(change.entity)!;
      if (change.data === null) entityRecords.delete(change.id);
      else entityRecords.set(change.id, structuredClone(change.data));
    }
  }

  async commitWithOutbox(localChanges: PersistenceChange[], cloudChanges: PersistenceChange[]): Promise<void> {
    await this.commit(localChanges);
    for (const change of cloudChanges) {
      this.outbox.push({ ...structuredClone(change), outboxId: this.nextOutboxId++ });
    }
  }

  async getPendingOutbox(limit: number): Promise<OutboxEntry[]> {
    return this.outbox.slice(0, limit).map((entry) => structuredClone(entry));
  }

  async markOutboxSynced(ids: number[]): Promise<void> {
    const synced = new Set(ids);
    for (let index = this.outbox.length - 1; index >= 0; index -= 1) {
      if (synced.has(this.outbox[index].outboxId)) this.outbox.splice(index, 1);
    }
  }

  async markOutboxFailed(): Promise<void> {}

  async commitImportedBookings(changes: PersistenceChange[]): Promise<void> {
    await this.commit(changes);
  }

  async pendingCount(): Promise<number> {
    return this.outbox.length;
  }

  async close(): Promise<void> {}
}

class FakeCloudRepository implements CloudPersistenceRepository {
  readonly mode = 'firebase' as const;
  private readonly records = new MemoryPersistenceRepository();
  online = false;

  async health(): Promise<PersistenceHealth> {
    return {
      mode: this.mode,
      mysqlConnected: false,
      firebaseConnected: this.online,
      persistentReady: this.online,
      pendingSync: 0,
      ...(this.online ? {} : { lastError: 'simulated offline state' })
    };
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    if (!this.online) throw new Error('simulated offline state');
    return this.records.get<T>(entity, id);
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    if (!this.online) throw new Error('simulated offline state');
    return this.records.list<T>(entity);
  }

  async listBookings(): Promise<Array<StoredRecord<unknown>>> {
    return this.list('bookings');
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    if (!this.online) throw new Error('simulated offline state');
    await this.records.commit(changes);
  }

  async close(): Promise<void> {}
}

describe('konfigurasi adapter persistence', () => {
  test('mode mysql, firebase, hybrid, dan memory dapat diinisialisasi', async () => {
    const mysql = new FakePrimaryRepository();
    const firebase = new FakeCloudRepository();
    const modes: Array<[string, PersistenceRepository]> = [
      ['memory', await createPersistenceRepository({ mode: 'memory' })],
      ['mysql', await createPersistenceRepository({ mode: 'mysql', mysql })],
      ['firebase', await createPersistenceRepository({ mode: 'firebase', firebase })],
      ['hybrid', await createPersistenceRepository({ mode: 'hybrid', mysql, firebase })]
    ];

    for (const [mode, repository] of modes) {
      const health = await repository.health();
      assert.equal(health.mode, mode);
    }
  });
});

describe('alur klinis pada repository', () => {
  test('pendaftaran, antrean, SOAP, farmasi, kasir, QR, dan audit dapat ditulis lalu dibaca', async () => {
    const repository = new MemoryPersistenceRepository();
    const workflow: PersistenceChange[] = [
      { entity: 'patients', id: 'patient-1', data: { no_rm: 'RM-TEST-1', nama: 'Pasien Uji' } },
      { entity: 'registrations', id: 'visit-1', data: { patientId: 'patient-1', status: 'registered' } },
      { entity: 'queues', id: 'queue-1', data: { visitId: 'visit-1', status: 'checked-in' } },
      { entity: 'emr_soap', id: 'soap-1', data: { visitId: 'visit-1', assessment: 'Tes' } },
      { entity: 'prescriptions', id: 'prescription-1', data: { visitId: 'visit-1', status: 'dispensed' } },
      { entity: 'billings', id: 'billing-1', data: { visitId: 'visit-1', status: 'paid' } },
      { entity: 'qr_tokens', id: 'token-hash-1', data: { subject: 'visit-1', consumedAt: '2026-11-21T00:00:00Z' } },
      { entity: 'audit_logs', id: 'audit-1', data: { action: 'CHECK_IN' } }
    ];

    await repository.commit(workflow);
    for (const record of workflow) {
      assert.deepEqual(await repository.get(record.entity, record.id), record.data);
    }
  });
});

describe('replikasi hybrid dan outbox', () => {
  test('tulis lokal berhasil saat Firestore offline lalu tersinkron saat online', async () => {
    const mysql = new FakePrimaryRepository();
    const firebase = new FakeCloudRepository();
    const hybrid = new HybridAdapter(mysql, firebase);
    const change: PersistenceChange = {
      entity: 'registrations',
      id: 'visit-offline-1',
      data: {
        status: 'booked',
        no_rm: 'RM-1001',
        pasien_nama: 'Pasien Privat',
        tanggal: '2026-11-21',
        poli: 'Poli Uji'
      }
    };

    await hybrid.commit([change]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(await hybrid.get('registrations', change.id), change.data);
    assert.equal((await hybrid.health()).pendingSync, 1);

    firebase.online = true;
    await hybrid.syncPending();
    assert.deepEqual(await firebase.get('registrations', change.id), {
      status: 'booked',
      tanggal: '2026-11-21',
      poli: 'Poli Uji'
    });
    assert.equal((await hybrid.health()).pendingSync, 0);
    await hybrid.close();
  });

  test('booking Firestore yang tervalidasi diimpor ke pendaftaran MySQL', async () => {
    const mysql = new FakePrimaryRepository();
    const firebase = new FakeCloudRepository();
    const hybrid = new HybridAdapter(mysql, firebase);
    firebase.online = true;
    await firebase.commit([{
      entity: 'bookings',
      id: 'external-visit-1',
      data: {
        pasien_id: 'patient-1',
        pasien_nama: 'Pasien Uji',
        no_rm: 'RM-EXT-1',
        poli: 'Poli Umum',
        dokter: 'dr. Uji',
        tanggal: '2026-11-21',
        jam_praktek: '09:00',
        nomor_antrian: 'UM-001',
        status: 'Menunggu',
        tipe: 'Rawat Jalan',
        created_at: '2026-11-21T00:00:00.000Z'
      }
    }]);

    await hybrid.syncExternalBookings();
    assert.equal((await mysql.get('registrations', 'external-visit-1') as { no_rm: string }).no_rm, 'RM-EXT-1');
    await hybrid.close();
  });
});

describe('integrasi Express dengan persistence', () => {
  test('perubahan API tersimpan sebelum respons sukses dan tersedia setelah app dibuat ulang', async () => {
    const previousEnv = {
      vercel: process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV,
      sessionSecret: process.env.SESSION_SECRET,
      demoAuth: process.env.ALLOW_INSECURE_DEMO_AUTH
    };
    process.env.VERCEL = '1';
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'persistence-integration-test-secret';
    process.env.ALLOW_INSECURE_DEMO_AUTH = 'true';
    const durableStore = new FakePrimaryRepository();
    const token = 'persistence-test-token';
    const auth = {
      resolvePrincipal: async (value: string) => value === token
        ? { uid: 'tester', email: 'tester@example.test', roleId: 'super_admin', mfaVerified: true }
        : null
    };
    const servers: http.Server[] = [];

    async function start(app: http.RequestListener): Promise<string> {
      const server = http.createServer(app);
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address() as AddressInfo;
      return `http://127.0.0.1:${address.port}`;
    }

    async function closeServers(): Promise<void> {
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    }

    try {
      const { createApps, addErrorHandler } = await import('../server');
      const first = await createApps(auth, { mode: 'mysql', mysql: durableStore });
      addErrorHandler(first.app);
      const firstUrl = await start(first.app);
      const created = await fetch(`${firstUrl}/api/v1/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nama: 'Pasien Persisten',
          tanggal_lahir: '1990-01-02',
          jenis_kelamin: 'P',
          alamat: 'Alamat Uji'
        })
      });
      const createdBody = await created.json() as { data: { id: string; nama: string } };
      assert.equal(created.status, 201);
      assert.deepEqual(await durableStore.get('patients', createdBody.data.id), createdBody.data);

      const patientUpdate = await fetch(`${firstUrl}/api/v1/patients/${createdBody.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alamat: 'Alamat Baru' })
      });
      assert.equal(patientUpdate.status, 200);
      assert.equal((await durableStore.get<{ alamat: string }>('patients', createdBody.data.id))?.alamat, 'Alamat Baru');

      const appointment = await fetch(`${firstUrl}/api/v1/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pasien_id: createdBody.data.id,
          poli: 'POL-TEST',
          dokter: 'D-TEST',
          tanggal: '2026-11-21'
        })
      });
      const appointmentBody = await appointment.json() as { data: { id: string } };
      assert.equal(appointment.status, 201);
      assert.ok(await durableStore.get('registrations', appointmentBody.data.id));

      const appointmentUpdate = await fetch(`${firstUrl}/api/v1/appointments/${appointmentBody.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'Diperiksa' })
      });
      assert.equal(appointmentUpdate.status, 200);
      assert.equal(
        (await durableStore.get<{ status: string }>('registrations', appointmentBody.data.id))?.status,
        'Diperiksa'
      );

      const systemDataValue = JSON.stringify([{ id: 'POL-TEST', nama: 'Poli Persisten' }]);
      const systemDataWrite = await fetch(`${firstUrl}/api/v1/system-data/hospital_poli_master`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Storage-Mode': 'mysql'
        },
        body: JSON.stringify({ data: systemDataValue })
      });
      assert.equal(systemDataWrite.status, 200);
      assert.deepEqual(await durableStore.get('system_data', 'hospital_poli_master'), {
        key: 'hospital_poli_master',
        data: systemDataValue,
        updatedAt: (await systemDataWrite.json() as { updatedAt: string }).updatedAt
      });

      const restarted = await createApps(auth, { mode: 'mysql', mysql: durableStore });
      addErrorHandler(restarted.app);
      const restartedUrl = await start(restarted.app);
      const listed = await fetch(`${restartedUrl}/api/v1/patients?q=Pasien%20Persisten`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const listedBody = await listed.json() as { data: Array<{ id: string }> };
      assert.equal(listed.status, 200);
      assert.equal(listedBody.data[0]?.id, createdBody.data.id);
      const systemDataRead = await fetch(`${restartedUrl}/api/v1/system-data/hospital_poli_master`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Storage-Mode': 'mysql' }
      });
      assert.equal(systemDataRead.status, 200);
      assert.equal((await systemDataRead.json() as { data: string }).data, systemDataValue);
      // Header X-Storage-Mode dari browser hanya label build (Cloudflare: d1, server: firestore); server mengabaikannya.
      const mismatchedMode = await fetch(`${restartedUrl}/api/v1/system-data/hospital_poli_master`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Storage-Mode': 'hybrid' }
      });
      assert.equal(mismatchedMode.status, 200);

      const offline = await createApps(auth, {
        mode: 'mysql',
        mysql: new FakePrimaryRepository(false)
      });
      addErrorHandler(offline.app);
      const offlineUrl = await start(offline.app);
      const rejectedWrite = await fetch(`${offlineUrl}/api/v1/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nama: 'Tidak Tersimpan',
          tanggal_lahir: '1990-01-02',
          jenis_kelamin: 'P',
          alamat: 'Alamat Uji'
        })
      });
      assert.equal(rejectedWrite.status, 503);
      assert.equal((await rejectedWrite.json() as { code: string }).code, 'PERSISTENCE_UNAVAILABLE');
      const degradedHealth = await fetch(`${offlineUrl}/api/v1/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const healthBody = await degradedHealth.json() as { status: string; storage: { mysqlConnected: boolean } };
      assert.equal(healthBody.status, 'DEGRADED');
      assert.equal(healthBody.storage.mysqlConnected, false);
    } finally {
      await closeServers();
      if (previousEnv.vercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousEnv.vercel;
      if (previousEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv.nodeEnv;
      if (previousEnv.sessionSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousEnv.sessionSecret;
      if (previousEnv.demoAuth === undefined) delete process.env.ALLOW_INSECURE_DEMO_AUTH;
      else process.env.ALLOW_INSECURE_DEMO_AUTH = previousEnv.demoAuth;
    }
  });
});
