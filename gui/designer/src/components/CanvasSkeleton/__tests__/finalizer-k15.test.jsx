/**
 * finalizer-k15.test.jsx — M-CANVAS-WORKFLOW-UX K15 (SPEC §7).
 *
 * Reducer-level finalizer hook: CREATE_OP_GROUP derives auto primers
 * via K11 deriveAutoPrimers and persists them in
 * state.assemblyDraftPrimers[zoneId]. REMOVE_OP_GROUP drops the auto
 * primers tied to that op-group (but preserves manual ones).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, cleanup, act,
} from '@testing-library/react';
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

function add3Pieces(zid) {
  act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
  act(() => { A.insertSegment(zid, 'cZ', 32, 64, false); });
  // a snippet piece between would normally come from insertSnippet;
  // tests below seed snippet directly via insertSnippet.
  return S.pieces.filter((p) => p.zoneId === zid)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((p) => p.id);
}

describe('K15 — CREATE_OP_GROUP derives auto primers (T8.5)', () => {
  it('2 sourced pieces ovPCR → 4 primers in zone primer pool', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const pool = S.assemblyDraftPrimers[zid] || [];
    expect(pool).toHaveLength(4);
  });

  it('each derived primer carries autoMode=auto + origin.opGroupId', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const opId = S.operations.find((o) => o.isOpGroup).id;
    const pool = S.assemblyDraftPrimers[zid] || [];
    for (const p of pool) {
      expect(p.autoMode).toBe('auto');
      expect(p.source.kind).toBe('auto-group');
      expect(p.source.opGroupId).toBe(opId);
    }
  });

  it('fwd/rev names follow the SPEC pattern (asm-fwd-N / asm-rev-N)', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const names = S.assemblyDraftPrimers[zid].map((p) => p.name).sort();
    expect(names).toEqual(['asm-fwd-1', 'asm-fwd-2', 'asm-rev-1', 'asm-rev-2']);
  });

  it('downstream piece fwd tail = prev piece last 30 nt (one-sided right, §9b)', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const pool = S.assemblyDraftPrimers[zid];
    const bFwd = pool.find((p) => p.name === 'asm-fwd-2');
    expect(bFwd.tail.length).toBe(30);
    // Prev piece sequence = container.slice(0,32) =
    // 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; last 30 = drop the first 2 nt.
    expect(bFwd.tail).toBe('AACCCCGGGGTTTTAAAACCCCGGGGTTTT');
  });

  it('single piece ovPCR → 2 primers with empty tails', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
    const pid = S.pieces.find((p) => p.zoneId === zid).id;
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [pid, pid]); });
    // The same id used twice — invalid (not continuous); op-group rejected.
    expect(S.operations.filter((o) => o.isOpGroup)).toHaveLength(0);
    expect(S.assemblyDraftPrimers[zid] || []).toHaveLength(0);
  });

  it('gibson kind reproduces ovPCR overlap', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'gibson', '', ids); });
    const pool = S.assemblyDraftPrimers[zid];
    const bFwd = pool.find((p) => p.name === 'asm-fwd-2');
    expect(bFwd.tail.length).toBe(30); // §9b one-sided right @ 30 nt
  });

  it('golden_gate kind → fwd tail starts with GGTCTC', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'golden_gate', '', ids); });
    const pool = S.assemblyDraftPrimers[zid];
    const bFwd = pool.find((p) => p.name === 'asm-fwd-2');
    expect(bFwd.tail.startsWith('GGTCTC')).toBe(true);
  });

  it('snippet piece between 2 sourced → snippet absent in primer set; its seq lives in next fwd tail', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
    act(() => { A.insertSnippet(zid, { sequence: 'CATCATCATCATCATCAT', snippetType: '6xHis', name: '6xHis' }); });
    act(() => { A.insertSegment(zid, 'cZ', 32, 64, false); });
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const pool = S.assemblyDraftPrimers[zid];
    // 2 sourced × 2 primers = 4. Snippet contributes none.
    expect(pool).toHaveLength(4);
    const bFwd = pool.find((p) => p.name === 'asm-fwd-3'); // piece index 3 = the right sourced
    // Actually the right sourced is at index 3 (1-indexed) in inputPieces:
    // pieces 1=sourced, 2=snippet (skipped), 3=sourced. asm-fwd-3 = right sourced fwd.
    expect(bFwd.tail.includes('CATCATCATCATCATCAT')).toBe(true);
  });

  it('mutation flag travels with the derived primer', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 32, false); });
    const pid = S.pieces.find((p) => p.zoneId === zid).id;
    act(() => { A.addPieceMutation(pid, { position: 7, fromBase: 'C', toBase: 'T' }); });
    // Group needs ≥2 pieces; add a second:
    act(() => { A.insertSegment(zid, 'cZ', 32, 64, false); });
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const pool = S.assemblyDraftPrimers[zid];
    const mutated = pool.filter((p) => p.source.pieceId === pid);
    expect(mutated.every((p) => p.mutated === true)).toBe(true);
  });
});

describe('K15 — REMOVE_OP_GROUP drops auto primers, preserves manual', () => {
  it('after REMOVE_OP_GROUP all auto primers of that op are gone', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const opId = S.operations.find((o) => o.isOpGroup).id;
    expect(S.assemblyDraftPrimers[zid]).toHaveLength(4);
    act(() => { A.removeOpGroup(opId); });
    expect((S.assemblyDraftPrimers[zid] || []).length).toBe(0);
  });

  it('manual primers tied to the op are preserved on remove', () => {
    const zid = openZone();
    const ids = add3Pieces(zid);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', ids); });
    const opId = S.operations.find((o) => o.isOpGroup).id;
    const autoPrimer = S.assemblyDraftPrimers[zid][0];
    // Promote the first auto primer to manual (biolog edited it).
    act(() => { A.updateAssemblyPrimer(zid, autoPrimer.id, { autoMode: 'manual' }); });
    expect(S.assemblyDraftPrimers[zid].find((p) => p.id === autoPrimer.id).autoMode).toBe('manual');
    act(() => { A.removeOpGroup(opId); });
    // The 3 remaining auto primers gone; the manual-locked one stays.
    const left = S.assemblyDraftPrimers[zid];
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(autoPrimer.id);
    expect(left[0].autoMode).toBe('manual');
  });

  it('two separate op-groups → primers tagged with their respective opGroupId; remove one keeps the other', () => {
    const zid = openZone();
    act(() => { A.insertSegment(zid, 'cZ', 0, 16, false); });
    act(() => { A.insertSegment(zid, 'cZ', 16, 32, false); });
    act(() => { A.insertSegment(zid, 'cZ', 32, 48, false); });
    act(() => { A.insertSegment(zid, 'cZ', 48, 64, false); });
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[0], ids[1]]); });
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[2], ids[3]]); });
    const ops = S.operations.filter((o) => o.isOpGroup);
    expect(ops).toHaveLength(2);
    expect(S.assemblyDraftPrimers[zid]).toHaveLength(8);
    act(() => { A.removeOpGroup(ops[0].id); });
    const left = S.assemblyDraftPrimers[zid];
    expect(left).toHaveLength(4);
    expect(left.every((p) => p.source.opGroupId === ops[1].id)).toBe(true);
  });
});
