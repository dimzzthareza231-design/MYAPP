import { test } from 'node:test';
import assert from 'node:assert/strict';

class TestStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

class TestCustomEvent extends Event {
  detail: unknown;

  constructor(type: string, init?: CustomEventInit) {
    super(type);
    this.detail = init?.detail;
  }
}

test('clinical storage sync protects legacy data and writes versioned changes', async () => {
  const global = globalThis as unknown as Record<string, unknown>;
  const keys = ['Storage', 'localStorage', 'window', 'document', 'CustomEvent', 'fetch'];
  const descriptors = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new TestStorage();
  const requests: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];
  let clinicalReadCount = 0;
  let clinicalCollectionVersion = 'clinical-collection-v1';
  const serverRecord = { id: 'BIL-SYNC-001', noBilling: 'BIL-SYNC-001', totalTagihan: 10000 };
  const legacyRecord = { id: 'BIL-DEMO-001', noBilling: 'BIL-DEMO-001', totalTagihan: 5000 };
  const newRecord = { id: 'BIL-REAL-001', noBilling: 'BIL-REAL-001', totalTagihan: 12000 };
  let serverRecords: Array<{ id: string; data: Record<string, unknown>; version: string }> = [
    { id: serverRecord.id, data: serverRecord, version: 'billing-v1' }
  ];
  let forceModuleConflict = false;

  Object.defineProperty(globalThis, 'Storage', { configurable: true, value: TestStorage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: () => true } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: TestCustomEvent });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);
      const method = init?.method || 'GET';
      requests.push({
        url: requestUrl,
        method,
        headers: new Headers(init?.headers),
        body: init?.body === undefined ? undefined : String(init.body)
      });
      if (requestUrl.endsWith('/module-data/hospital_conflict_test') && method === 'PUT' && forceModuleConflict) {
        return new Response(JSON.stringify({ code: 'MODULE_DATA_CONFLICT', version: 'module-v2' }), { status: 412 });
      }
      if (requestUrl.endsWith('/module-data/hospital_conflict_test') && method === 'GET') {
        return Response.json({ data: 'server-latest', version: 'module-v2' });
      }
      if (requestUrl.includes('/api/v1/clinical-records/') && method === 'GET') {
        if (new Headers(init?.headers).get('if-none-match') === `"${clinicalCollectionVersion}"`) {
          return new Response(null, { status: 304 });
        }
        clinicalReadCount += 1;
        const isBillings = requestUrl.includes('/clinical-records/billings?');
        const billings = isBillings ? serverRecords : [];
        return Response.json({
          data: billings.filter(({ data }) => typeof data.deletedAt !== 'string'),
          deletedIds: billings.filter(({ data }) => typeof data.deletedAt === 'string').map(({ id }) => id),
          totalPages: isBillings && billings.length ? 1 : 0,
          collectionVersion: clinicalCollectionVersion
        });
      }
      if (requestUrl.includes('/api/v1/clinical-records/') && method === 'PUT') {
        return Response.json({ success: true, version: 'billing-v2' });
      }
      return Response.json({ index: {} });
    }
  });

  try {
    const sync = await import('../src/lib/moduleSync');
    assert.equal(sync.isSyncedKey('hospital_clinical_record_versions'), false);
    assert.equal(sync.isSyncedKey('hospital_clinical_collection_versions'), false);
    assert.equal(sync.isSyncedKey('hospital_clinical_record_deferred'), false);
    assert.equal(sync.isSyncedKey('simrs_satusehat_config'), false);
    assert.equal(sync.isSyncedKey('bpjs_klaim'), false);
    assert.equal(sync.isSyncedKey('simrs_bpjs_claims'), false);
    assert.equal(sync.isSyncedKey('hospital_pharmacy_stocks'), false);
    assert.equal(sync.isSyncedKey('hospital_pharmacy_prescriptions'), true);
    assert.equal(sync.isSyncedKey('hospital_module_conflict_simrs_rme_soap'), false);

    await sync.startModuleSync();
    assert.deepEqual(JSON.parse(storage.getItem('hospital_finance_billings') || 'null'), [serverRecord]);
    const readsAfterInitialSync = clinicalReadCount;
    await sync.pullModuleData();
    assert.equal(clinicalReadCount, readsAfterInitialSync);
    assert.ok(requests.some((request) =>
      request.url.includes('/clinical-records/billings?') && request.headers.get('if-none-match') === `"${clinicalCollectionVersion}"`
    ));
    storage.setItem('hospital_finance_billings', JSON.stringify([{ ...serverRecord, totalTagihan: 12000 }]));
    await sync.stopModuleSync(true);

    const update = requests.find((request) =>
      request.url.endsWith('/clinical-records/billings/BIL-SYNC-001') && request.method === 'PUT'
    );
    assert.ok(update);
    assert.equal(update.headers.get('if-match'), '"billing-v1"');
    assert.equal(requests.some((request) => request.url.includes('/module-data/hospital_finance_billings')), false);

    clinicalCollectionVersion = 'clinical-collection-v2';
    serverRecords = [{
      id: serverRecord.id,
      data: { ...serverRecord, deletedAt: '2026-04-09T00:00:00.000Z' },
      version: 'billing-v2'
    }];
    await sync.pullModuleData();
    assert.deepEqual(JSON.parse(storage.getItem('hospital_finance_billings') || 'null'), []);

    storage.clear();
    requests.length = 0;
    serverRecords = [];
    storage.setItem('hospital_finance_billings', JSON.stringify([legacyRecord]));
    await sync.startModuleSync();
    assert.equal(requests.some((request) => request.method === 'PUT'), false);

    storage.setItem('hospital_finance_billings', JSON.stringify([legacyRecord, newRecord]));
    await sync.stopModuleSync(true);
    const writes = requests
      .filter((request) => request.url.includes('/clinical-records/billings/') && request.method === 'PUT')
      .map((request) => JSON.parse(request.body!).data);
    assert.deepEqual(writes, [newRecord]);

    storage.clear();
    requests.length = 0;
    await sync.startModuleSync();
    const firstRealRecord = { id: 'BIL-REAL-002', noBilling: 'BIL-REAL-002', totalTagihan: 15000 };
    storage.setItem('hospital_finance_billings', JSON.stringify([firstRealRecord]));
    await sync.stopModuleSync(true);
    const firstRealWrite = requests.find((request) =>
      request.url.endsWith('/clinical-records/billings/BIL-REAL-002') && request.method === 'PUT'
    );
    assert.ok(firstRealWrite);

    storage.clear();
    requests.length = 0;
    await sync.startModuleSync();
    storage.setItem('simrs_satusehat_config', '{"clientSecret":"never-sync"}');
    assert.equal(requests.some((request) => request.url.includes('simrs_satusehat_config')), false);

    forceModuleConflict = true;
    storage.setItem('hospital_conflict_test', 'local draft');
    await new Promise((resolve) => setTimeout(resolve, 1700));
    assert.equal(storage.getItem('hospital_conflict_test'), 'server-latest');
    assert.equal(storage.getItem('hospital_module_conflict_hospital_conflict_test'), 'local draft');
    storage.setItem('hospital_conflict_test', 'newer local draft');
    assert.equal(storage.getItem('hospital_conflict_test'), 'server-latest');
    assert.equal(storage.getItem('hospital_module_conflict_hospital_conflict_test'), 'newer local draft');
    assert.equal(requests.filter((request) =>
      request.url.endsWith('/module-data/hospital_conflict_test') && request.method === 'PUT'
    ).length, 1);
  } finally {
    const sync = await import('../src/lib/moduleSync');
    await sync.stopModuleSync(false);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete global[key];
    }
  }
});
