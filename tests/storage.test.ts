// storage.ts dijalankan dengan stub window/localStorage/document minimal (tanpa jsdom).
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const g = globalThis as Record<string, unknown>;
const saved = { window: g.window, document: g.document, localStorage: g.localStorage, CustomEvent: g.CustomEvent };
const data = new Map<string, string>();
const bodyClasses = new Set<string>();
const dispatched: string[] = [];

before(() => {
  g.localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear()
  };
  g.document = { body: { classList: { contains: (c: string) => bodyClasses.has(c) } } };
  g.window = { dispatchEvent: (e: { type: string }) => { dispatched.push(e.type); return true; } };
  g.CustomEvent ??= class { constructor(public type: string) {} };
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete g[key];
    else g[key] = value;
  }
});

beforeEach(() => {
  data.clear();
  bodyClasses.clear();
  dispatched.length = 0;
});

describe('storage (localStorage JSON wrapper)', () => {
  test('set/get menyimpan nilai sebagai JSON dan mengembalikan default bila tidak ada', async () => {
    const { storage } = await import('../src/utils/storage');
    storage.set('hospital_pasien', [{ id: 1 }]);
    assert.equal(data.get('hospital_pasien'), '[{"id":1}]');
    assert.deepEqual(storage.get('hospital_pasien', []), [{ id: 1 }]);
    assert.equal(storage.get('tidak_ada', 'default'), 'default');
  });

  test('JSON rusak mengembalikan nilai default, bukan melempar error', async () => {
    const { storage } = await import('../src/utils/storage');
    data.set('rusak', '{tidak valid');
    assert.deepEqual(storage.get('rusak', { aman: true }), { aman: true });
  });

  test('mode viewer memblokir penulisan data bisnis dan memancarkan event', async () => {
    const { storage } = await import('../src/utils/storage');
    bodyClasses.add('viewer-mode');
    storage.set('hospital_kunjungan', [1]);
    storage.remove('simrs_x');
    storage.clear();
    assert.equal(data.has('hospital_kunjungan'), false);
    assert.deepEqual(dispatched, ['viewer-mode-block', 'viewer-mode-block', 'viewer-mode-block']);
    storage.set('ui_preferensi', { tema: 'gelap' });
    assert.equal(data.get('ui_preferensi'), '{"tema":"gelap"}');
  });
});
