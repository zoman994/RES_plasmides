/**
 * piece-drag.test.js — T7 K2 (DEC-T7-06/07). HTML5 drag helpers for
 * moving piece-cards between Palette and the Assembled strip.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PIECE_MIME, onPieceDragStart, readPieceIdFromDrop,
  computeInsertPosition, onStripDrop,
} from '../canvas/zone-sequence-mode/piece-drag';

function mkDT() {
  const store = {};
  return {
    effectAllowed: '',
    setData: (k, v) => { store[k] = String(v); },
    getData: (k) => store[k] || '',
    types: { includes: (k) => k in store },
    _store: store,
  };
}

describe('T7 K2 — piece-drag helpers', () => {
  it('onPieceDragStart writes the piece id under the bodge MIME', () => {
    const dt = mkDT();
    onPieceDragStart({ dataTransfer: dt }, 'pc-1');
    expect(dt.effectAllowed).toBe('move');
    expect(dt.getData(PIECE_MIME)).toBe('pc-1');
  });

  it('readPieceIdFromDrop returns the id or null', () => {
    const dt = mkDT();
    dt.setData(PIECE_MIME, 'pc-9');
    expect(readPieceIdFromDrop({ dataTransfer: dt })).toBe('pc-9');
    expect(readPieceIdFromDrop({ dataTransfer: mkDT() })).toBeNull();
    expect(readPieceIdFromDrop({})).toBeNull();
  });

  it('computeInsertPosition maps mouseX to a card index', () => {
    const el = { getBoundingClientRect: () => ({ left: 100 }) };
    // cardWidth ~120: x=100 → 0, x=160 → 0, x=230 → 1, x=400 → 2
    expect(computeInsertPosition(el, 100, [])).toBe(0);
    expect(computeInsertPosition(el, 160, [])).toBe(0);
    expect(computeInsertPosition(el, 230, [])).toBe(1);
    expect(computeInsertPosition(el, 400, [])).toBe(2);
  });

  it('computeInsertPosition clamps negatives to 0', () => {
    const el = { getBoundingClientRect: () => ({ left: 100 }) };
    expect(computeInsertPosition(el, 40, [])).toBe(0);
  });

  it('onStripDrop dispatches ATTACH_PIECE_TO_ASSEMBLY with the explicit insert idx', () => {
    const dispatch = vi.fn();
    const dt = mkDT();
    dt.setData(PIECE_MIME, 'pc-7');
    const e = {
      preventDefault: vi.fn(),
      dataTransfer: dt,
      clientX: 250,
      currentTarget: { getBoundingClientRect: () => ({ left: 0 }) },
    };
    onStripDrop(e, dispatch, 'zn-1', 3);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'pc-7', zoneId: 'zn-1', order: 3,
    });
  });

  it('onStripDrop computes the position from mouseX when no default given', () => {
    const dispatch = vi.fn();
    const dt = mkDT();
    dt.setData(PIECE_MIME, 'pc-2');
    const e = {
      preventDefault: vi.fn(),
      dataTransfer: dt,
      clientX: 260, // (260-0)/120 = 2
      currentTarget: { getBoundingClientRect: () => ({ left: 0 }) },
    };
    onStripDrop(e, dispatch, 'zn-1');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId: 'pc-2', zoneId: 'zn-1', order: 2,
    });
  });

  it('onStripDrop is a no-op when the drop carries no piece id', () => {
    const dispatch = vi.fn();
    const e = {
      preventDefault: vi.fn(), dataTransfer: mkDT(), clientX: 0,
      currentTarget: { getBoundingClientRect: () => ({ left: 0 }) },
    };
    onStripDrop(e, dispatch, 'zn-1', 0);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
