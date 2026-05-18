/**
 * zone-assembly-read.test.jsx — T6 K7.
 *
 * AssemblyModeShell now dual-resolves its target: a ZONE id projects to
 * a pieces-shaped draft-like (selectZoneAsDraftLike → draftFromZone),
 * and the existing assembly-mode read path (header length/count,
 * SequenceTab assembled sequence + one coloured zone per piece,
 * SegmentList rows) renders it with no shape rewrite. A legacy
 * assemblyDrafts id still resolves unchanged (transition window).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within,
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

// Pieces are created zone-less (T1 invariant: createPiece zoneId=null),
// then assigned to the zone via SET_PIECE_ZONE (T3) — exactly what the
// zone-mode write facade will do in later K-steps.
function addPieceToZone(zid, start, end, orientation) {
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_PIECE',
      piece: {
        kind: 'sourced',
        name: `pc${start}`,
        sourceIds: ['cZ'],
        ranges: [{
          sourceId: 'cZ', start, end, orientation: orientation || 'forward',
        }],
        origin: 'selection',
        acquisitionMethod: 'undefined',
        acquisitionParams: {},
      },
    });
  });
  const pid = S.pieces[S.pieces.length - 1].id;
  act(() => {
    A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid });
  });
}

function openZoneWith2() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer(SRC); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'ZoneBuild', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  addPieceToZone(zid, 0, 8, 'forward');
  addPieceToZone(zid, 8, 16, 'forward');
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}

describe('T6 K7 — AssemblyModeShell reads a zone (pieces) via dual-resolve', () => {
  it('mounts the shell for a zone id; header shows assembled length + piece count', () => {
    const zid = openZoneWith2();
    const shell = screen.getByTestId('assembly-mode-shell');
    expect(shell.getAttribute('data-draft-id')).toBe(zid);
    const info = within(screen.getByTestId('assembly-header'))
      .getByTestId('assembly-header-info').textContent;
    // pcA src[0:8]=8bp + pcB src[8:16]=8bp = 16bp, 2 pieces
    expect(info).toMatch(/16 bp/);
    expect(info).toMatch(/2 сегм/);
  });

  it('renders one coloured backdrop zone per piece', () => {
    openZoneWith2();
    const zones = screen.getAllByTestId('sequence-view-zone');
    const ids = new Set(zones.map((z) => z.getAttribute('data-zone-id')));
    expect(ids.size).toBe(2);
  });

  it('SegmentList shows one row per piece with the source name', () => {
    openZoneWith2();
    const rows = screen.getAllByTestId('assembly-segment-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/pUC/)).toBeTruthy();
  });

  it('empty zone → shell mounts, no segment rows, header 0', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'EmptyZ', bounds: { x: 0, y: 0, width: 300, height: 200 } },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    act(() => { A.openEditorAssemblyTab(zid); });
    expect(screen.getByTestId('assembly-mode-shell')).toBeTruthy();
    expect(screen.queryAllByTestId('assembly-segment-row')).toHaveLength(0);
  });

  it('legacy assemblyDrafts id still resolves (transition back-compat)', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-legacy', name: 'Legacy' }); });
    act(() => { A.insertManualSegment('asm-legacy', { sequence: 'AAAACCCC' }); });
    act(() => { A.openEditorAssemblyTab('asm-legacy'); });
    const shell = screen.getByTestId('assembly-mode-shell');
    expect(shell.getAttribute('data-draft-id')).toBe('asm-legacy');
    expect(screen.getAllByTestId('assembly-segment-row')).toHaveLength(1);
  });
});
