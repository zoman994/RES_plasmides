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
