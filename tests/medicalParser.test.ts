import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSOAPFromParsing, parseMedicalTranscript } from '../src/utils/medicalParser';

describe('parser transkrip medis (Smart Voice Report)', () => {
  test('mengekstrak keluhan, diagnosis, obat dengan dosis, dan tanda vital', () => {
    const r = parseMedicalTranscript('Pasien mengeluh pusing dan mual. Riwayat hipertensi. TD 150/95, nadi 88, spo2 97. Diberi amlodipine 10 mg.');
    assert.match(r.keluhan_utama, /pusing/);
    assert.equal(r.diagnosis_suggestion[0].code, 'I10');
    assert.deepEqual(r.obat_suggestion, [{ nama: 'amlodipine', dosis: '10 mg' }]);
    assert.equal(r.tanda_vital.tekanan_darah, '150/95 mmHg');
    assert.equal(r.tanda_vital.nadi, '88 bpm');
    assert.equal(r.tanda_vital.spo2, '97%');
    assert.ok(r.confidence > 50);
  });

  test('nama alergen diambil setelah kata "alergi" tanpa entri ganda (regresi)', () => {
    const r = parseMedicalTranscript('Pasien alergi udang sejak kecil');
    assert.deepEqual(r.alergi_detected, [{ allergen: 'udang' }]);
    const terhadap = parseMedicalTranscript('ada alergi terhadap penisilin');
    assert.deepEqual(terhadap.alergi_detected, [{ allergen: 'penisilin' }]);
  });

  test('"tidak ada alergi" tidak dicatat sebagai alergi', () => {
    const r = parseMedicalTranscript('Pasien demam, tidak ada alergi obat');
    assert.deepEqual(r.alergi_detected, []);
    assert.equal(generateSOAPFromParsing(r).subjective.riwayat_alergi, 'Tidak ada');
  });

  test('tanggal tidak dianggap tekanan darah dan koma desimal suhu didukung', () => {
    const r = parseMedicalTranscript('Kontrol tanggal 12/05 lalu, tensi 130/85, suhu 38,5 derajat');
    assert.equal(r.tanda_vital.tekanan_darah, '130/85 mmHg');
    assert.equal(r.tanda_vital.suhu, '38.5 °C');
    assert.equal(parseMedicalTranscript('jadwal ulang 12/05').tanda_vital.tekanan_darah, undefined);
  });

  test('transkrip kosong menghasilkan struktur default', () => {
    const r = parseMedicalTranscript('');
    assert.equal(r.keluhan_utama, 'Tidak terdeteksi');
    assert.equal(r.confidence, 0);
    assert.equal(generateSOAPFromParsing(r).assessment.diagnosis_primer, null);
  });
});
