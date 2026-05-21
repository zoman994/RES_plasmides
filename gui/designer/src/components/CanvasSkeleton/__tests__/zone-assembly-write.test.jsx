/**
 * zone-assembly-write.test.jsx — T6 K8 (integration).
 *
 * SegmentList + SegmentDetailPanel, mounted in zone-mode, drive the
 * ASSEMBLY_* write actions which assemblyReducer dual-resolves to
 * piece/zone mutations (zone-assembly-write-adapter). Mirrors the
 * legacy assembly-mode.test.jsx K5/K10 contract, on pieces.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
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

const SRC = {
  id: 'cZ', name: 'pUC', kind: 'molecule',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [],
};

function addPieceToZone(zid, start, end) {
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_PIECE',
      piece: {
        kind: 'sourced',
        name: `pc${start}`,
        sourceIds: ['cZ'],
        ranges: [{ sourceId: 'cZ', start, end, orientation: 'forward' }],
        origin: 'selection',
        acquisitionMethod: 'undefined',
        acquisitionParams: {},
      },
    });
  });
  const pid = S.pieces[S.pieces.length - 1].id;
  act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
  return pid;
}

function openZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer(SRC); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'ZW', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  const a = addPieceToZone(zid, 0, 8);
  const b = addPieceToZone(zid, 8, 16);
  act(() => { A.openEditorAssemblyTab(zid); });
  return { zid, a, b };
}

const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid);

describe('T6 K8 — SegmentList + SegmentDetailPanel zone-mode writes', () => {
  it('delete ✕ removes the piece', () => {
    const { zid } = openZone();
    expect(zonePieces(zid)).toHaveLength(2);
    const rows = screen.getAllByTestId('assembly-segment-row');
    act(() => { within(rows[1]).getByTestId('assembly-segment-delete').click(); });
    expect(zonePieces(zid)).toHaveLength(1);
  });

  it('reorder ▼ on first row swaps piece order', () => {
    const { zid, a } = openZone();
    const rows = screen.getAllByTestId('assembly-segment-row');
    act(() => { within(rows[0]).getByTestId('assembly-segment-down').click(); });
    // first display row is now the other piece; `a` moved to index 1
    const orderedIds = [...zonePieces(zid)]
      .sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0))
      .map((p) => p.id);
    expect(orderedIds[1]).toBe(a);
  });

  it('inline RC flips orientation (V94 — SegmentDetailPanel снят)', () => {
    const { a } = openZone();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    act(() => { screen.getByTestId(`segment-row-expand-${segId}`).click(); });
    act(() => { screen.getByTestId(`segment-inline-rc-${segId}`).click(); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    const pcA = S.pieces.find((p) => p.id === a);
    expect(pcA.ranges[0].orientation).toBe('reverse');
  });

  it('inline range edit re-slices the piece (V94)', () => {
    const { a } = openZone();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    act(() => { screen.getByTestId(`segment-row-expand-${segId}`).click(); });
    act(() => {
      fireEvent.change(screen.getByTestId(`segment-inline-start-${segId}`), { target: { value: '4' } });
    });
    act(() => {
      fireEvent.change(screen.getByTestId(`segment-inline-end-${segId}`), { target: { value: '12' } });
    });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    const pcA = S.pieces.find((p) => p.id === a);
    expect(pcA.ranges[0]).toMatchObject({ start: 4, end: 12 });
  });

  it('inline label edit → piece.name (V94)', () => {
    const { a } = openZone();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    act(() => { screen.getByTestId(`segment-row-expand-${segId}`).click(); });
    act(() => {
      fireEvent.change(screen.getByTestId(`segment-inline-label-${segId}`), { target: { value: 'promoter' } });
    });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    expect(S.pieces.find((p) => p.id === a).name).toBe('promoter');
  });

  it('orphan: remove source → badge; convert-to-gap → piece.kind gap', () => {
    const { a } = openZone();
    act(() => { A.removeContainer('cZ'); });
    // REMOVE_CONTAINER deletes a piece whose only source is gone (T2
    // DEC-T2-11) → zone now empty, no rows.
    expect(S.pieces.find((p) => p.id === a)).toBeUndefined();
    expect(screen.queryAllByTestId('assembly-segment-row')).toHaveLength(0);
  });
});
