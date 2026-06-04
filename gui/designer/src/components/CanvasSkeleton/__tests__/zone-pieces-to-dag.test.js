/**
 * zone-pieces-to-dag.test.js — T6 K5.
 *
 * realiseAssembly rewritten to read pieces from a zone (4-tier shape)
 * while keeping the A4 reverse-DAG algorithm + API signature
 * (DEC-T6-04/05/15). Dual-resolution: a zone id resolves via
 * state.pieces[zoneId]; a legacy assemblyDrafts id still resolves
 * during the transition window (R-T6-4 back-compat).
 */
import { describe, it, expect } from 'vitest';
import { realiseAssembly, nameWithRevision } from '../lib/zone-pieces-to-dag';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

const C1 = {
  id: 'src1', kind: 'molecule', name: 'pUC',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false },
};
const C2 = {
  id: 'src2', kind: 'molecule', name: 'pET',
  sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false },
};

function piece(id, sourceId, start, end, orientation, extra = {}) {
  return {
    id,
    kind: 'sourced',
    name: id,
    sourceIds: [sourceId],
    ranges: [{ sourceId, start, end, orientation: orientation || 'forward' }],
    origin: 'legacy-migration',
    acquisitionMethod: 'undefined',
    acquisitionParams: {},
    functionalLabel: null,
    color: '#abcdef',
    zoneId: 'zn-1',
    derivedReactionId: null,
    frozen: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function zoneState(pieces, containers = [C1, C2]) {
  return {
    containers,
    operations: [],
    junctions: [],
    assemblyDrafts: [],
    positions: {},
    zones: [{
      id: 'zn-1', name: 'Z1', viewMode: 'sequence',
      bounds: { x: 0, y: 0, width: 600, height: 400 },
    }],
    pieces,
  };
}

describe('T6 K5 — zone-pieces-to-dag realiseAssembly (zone + pieces shape)', () => {
  it('2 sourced pieces + 1 boundary (gibson) → 2 ops, 1 junction, 3 containers', () => {
    const s = zoneState([
      piece('pc1', 'src1', 0, 24, 'forward', { createdAt: 1 }),
      piece('pc2', 'src2', 0, 24, 'forward', { createdAt: 2 }),
    ]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    expect(r.diff.operations).toHaveLength(2);
    expect(r.diff.junctions).toHaveLength(1);
    expect(r.diff.junctions[0].kind).toBe('overlap'); // gibson → overlap
    expect(r.diff.containers).toHaveLength(3); // 2 amplicons + 1 product
    expect(r.diff.operations[0].kind).toBe('pcr');
    expect(r.diff.operations[0].inputs).toContain('src1');
  });

  it('per-boundary methods reflected in junction kinds', () => {
    const C3 = { ...C1, id: 'src3', name: 'p3' };
    const s = zoneState([
      piece('p1', 'src1', 0, 24, 'forward', { createdAt: 1 }),
      piece('p2', 'src2', 0, 24, 'forward', { createdAt: 2 }),
      piece('p3', 'src3', 0, 24, 'forward', { createdAt: 3 }),
    ], [C1, C2, C3]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson', 1: 'restriction' }, {});
    expect(r.ok).toBe(true);
    expect(r.diff.junctions).toHaveLength(2);
    expect(r.diff.junctions[0].kind).toBe('overlap');
    expect(r.diff.junctions[1].kind).toBe('re_ligation');
  });

  it('reverse-orientation piece → frag container holds the RC slice', () => {
    const s = zoneState([
      piece('pf', 'src1', 0, 4, 'forward', { createdAt: 1 }), // AAAA
      piece('pr', 'src1', 0, 4, 'reverse', { createdAt: 2 }), // RC(AAAA)=TTTT
    ]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    const frag2 = r.diff.containers.find((c) => /frag-2/.test(c.name));
    expect(frag2.sequence).toBe('TTTT');
  });

  it('gap piece (kind=gap) blocks realise → ok:false gap-without-sequence', () => {
    const s = zoneState([
      piece('p1', 'src1', 0, 24, 'forward', { createdAt: 1 }),
      {
        id: 'g1', kind: 'gap', name: 'Гэп 20 нт', sourceIds: [], ranges: [],
        gapLength: 20, gapHint: 'unknown', origin: 'manual-gap',
        acquisitionMethod: 'synthesis', acquisitionParams: {},
        functionalLabel: 'gap', zoneId: 'zn-1', createdAt: 2,
      },
    ]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gap/i);
  });

  it('piece referencing a missing container → ok:false orphan/source', () => {
    const s = zoneState([
      piece('p1', 'GONE', 0, 24, 'forward', { createdAt: 1 }),
      piece('p2', 'src2', 0, 24, 'forward', { createdAt: 2 }),
    ]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/orphan|source/i);
  });

  it('unknown zone id → ok:false not found', () => {
    const r = realiseAssembly(zoneState([]), 'nope', {}, {});
    expect(r.ok).toBe(false);
  });

  it('zone with no pieces → ok:false (no segments)', () => {
    const r = realiseAssembly(zoneState([]), 'zn-1', {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/сегмент|segment/i);
  });

  it('pieces ordered by createdAt regardless of array order', () => {
    const s = zoneState([
      piece('pB', 'src2', 0, 24, 'forward', { createdAt: 5 }),
      piece('pA', 'src1', 0, 24, 'forward', { createdAt: 1 }),
    ]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    expect(r.diff.operations[0].inputs).toContain('src1'); // earliest first
  });

  it('positions laid out in a line; nameWithRevision suffixes >1', () => {
    const s = zoneState([
      piece('p1', 'src1', 0, 24, 'forward', { createdAt: 1 }),
      piece('p2', 'src2', 0, 24, 'forward', { createdAt: 2 }),
    ]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, { revision: 2 });
    expect(r.ok).toBe(true);
    const op0 = r.diff.operations[0];
    expect(r.diff.positionsLayout.operations[op0.id]).toBeTruthy();
    expect(r.diff.containers.some((c) => /-r2/.test(c.name))).toBe(true);
    expect(nameWithRevision('x', 1)).toBe('x');
    expect(nameWithRevision('x', 3)).toBe('x-r3');
  });

  it('backward-compat: legacy assemblyDrafts path still resolves', () => {
    const s = {
      containers: [C1, C2], operations: [], junctions: [], zones: [], pieces: [],
      positions: {},
      assemblyDrafts: [{
        id: 'asm', name: 'Legacy', topology: { circular: false }, realiseRevision: 0,
        segments: [
          {
            id: 's1', source: { type: 'container', containerId: 'src1' },
            start: 0, end: 24, reverseComplement: false, sequence: C1.sequence,
            length: 24, annotations: [],
          },
          {
            id: 's2', source: { type: 'container', containerId: 'src2' },
            start: 0, end: 24, reverseComplement: false, sequence: C2.sequence,
            length: 24, annotations: [],
          },
        ],
      }],
    };
    const r = realiseAssembly(s, 'asm', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    expect(r.diff.operations).toHaveLength(2);
    expect(r.diff.junctions).toHaveLength(1);
  });
});

// ─── V130 — realise materialises the auto-group primer (with tail), not the
// tailless autoPrimerPair fallback (SPEC §9b / acceptance «Приёмка слоя 2»). ──
//
// The layer-2 fix (mapPrimersForSegment matches the auto-group record by
// source.pieceId) only matters when assemblyDraftPrimers actually holds
// auto-group primers. The other realise tests pass an empty pool → the
// fallback branch, never exercising the fix locus. This builds the realistic
// state via CREATE_OP_GROUP (same path as node-a-primer-record's
// zoneStateWithGroup) so deriveAutoPrimers fills the pool with tailed primers,
// then asserts realise consumes THEM (source:'assembly', tm≠0, tail kept) —
// not the fallback (which would be source:'auto', tm:0, tailless slice(0,20)).
const SRC_OG = {
  id: 'src-og', kind: 'molecule', name: 'srcOG',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
  annotations: [], topology: { circular: false },
};

function ogPiece(id, start, end, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['src-og'],
    ranges: [{ sourceId: 'src-og', start, end, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    derivedReactionId: null, frozen: false, createdAt, updatedAt: createdAt,
  };
}

function zoneStateWithGroup() {
  let s = buildInitialState();
  s = {
    ...s,
    containers: [...s.containers, SRC_OG],
    zones: [{ id: 'zn-1', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [ogPiece('pc1', 0, 32, 1), ogPiece('pc2', 32, 64, 2)],
  };
  return skeletonReducer(s, {
    type: 'CREATE_OP_GROUP', zoneId: 'zn-1', kind: 'overlap_pcr', name: 'G', pieceIds: ['pc1', 'pc2'],
  });
}

describe('V130 — realise keeps the auto-group overlap tail (not the fallback)', () => {
  it('every PCR op consumes the assembly primer (source:assembly, tm≠0), not autoPrimerPair', () => {
    const s = zoneStateWithGroup();
    const primers = s.assemblyDraftPrimers['zn-1'];
    expect(primers).toHaveLength(4); // fwd+rev per piece, all auto-group with tails

    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    expect(r.diff.operations).toHaveLength(2);

    for (const op of r.diff.operations) {
      const up = op.params.userPrimers[0];
      // The V130 discriminator: mapPrimersForSegment matched → source:'assembly'.
      // Pre-fix the auto-group kind missed the whitelist → autoPrimerPair
      // fallback (source:'auto', fwdTm:0, tailless 20-nt slices).
      expect(up.source).toBe('assembly');
      expect(up.fwdTm).not.toBe(0);
      // forward is the exact auto-group fwd primer for this segment (tail kept).
      const draftFwd = primers.find(
        (p) => p.source.pieceId === op.origin.segmentId && p.source.side === 'fwd',
      );
      expect(up.forward).toBe(draftFwd.sequence);
    }
  });

  it('one-sided overlap: downstream fwd carries the tail, upstream rev is binding-only', () => {
    const s = zoneStateWithGroup();
    const r = realiseAssembly(s, 'zn-1', { 0: 'gibson' }, {});
    // pc1 (createdAt 1) = upstream, pc2 (createdAt 2) = downstream.
    const down = r.diff.operations.find((o) => o.origin.segmentId === 'pc2').params.userPrimers[0];
    const up = r.diff.operations.find((o) => o.origin.segmentId === 'pc1').params.userPrimers[0];
    // Downstream fwd has the 30-nt homology arm → longer than its binding.
    expect(down.forward.length).toBeGreaterThan(down.fwdBinding.length);
    // Upstream rev carries no overlap tail (overlapTarget='right') → binding-only.
    expect(up.reverse.length).toBe(up.revBinding.length);
  });
});
