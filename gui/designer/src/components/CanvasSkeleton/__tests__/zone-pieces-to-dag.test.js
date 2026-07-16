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
import {
  realiseAssembly, nameWithRevision, pruneZoneRealiseOutput, draftFromZone,
} from '../lib/zone-pieces-to-dag';
import { segmentOverhangs } from '../lib/segment-overhangs';
import { RE_ENZYMES } from '../../../restriction-db';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('pruneZoneRealiseOutput — idempotent re-realise helper (Игорь 11.06)', () => {
  const stateWith = () => ({
    containers: [
      { id: 'srcA', name: 'pUC' }, // a source — no realise origin → survives
      { id: 'fragA', name: 'asm-frag-1', origin: { kind: 'realised', assemblyId: 'zn-1' } },
      { id: 'prodA', name: 'asm-product', origin: { kind: 'realised-product', assemblyId: 'zn-1' } },
      { id: 'fragOther', name: 'other', origin: { kind: 'realised', assemblyId: 'zn-2' } },
    ],
    operations: [
      { id: 'opA', kind: 'pcr', origin: { kind: 'realised', assemblyId: 'zn-1' } },
      { id: 'opOther', kind: 'pcr', origin: { kind: 'realised', assemblyId: 'zn-2' } },
    ],
    junctions: [
      { id: 'jA', realisedFrom: { assemblyId: 'zn-1' } },
      { id: 'jOther', realisedFrom: { assemblyId: 'zn-2' } },
    ],
    positions: { fragA: { x: 1, y: 1 }, opA: { x: 2, y: 2 }, srcA: { x: 0, y: 0 } },
  });

  it('drops only THIS zone\'s realise output, keeping sources + other zones', () => {
    const out = pruneZoneRealiseOutput(stateWith(), 'zn-1');
    expect(out.containers.map((c) => c.id)).toEqual(['srcA', 'fragOther']);
    expect(out.operations.map((o) => o.id)).toEqual(['opOther']);
    expect(out.junctions.map((j) => j.id)).toEqual(['jOther']);
    expect(out.positions).toEqual({ srcA: { x: 0, y: 0 } }); // stale node positions gone
  });

  it('returns the SAME slice refs when there is nothing to prune (first realise)', () => {
    const s = stateWith();
    const out = pruneZoneRealiseOutput(s, 'zn-never');
    expect(out.containers).toBe(s.containers);
    expect(out.operations).toBe(s.operations);
    expect(out.junctions).toBe(s.junctions);
    expect(out.positions).toBe(s.positions);
  });
});

describe('draftFromZone — multi-range piece (#2 invert/backbone)', () => {
  it('concatenates all ranges (wrapped backbone = [hi..end] + [0..lo])', () => {
    const state = {
      containers: [{ id: 'c', name: 'pl', sequence: 'AAAACCCCGGGGTTTT' }], // 16 bp
      pieces: [{
        id: 'p1', zoneId: 'z1', kind: 'sourced', createdAt: 1, sourceIds: ['c'],
        ranges: [
          { sourceId: 'c', start: 12, end: 16, orientation: 'forward' }, // TTTT
          { sourceId: 'c', start: 0, end: 4, orientation: 'forward' }, // AAAA
        ],
      }],
      zones: [],
    };
    const draft = draftFromZone(state, { id: 'z1', topology: { circular: false } });
    expect(draft.segments[0].sequence).toBe('TTTTAAAA');
    expect(draft.segments[0].length).toBe(8);
  });

  it('single-range piece is unchanged (back-compat)', () => {
    const state = {
      containers: [{ id: 'c', sequence: 'AAAACCCCGGGGTTTT' }],
      pieces: [{
        id: 'p1', zoneId: 'z1', kind: 'sourced', createdAt: 1, sourceIds: ['c'],
        ranges: [{ sourceId: 'c', start: 4, end: 8, orientation: 'forward' }],
      }],
      zones: [],
    };
    const draft = draftFromZone(state, { id: 'z1', topology: { circular: false } });
    expect(draft.segments[0].sequence).toBe('CCCC');
  });

  it('wrap piece keeps annotations from BOTH ranges, shifted by the cumulative offset (Игорь 22.06)', () => {
    const state = {
      containers: [{
        id: 'c', name: 'pl', sequence: 'AAAACCCCGGGGTTTT', // 16 bp
        annotations: [
          // 1-based incl on parent. [14,15] sits in range0 (12..16) → local [2,3].
          { id: 'aT', type: 'CDS', level: 'region', start: 14, end: 15 },
          // [2,3] sits in range1 (0..4) → local [2,3] + offset 4 → [6,7].
          { id: 'aA', type: 'CDS', level: 'region', start: 2, end: 3 },
        ],
      }],
      pieces: [{
        id: 'p1', zoneId: 'z1', kind: 'sourced', createdAt: 1, sourceIds: ['c'],
        ranges: [
          { sourceId: 'c', start: 12, end: 16, orientation: 'forward' }, // TTTT
          { sourceId: 'c', start: 0, end: 4, orientation: 'forward' }, // AAAA
        ],
      }],
      zones: [],
    };
    const anns = draftFromZone(state, { id: 'z1', topology: { circular: false } }).segments[0].annotations;
    expect(anns).toHaveLength(2); // both ranges contributed (was [] before the coord-stitch)
    expect(anns.map((a) => a.start).sort((x, y) => x - y)).toEqual([2, 6]); // range1's ann shifted by len(range0)=4
  });

  // Игорь 07.07 — «при инверсии теряются липкие концы, если были выбраны две рестриктазы».
  // The inverted two-enzyme backbone wraps the origin; segmentOverhangs must read its ends
  // by PHYSICAL side (top strand starts at the high cut) not sorted position.
  describe('origin-wrap RE ends survive the invert (two enzymes)', () => {
    const SEQ = 'A'.repeat(20) + 'C'.repeat(10); // 30 bp; EcoRI@6(low), BamHI@20(high)
    const rp = { enzymes: ['EcoRI', 'BamHI'], cutSites: [{ position: 6 }, { position: 20 }] };
    const mkState = (ranges) => ({
      containers: [{ id: 'c', name: 'pl', sequence: SEQ }],
      pieces: [{
        id: 'p1', zoneId: 'z1', kind: 'sourced', createdAt: 1, sourceIds: ['c'],
        acquisitionMethod: 'restriction', acquisitionParams: rp, ranges,
      }],
      zones: [],
    });
    const segOf = (ranges) => draftFromZone(mkState(ranges), { id: 'z1', topology: { circular: false } }).segments[0];

    it('inverted backbone [hi..end]+[0..lo] → originWrap:true, LEFT=BamHI(high), RIGHT=EcoRI(low)', () => {
      const seg = segOf([
        { sourceId: 'c', start: 20, end: 30, orientation: 'forward' }, // high arc = physical 5′ start
        { sourceId: 'c', start: 0, end: 6, orientation: 'forward' }, // low arc
      ]);
      expect(seg.originWrap).toBe(true);
      const oh = segmentOverhangs(seg, RE_ENZYMES);
      expect(oh.left.enzyme).toBe('BamHI');
      expect(oh.right.enzyme).toBe('EcoRI');
      // sticky ends are NOT lost — both carry their overhang seq
      expect(oh.left.seq).toBeTruthy();
      expect(oh.right.seq).toBeTruthy();
    });

    it('the excised fragment [lo..hi] (single range) is unaffected → LEFT=EcoRI(low), RIGHT=BamHI(high)', () => {
      const seg = segOf([{ sourceId: 'c', start: 6, end: 20, orientation: 'forward' }]);
      expect(seg.originWrap).toBe(false);
      const oh = segmentOverhangs(seg, RE_ENZYMES);
      expect(oh.left.enzyme).toBe('EcoRI');
      expect(oh.right.enzyme).toBe('BamHI');
    });
  });
});

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
    expect(r.diff.operations.filter((o) => o.kind === 'pcr')).toHaveLength(2); // + 1 assembly op
    expect(r.diff.junctions).toHaveLength(1);
    expect(r.diff.junctions[0].kind).toBe('overlap'); // gibson → overlap
    expect(r.diff.containers).toHaveLength(3); // 2 amplicons + 1 product
    expect(r.diff.operations[0].kind).toBe('pcr');
    expect(r.diff.operations[0].inputs).toContain('src1');
  });

  it('CH-2 — a restriction-acquired piece realises to a «cut» op (not pcr), no primers', () => {
    const rp = (id, src) => piece(id, src, 0, 24, 'forward', {
      acquisitionMethod: 'restriction',
      acquisitionParams: { enzymes: ['EcoRI', 'BamHI'], cutSites: [{ position: 0 }, { position: 24 }] },
    });
    const s = zoneState([rp('pr1', 'src1'), rp('pr2', 'src2')]);
    const r = realiseAssembly(s, 'zn-1', { 0: 'restriction' }, {});
    expect(r.ok).toBe(true);
    // each digest fragment's reaction is a «cut» (not a PCR amplification)
    const fragOps = r.diff.operations.filter((o) => o.origin && o.origin.segmentId);
    expect(fragOps.length).toBe(2);
    for (const o of fragOps) {
      expect(o.kind).toBe('cut');
      expect(o.params.userPrimers).toBeUndefined();
      expect(Array.isArray(o.params.enzymes)).toBe(true);
    }
    // and NO pcr op amplifies a digest fragment
    expect(r.diff.operations.filter((o) => o.kind === 'pcr' && o.origin && o.origin.segmentId)).toHaveLength(0);
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
    expect(r.diff.operations.filter((o) => o.kind === 'pcr')).toHaveLength(2); // + 1 assembly op
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
    const pcrOps = r.diff.operations.filter((o) => o.kind === 'pcr');
    expect(pcrOps).toHaveLength(2); // + 1 assembly op (no userPrimers — skip it here)

    for (const op of pcrOps) {
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

// P0 (Игорь 27.06) — draftFromZone auto-closes a closable RE assembly UNLESS the user made
// an explicit «Линейная/Кольцевая» choice (zone.topology.explicit). SET_ZONE_TOPOLOGY marks
// the choice explicit so auto-close can't override it.
describe('P0 — explicit topology choice vs auto-close', () => {
  const C = { id: 'cA', name: 'src', sequence: 'GGGCCCAAAATTTTGGGCCCAAAATTTTGGGCCCAAAA' };
  // SmaI(blunt)/ApaI(GGCC) pair: two such fragments close into a ring (GGCC↔GGCC + blunt↔blunt).
  const reP = (id, t) => ({
    id, zoneId: 'zt', kind: 'sourced',
    ranges: [{ sourceId: 'cA', start: 0, end: 10, orientation: 'forward' }],
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes: ['SmaI', 'ApaI'], cutSites: [{ position: 0 }, { position: 10 }] },
    createdAt: t,
  });
  const baseState = { containers: [C], pieces: [reP('p1', 1), reP('p2', 2)] };

  it('no explicit choice → closable 2-RE assembly AUTO-closes (circular)', () => {
    const zone = { id: 'zt', name: 'Z' };
    expect(draftFromZone({ ...baseState, zones: [zone] }, zone).topology.circular).toBe(true);
  });

  it('explicit «Линейная» is RESPECTED → stays linear despite closable ends', () => {
    const zone = { id: 'zt', name: 'Z', topology: { circular: false, explicit: true } };
    expect(draftFromZone({ ...baseState, zones: [zone] }, zone).topology.circular).toBe(false);
  });

  it('SET_ZONE_TOPOLOGY marks the choice explicit (even when stored already matches)', () => {
    const s0 = { ...buildInitialState(), ...baseState, zones: [{ id: 'zt', name: 'Z' }] };
    const s1 = skeletonReducer(s0, { type: 'SET_ZONE_TOPOLOGY', zoneId: 'zt', circular: false });
    const zone = s1.zones.find((z) => z.id === 'zt');
    expect(zone.topology.explicit).toBe(true);
    expect(zone.topology.circular).toBe(false);
  });

  // P0.2 — draftFromZone is memoized per (immutable state, zoneId): same state ref → same object
  // (collapses the 2–5×/keystroke recompute incl. orientFragments); a new state ref recomputes.
  it('P0.2 — memoized: same state → same draft ref; new state → fresh', () => {
    const zone = { id: 'zt', name: 'Z' };
    const s = { ...baseState, zones: [zone] };
    expect(draftFromZone(s, zone)).toBe(draftFromZone(s, zone));
    const s2 = { ...baseState, zones: [zone] }; // new state ref
    expect(draftFromZone(s, zone)).not.toBe(draftFromZone(s2, zone));
  });
});
