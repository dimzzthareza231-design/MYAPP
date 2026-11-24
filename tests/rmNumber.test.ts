import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextRmNumber } from '../src/server/rmNumber';

describe('nextRmNumber', () => {
  it('format RM-YYMMDD-XXXX dan tidak kembar dengan yang ada', () => {
    const existing: Array<{ no_rm: string }> = [];
    for (let i = 0; i < 300; i++) {
      const rm = nextRmNumber(existing);
      assert.match(rm, /^RM-\d{6}-\d{4,6}$/);
      assert.ok(!existing.some((p) => p.no_rm === rm));
      existing.push({ no_rm: rm });
    }
  });
});

import { scrubPhi } from '../src/server/scrubPhi';
describe('scrubPhi', () => {
  it('membuang RM, NIK, email, telepon', () => {
    const out = scrubPhi('RM-260101-0001 NIK 3171012304850001 a@b.id 081234567890 diabetes');
    assert.equal(out, '[RM] NIK [NIK] [EMAIL] [TELEPON] diabetes');
  });
});
