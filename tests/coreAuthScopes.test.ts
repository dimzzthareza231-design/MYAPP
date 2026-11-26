import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasScope, isModuleDataConfigKey, moduleDataScopeForKey, scopeForPath } from '../src/server/coreAuth';

const get = { method: 'GET' } as never;

describe('scope jalur API inti', () => {
  it('system-data dan notifikasi tidak lagi terbuka untuk semua role', () => {
    assert.equal(scopeForPath('/api/v1/system-data/hospital_pasien', get), 'data-pasien');
    assert.equal(scopeForPath('/api/v1/patient-notifications/dispatch', { method: 'POST' } as never), 'rekam-medis');
  });

  it('role tanpa modul pasien ditolak, super_admin lolos', () => {
    assert.equal(hasScope('super_admin', 'data-pasien'), true);
    assert.equal(hasScope('role_tidak_ada', 'data-pasien'), false);
  });

  it('module-data memakai izin modul yang memiliki key dan menolak key konfigurasi', () => {
    const soapScope = scopeForPath('/api/v1/module-data/simrs_rme_soap', get);
    assert.equal(soapScope, 'rekam-medis');
    assert.equal(hasScope('kasir', soapScope!), false);
    assert.equal(hasScope('dokter', soapScope!), true);
    assert.equal(moduleDataScopeForKey('hospital_icu_observasi'), 'icu');
    assert.equal(isModuleDataConfigKey('simrs_satusehat_config'), true);
    assert.equal(scopeForPath('/api/v1/module-data', get), 'data-pasien');
  });

  it('ubah status antrean: farmasi, kasir, dokter, perawat boleh; laboran tidak', () => {
    const scope = scopeForPath('/api/v1/appointments/A-1', { method: 'PATCH' } as never);
    assert.equal(scope, 'antrean');
    for (const role of ['apoteker', 'kasir', 'dokter', 'perawat', 'pendaftaran']) assert.equal(hasScope(role, scope!), true, role);
    assert.equal(hasScope('laboran', scope!), false);
    assert.equal(scopeForPath('/api/v1/appointments', { method: 'POST' } as never), 'pendaftaran');
  });
});
