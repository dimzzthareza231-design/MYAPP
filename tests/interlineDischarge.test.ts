// Integrasi antar lini: pemulangan pasien rawat inap (Bed Management -> Kasir -> Patient Flow).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const g = globalThis as Record<string, unknown>;
const saved = { window: g.window, document: g.document, localStorage: g.localStorage, CustomEvent: g.CustomEvent };
const data = new Map<string, string>();
const events: Array<{ type: string; detail?: any }> = [];

before(() => {
  g.localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear()
  };
  g.document = { body: { classList: { contains: () => false } } };
  g.window = { dispatchEvent: (e: { type: string; detail?: unknown }) => { events.push(e); return true; } };
  g.CustomEvent = class { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } };
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete g[key];
    else g[key] = value;
  }
});

describe('dischargePatientFromBed', () => {
  test('mengosongkan bed yang dipilih ke antrean pembersihan dan mencatat kondisi pulang', async () => {
    const { dischargePatientFromBed, SIMRS_STORAGE_KEYS } = await import('../src/utils/interlineIntegration');
    const beds = [
      // Bed lain yang masih membawa No. RM sama (data usang) berada lebih dulu di daftar.
      { id: 'R-101', room: 'Mawar', class: 'Kelas 1', status: 'Terisi', patient: 'Lama', no_rm: 'RM-0001' },
      { id: 'R-102', room: 'Mawar', class: 'Kelas 1', status: 'Terisi', patient: 'Budi', no_rm: 'RM-0001' }
    ];
    data.set(SIMRS_STORAGE_KEYS.BED_MANAGEMENT, JSON.stringify(beds));
    data.set(SIMRS_STORAGE_KEYS.BILLINGS, JSON.stringify([]));
    data.set(SIMRS_STORAGE_KEYS.PATIENT_FLOW, JSON.stringify([{ no_rm: 'RM-0001', status: 'DIRAWAT', history_status: [] }]));

    dischargePatientFromBed({ bedId: 'R-102', no_rm: 'RM-0001', kondisiPulang: 'Sembuh' });

    const after = JSON.parse(data.get(SIMRS_STORAGE_KEYS.BED_MANAGEMENT)!);
    assert.equal(after[0].status, 'Terisi', 'bed lain tidak boleh ikut dikosongkan');
    assert.equal(after[1].status, 'Dibersihkan');
    assert.equal(after[1].no_rm, '');

    const flow = JSON.parse(data.get(SIMRS_STORAGE_KEYS.PATIENT_FLOW)!);
    assert.equal(flow[0].status, 'PROSES_BILLING');
    assert.match(flow[0].history_status[0].keterangan, /Sembuh/);

    const event = events.find((e) => e.type === 'simrs-interline-sync');
    assert.equal(event?.detail.action, 'PATIENT_DISCHARGED');
    assert.equal(event?.detail.payload.kondisiPulang, 'Sembuh');
  });
});
