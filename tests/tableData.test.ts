import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterAndSortTableRows, paginateTableRows } from '../src/lib/tableData';

test('table search checks visible columns only and preserves sort', () => {
  const rows = [
    { id: 1, name: 'Siti Aminah', internalCode: 'hidden-match' },
    { id: 2, name: 'Budi Santoso', internalCode: 'other' },
    { id: 3, name: 'Rina Melati', internalCode: 'other' }
  ];
  const columns = [{ key: 'name' }];

  assert.deepEqual(filterAndSortTableRows(rows, columns, 'siti', { key: 'name', dir: 'asc' }), [rows[0]]);
  assert.deepEqual(filterAndSortTableRows(rows, columns, 'hidden-match', { key: null, dir: 'asc' }), []);
  assert.deepEqual(
    filterAndSortTableRows(rows, columns, '', { key: 'name', dir: 'asc' }).map(row => row.name),
    ['Budi Santoso', 'Rina Melati', 'Siti Aminah']
  );
});

test('table pagination returns only the requested page', () => {
  assert.deepEqual(paginateTableRows([1, 2, 3, 4, 5], 2, 2), [3, 4]);
  assert.deepEqual(paginateTableRows([1, 2, 3], 2, 2), [3]);
});
