/**
 * circularize-apply.test.js — M-CIRCULARIZE C1. Pure mapping from the
 * CircularizeModal decision → the store actions AssemblyShellBody dispatches.
 */
import { describe, it, expect } from 'vitest';
import { circularizeActions } from '../circularize-apply';
import { pairKeyFor } from '../junction-derive';

const segs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('circularizeActions', () => {
  it('always sets topology', () => {
    const out = circularizeActions({
      draftId: 'z1', circular: true, method: 'gibson', applyToAll: true, isZoneTarget: false, segments: segs,
    });
    expect(out[0]).toEqual({ kind: 'topology', draftId: 'z1', circular: true });
  });

  it('legacy draft (not a zone) → only topology, no method', () => {
    const out = circularizeActions({
      draftId: 'd1', circular: true, method: 'gibson', applyToAll: true, isZoneTarget: false, segments: segs,
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('topology');
  });

  it('zone + applyToAll → SET_ASSEMBLY_METHOD for the whole assembly', () => {
    const out = circularizeActions({
      draftId: 'z1', circular: true, method: 'golden_gate', applyToAll: true, isZoneTarget: true, segments: segs,
    });
    expect(out).toEqual([
      { kind: 'topology', draftId: 'z1', circular: true },
      { kind: 'assemblyMethod', zoneId: 'z1', method: 'golden_gate' },
    ]);
  });

  it('zone + closure-only (not applyToAll) → SET_BOUNDARY_OVERLAP on the closure pairKey (last→first)', () => {
    const out = circularizeActions({
      draftId: 'z1', circular: true, method: 'restriction', applyToAll: false, isZoneTarget: true, segments: segs,
    });
    expect(out[1]).toEqual({
      kind: 'closureMethod', zoneId: 'z1', pairKey: pairKeyFor('c', 'a'), method: 'restriction',
    });
  });

  it('closure-only on a linear result → no closure action (no ring to close)', () => {
    const out = circularizeActions({
      draftId: 'z1', circular: false, method: 'overlap_pcr', applyToAll: false, isZoneTarget: true, segments: segs,
    });
    expect(out).toHaveLength(1); // topology only
  });

  it('closure-only with <2 segments → no closure action', () => {
    const out = circularizeActions({
      draftId: 'z1', circular: true, method: 'kld', applyToAll: false, isZoneTarget: true, segments: [{ id: 'a' }],
    });
    expect(out).toHaveLength(1); // topology only (single-fragment closure is C3)
  });
});
