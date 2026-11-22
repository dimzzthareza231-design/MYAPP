import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTER_POLIKLINIK, PASIEN, SEMUA_DOKTER, SEMUA_PERAWAT } from '../src/data/seedData';

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

describe('tanpa data contoh di repo', () => {
  test('seedData tidak memuat pasien, dokter, atau perawat contoh', () => {
    assert.deepEqual(PASIEN, []);
    assert.deepEqual(SEMUA_DOKTER, []);
    assert.deepEqual(SEMUA_PERAWAT, []);
    assert.ok(MASTER_POLIKLINIK.length > 0, 'daftar jenis poliklinik referensi tetap tersedia');
  });

  test('seedData tidak punya efek samping saat di-import', () => {
    const source = readFileSync('src/data/seedData.ts', 'utf-8');
    assert.doesNotMatch(source, /initSeedData|generateAllPatientsWithResumes|storage\.set|localStorage/);
    assert.doesNotMatch(readFileSync('src/main.tsx', 'utf-8'), /data\/seedData/);
  });

  test('server tidak membangun katalog dari data contoh', () => {
    const source = readFileSync('src/server/patientPortalService.ts', 'utf-8');
    assert.doesNotMatch(source, /seedData|SEMUA_DOKTER|MASTER_POLIKLINIK|MYITARU SIMK/);
  });
});

describe('aset gambar', () => {
  test('foto yang direferensikan kode tersedia', () => {
    for (const { from, target } of referencedImages()) {
      assert.equal(existsSync(target), true, `${target} (dirujuk ${from}) tersedia`);
    }
  });
});
