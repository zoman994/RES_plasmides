/**
 * zone-assembly-realise.test.jsx — T6 K11.
 *
 * ASSEMBLY_REALISE dual-resolves: handleAssemblyRealise resolves a zone
 * target (no draft) and applies the realiseAssembly diff (ops +
 * junctions + containers) just like a legacy draft. RealiseModal /
 * RealiseDagPreview / suggestMethodForBoundary are zone-aware via the
 * dual chokepoint; MethodPickerCard is prop-driven.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const C1 = {
  id: 'src1', kind: 'molecule', name: 'pUC',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false },
};
const C2 = {
  id: 'src2', kind: 'molecule', name: 'pET',
  sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false },
};

function piece(id, sid, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: [sid],
    ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    derivedReactionId: null, frozen: false, createdAt, updatedAt: createdAt,
  };
}

function zoneState() {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, C1, C2],
    zones: [{
      id: 'zn-1', name: 'ZR', viewMode: 'sequence',
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    }],
    pieces: [piece('pc1', 'src1', 1), piece('pc2', 'src2', 2)],
  };
}

describe('T6 K11 — ASSEMBLY_REALISE on a zone target (reducer)', () => {
  it('applies the diff atomically (2 PCR + 1 assembly op + 1 junction + 3 containers)', () => {
    let s = zoneState();
    const ops0 = s.operations.length;
    const cnt0 = s.containers.length;
    s = skeletonReducer(s, {
      type: 'ASSEMBLY_REALISE', draftId: 'zn-1', perBoundaryMethods: { 0: 'gibson' },
    });
    expect(s.operations.length).toBe(ops0 + 3); // 2 PCR + 1 assembly op (10.06)
    expect(s.junctions.length).toBe(1);
    expect(s.containers.length).toBe(cnt0 + 3);
    expect(s.operations.every((o) => o.kind === 'pcr' || o.origin?.kind === 'realised-assembly' || ops0 === 0)).toBe(true);
  });

  it('unknown id (neither zone nor draft) → state unchanged', () => {
    const s = zoneState();
    const out = skeletonReducer(s, {
      type: 'ASSEMBLY_REALISE', draftId: 'nope', perBoundaryMethods: {},
    });
    expect(out.operations.length).toBe(s.operations.length);
  });

  it('legacy draft realise still works (transition back-compat)', () => {
    let s = buildInitialState();
    s = { ...s, containers: [...s.containers, C1, C2] };
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm', name: 'L' });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src1', start: 0, end: 24, rc: false });
    s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm', sourceContainerId: 'src2', start: 0, end: 24, rc: false });
    const before = s.operations.length;
    s = skeletonReducer(s, { type: 'ASSEMBLY_REALISE', draftId: 'asm', perBoundaryMethods: { 0: 'gibson' } });
    expect(s.operations.length).toBe(before + 3); // 2 PCR + 1 assembly op (10.06)
    expect(s.assemblyDrafts.find((d) => d.id === 'asm').realiseRevision).toBe(1);
  });
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('T6 K11 — realise (direct, no modal) in zone-mode', () => {
  function mount() {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'ZRM', bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    const mk = (sid) => {
      act(() => {
        A.zoneDispatch({
          type: 'CREATE_PIECE',
          piece: {
            kind: 'sourced', name: sid, sourceIds: [sid],
            ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }],
            origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
          },
        });
      });
      const pid = S.pieces[S.pieces.length - 1].id;
      act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    };
    mk('src1');
    mk('src2');
    act(() => { A.openEditorAssemblyTab(zid); });
    return zid;
  }

  it('Realise button realises directly (no modal) → adds ops + junction', () => {
    mount();
    const btn = screen.getByTestId('assembly-realise-btn');
    expect(btn.disabled).toBe(false);
    // Modal removed (Игорь 11.06) — one click realises straight to the canvas.
    act(() => { fireEvent.click(btn); });
    expect(screen.queryByTestId('realise-modal')).toBeNull();
    expect(S.operations.filter((o) => o.kind === 'pcr').length).toBeGreaterThanOrEqual(2);
    expect(S.junctions.length).toBe(1);
  });

  it('re-realising the zone REGENERATES, it does not duplicate (Игорь 11.06)', () => {
    mount();
    act(() => { fireEvent.click(screen.getByTestId('assembly-realise-btn')); });
    const ops1 = S.operations.length;
    const cont1 = S.containers.length;
    const jun1 = S.junctions.length;
    expect(S.containers.filter((c) => c.origin && c.origin.kind === 'realised-product')).toHaveLength(1);
    // Second click must replace the prior DAG, not stack a second copy.
    act(() => { fireEvent.click(screen.getByTestId('assembly-realise-btn')); });
    expect(S.operations.length).toBe(ops1);
    expect(S.containers.length).toBe(cont1);
    expect(S.junctions.length).toBe(jun1);
    expect(S.containers.filter((c) => c.origin && c.origin.kind === 'realised-product')).toHaveLength(1);
  });
});
