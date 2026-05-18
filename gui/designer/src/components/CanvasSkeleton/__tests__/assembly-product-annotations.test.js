/**
 * assembly-product-annotations.test.js — Игорь 17.05.2026:
 * «продукты не наследуют аннотации исходника».
 *
 * Same class as V83: the legacy `makeSourcedSegment` transfers source
 * annotations via `transferAnnotations`, but the 4-tier `draftFromZone`
 * hardcoded `annotations: []`, so realiseAssembly's frag + product
 * containers came out feature-less. Fix: draftFromZone reuses the
 * proven `transferAnnotations`; the final product container aggregates
 * per-segment annotations via `concatSegmentAnnotations` (offset by the
 * concat position). Gap / missing-source segments stay annotation-less.
 */
import { describe, it, expect } from 'vitest';
import { draftFromZone, realiseAssembly } from '../lib/zone-pieces-to-dag';
import { concatSegmentAnnotations } from '../lib/assembly-model';

// 24 nt; 'prom' is 1-based inclusive [5,12] (GenBank contract).
const C = {
  id: 'src1', kind: 'molecule', name: 'pUC',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC',
  annotations: [{
    id: 'a-prom', start: 5, end: 12, type: 'promoter', name: 'prom',
    level: 'region', strand: 1,
  }],
  topology: { circular: false },
};
const CNONE = {
  id: 'src2', kind: 'molecule', name: 'pBare',
  sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false },
};

function sourced(id, sourceId, start, end, orientation, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: [sourceId],
    ranges: [{ sourceId, start, end, orientation: orientation || 'forward' }],
    origin: 'legacy-migration', acquisitionMethod: 'undefined', acquisitionParams: {},
    functionalLabel: null, color: '#abc', zoneId: 'zn-1',
    derivedReactionId: null, frozen: false, createdAt, updatedAt: createdAt,
  };
}
function gap(id, len, createdAt) {
  return {
    id, kind: 'gap', name: 'g', sourceIds: [], ranges: [],
    gapLength: len, gapHint: 'unknown', origin: 'manual-gap',
    acquisitionMethod: 'synthesis', acquisitionParams: { type: 'manual-gap' },
    functionalLabel: 'gap', zoneId: 'zn-1', createdAt, updatedAt: createdAt,
  };
}
function zoneState(pieces, containers = [C]) {
  return {
    containers, operations: [], junctions: [], assemblyDrafts: [], positions: {},
    zones: [{ id: 'zn-1', name: 'Сборка 1', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces,
  };
}
const ZONE = { id: 'zn-1', name: 'Сборка 1' };

describe('draftFromZone — sourced segment inherits source annotations', () => {
  it('full forward range → annotation preserved (segment-local 1-based)', () => {
    const segs = draftFromZone(zoneState([sourced('p1', 'src1', 0, 24, 'forward', 1)]), ZONE)
      .segments;
    expect(segs[0].annotations).toHaveLength(1);
    expect(segs[0].annotations[0]).toMatchObject({
      name: 'prom', start: 5, end: 12, strand: 1,
    });
  });

  it('clipped range [4,16) → annotation clipped + shifted to local coords', () => {
    const segs = draftFromZone(zoneState([sourced('p1', 'src1', 4, 16, 'forward', 1)]), ZONE)
      .segments;
    // parent 1-based [5,12] = 0-based [4,12); window [4,16) → local 0-based
    // [0,8) → local 1-based [1,8].
    expect(segs[0].annotations[0]).toMatchObject({ name: 'prom', start: 1, end: 8 });
  });

  it('reverse range mirrors the annotation + flips strand', () => {
    const segs = draftFromZone(zoneState([sourced('p1', 'src1', 0, 24, 'reverse', 1)]), ZONE)
      .segments;
    // segLen 24; ns = 24-12+1 = 13, ne = 24-5+1 = 20; strand 1 → -1.
    expect(segs[0].annotations[0]).toMatchObject({ start: 13, end: 20, strand: -1 });
  });

  it('source container with no annotations → [] (no throw)', () => {
    const segs = draftFromZone(zoneState([sourced('p1', 'src2', 0, 12, 'forward', 1)], [CNONE]), ZONE)
      .segments;
    expect(segs[0].annotations).toEqual([]);
  });

  it('missing source container → [] (orphan, unchanged)', () => {
    const segs = draftFromZone(zoneState([sourced('p1', 'cZZZ', 0, 12, 'forward', 1)]), ZONE)
      .segments;
    expect(segs[0].source.unavailable).toBe(true);
    expect(segs[0].annotations).toEqual([]);
  });

  it('gap segment stays annotation-less', () => {
    const segs = draftFromZone(zoneState([gap('g1', 8, 1)]), ZONE).segments;
    expect(segs[0].annotations).toEqual([]);
  });
});

describe('realiseAssembly — frag + product containers carry annotations', () => {
  it('frag container inherits the transferred annotation (not [])', () => {
    const r = realiseAssembly(
      zoneState([sourced('p1', 'src1', 0, 24, 'forward', 1)]), 'zn-1', {}, {},
    );
    expect(r.ok).toBe(true);
    const frag = r.diff.containers.find((c) => /frag-1/.test(c.name));
    expect(frag.annotations).toHaveLength(1);
    expect(frag.annotations[0].name).toBe('prom');
  });

  it('final product aggregates segment annotations offset by concat position', () => {
    // seg1 = src1[0,24) (24 nt, ann local [5,12]); seg2 = src1[0,10)
    // (10 nt, ann clipped: parent [4,12) ∩ [0,10) = [4,10) → local 1-based
    // [5,10]) → in the product seg2 is offset by 24.
    const r = realiseAssembly(zoneState([
      sourced('p1', 'src1', 0, 24, 'forward', 1),
      sourced('p2', 'src1', 0, 10, 'forward', 2),
    ]), 'zn-1', { 0: 'gibson' }, {});
    expect(r.ok).toBe(true);
    const product = r.diff.containers.find((c) => /product/.test(c.name));
    const starts = product.annotations.map((a) => a.start).sort((x, y) => x - y);
    expect(product.annotations).toHaveLength(2);
    expect(starts).toEqual([5, 29]); // seg1 ann @5 ; seg2 ann @ (5 + 24)
  });

  it('gap-only realise → gap container annotation-less, no throw', () => {
    const r = realiseAssembly(
      zoneState([sourced('p1', 'src1', 0, 24, 'forward', 1), {
        ...gap('g2', 6, 2), gapSequence: 'ATCGAT', gapHint: 'known',
      }]),
      'zn-1', { 0: 'gibson' }, {},
    );
    expect(r.ok).toBe(true);
    const g = r.diff.containers.find((c) => /gap-2/.test(c.name));
    expect(g.annotations).toEqual([]);
  });
});

describe('concatSegmentAnnotations — pure offset aggregation', () => {
  it('shifts each segment\'s 1-based annotations by the running char offset', () => {
    const out = concatSegmentAnnotations([
      { sequence: 'AAAAAAAAAA', annotations: [{ name: 'x', start: 2, end: 4 }] }, // len 10
      { sequence: 'CCCCC', annotations: [{ name: 'y', start: 1, end: 3 }] }, // len 5, +10
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((a) => a.name === 'x')).toMatchObject({ start: 2, end: 4 });
    expect(out.find((a) => a.name === 'y')).toMatchObject({ start: 11, end: 13 });
  });

  it('a gap (no annotations) still advances the offset', () => {
    const out = concatSegmentAnnotations([
      { sequence: '', length: 7, annotations: [] }, // gap, len 7
      { sequence: 'GG', annotations: [{ name: 'z', start: 1, end: 2 }] },
    ]);
    expect(out[0]).toMatchObject({ name: 'z', start: 8, end: 9 });
  });

  it('empty / defensive', () => {
    expect(concatSegmentAnnotations([])).toEqual([]);
    expect(concatSegmentAnnotations(undefined)).toEqual([]);
  });
});
