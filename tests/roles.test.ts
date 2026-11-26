import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasModuleAccess } from '../src/data/roles';
import { hasScope } from '../src/server/coreAuth';

describe('akses modul di browser selaras dengan server', () => {
  it('modul sungguhan: browser memberi akses hanya bila server juga memberi', () => {
    for (const [role, moduleId] of [['pendaftaran', 'rawat-jalan'], ['rekam_medis', 'rawat-jalan'], ['manajemen_mutu', 'telemedicine']] as const) {
      assert.equal(hasModuleAccess(role, moduleId), hasScope(role, moduleId), `${role} -> ${moduleId}`);
    }
    assert.equal(hasModuleAccess('pendaftaran', 'patient-flow'), true);
  });

  it('nama URL turunan mengikuti modul induknya', () => {
    assert.equal(hasModuleAccess('admin', 'crm'), true);
    assert.equal(hasModuleAccess('admin', 'multi-branch'), true);
    assert.equal(hasModuleAccess('pendaftaran', 'display-antrian'), true);
    assert.equal(hasModuleAccess('it_support', 'user-management'), true);
    assert.equal(hasModuleAccess('kasir', 'crm'), false);
  });
});
