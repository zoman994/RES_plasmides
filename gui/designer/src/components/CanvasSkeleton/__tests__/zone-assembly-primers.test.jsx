/**
 * zone-assembly-primers.test.jsx — T6 K10.
 *
 * WRITE_ASSEMBLY_PRIMER dual-resolves: a zone target builds a
 * pieces-shaped draft-like for the assembly sequence + boundaries;
 * primers are stored under assemblyDraftPrimers[zoneId] (id-keyed map).
 * AssemblyPrimersPanel + selectBoundaryCoverage become zone-aware via
 * the selectAssemblyDraftById chokepoint (no component edits).
 * MethodPickerCard is prop-driven (untouched).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import { selectBoundaryCoverage } from '../store/selectors-assembly';
import EditorWindowShell from '../editor/EditorWindowShell';
import { reverseComplement } from '../../../sequence-utils';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const C = {
  id: 'cZ', name: 'pUC', kind: 'molecule',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGG', annotations: [],
};

function zoneStateWithPiece() {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, C],
    zones: [{
      id: 'zn-1', name: 'Z', viewMode: 'sequence',
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    }],
    pieces: [{
      id: 'pc1', kind: 'sourced', name: 'pc1',
      sourceIds: ['cZ'],
      ranges: [{ sourceId: 'cZ', start: 0, end: 24, orientation: 'forward' }],
      origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
      functionalLabel: null, color: '#abc', zoneId: 'zn-1',
      derivedReactionId: null, frozen: false, createdAt: 1, updatedAt: 1,
    }],
    assemblyDraftPrimers: {},
  };
}

describe('T6 K10 — WRITE_ASSEMBLY_PRIMER on a zone target', () => {
  it('forward primer stored under assemblyDraftPrimers[zoneId] with binding from the assembled sequence', () => {
    let s = zoneStateWithPiece();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'zn-1', range: { start: 0, end: 20 }, direction: 'forward',
    });
    const list = s.assemblyDraftPrimers['zn-1'];
    expect(list).toHaveLength(1);
    expect(list[0].direction).toBe('forward');
    // assembled seq = cZ[0:24]; fwd binding = first 20 nt
    expect(list[0].bindingSequence).toBe(C.sequence.slice(0, 20));
    expect(list[0].name).toBe('asm-fwd-1');
  });

  it('reverse primer binding is reverse-complemented (zone-sourced sequence)', () => {
    let s = zoneStateWithPiece();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'zn-1', range: { start: 0, end: 20 }, direction: 'reverse',
    });
    expect(s.assemblyDraftPrimers['zn-1'][0].bindingSequence)
      .toBe(reverseComplement(C.sequence.slice(0, 20)));
  });

  it('selectBoundaryCoverage resolves a zone target (chokepoint dual)', () => {
    const s = zoneStateWithPiece();
    // single piece → no internal boundaries, but the selector must not
    // throw and must see the zone-projected draft.
    const cov = selectBoundaryCoverage(s, 'zn-1');
    expect(Array.isArray(cov)).toBe(true);
  });

  it('legacy draft primer write still works (transition back-compat)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'aP', name: 'P' });
    s = skeletonReducer(s, {
      type: 'INSERT_MANUAL_SEGMENT', draftId: 'aP', sequence: 'AAAACCCCGGGGTTTTAAAA',
    });
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'aP', range: { start: 0, end: 20 }, direction: 'forward',
    });
    expect(s.assemblyDraftPrimers.aP).toHaveLength(1);
    expect(s.assemblyDraftPrimers.aP[0].bindingSequence).toBe('AAAACCCCGGGGTTTTAAAA');
  });
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('T6 K10 — AssemblyPrimersPanel mounted in zone-mode', () => {
  it('panel lists a primer written on a zone assembly', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'ZP', bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_PIECE',
        piece: {
          kind: 'sourced', name: 'p', sourceIds: ['cZ'],
          ranges: [{ sourceId: 'cZ', start: 0, end: 24, orientation: 'forward' }],
          origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
        },
      });
    });
    const pid = S.pieces[S.pieces.length - 1].id;
    act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    act(() => { A.openEditorAssemblyTab(zid); });
    act(() => {
      A.writeAssemblyPrimer({
        draftId: zid, range: { start: 0, end: 20 }, direction: 'forward', source: 'manual',
      });
    });
    expect(S.assemblyDraftPrimers[zid]).toHaveLength(1);
    expect(screen.getAllByTestId('assembly-primer-row').length).toBeGreaterThanOrEqual(1);
  });
});
