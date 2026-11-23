import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryPersistenceRepository,
  createPersistenceRepository,
  getStorageMode,
  hashQrToken
} from '../src/server/databaseAdapter';

describe('MemoryPersistenceRepository', () => {
  test('get() mengembalikan salinan sehingga mutasi tidak mengubah data tersimpan (regresi)', async () => {
    const repo = new MemoryPersistenceRepository();
    await repo.commit([{ entity: 'patients', id: 'p1', data: { nama: 'Asli', alergi: ['Penisilin'] } }]);
    const first = await repo.get<{ nama: string; alergi: string[] }>('patients', 'p1');
    first!.nama = 'Diubah tanpa commit';
    first!.alergi.push('Sulfa');
    assert.deepEqual(await repo.get('patients', 'p1'), { nama: 'Asli', alergi: ['Penisilin'] });
  });

  test('commit menyimpan salinan, list mengembalikan semua record, dan data null menghapus', async () => {
    const repo = new MemoryPersistenceRepository();
    const payload = { status: 'Menunggu' };
    await repo.commit([
      { entity: 'queues', id: 'q1', data: payload },
      { entity: 'queues', id: 'q2', data: { status: 'Selesai' } }
    ]);
    payload.status = 'Diubah setelah commit';
    assert.deepEqual(await repo.get('queues', 'q1'), { status: 'Menunggu' });
    assert.equal((await repo.list('queues')).length, 2);
    await repo.commit([{ entity: 'queues', id: 'q1', data: null }]);
    assert.equal(await repo.get('queues', 'q1'), null);
    assert.deepEqual((await repo.list('queues')).map((r) => r.id), ['q2']);
  });

  test('menolak entitas tidak dikenal, id kosong/terlalu panjang, dan payload tak terserialisasi', async () => {
    const repo = new MemoryPersistenceRepository();
    await assert.rejects(repo.commit([{ entity: 'unknown' as never, id: 'x', data: {} }]), /Unsupported persistence entity/);
    await assert.rejects(repo.commit([{ entity: 'patients', id: '  ', data: {} }]), /1 to 128/);
    await assert.rejects(repo.commit([{ entity: 'patients', id: 'x'.repeat(129), data: {} }]), /1 to 128/);
    await assert.rejects(repo.commit([{ entity: 'patients', id: 'x', data: undefined }]), /JSON serializable/);
  });

  test('health melaporkan mode memory sebagai tidak persisten', async () => {
    const health = await new MemoryPersistenceRepository().health();
    assert.equal(health.mode, 'memory');
    assert.equal(health.persistentReady, false);
  });
});

describe('pemilihan mode penyimpanan', () => {
  test('default memory, menerima mode valid, dan menolak nilai lain', () => {
    assert.equal(getStorageMode(''), 'memory');
    assert.equal(getStorageMode(undefined), process.env.STORAGE_MODE ? getStorageMode(process.env.STORAGE_MODE) : 'memory');
    assert.equal(getStorageMode('d1'), 'd1');
    assert.throws(() => getStorageMode('postgres'), /STORAGE_MODE must be one of/);
  });

  test('mode d1 tanpa binding gagal dengan pesan jelas', async () => {
    await assert.rejects(createPersistenceRepository({ mode: 'd1' }), /requires a D1 binding/);
    const memory = await createPersistenceRepository({ mode: 'memory' });
    assert.equal(memory.mode, 'memory');
  });

  test('hash token QR deterministik dan tidak memuat token aslinya', () => {
    const hash = hashQrToken('MYITARU1.contoh');
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, hashQrToken('MYITARU1.contoh'));
    assert.notEqual(hash, hashQrToken('MYITARU1.lain'));
  });
});
