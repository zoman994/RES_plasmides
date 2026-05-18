/**
 * zone-mode-state.test.js — T7 K1 (DEC-T7-05).
 *
 * Pure selectors for inline sequence-mode: a zone's 3-state machine
 * (empty → palette → assembled) derived from its pieces' `order`.
 */
import { describe, it, expect } from 'vitest';
import {
  selectZoneSequenceState, selectContainersInZone,
  selectPiecesByZoneId, selectAttachedPieces, selectDetachedPieces,
} from '../canvas/zone-sequence-mode/zone-mode-state';

function st(pieces, containers = []) {
  return { pieces, containers, zones: [{ id: 'zn-1' }] };
}
const p = (id, order, extra = {}) => ({
  id, zoneId: 'zn-1', kind: 'sourced', createdAt: 1, order, ...extra,
});

describe('T7 K1 — selectZoneSequenceState', () => {
  it('empty: no pieces in the zone', () => {
    expect(selectZoneSequenceState(st([]), 'zn-1')).toBe('empty');
    expect(selectZoneSequenceState(st([p('x', null)], []), 'zn-OTHER')).toBe('empty');
  });

  it('palette: pieces present but all order null/undefined', () => {
    expect(selectZoneSequenceState(st([p('a', null), p('b', undefined)]), 'zn-1')).toBe('palette');
  });

  it('assembled: at least one piece has a numeric order', () => {
    expect(selectZoneSequenceState(st([p('a', null), p('b', 0)]), 'zn-1')).toBe('assembled');
  });

  it('order 0 counts as attached (not falsy-collapsed)', () => {
    expect(selectZoneSequenceState(st([p('a', 0)]), 'zn-1')).toBe('assembled');
  });
});

describe('T7 K1 — zone membership selectors', () => {
  it('selectPiecesByZoneId filters by zoneId', () => {
    const s = st([p('a', null), { id: 'z', zoneId: 'zn-2', order: null }]);
    expect(selectPiecesByZoneId(s, 'zn-1').map((x) => x.id)).toEqual(['a']);
  });

  it('selectContainersInZone filters containers by zoneId', () => {
    const s = st([], [{ id: 'c1', zoneId: 'zn-1' }, { id: 'c2', zoneId: 'zn-9' }]);
    expect(selectContainersInZone(s, 'zn-1').map((c) => c.id)).toEqual(['c1']);
  });

  it('selectAttachedPieces returns order!=null sorted by order then createdAt', () => {
    const s = st([
      p('c', 2, { createdAt: 1 }), p('a', 0, { createdAt: 5 }),
      p('b', 1, { createdAt: 2 }), p('free', null),
      p('a2', 0, { createdAt: 1 }), // tie on order → createdAt secondary
    ]);
    expect(selectAttachedPieces(s, 'zn-1').map((x) => x.id)).toEqual(['a2', 'a', 'b', 'c']);
  });

  it('selectDetachedPieces returns order==null sorted by createdAt', () => {
    const s = st([p('x', 1), p('m', null, { createdAt: 9 }), p('n', null, { createdAt: 2 })]);
    expect(selectDetachedPieces(s, 'zn-1').map((x) => x.id)).toEqual(['n', 'm']);
  });
});
