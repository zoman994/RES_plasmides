/**
 * auto-group-pipeline-k10.test.jsx — M-CANVAS-WORKFLOW-UX K10.
 *
 * autoGroupPipeline(zone, state) — pure heuristic (SPEC §4) that
 * proposes op-group structure for a zone given its sources + final
 * topology. Layer-1 groups are applicable (real piece ids); layer-2
 * groups reference intermediates by index (K15 finalizer materialises).
 *
 * Plus integration: AssemblyPipelinePanel «⚡ Auto-собрать» applies
 * layer-1 groups via createOpGroup.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { autoGroupPipeline } from '../lib/auto-group-pipeline';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function makeState(n, zoneId = 'z1') {
  const pieces = [];
  for (let i = 0; i < n; i += 1) {
    pieces.push({
      id: `pc-${i}`, kind: 'sourced', zoneId, createdAt: i + 1, groupId: null,
    });
  }
  return { pieces, operations: [], zones: [{ id: zoneId }] };
}

describe('K10 — autoGroupPipeline heuristic (SPEC §4)', () => {
  it('empty zone → no groups', () => {
    const r = autoGroupPipeline({ id: 'z1', finalTopology: 'circular' }, makeState(0));
    expect(r.groups).toEqual([]);
  });

  it('linear final topology → one overlap_pcr group with all sources', () => {
    const r = autoGroupPipeline({ id: 'z1', finalTopology: 'linear' }, makeState(8));
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].kind).toBe('overlap_pcr');
    expect(r.groups[0].pieceIds).toHaveLength(8);
    expect(r.groups[0].layer).toBe(0);
  });

  it('circular final with ≤6 sources → single overlap_pcr group at layer 0', () => {
    const r = autoGroupPipeline({ id: 'z1', finalTopology: 'circular' }, makeState(5));
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].kind).toBe('overlap_pcr');
    expect(r.groups[0].layer).toBe(0);
  });

  it('circular final with >6 sources → ceil(sqrt(N)) layer-1 ovPCR groups + 1 final gibson', () => {
    const r = autoGroupPipeline({ id: 'z1', finalTopology: 'circular' }, makeState(9));
    // sqrt(9)=3 → 3 layer-0 groups of 3 + 1 gibson final referring to intermediates.
    const l0 = r.groups.filter((g) => g.layer === 0);
    const l1 = r.groups.filter((g) => g.layer === 1);
    expect(l0).toHaveLength(3);
    expect(l0.every((g) => g.kind === 'overlap_pcr')).toBe(true);
    expect(l0.every((g) => g.pieceIds.length === 3)).toBe(true);
    expect(l1).toHaveLength(1);
    expect(l1[0].kind).toBe('gibson');
    expect(l1[0].intermediateFromGroups).toEqual([0, 1, 2]);
  });

  it('uneven N: 8 → groups split as 3+3+2 (ceil(sqrt(N)) buckets)', () => {
    const r = autoGroupPipeline({ id: 'z1', finalTopology: 'circular' }, makeState(8));
    const l0 = r.groups.filter((g) => g.layer === 0);
    const sizes = l0.map((g) => g.pieceIds.length).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 3, 3]);
  });

  it('skips already-grouped pieces', () => {
    const st = makeState(6);
    st.pieces[0].groupId = 'op-old';
    st.pieces[1].groupId = 'op-old';
    const r = autoGroupPipeline({ id: 'z1', finalTopology: 'circular' }, st);
    expect(r.groups[0].pieceIds).toHaveLength(4); // pc-2..pc-5
  });
});

describe('K10 — integration: panel Auto-собрать applies layer-1 groups', () => {
  it('clicking «⚡ Auto-собрать» on a 5-piece linear-final zone creates 1 ovPCR group', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer({ id: 'cZ', name: 'pUC', kind: 'molecule', sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [] }); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 }, finalTopology: 'linear' },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    act(() => { A.openEditorAssemblyTab(zid); });
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-loop-func
      act(() => { A.insertSegment(zid, 'cZ', i * 2, i * 2 + 2, false); });
    }
    act(() => { fireEvent.click(screen.getByTestId('assembly-pipeline-automode')); });
    const groups = S.operations.filter((o) => o.isOpGroup);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].kind).toBe('overlap_pcr');
    expect(groups[0].inputPieces).toHaveLength(5);
  });
});
