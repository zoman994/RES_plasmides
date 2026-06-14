/**
 * realise-method-from-junction-j9.test.jsx — JUNCTION step-2 FIX, J9.
 *
 * The assembly method is owned by the junction on the strip; RealiseModal only
 * REFLECTS it (no method radio buttons). The realiseAssembly signature is
 * unchanged — only the source of the per-boundary methods map moves from the
 * picker to zone.junctions.
 *   • methodsFromJunctions — pure: {[boundaryIdx]: method}, junction wins, else
 *     the suggestion, else gibson.
 *   • MethodPickerCard — read-only (no radios), shows the chosen method.
 *   • RealiseModal (live editor): a method set on the junction drives the
 *     realised junction kind.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { methodsFromJunctions, pairKeyFor } from '../lib/junction-derive';
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

function legacyDraft() {
  let s = buildInitialState();
  s = { ...s, containers: [...s.containers, C1, C2] };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'd', name: 'D' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'd', sourceContainerId: 'src1', start: 0, end: 24, rc: false });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'd', sourceContainerId: 'src2', start: 0, end: 24, rc: false });
  return s.assemblyDrafts.find((d) => d.id === 'd');
}

// ─── methodsFromJunctions (pure) ───────────────────────────────────────────

describe('JUNCTION FIX J9 — methodsFromJunctions (pure)', () => {
  it('the junction method wins over the suggestion', () => {
    const draft = legacyDraft();
    const [a, b] = draft.segments.map((seg) => seg.id);
    const zoneJunctions = { [pairKeyFor(a, b)]: { method: 'restriction' } };
    const m = methodsFromJunctions(draft, zoneJunctions, [{ method: 'gibson' }]);
    expect(m[0]).toBe('restriction');
  });

  it('falls back to the suggestion when no junction config', () => {
    const draft = legacyDraft();
    const m = methodsFromJunctions(draft, {}, [{ method: 'overlap_pcr' }]);
    expect(m[0]).toBe('overlap_pcr');
  });

  it('falls back to overlap_pcr for a LINEAR internal join — never gibson (AM-5)', () => {
    // gibson is a ring-forming method; a linear internal fuse must default to
    // overlap PCR. (This case previously asserted gibson — that encoded the bug.)
    const draft = legacyDraft();
    const m = methodsFromJunctions(draft, {}, []);
    expect(m[0]).toBe('overlap_pcr');
  });

  it('circular: the closure boundary defaults to gibson (AM-5)', () => {
    const draft = { ...legacyDraft(), topology: { circular: true } };
    const m = methodsFromJunctions(draft, {}, []);
    // 2 segments circular → keys 0 (internal) + 1 (closure)
    expect(m[0]).toBe('overlap_pcr'); // internal fuse
    expect(m[1]).toBe('gibson'); // last→first closure
  });

  it('prefers the construct assemblyMethod over the bare default (AM-2)', () => {
    const draft = { ...legacyDraft(), assemblyMethod: 'restriction' };
    const m = methodsFromJunctions(draft, {}, []);
    expect(m[0]).toBe('restriction');
  });

  it('keys boundaries by index 0..N−2', () => {
    const draft = legacyDraft();
    const m = methodsFromJunctions(draft, {}, [{ method: 'gibson' }]);
    expect(Object.keys(m)).toEqual(['0']); // 2 segments → 1 boundary
  });
});

// ─── Realise reads the method from the junction (live editor) ──────────────

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('JUNCTION FIX J9 — realise reads the method from zone.junctions', () => {
  function mount() {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'ZJ9', bounds: { x: 0, y: 0, width: 600, height: 400 } },
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
      return pid;
    };
    const p1 = mk('src1');
    const p2 = mk('src2');
    act(() => { A.openEditorAssemblyTab(zid); });
    return { zid, p1, p2 };
  }

  it('a method set on the junction drives the realised junction kind', () => {
    const { zid, p1, p2 } = mount();
    // The biologist set restriction on this junction (strip click → JunctionControl).
    act(() => {
      A.zoneDispatch({
        type: 'SET_BOUNDARY_OVERLAP', zoneId: zid, pairKey: pairKeyFor(p1, p2), method: 'restriction',
      });
    });
    // Modal removed (Игорь 11.06): the button realises directly from the strip
    // junctions — no confirm step, no preview.
    act(() => { fireEvent.click(screen.getByTestId('assembly-realise-btn')); });
    expect(screen.queryByTestId('realise-modal')).toBeNull();
    expect(S.junctions.length).toBe(1);
    // restriction (engine) → re_ligation (junction.kind) — proves the method
    // came from the junction, not the gibson default.
    expect(S.junctions[0].kind).toBe('re_ligation');
  });
});
