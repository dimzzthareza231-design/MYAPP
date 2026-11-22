import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_DOKTER_JAGA_LENGKAP } from '../src/data/dataDokterJagaLengkap';
import { SEMUA_DOKTER, SEMUA_PERAWAT } from '../src/data/seedData';

// Semua gambar yang direferensikan kode sumber dari src/assets/images harus benar-benar ada.
function referencedImages(dir = 'src'): Array<{ from: string; target: string }> {
  const found: Array<{ from: string; target: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...referencedImages(full));
    } else if (/\.(tsx?|css)$/.test(entry)) {
      const source = readFileSync(full, 'utf-8');
      for (const match of source.matchAll(/['"(]([^'"()]*assets\/images\/[^'"()]+)['")]/g)) {
        const ref = match[1];
        const target = ref.startsWith('.') ? resolve(dirname(full), ref) : resolve(ref.replace(/^@\//, '').replace(/^\//, ''));
        found.push({ from: full, target });
      }
    }
  }
  return found;
}

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

  test('foto yang direferensikan kode tersedia dan data perawat tetap terbentuk', () => {
    assert.ok(SEMUA_PERAWAT.length > 0);
    for (const { from, target } of referencedImages()) {
      assert.equal(existsSync(target), true, `${target} (dirujuk ${from}) tersedia`);
    }
  });
});
