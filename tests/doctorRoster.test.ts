import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_DOKTER_JAGA_LENGKAP } from '../src/data/dataDokterJagaLengkap';
import { SEMUA_DOKTER, SEMUA_PERAWAT } from '../src/data/seedData';

const imageFiles = [
  'edukasi_medis_myitaru.webp',
  'excellence_medical_suite_1794532010941.webp',
  'hospital_hero_atrium_1794532010598.webp',
  'inpatient_suite_room_1795141971596.webp',
  'myitaru_building_hero.webp',
  'myitaru_campus_dropoff.webp',
  'myitaru_center_of_excellence.webp',
  'myitaru_inpatient_room.webp',
  'myitaru_lobby_apm_01.webp',
  'myitaru_lobby_main_branded.webp',
  'myitaru_physiotherapy_rehab.webp',
  'myitaru_poli_consult.webp',
  'patient_mobile_lifestyle_1794532011071.webp',
  'physiotherapy_rehab_center_1795141971685.webp',
  'specialist_doctor_consult_1794532010547.webp'
];

describe('data dokter dan aset MYITARU', () => {
  test('memuat 35 dokter dengan ID unik pada roster dan master aplikasi', () => {
    assert.equal(DATA_DOKTER_JAGA_LENGKAP.length, 35);
    assert.equal(SEMUA_DOKTER.length, 35);
    assert.equal(new Set(DATA_DOKTER_JAGA_LENGKAP.map((doctor) => doctor.id)).size, 35);
    assert.deepEqual(
      SEMUA_DOKTER.map((doctor) => doctor.id),
      DATA_DOKTER_JAGA_LENGKAP.map((doctor) => doctor.id)
    );
  });

  test('menyertakan seluruh foto WebP dari paket aset dan tetap membentuk data perawat', () => {
    assert.ok(SEMUA_PERAWAT.length > 0);
    for (const imageFile of imageFiles) {
      assert.equal(existsSync(resolve('src/assets/images', imageFile)), true, `${imageFile} tersedia`);
    }
  });
});
