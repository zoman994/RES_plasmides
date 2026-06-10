/**
 * shift-assembly-primers-s3.test.js — SPEC_EDITABLE_ASSEMBLY_S3 §5.1 / §7.1.
 *
 * SHIFT_ASSEMBLY_PRIMERS {draftId, atPos, delta} maintains the
 * coordinates of SAVED assembly primers after an editable-view edit:
 *   (a) primer entirely left of atPos  → unchanged
 *   (b) primer entirely right of atPos → selectionStart/End (+ range +
 *       boundaryAtOffset) shift by delta
 *   (c) atPos strictly inside [start,end) → status:'stale', coords kept
 * Auto-from-group primers (no source coords) are left untouched.
 */
import { describe, it, expect } from 'vitest';
import { assemblyReducer } from '../store/skeleton-state-assembly';

function manual(id, start, end, extra = {}) {
  return {
    id,
    draftId: 'd1',
    range: { start, end },
    direction: 'forward',
    status: 'auto',
    source: { kind: 'segment', segmentId: 's', selectionStart: start, selectionEnd: end },
    ...extra,
  };
}
function stateWith(primers) {
  return { assemblyDraftPrimers: { d1: primers } };
}
const shift = (state, atPos, delta) => assemblyReducer(state, {
  type: 'SHIFT_ASSEMBLY_PRIMERS', draftId: 'd1', atPos, delta,
});

describe('SHIFT_ASSEMBLY_PRIMERS', () => {
  it('(b) a primer entirely RIGHT of atPos shifts its coordinates by delta', () => {
    const out = shift(stateWith([manual('p', 100, 120)]), 50, 5);
    const p = out.assemblyDraftPrimers.d1[0];
    expect(p.source.selectionStart).toBe(105);
    expect(p.source.selectionEnd).toBe(125);
    expect(p.range).toEqual({ start: 105, end: 125 });
    expect(p.status).toBe('auto');
  });

  it('(a) a primer entirely LEFT of atPos is unchanged', () => {
    const out = shift(stateWith([manual('p', 10, 30)]), 50, 5);
    expect(out.assemblyDraftPrimers.d1[0].source.selectionStart).toBe(10);
  });

  it('(c) an edit strictly inside the binding region marks the primer stale', () => {
    const out = shift(stateWith([manual('p', 40, 60)]), 50, 5);
    const p = out.assemblyDraftPrimers.d1[0];
    expect(p.status).toBe('stale');
    expect(p.source.selectionStart).toBe(40); // coords untouched
    expect(p.source.selectionEnd).toBe(60);
  });

  it('shifts source.boundaryAtOffset for a boundary primer', () => {
    const out = shift(stateWith([manual('p', 100, 120, {
      source: {
        kind: 'boundary', leftSegmentId: 'a', rightSegmentId: 'b', boundaryAtOffset: 110, selectionStart: 100, selectionEnd: 120,
      },
    })]), 50, -3);
    const p = out.assemblyDraftPrimers.d1[0];
    expect(p.source.boundaryAtOffset).toBe(107);
    expect(p.source.selectionStart).toBe(97);
  });

  it('delta 0 (substitution) still marks an in-region primer stale', () => {
    const out = shift(stateWith([manual('p', 40, 60)]), 50, 0);
    expect(out.assemblyDraftPrimers.d1[0].status).toBe('stale');
  });

  it('atPos === selectionStart shifts (insert before the primer), not stale', () => {
    const out = shift(stateWith([manual('p', 50, 70)]), 50, 5);
    const p = out.assemblyDraftPrimers.d1[0];
    expect(p.status).toBe('auto');
    expect(p.source.selectionStart).toBe(55);
  });

  it('atPos === selectionEnd is unchanged (edit after the primer)', () => {
    const out = shift(stateWith([manual('p', 30, 50)]), 50, 5);
    expect(out.assemblyDraftPrimers.d1[0].source.selectionStart).toBe(30);
  });

  it('leaves auto-from-group primers (no source coords) untouched', () => {
    const auto = {
      id: 'pr-1', autoMode: 'auto', sequence: 'ATGC', origin: { kind: 'auto-from-group', opGroupId: 'G' },
    };
    const out = shift(stateWith([auto]), 50, 5);
    expect(out.assemblyDraftPrimers.d1[0]).toEqual(auto);
  });

  it('no primers for the draft → state unchanged (same ref)', () => {
    const s = stateWith([]);
    expect(shift(s, 50, 5)).toBe(s);
  });
});
