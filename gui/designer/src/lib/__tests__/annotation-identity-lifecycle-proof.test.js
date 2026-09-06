/**
 * annotation-identity-lifecycle-proof.test.js — ANN-INTEGRITY seam BG-029 /
 * BG-031. Independent proof that annotation IDENTITY is opaque and stable, that
 * duplicate ingress is repaired deterministically, and that parent/child links
 * never dangle across delete / split / merge.
 */
import { describe, it, expect } from 'vitest';
import {
  makeAnnotationId,
  ensureAnnotationIds,
  repairDuplicateIds,
  cascadeDelete,
  dropChildrenOfRemoved,
  reparent,
  detachDanglingLinks,
  adoptLegacyParentId,
  ingestAnnotations,
  stripStaleSegments,
} from '../annotation-identity';
import {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  splitAnnotation,
  mergeAnnotations,
} from '../annotation-edit';

describe('annotation-identity — opaque ids', () => {
  it('mints opaque, unique, non-coordinate ids', () => {
    const a = makeAnnotationId();
    const b = makeAnnotationId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/^region:/);
  });

  it('ensureAnnotationIds stamps only the id-less, never rewriting an existing id', () => {
    const kept = { id: 'keep', name: 'a' };
    const out = ensureAnnotationIds([kept, { name: 'b' }]);
    expect(out[0]).toBe(kept); // existing id object returned by reference
    expect(out[1].id).toBeTruthy();
  });
});

describe('annotation-identity — collision-safe duplicate repair', () => {
  it('keeps the first occurrence and gives later collisions opaque ids', () => {
    const input = [
      { id: 'x', name: 'first' },
      { id: 'x', name: 'second' },
      { id: 'x', name: 'third' },
      { id: 'y', name: 'other' },
    ];
    const ids = repairDuplicateIds(input).map((z) => z.id);
    expect(ids[0]).toBe('x');
    expect(ids[3]).toBe('y');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[1]).not.toMatch(/^x#dup/);
    expect(ids[2]).not.toMatch(/^x#dup/);
  });

  it('reserves every original id before minting replacements (x, x, x#dup1)', () => {
    // The future third entry already owns `x#dup1`. A one-pass suffix repair
    // incorrectly gives that id to the second entry before seeing the owner.
    const input = [
      { id: 'x', name: 'a' },
      { id: 'x', name: 'b' },
      { id: 'x#dup1', name: 'pre-existing' },
    ];
    const out = repairDuplicateIds(input);
    const ids = out.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length); // every id unique
    expect(ids[0]).toBe('x');
    expect(ids[2]).toBe('x#dup1'); // future original owner remains untouched
    expect(ids[1]).not.toBe('x#dup1');
    expect(ids[1]).not.toMatch(/^x#dup/); // replacement itself is opaque
  });

  it('binds future-id reservation to an injected forced collision', () => {
    const minted = ['future-owner', 'forced-fresh'];
    const out = repairDuplicateIds([
      { id: 'x', name: 'first' },
      { id: 'x', name: 'duplicate' },
      { id: 'future-owner', name: 'later original owner' },
    ], () => minted.shift());
    expect(out.map((a) => a.id)).toEqual(['x', 'forced-fresh', 'future-owner']);
  });
});

describe('annotation-identity — cascade & link hygiene', () => {
  const region = { id: 'r1', level: 'region', type: 'CDS', start: 0, end: 100 };
  const childA = { id: 'd1', level: 'detail', regionId: 'r1', start: 10, end: 20 };
  const childB = { id: 'p1', level: 'point', regionId: 'r1', start: 30, end: 31 };
  const unrelated = { id: 'd2', level: 'detail', regionId: 'other', start: 5, end: 6 };

  it('cascadeDelete removes the region and every regionId-linked child', () => {
    const out = cascadeDelete([region, childA, childB, unrelated], 'r1');
    expect(out.map((a) => a.id)).toEqual(['d2']);
  });

  it('dropChildrenOfRemoved drops only children of removed parents', () => {
    const out = dropChildrenOfRemoved([childA, childB, unrelated], new Set(['r1']));
    expect(out.map((a) => a.id)).toEqual(['d2']);
  });

  it('reparent repoints links; null detaches them', () => {
    const moved = reparent([childA, childB], 'r1', 'r2');
    expect(moved.every((a) => a.regionId === 'r2')).toBe(true);
    const detached = reparent([childA], 'r1', null);
    expect(detached[0].regionId).toBeUndefined();
  });

  it('detachDanglingLinks removes a regionId that points at an absent region', () => {
    const out = detachDanglingLinks([region, unrelated]); // 'other' is not present
    expect(out.find((a) => a.id === 'd2').regionId).toBeUndefined();
    expect(out.find((a) => a.id === 'r1')).toBe(region);
  });

  it('ingestAnnotations is one gate for ALL levels: opaque ids, canonical regionId, no stale segments', () => {
    const gated = ingestAnnotations([
      { level: 'region', type: 'CDS', name: 'r', location: { kind: 'single', segments: [{ start: 0, end: 9 }] } }, // id-less
      { level: 'detail', type: 'domain', name: 'd', parentId: 'legacy-parent', start: 1, end: 4 }, // legacy parentId
      { id: 'dup', level: 'point', type: 'mutation', start: 5, end: 6 },
      { id: 'dup', level: 'point', type: 'mutation', start: 7, end: 8 }, // duplicate id
      {
        level: 'region', type: 'gene', name: 'stale', id: 'g2',
        location: { kind: 'single', segments: [{ start: 10, end: 20 }] },
        segments: [{ start: 999, end: 1000 }], // stale bare segments alongside a location
      },
    ]);
    // every annotation has a non-empty id
    expect(gated.every((a) => typeof a.id === 'string' && a.id.length > 0)).toBe(true);
    // ids are all unique (collision-safe repair)
    const ids = gated.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    // legacy parentId adopted as canonical regionId and removed
    const detail = gated.find((a) => a.name === 'd');
    // The legacy parent is absent, so the alias is not admitted as a valid
    // model link. Ingress detaches it instead of preserving an orphan.
    expect(detail.regionId).toBeUndefined();
    expect(detail.parentId).toBeUndefined();
    // stale bare segments dropped in favour of the canonical location
    const stale = gated.find((a) => a.id === 'g2');
    expect(stale.segments).toBeUndefined();
    expect(stale.location.segments).toEqual([{ start: 10, end: 20 }]);
  });

  it('rejects a child link to a duplicated region id as ambiguous', () => {
    expect(() => ingestAnnotations([
      { id: 'dup-parent', level: 'region', type: 'CDS', start: 0, end: 20 },
      { id: 'dup-parent', level: 'region', type: 'CDS', start: 30, end: 50 },
      { id: 'child', level: 'detail', regionId: 'dup-parent', start: 2, end: 5 },
    ])).toThrow(/ambiguous|duplicate parent/i);
  });

  it('remaps a child to the unique region renamed by a cross-level duplicate', () => {
    const out = ingestAnnotations([
      { id: 'x', level: 'detail', type: 'domain', start: 1, end: 3 },
      { id: 'x', level: 'region', type: 'CDS', start: 0, end: 10 },
      { id: 'child', level: 'point', regionId: 'x', start: 4, end: 5 },
    ]);
    const parent = out.find((a) => a.level === 'region');
    const child = out.find((a) => a.id === 'child');
    expect(parent.id).not.toBe('x');
    expect(child.regionId).toBe(parent.id);
  });

  it('stamps an id-less legacy parent and migrates its fallback-linked child', () => {
    const fallback = 'region:0:20:CDS:legacy';
    const out = ingestAnnotations([
      { level: 'region', type: 'CDS', name: 'legacy', start: 0, end: 20 },
      { id: 'child', level: 'detail', regionId: fallback, start: 2, end: 5 },
    ]);
    const parent = out.find((a) => a.level === 'region');
    const child = out.find((a) => a.id === 'child');
    expect(parent.id).toBeTruthy();
    expect(parent.id).not.toBe(fallback);
    expect(child.regionId).toBe(parent.id);
  });

  it('stripStaleSegments drops segments only when a location is present', () => {
    const kept = { id: 'a', segments: [{ start: 0, end: 3 }] }; // no location → kept
    const out = stripStaleSegments([kept]);
    expect(out[0].segments).toEqual([{ start: 0, end: 3 }]);
  });

  it('adoptLegacyParentId maps legacy parentId → canonical regionId (regionId wins)', () => {
    const out = adoptLegacyParentId([
      { id: 'a', parentId: 'r1' },
      { id: 'b', parentId: 'r1', regionId: 'r2' },
    ]);
    expect(out[0].regionId).toBe('r1');
    expect(out[0].parentId).toBeUndefined();
    expect(out[1].regionId).toBe('r2'); // existing regionId wins over legacy alias
    expect(out[1].parentId).toBeUndefined();
  });
});

describe('annotation-identity — stable id lifecycle through annotation-edit', () => {
  const seqLen = 5000;

  it('a new annotation gets an opaque id, preserved verbatim when supplied', () => {
    const auto = createAnnotation({ type: 'CDS', start: 0, end: 99 }, seqLen);
    expect(auto.id).not.toMatch(/^region:/);
    const explicit = createAnnotation({ id: 'seeded', type: 'CDS', start: 0, end: 99 }, seqLen);
    expect(explicit.id).toBe('seeded');
  });

  it('rename / move / type edits DO NOT change the id', () => {
    const base = createAnnotation({ id: 'stable', name: 'orig', type: 'CDS', start: 100, end: 400 }, seqLen);
    let arr = [base];
    arr = updateAnnotation(arr, 'stable', { name: 'renamed' }, seqLen);
    expect(arr[0].id).toBe('stable');
    arr = updateAnnotation(arr, 'stable', { start: 120, end: 380 }, seqLen);
    expect(arr[0].id).toBe('stable');
    arr = updateAnnotation(arr, 'stable', { type: 'gene' }, seqLen);
    expect(arr[0].id).toBe('stable');
    expect(arr[0]).toMatchObject({ name: 'renamed', type: 'gene', start: 120, end: 380 });
  });

  it('deleting a parent region cascades to its children', () => {
    const arr = [
      { id: 'r1', level: 'region', type: 'CDS', start: 0, end: 100, name: 'g' },
      { id: 'd1', level: 'detail', regionId: 'r1', start: 10, end: 20, name: 'dom' },
    ];
    const out = deleteAnnotation(arr, 'r1');
    expect(out.map((a) => a.id)).toEqual([]);
  });

  it('split reparents contained children and detaches a boundary-crossing child', () => {
    const arr = [
      { id: 'r1', level: 'region', type: 'CDS', start: 0, end: 100, strand: 1, name: 'g' },
      { id: 'left', level: 'detail', regionId: 'r1', start: 10, end: 20, name: 'left' },
      { id: 'right', level: 'detail', regionId: 'r1', start: 70, end: 80, name: 'right' },
      { id: 'cross', level: 'detail', regionId: 'r1', start: 45, end: 55, name: 'cross' },
    ];
    const out = splitAnnotation(arr, 'r1', 2, seqLen);
    const siblings = out.filter((a) => a.level === 'region');
    expect(siblings).toHaveLength(2);
    for (const sibling of siblings) expect(sibling.id).not.toMatch(/^region:/);
    expect(out.find((a) => a.id === 'left').regionId).toBe(siblings[0].id);
    expect(out.find((a) => a.id === 'right').regionId).toBe(siblings[1].id);
    expect(out.find((a) => a.id === 'cross').regionId).toBeUndefined();
  });

  it('merge reparents both regions’ children to the single merged region', () => {
    const arr = [
      { id: 'L', level: 'region', type: 'CDS', start: 0, end: 500, strand: 1, name: 'L' },
      { id: 'M', level: 'region', type: 'CDS', start: 500, end: 900, strand: 1, name: 'M' },
      { id: 'dL', level: 'detail', regionId: 'L', start: 10, end: 20, name: 'dL' },
      { id: 'dM', level: 'detail', regionId: 'M', start: 600, end: 620, name: 'dM' },
    ];
    const out = mergeAnnotations(arr, 'L', 'M');
    const merged = out.find((a) => a.level === 'region');
    expect(out.find((a) => a.id === 'dL').regionId).toBe(merged.id);
    expect(out.find((a) => a.id === 'dM').regionId).toBe(merged.id);
  });

  it('merge preserves compatible rich metadata and rejects conflicting metadata', () => {
    const left = {
      id: 'L', level: 'region', type: 'CDS', start: 0, end: 50, strand: 1, name: 'L',
      qualifiers: { note: ['kept'] }, provenance: { source: 'import' }, custom: 'same',
    };
    const right = {
      id: 'R', level: 'region', type: 'CDS', start: 50, end: 100, strand: 1, name: 'R',
      qualifiers: { note: ['kept'] }, provenance: { source: 'import' }, custom: 'same',
    };
    const merged = mergeAnnotations([left, right], 'L', 'R')[0];
    expect(merged.qualifiers).toEqual({ note: ['kept'] });
    expect(merged.provenance).toEqual({ source: 'import' });
    expect(merged.custom).toBe('same');

    expect(() => mergeAnnotations([
      left,
      { ...right, qualifiers: { note: ['different'] } },
    ], 'L', 'R')).toThrow(/conflict|metadata|qualifier/i);
  });
});
