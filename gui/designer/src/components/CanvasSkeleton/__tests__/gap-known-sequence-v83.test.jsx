/**
 * gap-known-sequence-v83.test.jsx — V83 fix.
 *
 * BUG (user-reported, 17.05.2026): inserting a gap whose card has a
 * KNOWN sequence (a linker preset like T2A, or a typed custom sequence)
 * rendered as poly-N of the same length instead of the real DNA. The
 * 4-tier gap piece only stored gapLength/gapHint — the actual sequence
 * was silently dropped (documented as the T6 DEC-T6-02/09 deviation;
 * promoted to a real bug because a T2A self-cleaving peptide is a
 * functional element, NOT an unknown placeholder).
 *
 * FIX: gap pieces gain an optional `gapSequence`. When present
 * (linker / custom), it is preserved verbatim end-to-end and
 * gapLength === gapSequence.length, gapHint = 'known'. When ABSENT
 * (the «Неизв. длина» tab — a genuine unknown placeholder) the
 * behaviour is UNCHANGED: poly-N of gapLength. Additive + optional →
 * no migration; old persisted gap pieces keep the poly-N behaviour.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
} from '@testing-library/react';
import { createPiece } from '../lib/piece-model';
import { validateCreate } from '../lib/piece-invariants';
import { routeAssemblyWriteToZone } from '../lib/zone-assembly-write-adapter';
import { draftFromZone, realiseAssembly } from '../lib/zone-pieces-to-dag';
import {
  pieceToSegmentShape, computeAssemblySequenceFromPieces,
} from '../lib/segment-to-piece-adapter';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

// LINKERS[2] in InsertGapModal — a real 54-nt self-cleaving peptide.
const T2A = 'GAGGGCAGAGGAAGTCTGCTAACATGCGGTGACGTCGAGGAGAATCCTGGCCCT';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const C1 = {
  id: 'src1', kind: 'molecule', name: 'pUC',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false },
};

function sourced(id, sourceId, start, end, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: [sourceId],
    ranges: [{ sourceId, start, end, orientation: 'forward' }],
    origin: 'legacy-migration', acquisitionMethod: 'undefined', acquisitionParams: {},
    functionalLabel: null, color: '#abcdef', zoneId: 'zn-1',
    derivedReactionId: null, frozen: false, createdAt, updatedAt: createdAt,
  };
}
function knownGap(id, seq, createdAt) {
  return {
    id, kind: 'gap', name: 'T2A', sourceIds: [], ranges: [],
    gapLength: seq.length, gapHint: 'known', gapSequence: seq,
    origin: 'manual-gap', acquisitionMethod: 'synthesis',
    acquisitionParams: { type: 'manual-gap' }, functionalLabel: 'gap',
    zoneId: 'zn-1', createdAt, updatedAt: createdAt,
  };
}
function zoneState(pieces) {
  return {
    containers: [C1], operations: [], junctions: [], assemblyDrafts: [],
    positions: {}, zones: [{ id: 'zn-1', name: 'Z1', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces,
  };
}

describe('V83 — piece-model: gap carries an optional gapSequence', () => {
  it('createPiece keeps gapSequence and derives gapLength from it', () => {
    const g = createPiece({
      kind: 'gap', name: 'T2A', gapSequence: T2A, origin: 'manual-gap',
      acquisitionMethod: 'synthesis', acquisitionParams: { type: 'manual-gap' },
    }, []);
    expect(g.kind).toBe('gap');
    expect(g.gapSequence).toBe(T2A);
    expect(g.gapLength).toBe(T2A.length); // derived, not 0
  });

  it('a gap WITHOUT gapSequence is unchanged (no gapSequence key)', () => {
    const g = createPiece({
      kind: 'gap', name: 'Гэп 20 нт', gapLength: 20, gapHint: 'unknown',
      origin: 'manual-gap', acquisitionMethod: 'synthesis',
      acquisitionParams: { type: 'manual-gap' },
    }, []);
    expect(g.gapLength).toBe(20);
    expect('gapSequence' in g).toBe(false);
  });
});

describe('V83 — piece-invariants: gapSequence consistency', () => {
  const base = {
    kind: 'gap', name: 'g', sourceIds: [], ranges: [], origin: 'manual-gap',
    acquisitionMethod: 'synthesis', acquisitionParams: { type: 'manual-gap' },
  };
  const stateWith = () => ({ containers: [], pieces: [] });
  it('consistent gapSequence/gapLength → ok', () => {
    expect(validateCreate(stateWith(), {
      ...base, gapSequence: 'ATCG', gapLength: 4,
    })).toEqual({ ok: true });
  });
  it('gapLength ≠ gapSequence.length → fail', () => {
    expect(validateCreate(stateWith(), {
      ...base, gapSequence: 'ATCG', gapLength: 99,
    }).ok).toBe(false);
  });
  it('non-string gapSequence → fail', () => {
    expect(validateCreate(stateWith(), {
      ...base, gapSequence: 123, gapLength: 3,
    }).ok).toBe(false);
  });
  it('gap WITHOUT gapSequence still ok (regression guard)', () => {
    expect(validateCreate(stateWith(), {
      ...base, gapLength: 12, gapHint: 'unknown',
    })).toEqual({ ok: true });
  });
});

describe('V83 — write adapter INSERT_MANUAL_SEGMENT preserves a known sequence', () => {
  const baseState = {
    containers: [C1], pieces: [],
    zones: [{ id: 'zn-1', name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
  };
  it('sequence given (linker/custom) → gap piece with gapSequence + gapHint "known"', () => {
    const next = routeAssemblyWriteToZone(baseState, {
      type: 'INSERT_MANUAL_SEGMENT', draftId: 'zn-1', sequence: T2A, label: 'T2A',
    });
    const g = next.pieces.find((p) => p.kind === 'gap');
    expect(g.gapSequence).toBe(T2A);
    expect(g.gapLength).toBe(T2A.length);
    expect(g.gapHint).toBe('known');
  });
  it('no sequence (unknown-length tab) → no gapSequence, poly-N path kept', () => {
    const next = routeAssemblyWriteToZone(baseState, {
      type: 'INSERT_MANUAL_SEGMENT', draftId: 'zn-1', length: 20, gapKind: 'unknown',
    });
    const g = next.pieces.find((p) => p.kind === 'gap');
    expect(g.gapLength).toBe(20);
    expect(g.gapHint).toBe('unknown');
    expect(g.gapSequence == null).toBe(true);
  });
});

describe('V83 — realise / sequence path uses the real sequence, not N×len', () => {
  it('draftFromZone: known gap → segment.sequence is the real DNA', () => {
    const seg = draftFromZone(zoneState([knownGap('g1', T2A, 1)]), { id: 'zn-1', name: 'Z1' })
      .segments[0];
    expect(seg.sequence).toBe(T2A);
    expect(seg.length).toBe(T2A.length);
    expect(/^N+$/.test(seg.sequence)).toBe(false);
  });

  it('computeAssemblySequenceFromPieces: known gap contributes its DNA (no N-run)', () => {
    const out = computeAssemblySequenceFromPieces(
      [knownGap('g1', T2A, 1)], { containers: [C1] },
    );
    expect(out).toBe(T2A);
    expect(out.includes('N')).toBe(false);
  });

  it('computeAssemblySequenceFromPieces: gap WITHOUT gapSequence still → N×gapLength', () => {
    const out = computeAssemblySequenceFromPieces(
      [{ id: 'g', kind: 'gap', gapLength: 6 }], { containers: [] },
    );
    expect(out).toBe('NNNNNN');
  });

  it('pieceToSegmentShape: known gap keeps the sequence', () => {
    const seg = pieceToSegmentShape(knownGap('g1', T2A, 1));
    expect(seg.sequence).toBe(T2A);
    expect(seg.length).toBe(T2A.length);
  });

  it('realiseAssembly: sourced + known-gap → ok:true, frag holds T2A (not N×54)', () => {
    const s = zoneState([sourced('p1', 'src1', 0, 12, 1), knownGap('g2', T2A, 2)]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true); // NOT blocked by gap-without-sequence
    const gapCnt = r.diff.containers.find((c) => /gap-2/.test(c.name));
    expect(gapCnt.sequence).toBe(T2A);
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    expect(product.sequence).toContain(T2A);
    expect(/N{10,}/.test(product.sequence)).toBe(false);
  });
});

describe('V83 — paste custom sequence (zone-mode, SAFE custom-segment path)', () => {
  // SPEC_ASSEMBLY_CUSTOM_SEGMENT §3 — the InsertGapModal is removed;
  // «вставить свой сиквенс» в едином пикере идёт через тот же
  // INSERT_MANUAL_SEGMENT → known-gap path. This re-covers the V83
  // reported flow end-to-end via the new UI.
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
  const pasteSeq = (value) => {
    act(() => {
      fireEvent.change(screen.getByTestId('assembly-source-picker-paste-input'), { target: { value } });
    });
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-paste-confirm')); });
  };

  it('T2A pasted → gap piece keeps the full T2A sequence (not poly-N)', () => {
    const zid = openEmptyZone();
    pasteSeq(T2A);
    const g = S.pieces.filter((p) => p.zoneId === zid && p.kind === 'gap')[0];
    expect(g.gapSequence).toBe(T2A);
    expect(g.gapLength).toBe(T2A.length);
    expect(g.gapHint).toBe('known');
  });

  it('mixed-case input → preserved verbatim, uppercased', () => {
    const zid = openEmptyZone();
    pasteSeq('atcgATCG');
    const g = S.pieces.filter((p) => p.zoneId === zid && p.kind === 'gap')[0];
    expect(g.gapSequence).toBe('ATCGATCG');
    expect(g.gapLength).toBe(8);
  });
});
