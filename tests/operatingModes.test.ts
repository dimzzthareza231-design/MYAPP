import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isModuleAvailableInMode } from '../src/data/operatingModes';

describe('mode operasional', () => {
  test('mode SIMK menampilkan alur klinik dasar dan menyembunyikan modul rawat inap', () => {
    assert.equal(isModuleAvailableInMode('patient-flow', 'SIMK'), true);
    assert.equal(isModuleAvailableInMode('rekam-medis', 'SIMK'), true);
    assert.equal(isModuleAvailableInMode('rawat-inap', 'SIMK'), false);
    assert.equal(isModuleAvailableInMode('icu', 'SIMK'), false);
  });

  test('mode SIMRS membuka modul lanjutan', () => {
    assert.equal(isModuleAvailableInMode('rawat-inap', 'SIMRS'), true);
    assert.equal(isModuleAvailableInMode('icu', 'SIMRS'), true);
  });
});
