import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jakartaDate } from '../src/utils/jakartaDate';

test('jakartaDate follows the Asia/Jakarta day across UTC midnight', () => {
  assert.equal(jakartaDate(new Date('2026-04-08T16:59:59.000Z')), '2026-04-08');
  assert.equal(jakartaDate(new Date('2026-04-08T17:00:00.000Z')), '2026-04-09');
});
