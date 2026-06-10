/**
 * assembly-readiness-ux.test.jsx — UX slice 4: one readiness line above the
 * strip so the biologist gets ONE answer to "is this assembly settled?" without
 * mentally integrating N junctions. Derived purely from the per-junction trust
 * state (tentative vs decided) + differs-from-assembly. No biology.
 */
import { describe, it, expect, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, cleanup, act } from '@testing-library/react';
import { assemblyReadiness, enrichZonesWithJunctions, pairKeyFor } from '../lib/junction-derive';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);

const PK12 = pairKeyFor('pc1', 'pc2');

// ─── pure helper ───────────────────────────────────────────────────────────

describe('UX slice 4 — assemblyReadiness (pure)', () => {
  it('all-tentative assembly is NOT ready and counts the defaults', () => {
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }, { zoneId: 'pc3', end: 48 }], {},
    );
    const r = assemblyReadiness(zones);
    expect(r.total).toBe(2);
    expect(r.tentative).toBe(2);
    expect(r.ready).toBe(false);
  });

  it('all-decided assembly is ready', () => {
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'overlap_pcr', autoMode: 'manual' } },
    );
    const r = assemblyReadiness(zones);
    expect(r.tentative).toBe(0);
    expect(r.ready).toBe(true);
  });

  it('counts junctions that differ from the assembly method', () => {
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'golden_gate', autoMode: 'manual' } }, 'overlap_pcr',
    );
    expect(assemblyReadiness(zones).differs).toBe(1);
  });

  it('no junctions → not ready (nothing to assemble yet)', () => {
    expect(assemblyReadiness([{ zoneId: 'only', end: 10 }]).ready).toBe(false);
  });
});

// ─── live: the readiness line renders in the editor ────────────────────────

const C1 = { id: 'src1', kind: 'molecule', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false } };
const C2 = { id: 'src2', kind: 'molecule', name: 'pET', sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false } };
let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('UX slice 4 — readiness line in the live editor', () => {
  it('a fresh 2-piece assembly shows a "по умолчанию" readiness line', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZR', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    const mk = (sid) => {
      act(() => {
        A.zoneDispatch({
          type: 'CREATE_PIECE',
          piece: { kind: 'sourced', name: sid, sourceIds: [sid], ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }], origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {} },
        });
      });
      const pid = S.pieces[S.pieces.length - 1].id;
      act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    };
    mk('src1');
    mk('src2');
    act(() => { A.openEditorAssemblyTab(zid); });
    const line = screen.getByTestId('assembly-readiness');
    expect(line.textContent.toLowerCase()).toMatch(/умолчан/);
  });
});
