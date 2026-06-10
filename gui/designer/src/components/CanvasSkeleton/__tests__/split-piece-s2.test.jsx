/**
 * split-piece-s2.test.jsx — SPEC_EDITABLE_ASSEMBLY_S2 §5.1 / §7.2.
 *
 * SPLIT_PIECE — divides a single-range `sourced` piece by a top-strand
 * local offset into two `sourced` halves (rc-aware ranges, parents
 * preserved, mutations distributed, left-before-right in the zone).
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
      id: 'cZ', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT', annotations: [],
    });
  });
  act(() => {
    A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } } });
  });
  return S.zones[S.zones.length - 1].id;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid)
  .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const split = (pieceId, atOffset) => act(() => { A.zoneDispatch({ type: 'SPLIT_PIECE', pieceId, atOffset }); });

describe('SPLIT_PIECE — forward', () => {
  it('splits [0,8) forward at 3 → [0,3) + [3,8); parents preserved; left before right', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); });
    const parent = zonePieces(zid)[0];
    split(parent.id, 3);
    const post = zonePieces(zid);
    expect(post).toHaveLength(2);
    const [left, right] = post;
    expect(left.kind).toBe('sourced');
    expect(right.kind).toBe('sourced');
    expect(left.ranges[0]).toMatchObject({ sourceId: 'cZ', start: 0, end: 3, orientation: 'forward' });
    expect(right.ranges[0]).toMatchObject({ sourceId: 'cZ', start: 3, end: 8, orientation: 'forward' });
    expect(left.sourceIds).toEqual(['cZ']);
    expect(right.sourceIds).toEqual(['cZ']);
    expect(left.origin).toBe(parent.origin);
    expect(left.id).not.toBe(parent.id);
    expect(right.id).not.toBe(left.id);
  });
});

describe('SPLIT_PIECE — reverse (rc-aware)', () => {
  it('splits [0,8) reverse at 3 → left [5,8) + right [0,5), both reverse', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, true); });
    const parent = zonePieces(zid)[0];
    expect(parent.ranges[0].orientation).toBe('reverse');
    split(parent.id, 3);
    const [left, right] = zonePieces(zid);
    expect(left.ranges[0]).toMatchObject({ start: 5, end: 8, orientation: 'reverse' });
    expect(right.ranges[0]).toMatchObject({ start: 0, end: 5, orientation: 'reverse' });
  });
});

describe('SPLIT_PIECE — mutation distribution', () => {
  it('mutations split by atOffset; right half positions shift by -atOffset', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); });
    const parent = zonePieces(zid)[0];
    act(() => { A.addPieceMutation(parent.id, { position: 1, fromBase: 'A', toBase: 'G' }); });
    act(() => { A.addPieceMutation(parent.id, { position: 5, fromBase: 'C', toBase: 'T' }); });
    split(parent.id, 3);
    const [left, right] = zonePieces(zid);
    expect(left.mutations.map((m) => m.position)).toEqual([1]);
    expect(right.mutations.map((m) => m.position)).toEqual([2]); // 5 - 3
  });
});

describe('SPLIT_PIECE — guards (no-op)', () => {
  it('atOffset at the boundary is a no-op', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 8, false); });
    const id = zonePieces(zid)[0].id;
    split(id, 0);
    expect(zonePieces(zid)).toHaveLength(1);
    split(id, 8);
    expect(zonePieces(zid)).toHaveLength(1);
  });

  it('a gap piece (non-sourced) is a no-op', () => {
    const zid = openZone();
    act(() => { A.insertSnippet(zid, { sequence: 'ATGC' }, undefined); });
    const id = zonePieces(zid)[0].id;
    split(id, 2);
    expect(zonePieces(zid)).toHaveLength(1);
    expect(zonePieces(zid)[0].kind).toBe('snippet');
  });
});
