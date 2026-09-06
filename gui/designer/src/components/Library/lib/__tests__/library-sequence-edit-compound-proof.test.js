/**
 * library-sequence-edit-compound-proof.test.js — ANN-INTEGRITY seam BG-030.
 *
 * Independent proof that a character-level sequence edit remaps the CANONICAL
 * segment geometry of a compound / origin-crossing annotation, instead of only
 * shifting the scalar start/end projection and silently leaving the segments
 * (the biology) frozen at the old coordinates.
 *
 * Negative control: the pre-fix scalar implementation shifts `start`/`end` but
 * never touches `location.segments`, so the assertions on `location.segments`
 * below fail — that failing run is the RED for this seam.
 */
import { describe, it, expect } from 'vitest';
import { applySequenceEditToEntry } from '../library-sequence-edit';
import { makeLocation, LOCATION_KINDS } from '../../../../lib/annotation-location';

function mkEntry(sequence, annotations, topology = 'linear') {
  return { payload: { sequence, length: sequence.length, annotations, topology } };
}

// A spliced feature: exon1 [2,6) join exon2 [10,14).
function joinAnn(id = 'j') {
  return {
    id,
    name: 'spliced',
    type: 'CDS',
    level: 'region',
    strand: 1,
    location: makeLocation(LOCATION_KINDS.JOIN, [
      { start: 2, end: 6 },
      { start: 10, end: 14 },
    ]),
    start: 2,
    end: 14,
  };
}

describe('applySequenceEditToEntry — compound (join) geometry survives indels', () => {
  it('insert before all segments shifts EVERY segment, not just the projection', () => {
    const entry = mkEntry('ACGTACGTACGTAC', [joinAnn()]);
    const res = applySequenceEditToEntry(entry, { kind: 'insert', pos: 0, char: 'N' });
    expect(res.ok).toBe(true);
    const segs = res.annotations[0].location.segments;
    expect(segs).toEqual([{ start: 3, end: 7 }, { start: 11, end: 15 }]);
    // Scalar projection stays coherent with the shifted segments.
    expect(res.annotations[0].start).toBe(3);
    expect(res.annotations[0].end).toBe(15);
  });

  it('insert between the two exons shifts only the downstream exon', () => {
    const entry = mkEntry('ACGTACGTACGTAC', [joinAnn()]);
    // pos 8 lies in the intron gap (between exon1 end=6 and exon2 start=10).
    const res = applySequenceEditToEntry(entry, { kind: 'insert', pos: 8, char: 'N' });
    expect(res.ok).toBe(true);
    const segs = res.annotations[0].location.segments;
    expect(segs).toEqual([{ start: 2, end: 6 }, { start: 11, end: 15 }]);
  });

  it('uses half-open insert boundaries: start shifts, end stays outside', () => {
    const atStart = applySequenceEditToEntry(
      mkEntry('ACGTACGTACGTAC', [joinAnn()]),
      { kind: 'insert', pos: 2, char: 'N' },
    );
    expect(atStart.annotations[0].location.segments).toEqual([
      { start: 3, end: 7 },
      { start: 11, end: 15 },
    ]);

    const atEnd = applySequenceEditToEntry(
      mkEntry('ACGTACGTACGTAC', [joinAnn()]),
      { kind: 'insert', pos: 6, char: 'N' },
    );
    expect(atEnd.annotations[0].location.segments).toEqual([
      { start: 2, end: 6 }, // insertion exactly at end is outside exon 1
      { start: 11, end: 15 },
    ]);
  });

  it('delete that removes exon1 entirely leaves a single surviving segment', () => {
    const entry = mkEntry('ACGTACGTACGTAC', [joinAnn()]);
    // Delete [2,6) — exactly exon1.
    const res = applySequenceEditToEntry(entry, { kind: 'delete', pos: 2, length: 4 });
    expect(res.ok).toBe(true);
    const loc = res.annotations[0].location;
    // exon2 [10,14) shifts left by 4 → [6,10); exon1 gone → single segment.
    expect(loc.segments).toEqual([{ start: 6, end: 10 }]);
    expect(loc.kind).toBe(LOCATION_KINDS.SINGLE);
  });

  it('clips every partially-overlapped segment without flattening traversal order', () => {
    const res = applySequenceEditToEntry(
      mkEntry('ACGTACGTACGTAC', [joinAnn()]),
      { kind: 'delete', pos: 4, length: 8 },
    );
    expect(res.ok).toBe(true);
    expect(res.annotations[0].location.kind).toBe(LOCATION_KINDS.JOIN);
    expect(res.annotations[0].location.segments).toEqual([
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it('replace remaps segments atomically and preserves rich metadata + identity', () => {
    const ann = {
      ...joinAnn('rich'),
      qualifiers: { note: ['one', 'two'] },
      provenance: { source: 'snapgene' },
      description: 'kept',
      unknownScalar: 'also kept',
    };
    const res = applySequenceEditToEntry(
      mkEntry('ACGTACGTACGTAC', [ann]),
      { kind: 'replace', start: 3, end: 5, replacement: 'NNN' },
    );
    expect(res.ok).toBe(true);
    expect(res.annotations[0].location.segments).toEqual([
      { start: 2, end: 7 },
      { start: 11, end: 15 },
    ]);
    expect(res.annotations[0]).toMatchObject({
      id: 'rich', qualifiers: { note: ['one', 'two'] },
      provenance: { source: 'snapgene' }, description: 'kept',
      unknownScalar: 'also kept',
    });
  });

  it('replace is atomic at both segment edges and may drop a fully covered segment', () => {
    const atFirst = applySequenceEditToEntry(
      mkEntry('ACGTACGT', [{ ...joinAnn('first'), location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 2, end: 6 }]), start: 2, end: 6 }]),
      { kind: 'replace', start: 2, end: 3, replacement: 'N' },
    );
    const atLast = applySequenceEditToEntry(
      mkEntry('ACGTACGT', [{ ...joinAnn('last'), location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 2, end: 6 }]), start: 2, end: 6 }]),
      { kind: 'replace', start: 5, end: 6, replacement: 'N' },
    );
    const covered = applySequenceEditToEntry(
      mkEntry('ACGTACGT', [{ ...joinAnn('covered'), location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 2, end: 6 }]), start: 2, end: 6 }]),
      { kind: 'replace', start: 1, end: 7, replacement: 'NN' },
    );
    expect(atFirst.annotations[0].location.segments).toEqual([{ start: 2, end: 6 }]);
    expect(atLast.annotations[0].location.segments).toEqual([{ start: 2, end: 6 }]);
    expect(covered.annotations).toEqual([]);
  });

  it('proves non-unit replacement deltas on both partial-overlap branches', () => {
    const leftOverlap = applySequenceEditToEntry(
      mkEntry('ACGTACGTACGT', [{
        ...joinAnn('left-overlap'),
        location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 3, end: 8 }]),
        start: 3, end: 8,
      }]),
      { kind: 'replace', start: 2, end: 5, replacement: 'NNNNN' },
    );
    expect(leftOverlap.annotations[0].location.segments)
      .toEqual([{ start: 2, end: 10 }]);
    expect(leftOverlap.annotations[0]).toMatchObject({ start: 2, end: 10 });

    const rightOverlap = applySequenceEditToEntry(
      mkEntry('ACGTACGTACGT', [{
        ...joinAnn('right-overlap'),
        location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 2, end: 7 }]),
        start: 2, end: 7,
      }]),
      { kind: 'replace', start: 5, end: 9, replacement: 'NNN' },
    );
    expect(rightOverlap.annotations[0].location.segments)
      .toEqual([{ start: 2, end: 8 }]);
    expect(rightOverlap.annotations[0]).toMatchObject({ start: 2, end: 8 });
  });

  it('normalizes and remaps a one-element legacy bare segments[] shape', () => {
    const legacy = {
      id: 'legacy-one', name: 'legacy', type: 'misc_feature', level: 'region', strand: 1,
      segments: [{ start: 2, end: 6 }],
      start: 2, end: 6,
    };
    const once = applySequenceEditToEntry(
      mkEntry('ACGTACGT', [legacy]),
      { kind: 'insert', pos: 0, char: 'N' },
    );
    expect(once.annotations[0].segments).toBeUndefined();
    expect(once.annotations[0].location.segments).toEqual([{ start: 3, end: 7 }]);
    expect(once.annotations[0]).toMatchObject({ start: 3, end: 7 });

    const twice = applySequenceEditToEntry(
      mkEntry(once.sequence, once.annotations),
      { kind: 'insert', pos: 0, char: 'N' },
    );
    expect(twice.annotations[0].location.segments).toEqual([{ start: 4, end: 8 }]);
  });

  it('origin-crossing feature on a circular molecule keeps its wrap after an insert', () => {
    // seq length 14; wrap segment [12,14) join [0,3).
    const wrap = {
      id: 'w',
      name: 'wrap',
      type: 'misc_feature',
      level: 'region',
      strand: 1,
      location: makeLocation(LOCATION_KINDS.JOIN, [
        { start: 12, end: 14 },
        { start: 0, end: 3 },
      ]),
      start: 12,
      end: 3,
    };
    const entry = mkEntry('ACGTACGTACGTAC', [wrap], 'circular');
    // Insert at pos 1 — inside the second (post-origin) segment [0,3).
    const res = applySequenceEditToEntry(entry, { kind: 'insert', pos: 1, char: 'N' });
    expect(res.ok).toBe(true);
    const segs = res.annotations[0].location.segments;
    // [12,14) → [13,15) (pos 1 <= 12); [0,3) → [0,4) (insert inside extends end).
    expect(segs).toEqual([{ start: 13, end: 15 }, { start: 0, end: 4 }]);
  });

  it('cascade: deleting a region entirely also drops its orphaned detail children', () => {
    const region = joinAnn('parent');
    const child = {
      id: 'c1', name: 'domain', type: 'domain', level: 'detail',
      regionId: 'parent', strand: 1,
      location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 3, end: 5 }]),
      start: 3, end: 5,
    };
    const entry = mkEntry('ACGTACGTACGTAC', [region, child]);
    // Delete [2,14) — removes both exons → the parent region disappears.
    const res = applySequenceEditToEntry(entry, { kind: 'delete', pos: 2, length: 12 });
    expect(res.ok).toBe(true);
    // Parent gone AND its now-parentless child dropped (no orphan link left).
    expect(res.annotations.find((a) => a.id === 'parent')).toBeUndefined();
    expect(res.annotations.find((a) => a.id === 'c1')).toBeUndefined();
  });

  it('normalizes a legacy id-less parent before full-delete cascade', () => {
    const fallback = 'region:2:6:CDS:legacy';
    const parent = {
      name: 'legacy', type: 'CDS', level: 'region', strand: 1, start: 2, end: 6,
    };
    const child = {
      id: 'legacy-child', name: 'domain', type: 'domain', level: 'detail',
      // Deliberately straddles the parent's left edge. Geometry alone leaves
      // [1,2) after the delete, so only the parent-link cascade can remove it.
      regionId: fallback, strand: 1, start: 1, end: 3,
    };
    const res = applySequenceEditToEntry(
      mkEntry('ACGTACGT', [parent, child]),
      { kind: 'delete', pos: 2, length: 4 },
    );
    expect(res.ok).toBe(true);
    expect(res.annotations).toEqual([]);
  });
});
