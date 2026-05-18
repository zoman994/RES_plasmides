/**
 * sanger-selectors.test.js — T10 K4 (§5.2).
 */
import { describe, it, expect } from 'vitest';
import { selectClonesInZone, selectSangerSummaryForZone } from '../store/selectors-pieces';

function st() {
  return {
    containers: [
      { id: 'prod', name: 'gibson-product', zoneId: 'z1' },
      { id: 'c2', name: 'clone2', zoneId: 'z1' },
    ],
    operations: [
      {
        id: 'op1', kind: 'gibson', zoneId: 'z1',
        materializedClones: [
          { cloneId: 'prod', label: 'clone 1', sangerVerified: 'verified', notes: 'ok' },
          { cloneId: 'c2', label: 'clone 2', sangerVerified: 'failed', notes: null },
        ],
      },
      { id: 'op2', kind: 'pcr', zoneId: 'z1', materializedClones: null }, // skipped
      {
        id: 'op3', kind: 'cut', zoneId: 'z2',
        materializedClones: [{ cloneId: 'x', label: 'c', sangerVerified: 'pending' }],
      }, // other zone
    ],
    pieces: [],
  };
}

describe('T10 K4 — selectClonesInZone', () => {
  it('groups clones by parent op (only ops with materializedClones in the zone)', () => {
    const g = selectClonesInZone(st(), 'z1');
    expect(g).toHaveLength(1);
    expect(g[0].op.id).toBe('op1');
    expect(g[0].clones).toHaveLength(2);
    // container resolved + attached
    expect(g[0].clones[0].container.name).toBe('gibson-product');
  });

  it('zone with no materialized ops → []', () => {
    expect(selectClonesInZone(st(), 'zEmpty')).toEqual([]);
  });
});

describe('T10 K4 — selectSangerSummaryForZone', () => {
  it('counts per status', () => {
    const { counts, groupedByOp } = selectSangerSummaryForZone(st(), 'z1');
    expect(counts).toEqual({
      pending: 0, verified: 1, failed: 1, unplanned: 0,
    });
    expect(groupedByOp).toHaveLength(1);
  });

  it('null sangerVerified counts as unplanned', () => {
    const s = st();
    s.operations[0].materializedClones[0].sangerVerified = null;
    expect(selectSangerSummaryForZone(s, 'z1').counts).toEqual({
      pending: 0, verified: 0, failed: 1, unplanned: 1,
    });
  });
});
