import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { safeErrorDetails, scrubPhi, scrubPhiData } from '../src/server/scrubPhi';

describe('scrubPhi', () => {
  test('redacts labeled identity fields and common identifiers', () => {
    const text = scrubPhi('Nama Pasien: Budi Santoso, No. RM: RM-260101-0001, NIK: 1234567890123456');
    assert.doesNotMatch(text, /Budi Santoso|RM-260101-0001|1234567890123456/);
    assert.match(text, /\[IDENTITAS\]|\[RM\]|\[NIK\]/);
    assert.doesNotMatch(scrubPhi('{"patientName":"Budi Santoso"}'), /Budi Santoso/);
  });

  test('removes identifying object fields and scrubs free-text values', () => {
    assert.deepEqual(scrubPhiData({
      nama_pasien: 'Budi Santoso',
      no_rm: 'RM-260101-0001',
      allergies: 'NIK 1234567890123456',
      diagnosis: 'Hipertensi'
    }), {
      allergies: 'NIK [NIK]',
      diagnosis: 'Hipertensi'
    });
  });

  test('keeps logged errors to scrubbed type and message only', () => {
    const error = Object.assign(new Error('Nama Pasien: Budi Santoso'), {
      type: 'upstream_error',
      body: 'private request payload'
    });
    assert.deepEqual(safeErrorDetails(error), {
      type: 'upstream_error',
      message: 'Nama Pasien: [IDENTITAS]'
    });
  });
});
