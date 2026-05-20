/**
 * smoke-workflow-k17.test.jsx — M-CANVAS-WORKFLOW-UX K17 (SPEC §10 K17).
 *
 * End-to-end rehearsal of the biolog workflow built up across K1–K15:
 *   1. Open assembly zone (finalTopology default 'circular' from K1).
 *   2. + Плазмида ×3 (sourced pieces — K5 via insertSegment).
 *   3. + Обвес 6×His between piece 1 and 2 (K3 INSERT_SNIPPET).
 *   4. Mutation C→T on piece 1 (K14 ADD_PIECE_MUTATION).
 *   5. ⚡ Auto-собрать (K10 autoGroupPipeline → CREATE_OP_GROUP).
 *   6. Verify K15 finalizer derived primers: pool populated, snippet
 *      embedded in next piece's fwd tail, mutation flag set.
 *   7. Lock one primer manual (K12). REMOVE_OP_GROUP keeps the locked
 *      primer but drops the rest.
 *
 * Step 8 (real realiseAssembly) is covered by the existing realise
 * suite — unchanged in this sprint — so K17 focuses on the new flow.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('K17 — end-to-end biolog workflow smoke', () => {
  it('zone → 3 plasmid pieces + snippet + mutation → auto-group → primers correct → lock preserves on remove', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);

    // ─ Step 1: new assembly zone (final = circular by default in K1).
    act(() => {
      A.addContainer({
        id: 'cP', kind: 'molecule', name: 'pUC',
        sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
        annotations: [],
      });
    });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'pks4', bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    expect(S.zones[0].finalTopology).toBe('circular'); // K1 default
    act(() => { A.openEditorAssemblyTab(zid); });

    // ─ Step 2: + Плазмида ×3 (sourced via insertSegment).
    act(() => { A.insertSegment(zid, 'cP', 0, 20, false); });
    act(() => { A.insertSegment(zid, 'cP', 20, 40, false); });
    act(() => { A.insertSegment(zid, 'cP', 40, 60, false); });

    // ─ Step 3: + Обвес 6×His between piece 1 and 2. insertSnippet places
    //          at the END of the zone, so re-order it into position 2.
    act(() => {
      A.insertSnippet(zid, { sequence: 'CATCATCATCATCATCAT', snippetType: '6xHis', name: '6xHis' });
    });
    const ordered = () => S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const snippetId = ordered().find((p) => p.kind === 'snippet').id;
    // Re-order: snippet is currently last; move it to index 1.
    act(() => { A.reorderSegments(zid, ordered().findIndex((p) => p.id === snippetId), 1); });

    const finalOrder = ordered();
    expect(finalOrder.map((p) => p.kind)).toEqual(['sourced', 'snippet', 'sourced', 'sourced']);

    // ─ Step 4: mutation C→T on the first sourced piece at position 7.
    const firstSourced = finalOrder[0];
    act(() => {
      A.addPieceMutation(firstSourced.id, {
        position: 7, fromBase: 'C', toBase: 'T', kind: 'silent',
      });
    });
    expect(S.pieces.find((p) => p.id === firstSourced.id).mutations).toHaveLength(1);

    // ─ Step 5: ⚡ Auto-собрать from the pipeline panel (K10).
    expect(screen.getByTestId('assembly-pipeline-panel')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('assembly-pipeline-automode')); });

    const groups = S.operations.filter((o) => o.isOpGroup);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('overlap_pcr');
    // The auto group contains all 4 pieces (the snippet too — finalizer
    // skips snippet/gap when generating primers, but the group's
    // inputPieces preserves the strip order).
    expect(groups[0].inputPieces).toHaveLength(4);

    // ─ Step 6a: K15 derived auto primers — pool has 6 (3 sourced × 2).
    const pool = S.assemblyDraftPrimers[zid] || [];
    expect(pool).toHaveLength(6);

    // 6b: middle sourced piece (the one AFTER the snippet) — its fwd
    //     tail must contain the His sequence.
    const middleSourced = finalOrder[2]; // index 2 in the re-ordered list
    const middleFwd = pool.find((p) => p.origin.pieceId === middleSourced.id && p.origin.side === 'fwd');
    expect(middleFwd.tail.includes('CATCATCATCATCATCAT')).toBe(true);

    // 6c: mutagenic flag travels to the first piece's primers.
    const firstPrimers = pool.filter((p) => p.origin.pieceId === firstSourced.id);
    expect(firstPrimers.every((p) => p.mutated === true)).toBe(true);

    // ─ Step 7: lock one primer (auto → manual) then remove the op-group.
    const toLock = pool[0];
    act(() => { A.updateAssemblyPrimer(zid, toLock.id, { autoMode: 'manual' }); });
    expect(S.assemblyDraftPrimers[zid].find((p) => p.id === toLock.id).autoMode).toBe('manual');

    act(() => { A.removeOpGroup(groups[0].id); });
    const left = S.assemblyDraftPrimers[zid];
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(toLock.id);
    expect(left[0].autoMode).toBe('manual');
  });
});
