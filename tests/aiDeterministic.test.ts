// Mesin aturan klinis (Tier 3) yang dipakai saat Gemini tidak tersedia.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeClinicalNoteDeterministic,
  checkDrugInteractionsDeterministic,
  generateClinicalDecisionSupportDeterministic,
  parseSafeJson
} from '../src/server/aiIntelligenceEngine';

describe('parseSafeJson', () => {
  test('membaca JSON murni dan yang dibungkus pagar kode markdown', () => {
    assert.deepEqual(parseSafeJson('{"a":1}'), { a: 1 });
    assert.deepEqual(parseSafeJson('```json\n{"a":[1,2]}\n```'), { a: [1, 2] });
  });

  test('membaca objek yang diapit teks penjelasan', () => {
    assert.deepEqual(parseSafeJson('Berikut hasilnya: {"ok":true} semoga membantu'), { ok: true });
  });

  test('membaca array berisi objek yang diapit teks (regresi)', () => {
    assert.deepEqual(parseSafeJson('Hasil: [{"code":"I10"},{"code":"E11.9"}] selesai.'), [{ code: 'I10' }, { code: 'E11.9' }]);
  });

  test('mengembalikan null untuk teks tanpa JSON atau kosong', () => {
    assert.equal(parseSafeJson('tidak ada json di sini'), null);
    assert.equal(parseSafeJson(''), null);
    assert.equal(parseSafeJson(undefined), null);
    assert.equal(parseSafeJson('{rusak'), null);
  });
});

describe('analisis catatan klinis', () => {
  test('hipotensi tidak dikodekan sebagai hipertensi I10', () => {
    const result = analyzeClinicalNoteDeterministic('Pasien hipotensi, lemas dan pucat setelah diare');
    assert.notEqual(result.icd10[0].code, 'I10');
  });

  test('kata yang mengandung "dm" (mis. admisi) tidak dikodekan sebagai diabetes', () => {
    const result = analyzeClinicalNoteDeterministic('Pasien datang melalui admisi untuk kontrol rutin');
    assert.notEqual(result.icd10[0].code, 'E11.9');
  });

  test('kata kunci yang benar tetap dikenali', () => {
    assert.equal(analyzeClinicalNoteDeterministic('tensi 160/100, riwayat hipertensi').icd10[0].code, 'I10');
    assert.equal(analyzeClinicalNoteDeterministic('riwayat DM tipe 2, gula darah tinggi').icd10[0].code, 'E11.9');
    assert.equal(analyzeClinicalNoteDeterministic('batuk pilek 3 hari').icd10[0].code, 'J06.9');
  });
});

describe('CDSS: skor NEWS dan triase', () => {
  test('tanda vital normal menghasilkan P4 tanpa flag', () => {
    const r = generateClinicalDecisionSupportDeterministic({
      vitals: { systolic: 120, diastolic: 80, heartRate: 78, temperature: 36.7, respiratoryRate: 16, spO2: 98 }
    }) as any;
    assert.equal(r.triage.level, 'P4');
    assert.equal(r.vitalStatus.flags.length, 0);
  });

  test('bradipnea berat (RR 6) dan hipotermia ditandai kritis (regresi)', () => {
    const r = generateClinicalDecisionSupportDeterministic({
      vitals: { systolic: 120, diastolic: 80, heartRate: 78, temperature: 34.5, respiratoryRate: 6, spO2: 97 }
    }) as any;
    const flags: Array<{ parameter: string; severity: string }> = r.vitalStatus.flags;
    assert.ok(flags.some((f) => f.parameter === 'Pernapasan (RR)' && f.severity === 'critical'), JSON.stringify(flags));
    assert.ok(flags.some((f) => f.parameter === 'Suhu Tubuh' && f.severity === 'critical'));
    assert.notEqual(r.triage.level, 'P4');
  });
});

describe('interaksi obat', () => {
  test('mendeteksi pasangan mayor dengan alias Indonesia', () => {
    const r = checkDrugInteractionsDeterministic(['Warfarin 2 mg', { nama: 'Asetosal 80 mg' }]);
    assert.equal(r.hasCriticalInteraction, true);
    assert.equal(r.interactions[0].drugA, 'WARFARIN');
  });

  test('input tidak valid dari body request tidak melempar error', () => {
    assert.doesNotThrow(() => checkDrugInteractionsDeterministic(null as any));
    assert.doesNotThrow(() => checkDrugInteractionsDeterministic([null, undefined, 42, {}] as any));
    assert.equal(checkDrugInteractionsDeterministic('warfarin' as any).interactions.length, 0);
  });
});
