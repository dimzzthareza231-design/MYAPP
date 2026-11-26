// D1Adapter dijalankan terhadap SQLite sungguhan (node:sqlite) memakai skema migrations/0001_init.sql.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { D1Adapter, PERSISTENCE_ENTITIES, type D1DatabaseLike, type D1PreparedStatementLike } from '../src/server/databaseAdapter';

// Minimal D1 shim: same prepare/bind/first/all/run/batch shape; batch is one transaction like D1.
function createD1Shim(db: DatabaseSync): D1DatabaseLike {
  const prepare = (query: string, values: unknown[] = []): D1PreparedStatementLike => ({
    bind: (...next) => prepare(query, next),
    first: async <T>() => (db.prepare(query).get(...(values as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(query).all(...(values as never[])) as T[] }),
    run: async () => db.prepare(query).run(...(values as never[]))
  });
  return {
    prepare: (query) => prepare(query),
    batch: async (statements) => {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function migratedAdapter(): D1Adapter {
  const db = new DatabaseSync(':memory:');
  for (const migration of ['0001_init.sql', '0002_clinical_entities.sql']) {
    db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  return new D1Adapter(createD1Shim(db));
}

describe('D1Adapter', () => {
  test('migration creates a table for every persistence entity', async () => {
    const adapter = migratedAdapter();
    for (const entity of PERSISTENCE_ENTITIES) assert.deepEqual(await adapter.list(entity), []);
    const health = await adapter.health();
    assert.equal(health.mode, 'd1');
    assert.equal(health.persistentReady, true);
  });

  test('reports unhealthy when the migration has not run', async () => {
    const health = await new D1Adapter(createD1Shim(new DatabaseSync(':memory:'))).health();
    assert.equal(health.persistentReady, false);
    assert.ok(health.lastError);
  });

  test('upserts, reads, lists newest first and deletes', async () => {
    const adapter = migratedAdapter();
    // updated_at has millisecond resolution; pause so ordering is observable.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    await adapter.commit([{ entity: 'patients', id: 'p1', data: { nama: 'A' } }]);
    await tick();
    await adapter.commit([{ entity: 'patients', id: 'p2', data: { nama: 'B' } }]);
    await tick();
    await adapter.commit([{ entity: 'patients', id: 'p1', data: { nama: 'A2' } }]);

    assert.deepEqual(await adapter.get('patients', 'p1'), { nama: 'A2' });
    assert.deepEqual((await adapter.list('patients')).map((r) => r.id), ['p1', 'p2']);

    const firstPage = await adapter.listPage<{ nama: string }>('patients', 0, 1);
    assert.deepEqual(firstPage.records.map((record) => record.id), ['p1']);
    assert.equal(firstPage.total, 2);
    assert.equal(firstPage.hasMore, true);
    const lastPage = await adapter.listPage('patients', 1, 1);
    assert.deepEqual(lastPage.records.map((record) => record.id), ['p2']);
    assert.equal(lastPage.hasMore, false);

    await adapter.commit([{ entity: 'patients', id: 'p1', data: null }]);
    assert.equal(await adapter.get('patients', 'p1'), null);
    assert.equal((await adapter.list('patients')).length, 1);
  });

  test('an invalid change rejects the whole commit without partial writes', async () => {
    const adapter = migratedAdapter();
    await assert.rejects(adapter.commit([
      { entity: 'queues', id: 'q1', data: { n: 1 } },
      { entity: 'queues', id: 'x'.repeat(129), data: { n: 2 } }
    ]));
    assert.equal(await adapter.get('queues', 'q1'), null);
  });

  test('rejects unknown entities', async () => {
    await assert.rejects(migratedAdapter().get('nope' as never, 'a'), /Unsupported persistence entity/);
  });
});
