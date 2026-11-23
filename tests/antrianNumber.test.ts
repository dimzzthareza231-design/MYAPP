import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { kunjunganDateKey, nextNomorAntrian, toLocalDateKey } from '../src/utils/antrianNumber';

describe('penomoran antrian poli harian', () => {
  const now = new Date(2026, 10, 23, 9, 30); // 23 Nov 2026, 09.30 waktu lokal
  const today = toLocalDateKey(now);

  test('mulai dari 001 bila belum ada kunjungan hari ini, meskipun ada riwayat hari sebelumnya', () => {
    const kunjungan = [
      { poli_id: 'POL-01', tanggal: '2026-11-22', nomor_antrian: 'UMM-001' },
      { poli_id: 'POL-01', tanggal: '2026-11-22', nomor_antrian: 'UMM-002' },
      { poli_id: 'POL-01', tanggal: '2026-11-21', nomor_antrian: 'UMM-001' }
    ];
    assert.equal(nextNomorAntrian(kunjungan, 'POL-01', 'UMM', now), 'UMM-001');
  });

  test('melanjutkan dari nomor tertinggi hari ini dan mengabaikan poli lain', () => {
    const kunjungan = [
      { poli_id: 'POL-01', tanggal: today, nomor_antrian: 'UMM-001' },
      { poli_id: 'POL-01', tanggal: new Date(2026, 10, 23, 8, 0).toISOString(), nomor_antrian: 'UMM-004' },
      { poli_id: 'POL-02', tanggal: today, nomor_antrian: 'IGD-009' }
    ];
    assert.equal(nextNomorAntrian(kunjungan, 'POL-01', 'UMM', now), 'UMM-005');
    assert.equal(nextNomorAntrian(kunjungan, 'POL-03', 'OBG', now), 'OBG-001');
  });

  test('tidak bentrok bila nomor antrian tidak berformat urutan', () => {
    const kunjungan = [
      { poli_id: 'POL-01', tanggal: today, nomor_antrian: 'A-xyz' },
      { poli_id: 'POL-01', tanggal: today, nomor_antrian: null }
    ];
    assert.equal(nextNomorAntrian(kunjungan, 'POL-01', 'UMM', now), 'UMM-003');
  });

  test('kunci tanggal memakai kalender lokal dan menolak nilai tidak valid', () => {
    assert.equal(kunjunganDateKey('2026-11-23'), '2026-11-23');
    assert.equal(kunjunganDateKey(new Date(2026, 10, 23, 1, 15).toISOString()), '2026-11-23');
    assert.equal(kunjunganDateKey('bukan tanggal'), null);
    assert.equal(kunjunganDateKey(undefined), null);
  });
});
