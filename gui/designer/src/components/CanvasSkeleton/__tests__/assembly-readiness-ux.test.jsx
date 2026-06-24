/**
 * assembly-readiness-ux.test.jsx — UX slice 4: one readiness line above the
 * strip so the biologist gets ONE answer to "is this assembly settled?" without
 * mentally integrating N junctions. Derived purely from the per-junction trust
 * state (tentative vs decided) + differs-from-assembly. No biology.
 */
import { describe, it, expect, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { assemblyReadiness, assemblyJunctionConflicts, enrichZonesWithJunctions, pairKeyFor } from '../lib/junction-derive';
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

  // S1 (V161) — readiness must reflect CHEMISTRY, not just clicks: a junction
  // whose two sticky ends do not mate (V160 junctionInterlock 'incompatible')
  // blocks the build even though every junction glyph was decided.
  it('an incompatible interlock blocks readiness even when every junction is DECIDED', () => {
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'restriction', autoMode: 'manual' } },
    );
    zones[0].interlock = { verdict: 'incompatible', message: 'Несовместимые липкие концы' };
    const r = assemblyReadiness(zones);
    expect(r.incompatible).toBe(1);
    expect(r.ready).toBe(false);
  });

  it('RC-D1 — assemblyJunctionConflicts names each incompatible STICKY junction (3+ fragments)', () => {
    const zones = enrichZonesWithJunctions(
      [
        { zoneId: 'pc1', end: 16, label: 'insert' },
        { zoneId: 'pc2', end: 32, label: 'linker' },
        { zoneId: 'pc3', end: 48, label: 'vector' },
      ],
      {
        [pairKeyFor('pc1', 'pc2')]: { method: 'restriction', autoMode: 'manual' },
        [pairKeyFor('pc2', 'pc3')]: { method: 'restriction', autoMode: 'manual' },
      },
    );
    // The pc2→pc3 seam (zones[1]) is the incompatible one.
    zones[1].interlock = { verdict: 'incompatible', message: 'Несовместимые липкие концы: 5′ AATT ≠ 5′ TCGA' };
    const conflicts = assemblyJunctionConflicts(zones);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].leftLabel).toBe('linker');
    expect(conflicts[0].rightLabel).toBe('vector');
    expect(conflicts[0].message).toMatch(/AATT/);
    // count parity with assemblyReadiness.incompatible
    expect(conflicts.length).toBe(assemblyReadiness(zones).incompatible);
  });

  it('RC-BIO-3 — incompatible CLOSURE seam (circular) blocks readiness + named in conflicts', () => {
    // A 2-fragment circular RE assembly: internal seam fine, but the closing
    // (last→first) seam does not mate. The closure must be counted.
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16, label: 'insert' }, { zoneId: 'pc2', end: 32, label: 'vector' }],
      { [PK12]: { method: 'restriction', autoMode: 'manual' } },
    );
    zones[0].interlock = { verdict: 'compatible' }; // internal seam OK
    const closure = {
      interlock: { verdict: 'incompatible', message: 'Несовместимые липкие концы: 5′ AATT ≠ 5′ TCGA' },
      kind: 're_ligation', pairKey: pairKeyFor('pc2', 'pc1'), leftLabel: 'vector', rightLabel: 'insert',
    };
    const r = assemblyReadiness(zones, closure);
    expect(r.incompatible).toBe(1);
    expect(r.ready).toBe(false);
    const conflicts = assemblyJunctionConflicts(zones, closure);
    expect(conflicts.length).toBe(r.incompatible);
    const c = conflicts.find((x) => x.isClosure);
    expect(c).toBeTruthy();
    expect(c.leftLabel).toBe('vector');
    expect(c.rightLabel).toBe('insert');
  });

  it('RC-BIO-3 — closure compatible OR non-sticky method → not counted (back-compat: no closure arg)', () => {
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'restriction', autoMode: 'manual' } },
    );
    // compatible closure
    expect(assemblyReadiness(zones, { interlock: { verdict: 'compatible' }, kind: 're_ligation' }).incompatible).toBe(0);
    // incompatible but non-sticky (gibson/overlap closure) → mismatch irrelevant
    expect(assemblyReadiness(zones, { interlock: { verdict: 'incompatible' }, kind: 'overlap' }).incompatible).toBe(0);
    // no closure arg → unchanged
    expect(assemblyReadiness(zones).incompatible).toBe(0);
    expect(assemblyJunctionConflicts(zones)).toEqual([]);
  });

  it('RC-D1 — compatible junction → no conflicts; non-sticky method ignored (parity with readiness)', () => {
    const compat = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'restriction', autoMode: 'manual' } },
    );
    compat[0].interlock = { verdict: 'compatible' };
    expect(assemblyJunctionConflicts(compat)).toEqual([]);

    const overlap = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'overlap_pcr', autoMode: 'manual' } },
    );
    overlap[0].interlock = { verdict: 'incompatible', message: 'x' };
    // overlap_pcr is NOT a sticky join → not a conflict (matches readiness gate).
    expect(assemblyJunctionConflicts(overlap)).toEqual([]);
    expect(assemblyReadiness(overlap).incompatible).toBe(0);
  });

  it('compatible / blunt / unknown interlocks do NOT block readiness', () => {
    const mk = (verdict) => {
      const zones = enrichZonesWithJunctions(
        [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
        { [PK12]: { method: 'restriction', autoMode: 'manual' } },
      );
      zones[0].interlock = { verdict };
      return assemblyReadiness(zones);
    };
    expect(mk('compatible').ready).toBe(true);
    expect(mk('blunt').ready).toBe(true);
    expect(mk('unknown').ready).toBe(true);
    expect(mk('compatible').incompatible).toBe(0);
  });

  it('an incompatible interlock on an OVERLAP/Gibson junction does NOT block — those rework the ends', () => {
    const zones = enrichZonesWithJunctions(
      [{ zoneId: 'pc1', end: 16 }, { zoneId: 'pc2', end: 32 }],
      { [PK12]: { method: 'overlap_pcr', autoMode: 'manual' } },
    );
    zones[0].interlock = { verdict: 'incompatible' };
    const r = assemblyReadiness(zones);
    expect(r.incompatible).toBe(0); // Gibson homology ignores the RE overhangs
    expect(r.ready).toBe(true);
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

  // S1 (V161) — two RE fragments whose facing sticky ends DON'T mate (EcoRI 5′
  // AATT vs SalI 5′ TCGA) → red «сборка невозможна» line + Realise disabled,
  // even though both junction glyphs would otherwise be clickable. The whole
  // coloredZones→junctionInterlock→assemblyReadiness→UI path runs for real.
  it('incompatible RE sticky ends → red readiness line + Realise blocked', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZX', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    // A's RIGHT end = EcoRI (higher cut); B's LEFT end = SalI (lower cut) → mismatch.
    const reParams = (enzymes) => ({ enzymes, cutSites: [{ position: 2 }, { position: 20 }] });
    const mkRE = (sid, enzymes) => {
      act(() => {
        A.zoneDispatch({
          type: 'CREATE_PIECE',
          piece: {
            kind: 'sourced', name: sid, sourceIds: [sid],
            ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }],
            origin: 'selection', acquisitionMethod: 'restriction', acquisitionParams: reParams(enzymes),
          },
        });
      });
      const pid = S.pieces[S.pieces.length - 1].id;
      act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
      return pid;
    };
    const pidA = mkRE('src1', ['BamHI', 'EcoRI']); // sorted: left BamHI@2, right EcoRI@20
    const pidB = mkRE('src2', ['SalI', 'BamHI']);  // sorted: left SalI@2,  right BamHI@20
    // The junction is an actual RE-ligation (sticky ends joined as-is) — so the
    // EcoRI(AATT) vs SalI(TCGA) mismatch genuinely blocks (a Gibson junction here
    // would NOT, since homology reworks the ends).
    act(() => {
      A.zoneDispatch({
        type: 'SET_BOUNDARY_OVERLAP', zoneId: zid, pairKey: pairKeyFor(pidA, pidB),
        method: 'restriction', autoMode: 'manual',
      });
    });
    act(() => { A.openEditorAssemblyTab(zid); });

    const line = screen.getByTestId('assembly-readiness');
    expect(line.getAttribute('data-incompatible')).toBe('1');
    expect(line.textContent.toLowerCase()).toMatch(/несовместим/);
    expect(screen.getByTestId('assembly-realise-btn').disabled).toBe(true);
  });

  // S2 (V162) — two CURSOR fragments (5′-OH) blunt-ligated → the junction can't
  // seal without T4 PNK. Readiness shows the amber phosphorylation note + the
  // segment rows badge their 5′-OH ends. Non-blocking (Realise stays enabled).
  it('two 5′-OH cursor fragments + blunt ligation → 5′-OH/phosphorylation surfaced', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZP', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    const mkCursor = (sid) => {
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
    const pidA = mkCursor('src1');
    const pidB = mkCursor('src2');
    act(() => {
      A.zoneDispatch({
        type: 'SET_BOUNDARY_OVERLAP', zoneId: zid, pairKey: pairKeyFor(pidA, pidB),
        method: 'direct_ligation', autoMode: 'manual',
      });
    });
    act(() => { A.openEditorAssemblyTab(zid); });

    const line = screen.getByTestId('assembly-readiness');
    expect(line.getAttribute('data-needs-phos')).toBe('1');
    expect(screen.getByTestId('assembly-verify-warnings').textContent.toLowerCase()).toMatch(/фосфорилир/);
    expect(screen.getAllByTestId('segment-endchem-phos').length).toBeGreaterThan(0);
    // S5 — cursor fragments carry the «⌖» acquisition badge (visual tracking).
    expect(screen.getAllByTestId('segment-acq-badge').map((el) => el.textContent)).toContain('⌖');
    // Non-blocking: a 5′-OH end is a protocol step, not an impossibility.
    expect(screen.getByTestId('assembly-realise-btn').disabled).toBe(false);
  });

  // S3 (V163) — RE-cloning chemistry: one fragment cut by buffer-incompatible
  // enzymes (sequential digest), one with same overhangs both ends (self-
  // ligation → dephosphorylate). Surfaced in readiness + segment-row chips.
  it('RE fragments surface sequential digest + dephosphorylation notes', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZR3', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    const reParams = (enzymes) => ({ enzymes, cutSites: [{ position: 2 }, { position: 20 }] });
    const mkRE = (sid, enzymes) => {
      act(() => {
        A.zoneDispatch({
          type: 'CREATE_PIECE',
          piece: {
            kind: 'sourced', name: sid, sourceIds: [sid],
            ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }],
            origin: 'selection', acquisitionMethod: 'restriction', acquisitionParams: reParams(enzymes),
          },
        });
      });
      const pid = S.pieces[S.pieces.length - 1].id;
      act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    };
    mkRE('src1', ['EcoRI', 'BglII']); // CutSmart vs NEBuffer 3.1 → sequential digest
    mkRE('src2', ['EcoRI', 'MfeI']);  // both 5′ AATT → self-ligation → dephosphorylate
    act(() => { A.openEditorAssemblyTab(zid); });

    const line = screen.getByTestId('assembly-readiness');
    expect(line.getAttribute('data-sequential')).toBe('1');
    expect(line.getAttribute('data-dephos')).toBe('1');
    const warn = screen.getByTestId('assembly-verify-warnings').textContent.toLowerCase();
    expect(warn).toMatch(/последовательн/);
    expect(warn).toMatch(/дефосфорил/);
    expect(screen.getByTestId('segment-recloning-sequential')).toBeTruthy();
    expect(screen.getByTestId('segment-recloning-dephos')).toBeTruthy();
    // S5 — RE-cut fragments carry the «RE» acquisition badge.
    expect(screen.getAllByTestId('segment-acq-badge').map((el) => el.textContent)).toContain('RE');
  });

  // V167 — per-fragment method picker (transparency + «оверлап оверлапом»):
  // promote a cursor fragment to Overlap-PCR → it amplifies. The store updates
  // (SET_PIECE_ACQUISITION_METHOD) and the acquisition badge follows.
  it('per-fragment method picker promotes a cursor fragment to Overlap-PCR', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZM', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
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
    const pidA = mk('src1');
    mk('src2');
    act(() => { A.openEditorAssemblyTab(zid); });

    // expand the first row, then change its method to Overlap-PCR
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${pidA}`)); });
    act(() => { fireEvent.change(screen.getByTestId(`segment-method-${pidA}`), { target: { value: 'ov-pcr' } }); });

    expect(S.pieces.find((p) => p.id === pidA).acquisitionMethod).toBe('ov-pcr');
    // the acquisition badge follows the new method
    expect(screen.getAllByTestId('segment-acq-badge').map((el) => el.textContent)).toContain('OV');
  });
});

// ─── Кирпич 2 — edit-driven mutagenesis: a base edit surfaces the mechanism ──

describe('Кирпич 2 — edit-driven mutation mechanism line', () => {
  const CM = {
    id: 'srcMut', kind: 'molecule', name: 'pMut',
    sequence: `ATG${'GCC'.repeat(30)}TAA`, annotations: [], topology: { circular: false },
  };

  it('an in-editor substitution shows the derived molecular mechanism', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(CM); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZMUT', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_PIECE',
        piece: {
          kind: 'sourced', name: 'pMut', sourceIds: ['srcMut'],
          ranges: [{ sourceId: 'srcMut', start: 0, end: 96, orientation: 'forward' }],
          origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
        },
      });
    });
    const pid = S.pieces[S.pieces.length - 1].id;
    act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    // record an in-editor substitution (local pos 30: G→T) — what onSequenceEdit
    // dispatches for a 1-nt replace on a sourced piece.
    act(() => { A.zoneDispatch({ type: 'ADD_PIECE_MUTATION', pieceId: pid, mutation: { position: 30, fromBase: 'G', toBase: 'T' } }); });
    act(() => { A.openEditorAssemblyTab(zid); });

    const line = screen.getByTestId('assembly-mutation-mechanism');
    // linear single-segment edit → overlap-extension mechanism (two_fragment).
    expect(line.getAttribute('data-mechanism')).toBe('two_fragment');
    expect(line.getAttribute('data-mech-blocked')).toBe('false');
    expect(line.textContent.toLowerCase()).toMatch(/механик/);
    // 3a — the derived protocol is surfaced from the same edit.
    expect(line.textContent.toLowerCase()).toMatch(/протокол/);

    // Point 1 — derive is available for overlap too; it creates the op node
    // (overlap leaves primers to the assembly engine → none in the pool).
    act(() => { fireEvent.click(screen.getByTestId('assembly-derive-primers-btn')); });
    expect((S.operations || []).some((o) => o.kind === 'mutagenesis')).toBe(true);
    const derivedPool = (S.assemblyDraftPrimers[zid] || []).filter((p) => p.source.kind === 'derived-mutagenesis');
    expect(derivedPool.length).toBe(0);
  });

  it('derive primers → KLD pair lands in the pool with project+assembly provenance', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(CM); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZKLD', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    // circular → the single edited plasmid is a KLD (site-directed) job.
    act(() => { A.zoneDispatch({ type: 'SET_ZONE_TOPOLOGY', zoneId: zid, circular: true }); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_PIECE',
        piece: {
          kind: 'sourced', name: 'pMut', sourceIds: ['srcMut'],
          ranges: [{ sourceId: 'srcMut', start: 0, end: 96, orientation: 'forward' }],
          origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
        },
      });
    });
    const pid = S.pieces[S.pieces.length - 1].id;
    act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    act(() => { A.zoneDispatch({ type: 'ADD_PIECE_MUTATION', pieceId: pid, mutation: { position: 30, fromBase: 'G', toBase: 'T' } }); });
    act(() => { A.openEditorAssemblyTab(zid); });

    const line = screen.getByTestId('assembly-mutation-mechanism');
    expect(line.getAttribute('data-mechanism')).toBe('kld');
    act(() => { fireEvent.click(screen.getByTestId('assembly-derive-primers-btn')); });

    // The circular single fragment also auto-generates self-closure primers;
    // filter to the pair WE derived from the edit.
    const pool = (S.assemblyDraftPrimers[zid] || []).filter((p) => p.source.kind === 'derived-mutagenesis');
    expect(pool.length).toBe(2);
    expect(pool[0].source.assemblyId).toBe(zid);
    expect(pool[0].source.mechanism).toBe('kld');
    expect(pool.map((p) => p.direction).sort()).toEqual(['forward', 'reverse']);

    // 3c — the same derive also creates an op_mutagenesis NODE on the canvas.
    const op = (S.operations || []).find((o) => o.kind === 'mutagenesis');
    expect(op).toBeTruthy();
    expect(op.params.mutationType).toBe('point');
    expect(op.params.mutations[0]).toEqual({ position: 30, from: 'G', to: 'T' });
  });

  it('swap mechanism → KLD flips to overlap-extension (Кирпич 4)', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(CM); });
    act(() => { A.zoneDispatch({ type: 'CREATE_ZONE', zone: { name: 'ZSWAP', bounds: { x: 0, y: 0, width: 600, height: 400 } } }); });
    const zid = S.zones[S.zones.length - 1].id;
    act(() => { A.zoneDispatch({ type: 'SET_ZONE_TOPOLOGY', zoneId: zid, circular: true }); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_PIECE',
        piece: {
          kind: 'sourced', name: 'pMut', sourceIds: ['srcMut'],
          ranges: [{ sourceId: 'srcMut', start: 0, end: 96, orientation: 'forward' }],
          origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
        },
      });
    });
    const pid = S.pieces[S.pieces.length - 1].id;
    act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
    act(() => { A.zoneDispatch({ type: 'ADD_PIECE_MUTATION', pieceId: pid, mutation: { position: 30, fromBase: 'G', toBase: 'T' } }); });
    act(() => { A.openEditorAssemblyTab(zid); });

    expect(screen.getByTestId('assembly-mutation-mechanism').getAttribute('data-mechanism')).toBe('kld');
    act(() => { fireEvent.click(screen.getByTestId('assembly-mech-swap-btn')); });
    expect(screen.getByTestId('assembly-mutation-mechanism').getAttribute('data-mechanism')).toBe('two_fragment');
  });
});
