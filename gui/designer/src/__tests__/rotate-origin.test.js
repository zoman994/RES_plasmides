import { describe, it, expect } from 'vitest';
import { rotateOriginToPosition } from '../rotate-origin';
import {
  LOCATION_KINDS,
  makeLocation,
  getSegments,
  locationLength,
  locationSpan,
  wrapsOrigin,
} from '../lib/annotation-location';
import { entryToGenbank } from '../lib/export-genbank';
import { parseGenBank } from '../genbank-parser';
import { importFeatures } from '../import-annotations';

describe('rotateOriginToPosition', () => {
  it('linear topology → no-op (sequence + annotations untouched)', () => {
    const seq = 'AAAAACCCCCGGGGGTTTTT';
    const ann = [{ id: 'a1', start: 5, end: 10, name: 'C-block', level: 'region' }];
    const out = rotateOriginToPosition(seq, ann, 6, { topology: 'linear' });
    expect(out.sequence).toBe(seq);
    expect(out.annotations).toEqual(ann);
  });

  it('circular: simple rotation, annotation does not cross cut → coords shift', () => {
    // length 17, origin at 1-indexed 10 (k=9). Annotation at [12, 15) (0-indexed half-open).
    const seq = 'ABCDEFGHIJKLMNOPQ'; // 17 chars, A→pos1
    const ann = [{ id: 'a1', start: 12, end: 15, name: 'tail', level: 'region' }];
    const out = rotateOriginToPosition(seq, ann, 10, { topology: 'circular' });
    // New origin at position 10 (J). Rotated seq = 'JKLMNOPQABCDEFGHI'.
    expect(out.sequence).toBe('JKLMNOPQABCDEFGHI');
    // ann positions [12, 15) shift by -9 → [3, 6).
    expect(out.annotations).toHaveLength(1);
    expect(out.annotations[0]).toMatchObject({
      id: 'a1', start: 3, end: 6, name: 'tail', level: 'region',
    });
    expect(getSegments(out.annotations[0])).toEqual([{ start: 3, end: 6 }]);
  });

  /**
   * ANN-0A supersedes the pre-BG-028 contract. OLD assumption: an annotation
   * crossing the cut was duplicated into `a1_part1` + `a1_part2`, which changed
   * one biological feature into two and orphaned every child pointing at `a1`.
   * NEW contract: it stays ONE annotation with a two-segment canonical location
   * and keeps its id.
   */
  it('circular: annotation crossing cut stays one feature with a wrapping location', () => {
    // length 17, k=9 (origin 10). Annotation [3, 12) crosses k=9.
    // Expected segments: [3-9+17, 17) = [11, 17) then [0, 12-9) = [0, 3).
    const seq = 'ABCDEFGHIJKLMNOPQ';
    const ann = [{ id: 'a1', start: 3, end: 12, name: 'wraparound', type: 'CDS', level: 'region', strand: 1 }];
    const out = rotateOriginToPosition(seq, ann, 10, { topology: 'circular' });
    expect(out.sequence).toBe('JKLMNOPQABCDEFGHI');
    expect(out.annotations).toHaveLength(1);

    const [rotated] = out.annotations;
    expect(rotated).toMatchObject({
      id: 'a1', name: 'wraparound', type: 'CDS', level: 'region', strand: 1,
    });
    expect(getSegments(rotated)).toEqual([
      { start: 11, end: 17 },
      { start: 0, end: 3 },
    ]);
    // the feature keeps its 9 bp — it is not stretched across the molecule
    expect(locationLength(rotated)).toBe(9);
    expect(wrapsOrigin(rotated, { length: 17, topology: 'circular' })).toBe(true);
  });

  /**
   * ANN-0A corrective §5 — rotation must PRESERVE traversal order, never
   * re-sort it. A linear join whose parts land either side of the new origin
   * becomes an origin-crossing location, and the part that now starts the
   * feature must stay first.
   *
   *   length 1000, segments [100,150) → [200,250), new origin 176 (k = 175)
   *   [100,150) → [925, 975)
   *   [200,250) → [ 25,  75)
   *   traversal order must remain [925,975) → [25,75)
   */
  describe.each([1, -1])('circular: compound rotation, strand %i', (strand) => {
    const seq = 'A'.repeat(1000);
    const doc = { length: 1000, topology: 'circular' };

    function rotated() {
      const ann = {
        id: 'g1', name: 'spliced', type: 'CDS', level: 'region', strand,
        location: makeLocation(LOCATION_KINDS.JOIN, [
          { start: 100, end: 150 }, { start: 200, end: 250 },
        ]),
        start: 100, end: 250,
      };
      const child = {
        id: 'd1', name: 'dom', type: 'domain', level: 'detail', strand,
        regionId: 'g1', start: 210, end: 240,
      };
      return rotateOriginToPosition(seq, [ann, child], 176, { topology: 'circular' });
    }

    it('preserves traversal order and does not sort segments', () => {
      const gene = rotated().annotations.find((a) => a.id === 'g1');
      expect(getSegments(gene)).toEqual([
        { start: 925, end: 975 },
        { start: 25, end: 75 },
      ]);
    });

    it('keeps kind, length, wrap flag and scalar projection coherent', () => {
      const gene = rotated().annotations.find((a) => a.id === 'g1');
      expect(gene.location.kind).toBe(LOCATION_KINDS.JOIN);
      expect(locationLength(gene)).toBe(100);
      expect(wrapsOrigin(gene, doc)).toBe(true);
      expect(locationSpan(gene)).toEqual({ start: gene.start, end: gene.end });
      expect(gene.start).toBe(925);
      expect(gene.end).toBe(75);
    });

    it('keeps id, strand and the child regionId link', () => {
      const out = rotated();
      const gene = out.annotations.find((a) => a.id === 'g1');
      const child = out.annotations.find((a) => a.id === 'd1');
      expect(gene.strand).toBe(strand);
      expect(child.regionId).toBe('g1');
      expect(getSegments(child)).toEqual([{ start: 35, end: 65 }]);
    });

    it('survives a GenBank export → re-import round-trip', () => {
      const gene = rotated().annotations.find((a) => a.id === 'g1');
      const gb = entryToGenbank({
        id: 'e', name: 'rot',
        payload: { sequence: seq, annotations: [gene], topology: 'circular' },
      });
      const expected = strand === -1
        ? /complement\(join\(926\.\.975,26\.\.75\)\)/
        : /join\(926\.\.975,26\.\.75\)/;
      expect(gb).toMatch(expected);

      const back = importFeatures(
        parseGenBank(gb).features, 1000, 'genbank', doc,
      ).annotations.find((a) => a.name === 'spliced');
      expect(getSegments(back)).toEqual([
        { start: 925, end: 975 },
        { start: 25, end: 75 },
      ]);
      expect(back.strand).toBe(strand);
    });
  });

  it('circular: a child keeps pointing at its parent after the parent wraps', () => {
    const seq = 'ABCDEFGHIJKLMNOPQ';
    const anns = [
      { id: 'a1', start: 3, end: 12, name: 'wraparound', type: 'CDS', level: 'region', strand: 1 },
      { id: 'd1', start: 4, end: 7, name: 'dom', type: 'domain', level: 'detail', strand: 1, regionId: 'a1' },
    ];
    const out = rotateOriginToPosition(seq, anns, 10, { topology: 'circular' });
    const child = out.annotations.find((a) => a.id === 'd1');
    expect(child.regionId).toBe('a1');
    expect(out.annotations.some((a) => a.id === child.regionId)).toBe(true);
  });
});
