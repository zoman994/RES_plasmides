/**
 * disband-op-group-s1.test.jsx — SPEC_EDITABLE_ASSEMBLY_S1 §5.6 / §7.2.
 *
 * DISBAND_OP_GROUP — a NEW thin action used by the editable-assembly
 * handler before applying an edit to a grouped piece. Behaviour:
 *   (a) every piece with groupId === G  → groupId:null, groupLayer:0
 *       (mirrored in piecesReducer, REMOVE_CONTAINER cross-domain pattern)
 *   (b) the op-group G (isOpGroup) is removed
 *   (c) any layer-1+ op-group that depended on G (consumed an
 *       intermediate piece derived from G) is orphaned — its members
 *       are re-marked ungrouped WITHOUT cascading piece deletion.
 *
 * Distinct from REMOVE_OP_GROUP: DISBAND also resets groupLayer and
 * self-heals downstream orphans (§5.6c).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openZone() {
  render(<SkeletonProvider><H /></SkeletonProvider>);
  act(() => {
    A.addContainer({
      id: 'cZ', kind: 'molecule', name: 'pUC',
      sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
      annotations: [],
    });
  });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  return S.zones[S.zones.length - 1].id;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid)
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

describe('DISBAND_OP_GROUP — natural layer-0 group', () => {
  it('removes the op-group and resets groupId + groupLayer on every member', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
    act(() => { A.insertSegment(zid, 'cZ', 32, 64, false); });
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const op = S.operations.find((o) => o.isOpGroup);
    expect(op).toBeTruthy();
    // sanity — members carry the groupId after grouping.
    expect(zonePieces(zid).every((p) => p.groupId === op.id)).toBe(true);

    act(() => { A.disbandOpGroup(op.id); });

    expect(S.operations.find((o) => o.id === op.id)).toBeUndefined();
    const post = zonePieces(zid);
    expect(post).toHaveLength(2); // no piece deleted
    expect(post.every((p) => p.groupId === null)).toBe(true);
    expect(post.every((p) => p.groupLayer === 0)).toBe(true);
  });

  it('keeps junction-owned primers when the group is disbanded (J11)', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
    act(() => { A.insertSegment(zid, 'cZ', 32, 64, false); });
    const ids = zonePieces(zid).map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const op = S.operations.find((o) => o.isOpGroup);
    // Primers are junction-owned (zone implicit group), not tagged to the op.
    const before = (S.assemblyDraftPrimers?.[zid] || []);
    expect(before.length).toBe(4);
    expect(before.every((p) => p.source.opGroupId === `zgrp-${zid}`)).toBe(true);

    act(() => { A.disbandOpGroup(op.id); });

    // Disband tears down the group but NOT the primers (pieces stay in zone).
    expect((S.assemblyDraftPrimers?.[zid] || []).length).toBe(4);
  });

  it('is a no-op on an id that is not an op-group', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
    const before = S.pieces.length;
    act(() => { A.disbandOpGroup('op-does-not-exist'); });
    expect(S.pieces).toHaveLength(before);
  });
});

describe('DISBAND_OP_GROUP — two-layer dependency (§5.6c)', () => {
  // Layer-1 op-groups are not creatable through the K7 UI (createOpGroup
  // always mints layer-0), so the two-layer state is constructed via
  // REPLACE_STATE: G (layer-0) feeds an intermediate piece PI consumed by
  // a layer-1 group G2.
  function buildTwoLayerState() {
    const now = Date.now();
    const piece = (over) => ({
      id: over.id,
      kind: over.kind || 'sourced',
      name: over.id,
      sourceIds: over.kind === 'intermediate' ? [] : ['cZ'],
      ranges: over.kind === 'intermediate' ? [] : [{
        sourceId: 'cZ', start: over.start, end: over.end, orientation: 'forward',
      }],
      sequence: over.kind === 'intermediate' ? 'AAAACCCC' : undefined,
      origin: over.kind === 'intermediate' ? 'intermediate' : 'selection',
      acquisitionMethod: 'undefined',
      acquisitionParams: {},
      color: '#888888',
      functionalLabel: null,
      zoneId: 'zZ',
      order: null,
      variantGroupId: null,
      derivedReactionId: null,
      derivedFromOpId: over.derivedFromOpId || null,
      frozen: false,
      pinned: false,
      groupId: over.groupId || null,
      groupLayer: over.groupLayer || 0,
      mutations: [],
      createdAt: now + (over.tick || 0),
      updatedAt: now,
    });
    const opGroup = (over) => ({
      id: over.id,
      kind: over.kind || 'overlap_pcr',
      status: 'committed',
      position: { x: 0, y: 0 },
      inputs: [],
      inputPieces: over.inputPieces,
      zoneId: 'zZ',
      outputs: [],
      params: {},
      junctionRefs: [],
      materializedClones: null,
      pinned: false,
      isOpGroup: true,
      groupLayer: over.groupLayer || 0,
      createdAt: new Date().toISOString(),
      executedAt: null,
      error: null,
    });
    return {
      containers: [{
        id: 'cZ', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [],
      }],
      positions: {},
      junctions: [],
      operations: [
        opGroup({ id: 'G', inputPieces: ['P1', 'P2'], groupLayer: 0 }),
        opGroup({ id: 'G2', inputPieces: ['PI'], groupLayer: 1 }),
      ],
      pieces: [
        piece({ id: 'P1', start: 0, end: 4, groupId: 'G', tick: 0 }),
        piece({ id: 'P2', start: 4, end: 8, groupId: 'G', tick: 1 }),
        piece({
          id: 'PI', kind: 'intermediate', derivedFromOpId: 'G', groupId: 'G2', groupLayer: 1, tick: 2,
        }),
      ],
      zones: [{
        id: 'zZ', name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 }, viewMode: 'sequence',
      }],
    };
  }

  it('disbanding the layer-0 group orphans the layer-1 group; no piece deleted', () => {
    render(<SkeletonProvider><H /></SkeletonProvider>);
    act(() => { A.zoneDispatch({ type: 'REPLACE_STATE', state: buildTwoLayerState() }); });
    // sanity
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(2);
    expect(S.pieces).toHaveLength(3);

    act(() => { A.disbandOpGroup('G'); });

    // (b) + (c) — both op-groups gone (G removed; G2 orphaned and removed).
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
    // (no cascade) — all three pieces survive.
    expect(S.pieces).toHaveLength(3);
    // (a) + (c) — every piece is re-marked ungrouped.
    expect(S.pieces.every((p) => p.groupId === null)).toBe(true);
    expect(S.pieces.every((p) => p.groupLayer === 0)).toBe(true);
  });
});
