/**
 * assembly-annotations.test.js — fragment features on the assembly.
 *
 * Игорь 17.05.2026: «фичи фрагментов должны показываться на сборке».
 * Each sourced segment's source-container annotations are clipped to
 * the segment's slice and remapped onto assembly coordinates (RC
 * segments mirror within the segment + flip strand). Gap / unavailable
 * / non-container segments contribute nothing.
 */
import { describe, it, expect } from 'vitest';
import { collectAssemblyAnnotations } from '../lib/assembly-annotations';
import { segmentBoundaries } from '../lib/assembly-model';

const C1 = {
  id: 'c1', name: 'pA', sequence: 'AAAACCCCGGGGTTTT', // 16 nt
  annotations: [
    { id: 'gene', start: 4, end: 12, type: 'CDS', name: 'gene', level: 'region', strand: 1 },
    { id: 'far', start: 14, end: 16, type: 'misc', name: 'far', level: 'region', strand: 1 },
  ],
};
const C2 = {
  id: 'c2', name: 'pB', sequence: 'TTTTGGGGCCCCAAAA',
  annotations: [{ id: 'p', start: 0, end: 6, type: 'promoter', name: 'P', level: 'region', strand: 1 }],
};

function draftOf(segments) {
  return { id: 'd', name: 'asm', topology: { circular: false }, segments };
}
function sourced(id, cId, start, end, rc) {
  const len = end - start;
  return {
    id,
    source: { type: 'container', containerId: cId },
    start,
    end,
    reverseComplement: !!rc,
    sequence: 'X'.repeat(len), // length is what matters for boundaries
    length: len,
    color: '#abc',
  };
}

describe('collectAssemblyAnnotations', () => {
  it('forward segment: container annotation remapped onto assembly coords', () => {
    const draft = draftOf([sourced('s1', 'c1', 0, 16, false)]);
    const { boundaries } = segmentBoundaries(draft);
    const anns = collectAssemblyAnnotations(draft, boundaries, [C1]);
    const g = anns.find((a) => a.name === 'gene');
    expect(g).toBeTruthy();
    expect(g.start).toBe(4);
    expect(g.end).toBe(12);
    expect(g.strand).toBe(1);
  });

  it('offsets by the preceding segment length', () => {
    const draft = draftOf([
      sourced('s0', 'c2', 0, 10, false), // assembly [0..10)
      sourced('s1', 'c1', 0, 16, false), // assembly [10..26)
    ]);
    const { boundaries } = segmentBoundaries(draft);
    const anns = collectAssemblyAnnotations(draft, boundaries, [C1, C2]);
    const g = anns.find((a) => a.name === 'gene');
    expect(g.start).toBe(10 + 4);
    expect(g.end).toBe(10 + 12);
  });

  it('clips an annotation to the segment slice (partial overlap kept, outside dropped)', () => {
    // slice [8..16) of c1 → 'far' [14..16) kept as local [6..8); 'gene'
    // [4..12) partially overlaps → clipped to [8..12) local [0..4).
    const draft = draftOf([sourced('s1', 'c1', 8, 16, false)]);
    const { boundaries } = segmentBoundaries(draft);
    const anns = collectAssemblyAnnotations(draft, boundaries, [C1]);
    const g = anns.find((a) => a.name === 'gene');
    const far = anns.find((a) => a.name === 'far');
    expect(g.start).toBe(0);
    expect(g.end).toBe(4); // 12-8
    expect(far.start).toBe(6); // 14-8
    expect(far.end).toBe(8); // 16-8
  });

  it('RC segment mirrors the interval within the segment and flips strand', () => {
    // c1 slice [0..16) reverse-complemented. 'gene' [4..12) → mirrored
    // within L=16 → [16-12 .. 16-4) = [4..12) (symmetric here); use the
    // 'far' [14..16) → [16-16 .. 16-14) = [0..2); strand 1 → -1.
    const draft = draftOf([sourced('s1', 'c1', 0, 16, true)]);
    const { boundaries } = segmentBoundaries(draft);
    const anns = collectAssemblyAnnotations(draft, boundaries, [C1]);
    const far = anns.find((a) => a.name === 'far');
    expect(far.start).toBe(0);
    expect(far.end).toBe(2);
    expect(far.strand).toBe(-1);
  });

  it('gap / non-container / unavailable segments contribute nothing', () => {
    const gap = {
      id: 'g', source: { type: 'manual' }, sequence: '', length: 5,
    };
    const unavail = {
      id: 'u', source: { type: 'container', containerId: 'c1', unavailable: true },
      start: 0, end: 8, sequence: 'X'.repeat(8), length: 8,
    };
    const draft = draftOf([gap, unavail]);
    const { boundaries } = segmentBoundaries(draft);
    // c1 IS present, but the segment is flagged unavailable → still
    // skipped (its cached slice is an orphan, not real coords).
    const anns = collectAssemblyAnnotations(draft, boundaries, [C1]);
    expect(anns).toHaveLength(0);
  });

  it('source container missing from the list → no throw, nothing emitted', () => {
    const draft = draftOf([sourced('s1', 'cZZZ', 0, 8, false)]);
    const { boundaries } = segmentBoundaries(draft);
    expect(collectAssemblyAnnotations(draft, boundaries, [C1])).toEqual([]);
  });

  it('annotation ids are namespaced per segment (no collision across reuse)', () => {
    const draft = draftOf([
      sourced('s1', 'c1', 0, 16, false),
      sourced('s2', 'c1', 0, 16, false), // same container reused
    ]);
    const { boundaries } = segmentBoundaries(draft);
    const anns = collectAssemblyAnnotations(draft, boundaries, [C1]);
    const ids = anns.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(anns.filter((a) => a.name === 'gene')).toHaveLength(2);
  });
});
