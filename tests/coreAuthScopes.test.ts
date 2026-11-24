import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasScope, scopeForPath } from '../src/server/coreAuth';

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
});
