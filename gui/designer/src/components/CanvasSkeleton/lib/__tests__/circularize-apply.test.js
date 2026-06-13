/**
 * circularize-apply.test.js — M-CIRCULARIZE C1. Pure mapping from the
 * CircularizeModal decision → the store actions AssemblyShellBody dispatches.
 */
import { describe, it, expect } from 'vitest';
import { circularizeActions, applyCircularize } from '../circularize-apply';
import { pairKeyFor } from '../junction-derive';

const segs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('circularizeActions', () => {
  it('always sets topology (carries isZoneTarget for routing)', () => {
    const out = circularizeActions({
      draftId: 'z1', circular: true, method: 'gibson', applyToAll: true, isZoneTarget: false, segments: segs,
    });
    expect(out[0]).toEqual({
      kind: 'topology', draftId: 'z1', circular: true, isZoneTarget: false,
    });
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
      { kind: 'topology', draftId: 'z1', circular: true, isZoneTarget: true },
      { kind: 'assemblyMethod', zoneId: 'z1', method: 'golden_gate' },
    ]);
  });

  it('applyCircularize routes a ZONE topology to SET_ZONE_TOPOLOGY (not the draft no-op)', () => {
    const calls = [];
    const actions = {
      setAssemblyDraftTopology: (id, c) => calls.push(['draft', id, c]),
      zoneDispatch: (a) => calls.push([a.type, a.zoneId, a.circular ?? a.method]),
    };
    applyCircularize(actions, {
      draftId: 'zn-1', circular: true, method: 'gibson', applyToAll: true, isZoneTarget: true, segments: segs,
    });
    expect(calls).toContainEqual(['SET_ZONE_TOPOLOGY', 'zn-1', true]);
    expect(calls.find((c) => c[0] === 'draft')).toBeUndefined();
  });

  it('applyCircularize routes a LEGACY draft topology to setAssemblyDraftTopology', () => {
    const calls = [];
    const actions = {
      setAssemblyDraftTopology: (id, c) => calls.push(['draft', id, c]),
      zoneDispatch: (a) => calls.push([a.type, a.zoneId]),
    };
    applyCircularize(actions, {
      draftId: 'd1', circular: true, method: 'gibson', applyToAll: true, isZoneTarget: false, segments: segs,
    });
    expect(calls).toContainEqual(['draft', 'd1', true]);
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
