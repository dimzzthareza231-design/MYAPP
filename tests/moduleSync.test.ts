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
}

class TestCustomEvent extends Event {
  detail: unknown;

  constructor(type: string, init?: CustomEventInit) {
    super(type);
    this.detail = init?.detail;
  }
}

test('clinical storage keys sync through entity APIs with version preconditions', async () => {
  const global = globalThis as unknown as Record<string, unknown>;
  const keys = ['Storage', 'localStorage', 'window', 'document', 'CustomEvent', 'fetch'];
  const descriptors = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new TestStorage();
  const requests: Array<{ url: string; method: string; headers: Headers }> = [];
  const record = { id: 'BIL-SYNC-001', noBilling: 'BIL-SYNC-001', totalTagihan: 10000 };

  Object.defineProperty(globalThis, 'Storage', { configurable: true, value: TestStorage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dispatchEvent: () => true }
  });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: TestCustomEvent });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(input);
      const method = init?.method || 'GET';
      requests.push({ url: requestUrl, method, headers: new Headers(init?.headers) });
      if (requestUrl.includes('/clinical-records/billings?')) {
        return Response.json({ data: [{ id: record.id, data: record, version: 'billing-v1' }], totalPages: 1 });
      }
      if (requestUrl.includes('/api/v1/clinical-records/')) {
        return Response.json({ success: true, version: 'billing-v2' });
      }
      return Response.json({ index: {} });
    }
  });

  try {
    const sync = await import('../src/lib/moduleSync');
    assert.equal(sync.isSyncedKey('hospital_clinical_record_versions'), false);
    await sync.startModuleSync();
    assert.deepEqual(JSON.parse(storage.getItem('hospital_finance_billings') || 'null'), [record]);

    storage.setItem('hospital_finance_billings', JSON.stringify([{ ...record, totalTagihan: 12000 }]));
    await sync.stopModuleSync(true);

    const update = requests.find((request) =>
      request.url.endsWith('/clinical-records/billings/BIL-SYNC-001') && request.method === 'PUT'
    );
    assert.ok(update);
    assert.equal(update.headers.get('if-match'), '"billing-v1"');
    assert.equal(requests.some((request) => request.url.includes('/module-data/hospital_finance_billings')), false);
    assert.equal(requests.some((request) => request.url.includes('/module-data/hospital_clinical_record_versions')), false);
  } finally {
    const pending = await import('../src/lib/moduleSync');
    await pending.stopModuleSync(false);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete global[key];
    }
  }
});
