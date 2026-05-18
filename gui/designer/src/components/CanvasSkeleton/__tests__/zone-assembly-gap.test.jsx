/**
 * zone-assembly-gap.test.jsx — T6 K12.
 *
 * InsertGapModal in zone-mode: all three tabs (linker preset / custom
 * sequence / unknown length) route INSERT_MANUAL_SEGMENT through the
 * K8 zone-write adapter → a kind='gap' piece in the zone.
 *
 * V83 (17.05.2026) — the former T6 DEC-T6-02/09 "sequence-lossy"
 * deviation is FIXED. A gap piece now carries an optional
 * `gapSequence`: a linker preset / custom sequence is preserved
 * verbatim (gapHint 'known', gapLength === gapSequence.length); only
 * the «Неизв. длина» tab stays a poly-N placeholder. (Reported as a
 * real bug: a T2A self-cleaving peptide silently became 54 N's.) The
 * file is NOT renamed to InsertGapInZoneModal (DEC-T6-08 precedent:
 * avoid breaking imports / the legacy K7 modal tests).
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

function openEmptyZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'ZG', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}

const gapPieces = (zid) => S.pieces.filter((p) => p.zoneId === zid && p.kind === 'gap');

describe('T6 K12 — InsertGapModal gap-piece creation in zone-mode', () => {
  it('preset linker → gap piece keeps the linker sequence (V83)', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-gap')); });
    const m = screen.getByTestId('insert-gap-modal');
    act(() => { fireEvent.click(within(m).getByTestId('gap-tab-linker')); });
    act(() => { fireEvent.click(within(m).getAllByTestId('gap-preset')[0]); });
    act(() => { fireEvent.click(within(m).getByTestId('gap-insert')); });
    const gs = gapPieces(zid);
    expect(gs).toHaveLength(1);
    // LINKERS[0] = 6×His = 'CACCACCACCACCACCAC' (18 nt).
    expect(gs[0].gapSequence).toBe('CACCACCACCACCACCAC');
    expect(gs[0].gapLength).toBe(18);
    expect(gs[0].gapHint).toBe('known');
  });

  it('custom sequence → gap piece preserves it verbatim, uppercased (V83)', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-gap')); });
    const m = screen.getByTestId('insert-gap-modal');
    act(() => { fireEvent.click(within(m).getByTestId('gap-tab-custom')); });
    act(() => {
      fireEvent.change(within(m).getByTestId('gap-custom-seq'), { target: { value: 'atcgATCG' } });
    });
    act(() => { fireEvent.click(within(m).getByTestId('gap-insert')); });
    const gs = gapPieces(zid);
    expect(gs).toHaveLength(1);
    expect(gs[0].gapSequence).toBe('ATCGATCG'); // V83 — sequence kept, not dropped
    expect(gs[0].gapLength).toBe(8);
    expect(gs[0].gapHint).toBe('known');
  });

  it('unknown length → gap piece of N bp (primary correct case)', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-gap')); });
    const m = screen.getByTestId('insert-gap-modal');
    act(() => { fireEvent.click(within(m).getByTestId('gap-tab-unknown')); });
    act(() => {
      fireEvent.change(within(m).getByTestId('gap-unknown-len'), { target: { value: '24' } });
    });
    act(() => { fireEvent.click(within(m).getByTestId('gap-insert')); });
    const gs = gapPieces(zid);
    expect(gs).toHaveLength(1);
    expect(gs[0].gapLength).toBe(24);
    expect(gs[0].gapHint).toBe('unknown');
    expect(gs[0].origin).toBe('manual-gap');
  });

  it('Cancel closes without inserting', () => {
    const zid = openEmptyZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-add-gap')); });
    const m = screen.getByTestId('insert-gap-modal');
    act(() => { fireEvent.click(within(m).getByTestId('gap-cancel')); });
    expect(screen.queryByTestId('insert-gap-modal')).toBeNull();
    expect(gapPieces(zid)).toHaveLength(0);
  });
});
