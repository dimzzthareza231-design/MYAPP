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
  const serverRecord = { id: 'BIL-SYNC-001', noBilling: 'BIL-SYNC-001', totalTagihan: 10000 };
  const legacyRecord = { id: 'BIL-DEMO-001', noBilling: 'BIL-DEMO-001', totalTagihan: 5000 };
  const newRecord = { id: 'BIL-REAL-001', noBilling: 'BIL-REAL-001', totalTagihan: 12000 };
  let serverRecords = [{ id: serverRecord.id, data: serverRecord, version: 'billing-v1' }];

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
      if (requestUrl.includes('/clinical-records/billings?')) {
        return Response.json({ data: serverRecords, totalPages: serverRecords.length ? 1 : 0 });
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
    assert.equal(sync.isSyncedKey('hospital_clinical_record_deferred'), false);

    await sync.startModuleSync();
    assert.deepEqual(JSON.parse(storage.getItem('hospital_finance_billings') || 'null'), [serverRecord]);
    storage.setItem('hospital_finance_billings', JSON.stringify([{ ...serverRecord, totalTagihan: 12000 }]));
    await sync.stopModuleSync(true);

    const update = requests.find((request) =>
      request.url.endsWith('/clinical-records/billings/BIL-SYNC-001') && request.method === 'PUT'
    );
    assert.ok(update);
    assert.equal(update.headers.get('if-match'), '"billing-v1"');
    assert.equal(requests.some((request) => request.url.includes('/module-data/hospital_finance_billings')), false);

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
  } finally {
    const sync = await import('../src/lib/moduleSync');
    await sync.stopModuleSync(false);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete global[key];
    }
  }
});
