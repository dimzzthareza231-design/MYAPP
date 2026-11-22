// Helper murni riwayat kunjungan & tren lab aplikasi pasien.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeVisitError,
  findVisitDoctor,
  isUpcomingVisit,
  parseVisits,
  sortVisitsNewestFirst,
  visitStatusTone,
  type PatientVisit
} from '../src/components/Mobile/patient/visitHelpers';
import { buildLabTrends, extractMeasurements, sparklinePoints } from '../src/components/Mobile/patient/labTrend';
import type { PublicDoctor } from '../src/components/Mobile/patient/types';

function visit(partial: Partial<PatientVisit>): PatientVisit {
  return {
    id: 'v',
    kode_booking: null,
    poli: 'Poli Anak',
    dokter: 'dr. A',
    tanggal: '2026-12-01',
    jam_praktek: '08:00 - 12:00',
    nomor_antrian: 'A-001',
    status: 'Menunggu',
    tipe: 'Rawat Jalan',
    created_at: '2026-11-20T00:00:00Z',
    can_cancel: true,
    can_reschedule: true,
    ...partial
  };
}

describe('riwayat kunjungan', () => {
  test('parseVisits membuang entri tidak valid & menormalisasi field', () => {
    const out = parseVisits({ visits: [{ id: 'x', kode_booking: '', can_cancel: 'yes' }, null, { nama: 'tanpa id' }] });
    assert.equal(out.length, 1);
    assert.equal(out[0].kode_booking, null);
    assert.equal(out[0].can_cancel, false);
    assert.deepEqual(parseVisits(null), []);
  });

  test('urutan terbaru lebih dulu', () => {
    const sorted = sortVisitsNewestFirst([
      visit({ id: 'old', tanggal: '2026-01-01' }),
      visit({ id: 'new', tanggal: '2026-12-01' }),
      visit({ id: 'new-later', tanggal: '2026-12-01', created_at: '2026-11-21T00:00:00Z' })
    ]);
    assert.deepEqual(sorted.map((v) => v.id), ['new-later', 'new', 'old']);
  });

  test('tone status', () => {
    assert.equal(visitStatusTone('Menunggu'), 'waiting');
    assert.equal(visitStatusTone('Diperiksa'), 'active');
    assert.equal(visitStatusTone('Selesai'), 'done');
    assert.equal(visitStatusTone('Dibatalkan'), 'cancelled');
    assert.equal(visitStatusTone('Batal'), 'cancelled');
    assert.equal(visitStatusTone('???'), 'neutral');
  });

  test('kunjungan mendatang untuk kalender', () => {
    assert.equal(isUpcomingVisit(visit({}), '2026-11-22'), true);
    assert.equal(isUpcomingVisit(visit({ tanggal: '2026-11-01' }), '2026-11-22'), false);
    assert.equal(isUpcomingVisit(visit({ status: 'Dibatalkan' }), '2026-11-22'), false);
  });

  test('pesan galat ramah untuk setiap kode', () => {
    assert.match(describeVisitError('cancel', 401, 'PATIENT_SESSION_REQUIRED'), /Sesi Anda telah berakhir/);
    assert.match(describeVisitError('cancel', 404, 'APPOINTMENT_NOT_FOUND'), /tidak ditemukan/);
    assert.match(describeVisitError('cancel', 409, 'APPOINTMENT_NOT_MODIFIABLE'), /tidak dapat dibatalkan lagi/);
    assert.match(describeVisitError('reschedule', 409, 'APPOINTMENT_NOT_MODIFIABLE'), /dijadwalkan ulang/);
    assert.match(describeVisitError('reschedule', 409, 'DOCTOR_QUOTA_FULL'), /Kuota dokter/);
    assert.match(describeVisitError('reschedule', 400, 'NO_CHANGE'), /sama dengan jadwal/);
    assert.match(describeVisitError('reschedule', 503, 'QR_SECRET_NOT_CONFIGURED'), /tidak tersedia/);
    assert.match(describeVisitError('reschedule', null), /koneksi internet/);
    assert.match(describeVisitError('load', 500), /Server sedang bermasalah/);
  });

  test('dokter kunjungan dicari di katalog (nama + poli)', () => {
    const doctors = [
      { id: '1', nama: 'dr. A', poli: 'Poli Dewasa', poli_id: 'p2', spesialis: '' },
      { id: '2', nama: 'dr. A', poli: 'Poli Anak', poli_id: 'p1', spesialis: '' }
    ] as PublicDoctor[];
    assert.equal(findVisitDoctor(visit({}), doctors)?.id, '2');
    assert.equal(findVisitDoctor(visit({ dokter: 'dr. Z' }), doctors), null);
  });
});

describe('tren hasil lab', () => {
  test('ekstraksi nilai numerik; nilai berawalan </> diabaikan', () => {
    assert.deepEqual(extractMeasurements('Hemoglobin: 12,5 g/dL\nLeukosit = 8500 /uL\nCRP: <5 mg/L', 'Darah Lengkap'), [
      { name: 'Hemoglobin', value: 12.5, unit: 'g/dL' },
      { name: 'Leukosit', value: 8500, unit: '/uL' }
    ]);
    assert.deepEqual(extractMeasurements('110 mg/dL', 'Gula Darah Puasa'), [
      { name: 'Gula Darah Puasa', value: 110, unit: 'mg/dL' }
    ]);
    assert.deepEqual(extractMeasurements('Dalam batas normal', 'Rontgen'), []);
  });

  test('tren hanya untuk parameter dengan ≥ 2 hasil, urut dari terlama', () => {
    const trends = buildLabTrends([
      { id: 'r3', jenis: 'Laboratorium', pemeriksaan: 'DL', tanggal: '2026-11-20', hasil: 'Hemoglobin: 13 g/dL\nTrombosit: 250000 /uL' },
      { id: 'r2', jenis: 'Laboratorium', pemeriksaan: 'DL', tanggal: '2026-10-01', hasil: 'Hemoglobin: 11.5 g/dL' },
      { id: 'r1', jenis: 'Laboratorium', pemeriksaan: 'DL', tanggal: '2026-09-01', hasil: 'hemoglobin : 10 g/dL' }
    ]);
    assert.equal(trends.length, 1);
    assert.deepEqual(trends[0].points.map((p) => p.value), [10, 11.5, 13]);
    assert.equal(trends[0].unit, 'g/dL');
  });

  test('satuan berbeda tidak digabung', () => {
    const trends = buildLabTrends([
      { id: 'a', jenis: 'Lab', pemeriksaan: 'GDS', tanggal: '2026-11-01', hasil: 'Glukosa: 110 mg/dL' },
      { id: 'b', jenis: 'Lab', pemeriksaan: 'GDS', tanggal: '2026-11-02', hasil: 'Glukosa: 6.1 mmol/L' }
    ]);
    assert.equal(trends.length, 0);
  });

  test('koordinat sparkline: nilai tertinggi di atas', () => {
    const pts = sparklinePoints([1, 3, 2], 100, 40, 0);
    assert.deepEqual(pts, [
      [0, 40],
      [50, 0],
      [100, 20]
    ]);
    assert.deepEqual(sparklinePoints([5, 5], 100, 40, 0), [
      [0, 20],
      [100, 20]
    ]);
  });
});
