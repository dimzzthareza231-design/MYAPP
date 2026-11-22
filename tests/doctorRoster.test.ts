import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_DOKTER_JAGA_LENGKAP } from '../src/data/dataDokterJagaLengkap';
import { SEMUA_DOKTER, SEMUA_PERAWAT } from '../src/data/seedData';

const imageFiles = [
  'edukasi_medis_myitaru.jpg',
  'myitaru_center_of_excellence.jpg',
  'myitaru_physiotherapy_rehab.jpg',
  'myitaru_inpatient_room.jpg',
  'myitaru_lobby_main_branded.jpg',
  'myitaru_campus_dropoff.jpg',
  'myitaru_poli_consult.jpg',
  'myitaru_lobby_apm_01.jpg',
  'myitaru_building_hero.jpg'
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

  test('menyertakan seluruh foto dari paket aset dan tetap membentuk data perawat', () => {
    assert.ok(SEMUA_PERAWAT.length > 0);
    for (const imageFile of imageFiles) {
      assert.equal(existsSync(resolve('src/assets/images', imageFile)), true, `${imageFile} tersedia`);
    }
  });
});
