import { describe, it, expect } from 'vitest';
import {
  generateAnnotationId,
  validateAnnotationCoords,
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
  createBatchAnnotations,
  applyAnnotationEdit,
  toUiCoords,
  fromUiCoords,
  splitAnnotation,
  mergeAnnotations,
} from '../annotation-edit.js';
import { getIntronsForRegion } from '../../intron-utils.js';
import { LOCATION_KINDS, makeLocation } from '../annotation-location.js';

const SEQLEN = 5000;

const lacZ = {
  id: 'region:145:469:CDS:lacZα',
  name: 'lacZα',
  type: 'CDS',
  start: 145,
  end: 469,
  strand: -1,
  level: 'region',
};

describe('annotation-edit — generateAnnotationId', () => {
  it('produces the canonical region:start:end:type:name shape', () => {
    expect(generateAnnotationId({ start: 145, end: 469, type: 'CDS', name: 'lacZα' }))
      .toBe('region:145:469:CDS:lacZα');
  });

  it('falls back to "unknown" for missing type and "" for missing name', () => {
    expect(generateAnnotationId({ start: 0, end: 100 }))
      .toBe('region:0:100:unknown:');
  });
});

describe('annotation-edit — validateAnnotationCoords', () => {
  it('accepts a normal region inside the sequence', () => {
    expect(validateAnnotationCoords(145, 469, SEQLEN)).toEqual({ valid: true });
  });

  it('rejects negative start', () => {
    const r = validateAnnotationCoords(-1, 100, SEQLEN);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Начало/);
  });

  it('rejects start >= end (no flips, no zero-length)', () => {
    expect(validateAnnotationCoords(100, 100, SEQLEN).valid).toBe(false);
    expect(validateAnnotationCoords(200, 100, SEQLEN).valid).toBe(false);
  });

  it('rejects end > seqLength', () => {
    const r = validateAnnotationCoords(0, SEQLEN + 5, SEQLEN);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Конец/);
  });

  it('skips the seqLength bound when seqLength is not finite', () => {
    expect(validateAnnotationCoords(0, 999999).valid).toBe(true);
  });
});

describe('annotation-edit — createAnnotation', () => {
  it('builds a valid region with an OPAQUE auto-id (ANN-INTEGRITY seam 4)', () => {
    // Old assumption: a new annotation's id was the coordinate-derived
    // `region:start:end:type:name`. New contract: new ids are opaque
    // (crypto.randomUUID) so two features sharing coords/type/name never collide.
    const a = createAnnotation({ name: 'AmpR', type: 'CDS', start: 1626, end: 2486 }, SEQLEN);
    expect(typeof a.id).toBe('string');
    expect(a.id.length).toBeGreaterThan(0);
    expect(a.id).not.toMatch(/^region:/);
    const b = createAnnotation({ name: 'AmpR', type: 'CDS', start: 1626, end: 2486 }, SEQLEN);
    expect(b.id).not.toBe(a.id); // opaque → no collision on identical coords
    expect(a.level).toBe('region');
    expect(a.strand).toBe(1);
  });

  it('forwards predicted metadata when present', () => {
    const a = createAnnotation({
      name: 'orf',
      type: 'CDS',
      start: 0,
      end: 99,
      predicted: true,
      source: 'orf_scan',
      confidence: 0.8,
      signals: [{ type: 'orf', aaLen: 33 }],
    }, SEQLEN);
    expect(a.predicted).toBe(true);
    expect(a.source).toBe('orf_scan');
    expect(a.confidence).toBe(0.8);
    expect(a.signals).toHaveLength(1);
  });

  it('throws on invalid coords', () => {
    expect(() => createAnnotation({ start: 200, end: 100 }, SEQLEN)).toThrow(/Начало/);
  });

  it('coerces strand to ±1 (truthy reverse → -1, anything else → +1)', () => {
    expect(createAnnotation({ start: 0, end: 10, strand: -1 }, SEQLEN).strand).toBe(-1);
    expect(createAnnotation({ start: 0, end: 10, strand: 1 }, SEQLEN).strand).toBe(1);
    expect(createAnnotation({ start: 0, end: 10 }, SEQLEN).strand).toBe(1);
  });

  it('preserves a detail intron with its parent regionId (manual splice marking)', () => {
    const a = createAnnotation(
      { type: 'intron', level: 'detail', regionId: 'cds1', start: 20, end: 80 },
      SEQLEN,
    );
    expect(a).toMatchObject({ type: 'intron', level: 'detail', regionId: 'cds1' });
  });

  it('omits regionId when none is supplied (regular region annotation)', () => {
    const a = createAnnotation({ type: 'CDS', start: 0, end: 30 }, SEQLEN);
    expect(a.regionId).toBeUndefined();
  });

  it('preserves an explicit id (cross-referenced annotations keep their link)', () => {
    expect(createAnnotation({ id: 'gene1', type: 'gene', start: 0, end: 30 }, SEQLEN).id).toBe('gene1');
  });

  it('preserves qualifiers, provenance and unknown fields losslessly', () => {
    const qualifiers = { note: ['first', 'second'], codon_start: ['1'] };
    const provenance = { source: 'snapgene', parser: { version: 2 } };
    const custom = { nested: ['kept'] };
    const a = createAnnotation({
      name: 'rich', type: 'CDS', start: 10, end: 40,
      description: 'full description', qualifiers, provenance, custom,
      origin: { type: 'imported', file: 'x.gb' }, customScalar: 'value',
    }, SEQLEN);
    expect(a).toMatchObject({
      description: 'full description', qualifiers, provenance, custom,
      origin: { type: 'imported', file: 'x.gb' }, customScalar: 'value',
    });
    expect(a.qualifiers.note).toEqual(['first', 'second']); // order is semantic
  });
});

describe('annotation-edit — create-batch keeps the gene↔intron link (apply path)', () => {
  it('preserves ids so a gene + its detail introns still resolve after apply', () => {
    // exactly what buildGeneAnnotations emits: a gene + introns linked by regionId
    const batch = [
      { id: 'g1', type: 'gene', level: 'region', start: 0, end: 120, strand: 1, name: 'ген' },
      { id: 'i1', type: 'intron', level: 'detail', regionId: 'g1', start: 30, end: 90, strand: 1, name: 'интрон 1' },
    ];
    const { next } = applyAnnotationEdit([], { kind: 'create-batch', payload: batch }, 200);
    const gene = next.find((a) => a.type === 'gene');
    expect(gene.id).toBe('g1'); // id NOT regenerated
    // link survives → AA splice + exon-block render both work
    expect(getIntronsForRegion(next, gene)).toHaveLength(1);
  });

  it('repairs a cross-level explicit-id collision as one batch and keeps the child on its unique region', () => {
    const existing = [{
      id: 'x', type: 'domain', level: 'detail', start: 120, end: 140,
    }];
    const { next } = applyAnnotationEdit(existing, {
      kind: 'create-batch',
      payload: [
        { id: 'x', type: 'gene', level: 'region', start: 0, end: 100 },
        { id: 'child', type: 'intron', level: 'detail', regionId: 'x', start: 30, end: 50 },
      ],
    }, 200);
    expect(new Set(next.map((a) => a.id)).size).toBe(next.length);
    const region = next.find((a) => a.level === 'region');
    expect(region.id).not.toBe('x');
    expect(next.find((a) => a.id === 'child').regionId).toBe(region.id);
  });
});

describe('annotation-edit — deleteAnnotation', () => {
  it('removes the matching annotation', () => {
    const arr = [lacZ, { ...lacZ, id: 'other', name: 'other' }];
    const next = deleteAnnotation(arr, lacZ.id);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('other');
  });

  it('returns the same reference when id is not found (no-op detection)', () => {
    const arr = [lacZ];
    const next = deleteAnnotation(arr, 'nope');
    expect(next).toBe(arr);
  });

  it('returns [] for null/undefined input', () => {
    expect(deleteAnnotation(null, 'x')).toEqual([]);
    expect(deleteAnnotation(undefined, 'x')).toEqual([]);
  });
});

describe('annotation-edit — updateAnnotation', () => {
  it('shallow-merges patch and KEEPS the stable id when coords shift (ANN-INTEGRITY seam 4)', () => {
    // Old assumption: a coord/name/type edit regenerated the id. New contract:
    // the existing id is opaque and stable across the edit.
    const arr = [lacZ];
    const next = updateAnnotation(arr, lacZ.id, { start: 100, end: 469 }, SEQLEN);
    expect(next[0].start).toBe(100);
    expect(next[0].id).toBe(lacZ.id);
  });

  it('keeps the original id when patch only touches strand', () => {
    const arr = [lacZ];
    const next = updateAnnotation(arr, lacZ.id, { strand: 1 }, SEQLEN);
    expect(next[0].strand).toBe(1);
    expect(next[0].id).toBe(lacZ.id);
  });

  it('returns the same reference when id is not found', () => {
    const arr = [lacZ];
    expect(updateAnnotation(arr, 'nope', { start: 0, end: 10 }, SEQLEN)).toBe(arr);
  });

  it('throws on patch that produces invalid coords', () => {
    const arr = [lacZ];
    expect(() => updateAnnotation(arr, lacZ.id, { start: 600 }, SEQLEN)).toThrow(/Начало/);
  });

  it('treats a location patch as authoritative and derives its scalar projection', () => {
    const original = {
      ...lacZ,
      qualifiers: { note: ['keep'] },
      provenance: { source: 'import' },
      customScalar: 'keep-too',
      segments: [{ start: 999, end: 1000 }], // stale display shape
    };
    const location = makeLocation(LOCATION_KINDS.ORDER, [
      { start: 100, end: 120 },
      { start: 200, end: 230 },
    ]);
    const next = updateAnnotation(
      [original], original.id,
      // Stale scalar values from a UI projection must not override the
      // canonical location supplied by the segment editor.
      { location, start: 999, end: 1000, name: 'ordered' },
      SEQLEN,
      { length: SEQLEN, topology: 'linear' },
    )[0];
    expect(next.location.kind).toBe(LOCATION_KINDS.ORDER);
    expect(next.location.segments).toEqual([
      { start: 100, end: 120 },
      { start: 200, end: 230 },
    ]);
    expect(next.start).toBe(100);
    expect(next.end).toBe(230);
    expect(next.segments).toBeUndefined();
    expect(next.id).toBe(original.id);
    expect(next.qualifiers).toEqual({ note: ['keep'] });
    expect(next.provenance).toEqual({ source: 'import' });
    expect(next.customScalar).toBe('keep-too');
  });

  it('treats location:undefined as metadata-only and preserves JOIN/ORDER geometry', () => {
    const original = {
      id: 'compound', name: 'old', type: 'CDS', level: 'region', strand: 1,
      location: makeLocation(LOCATION_KINDS.ORDER, [
        { start: 10, end: 20 },
        { start: 40, end: 50 },
      ]),
      start: 10, end: 50,
    };
    const next = updateAnnotation(
      [original], original.id,
      { name: 'renamed', location: undefined },
      100,
    )[0];
    expect(next.name).toBe('renamed');
    expect(next.location).toEqual(original.location);
    expect(next.start).toBe(10);
    expect(next.end).toBe(50);
  });

  it('dispatcher forwards circular topology for an explicit origin-crossing location patch', () => {
    const original = {
      id: 'wrap', name: 'wrap', type: 'misc_feature', level: 'region', strand: 1,
      location: makeLocation(LOCATION_KINDS.SINGLE, [{ start: 4, end: 8 }]),
      start: 4, end: 8,
    };
    const wrap = makeLocation(LOCATION_KINDS.JOIN, [
      { start: 16, end: 20 },
      { start: 0, end: 4 },
    ]);
    const next = applyAnnotationEdit(
      [original],
      { kind: 'update', id: original.id, patch: { location: wrap } },
      20,
      { length: 20, topology: 'circular' },
    )[0];
    expect(next.location).toEqual(wrap);
    expect(next.start).toBe(16);
    expect(next.end).toBe(4);
  });
});

// ANN-INTEGRITY seam 4 (supersedes V180) — a region's id is opaque and STABLE
// across a coord/name/type edit, so its detail/point children (linked via
// `regionId = <id>`) stay attached WITHOUT any re-link. The old V180 behaviour
// (id regenerated → children re-pointed) is gone: identity no longer moves, so
// there is nothing to orphan in the first place.
describe('annotation-edit — updateAnnotation keeps children linked via a stable id', () => {
  const gene = { id: 'g-uuid', type: 'gene', level: 'region', start: 0, end: 120, strand: 1, name: 'ген' };
  const intron = { id: 'i1', type: 'intron', level: 'detail', regionId: 'g-uuid', start: 30, end: 90, strand: 1, name: 'интрон 1' };

  it('coord edit keeps the id stable and the intron link intact (no orphan)', () => {
    const next = updateAnnotation([gene, intron], 'g-uuid', { end: 130 }, 200);
    const g = next.find((a) => a.type === 'gene');
    const i = next.find((a) => a.type === 'intron');
    expect(g.id).toBe('g-uuid');            // id STABLE across the coord edit
    expect(i.regionId).toBe('g-uuid');      // child still linked
    expect(getIntronsForRegion(next, g)).toHaveLength(1);
  });

  it('rename keeps the id stable and children linked', () => {
    const next = updateAnnotation([gene, intron], 'g-uuid', { name: 'ген2' }, 200);
    const g = next.find((a) => a.type === 'gene');
    const i = next.find((a) => a.type === 'intron');
    expect(g.id).toBe('g-uuid');
    expect(i.regionId).toBe('g-uuid');
  });

  it('strand-only edit keeps the id and does not disturb children', () => {
    const next = updateAnnotation([gene, intron], 'g-uuid', { strand: -1 }, 200);
    const g = next.find((a) => a.type === 'gene');
    const i = next.find((a) => a.type === 'intron');
    expect(g.id).toBe('g-uuid');
    expect(i.regionId).toBe('g-uuid');
  });

  it('point children (e.g. mutation) stay linked too', () => {
    const mut = { id: 'm1', type: 'mutation', level: 'point', regionId: 'g-uuid', start: 45, end: 46 };
    const next = updateAnnotation([gene, mut], 'g-uuid', { end: 130 }, 200);
    expect(next.find((a) => a.type === 'mutation').regionId).toBe('g-uuid');
  });

  it('legacy region without id: first edit freezes the backfill id and keeps children linked', () => {
    const lg = { type: 'gene', level: 'region', start: 0, end: 120, strand: 1, name: 'ген' }; // no id
    const child = { id: 'd1', type: 'domain', level: 'detail', regionId: 'region:0:120:gene:ген', start: 10, end: 50 };
    const next = updateAnnotation([lg, child], 'region:0:120:gene:ген', { end: 130 }, 200);
    const g = next.find((a) => a.type === 'gene');
    // Stamped with the id it was ALREADY known by (pre-edit backfill), then stable.
    expect(g.id).toBe('region:0:120:gene:ген');
    expect(next.find((a) => a.type === 'domain').regionId).toBe('region:0:120:gene:ген');
  });

  it('does not touch unrelated children of other regions', () => {
    const other = { id: 'd2', type: 'domain', level: 'detail', regionId: 'other-region', start: 10, end: 50 };
    const next = updateAnnotation([gene, intron, other], 'g-uuid', { end: 130 }, 200);
    expect(next.find((a) => a.id === 'd2').regionId).toBe('other-region');
  });
});

describe('annotation-edit — createBatchAnnotations + DEC-ANN-09 dedup', () => {
  it('appends candidates with no overlap', () => {
    const arr = [lacZ];
    const cands = [{ name: 'AmpR', type: 'CDS', start: 1626, end: 2486 }];
    const { next, skipped, accepted } = createBatchAnnotations(arr, cands, SEQLEN);
    expect(skipped).toBe(0);
    expect(accepted).toHaveLength(1);
    expect(next).toHaveLength(2);
  });

  it('skips a candidate that overlaps >50% with same-type existing region', () => {
    const arr = [lacZ]; // 145..469, CDS
    // 144..470 overlaps lacZ entirely → 100% relative to lacZ length
    const cands = [{ name: 'predicted-orf', type: 'CDS', start: 144, end: 470 }];
    const { next, skipped, accepted } = createBatchAnnotations(arr, cands, SEQLEN);
    expect(skipped).toBe(1);
    expect(accepted).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it('accepts a same-coords candidate with DIFFERENT type (dedup is type-scoped)', () => {
    const arr = [lacZ];
    const cands = [{ name: 'misc', type: 'misc_feature', start: 145, end: 469 }];
    const { skipped, accepted } = createBatchAnnotations(arr, cands, SEQLEN);
    expect(skipped).toBe(0);
    expect(accepted).toHaveLength(1);
  });

  it('treats invalid candidates as silent skips', () => {
    const arr = [lacZ];
    const cands = [{ name: 'x', type: 'CDS', start: 100, end: 50 }]; // flipped
    const { skipped, accepted } = createBatchAnnotations(arr, cands, SEQLEN);
    expect(skipped).toBe(1);
    expect(accepted).toHaveLength(0);
  });
});

describe('annotation-edit — applyAnnotationEdit dispatcher', () => {
  it('dispatches kind=create', () => {
    const next = applyAnnotationEdit([], {
      kind: 'create',
      payload: { name: 'foo', type: 'CDS', start: 0, end: 99 },
    }, SEQLEN);
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('foo');
  });

  it('single create reserves existing ids even when the injected mint collides first', () => {
    const minted = ['taken', 'fresh-create'];
    const next = applyAnnotationEdit(
      [{ id: 'taken', type: 'domain', level: 'detail', start: 20, end: 30 }],
      { kind: 'create', payload: { name: 'foo', type: 'CDS', start: 0, end: 10 } },
      100,
      { idFactory: () => minted.shift() },
    );
    expect(next.map((a) => a.id)).toEqual(['taken', 'fresh-create']);
  });

  it('dispatches kind=delete', () => {
    const next = applyAnnotationEdit([lacZ], { kind: 'delete', id: lacZ.id }, SEQLEN);
    expect(next).toHaveLength(0);
  });

  it('dispatches kind=update', () => {
    const next = applyAnnotationEdit([lacZ], {
      kind: 'update',
      id: lacZ.id,
      patch: { name: 'lacZ-renamed' },
    }, SEQLEN);
    expect(next[0].name).toBe('lacZ-renamed');
    expect(next[0].id).toBe(lacZ.id); // stable id across rename (ANN-INTEGRITY seam 4)
  });

  it('dispatches kind=create-batch and returns {next, skipped, accepted}', () => {
    const result = applyAnnotationEdit([], {
      kind: 'create-batch',
      payload: [
        { name: 'a', type: 'CDS', start: 0, end: 99 },
        { name: 'b', type: 'CDS', start: 200, end: 299 },
      ],
    }, SEQLEN);
    expect(result.next).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it('throws on unknown kind', () => {
    expect(() => applyAnnotationEdit([], { kind: 'frobnicate' }, SEQLEN)).toThrow(/unknown kind/);
  });

  it('throws when edit is not an object', () => {
    expect(() => applyAnnotationEdit([], null, SEQLEN)).toThrow(/object/);
  });
});

describe('annotation-edit — backfill-id matching for imported annotations', () => {
  // Bug-rush 1 (04.05.2026 evening): existing annotations parsed from
  // .dna / .gb arrived without an `id` field. SequenceView dispatched
  // drag-resize edits using the deterministic backfill id (the same
  // shape that getRegions stamps on read). Pre-fix, updateAnnotation
  // looked for strict a.id === annotationId and silently skipped.
  // Now the matcher accepts both forms and stamps the canonical id
  // on the way out.
  const noId = { name: 'lacZα', type: 'CDS', start: 145, end: 469, level: 'region', strand: -1 };

  it('updateAnnotation finds a region without id by its backfill id', () => {
    const arr = [noId];
    const next = updateAnnotation(arr, 'region:145:469:CDS:lacZα', { end: 500 }, SEQLEN);
    expect(next).not.toBe(arr);
    expect(next[0].end).toBe(500);
    // The legacy no-id annotation is stamped with the id it was ALREADY known by
    // (the pre-edit backfill) and that id is then stable — it does not track the
    // new coords (ANN-INTEGRITY seam 4).
    expect(next[0].id).toBe('region:145:469:CDS:lacZα');
  });

  it('updateAnnotation stamps the canonical id even when the patch only changes strand', () => {
    const arr = [noId];
    const next = updateAnnotation(arr, 'region:145:469:CDS:lacZα', { strand: 1 }, SEQLEN);
    expect(next[0].id).toBe('region:145:469:CDS:lacZα');
  });

  it('deleteAnnotation removes a region without id by its backfill id', () => {
    const arr = [noId];
    const next = deleteAnnotation(arr, 'region:145:469:CDS:lacZα');
    expect(next).toHaveLength(0);
  });
});

describe('annotation-edit — toUiCoords / fromUiCoords round-trip', () => {
  it('toUiCoords adds 1 to start, leaves end untouched', () => {
    expect(toUiCoords(145, 469)).toEqual({ uiStart: 146, uiEnd: 469 });
  });

  it('fromUiCoords subtracts 1 from start, leaves end untouched', () => {
    expect(fromUiCoords(146, 469)).toEqual({ start: 145, end: 469 });
  });

  it('round-trips losslessly', () => {
    const { uiStart, uiEnd } = toUiCoords(145, 469);
    expect(fromUiCoords(uiStart, uiEnd)).toEqual({ start: 145, end: 469 });
  });
});

// ─── Sprint M-X.3 follow-up — split / merge helpers for the
//     FeatureEditorModal. ─────────────────────────────────────────
describe('splitAnnotation', () => {
  const cds = {
    id: 'r1', name: 'lacZα', type: 'CDS',
    start: 100, end: 1000, strand: 1, level: 'region',
  };

  it('splits a feature into N equal-length child features', () => {
    const next = splitAnnotation([cds], 'r1', 3, 5000);
    expect(next).toHaveLength(3);
    expect(next[0].start).toBe(100);
    expect(next[0].end).toBe(400);
    expect(next[1].start).toBe(400);
    expect(next[1].end).toBe(700);
    expect(next[2].start).toBe(700);
    expect(next[2].end).toBe(1000);
  });

  it('children inherit type + strand from the parent', () => {
    const next = splitAnnotation([{ ...cds, strand: -1, type: 'gene' }], 'r1', 2, 5000);
    expect(next.every((c) => c.type === 'gene' && c.strand === -1)).toBe(true);
  });

  it('children get «Name-1», «Name-2», … numbered names', () => {
    const next = splitAnnotation([cds], 'r1', 3, 5000);
    expect(next[0].name).toBe('lacZα-1');
    expect(next[1].name).toBe('lacZα-2');
    expect(next[2].name).toBe('lacZα-3');
  });

  it('children get fresh deterministic ids', () => {
    const next = splitAnnotation([cds], 'r1', 2, 5000);
    expect(next[0].id).toBeTruthy();
    expect(next[1].id).toBeTruthy();
    expect(next[0].id).not.toBe(next[1].id);
  });

  it('reserves every current id when split uses an injected colliding mint', () => {
    const occupied = {
      id: 'taken', name: 'domain', type: 'domain', level: 'detail', start: 2000, end: 2010,
    };
    const minted = ['taken', 'split-a', 'split-b'];
    const next = splitAnnotation(
      [cds, occupied], 'r1', 2, 5000,
      { idFactory: () => minted.shift() },
    );
    expect(next.filter((a) => a.level === 'region').map((a) => a.id))
      .toEqual(['split-a', 'split-b']);
    expect(next.find((a) => a.id === 'taken')).toBe(occupied);
  });

  it('rounding: total length preserved on uneven divisions', () => {
    // 1000 - 100 = 900; 900 / 4 = 225 (exact) — pick uneven 7 chunks of 900.
    const next = splitAnnotation([cds], 'r1', 7, 5000);
    expect(next[0].start).toBe(100);
    expect(next[next.length - 1].end).toBe(1000);
    // Internal segments are contiguous (next.start === prev.end).
    for (let i = 1; i < next.length; i++) {
      expect(next[i].start).toBe(next[i - 1].end);
    }
  });

  it('preserves other annotations unchanged', () => {
    const other = { id: 'r2', name: 'X', type: 'misc', start: 2000, end: 2500, strand: 1, level: 'region' };
    const next = splitAnnotation([cds, other], 'r1', 2, 5000);
    expect(next).toHaveLength(3); // 2 children + other
    expect(next.find((a) => a.id === 'r2')).toEqual(other);
  });

  it('N <= 1 throws (no point splitting into one)', () => {
    expect(() => splitAnnotation([cds], 'r1', 1, 5000)).toThrow();
    expect(() => splitAnnotation([cds], 'r1', 0, 5000)).toThrow();
  });

  it('unknown id is a no-op (returns input array unchanged)', () => {
    const next = splitAnnotation([cds], 'nope', 2, 5000);
    expect(next).toEqual([cds]);
  });

  it('feature too short to split (length < N) throws', () => {
    const tiny = { ...cds, start: 100, end: 102 }; // length 2
    expect(() => splitAnnotation([tiny], 'r1', 4, 5000)).toThrow();
  });
});

describe('mergeAnnotations', () => {
  const left  = { id: 'L', name: 'Left',  type: 'CDS', start: 0,    end: 500,  strand: 1, level: 'region' };
  const mid   = { id: 'M', name: 'Mid',   type: 'CDS', start: 500,  end: 900,  strand: 1, level: 'region' };
  const right = { id: 'R', name: 'Right', type: 'CDS', start: 900,  end: 1300, strand: 1, level: 'region' };
  const far   = { id: 'F', name: 'Far',   type: 'CDS', start: 5000, end: 6000, strand: 1, level: 'region' };

  it('merges two adjacent features into one (union range)', () => {
    const next = mergeAnnotations([left, mid], 'L', 'M');
    expect(next).toHaveLength(1);
    expect(next[0].start).toBe(0);
    expect(next[0].end).toBe(900);
  });

  it('reserves every current id when merge uses an injected colliding mint', () => {
    const occupied = {
      id: 'taken', name: 'domain', type: 'domain', level: 'detail', start: 2000, end: 2010,
    };
    const minted = ['taken', 'merged-fresh'];
    const next = mergeAnnotations(
      [left, mid, occupied], 'L', 'M',
      { idFactory: () => minted.shift() },
    );
    expect(next.find((a) => a.level === 'region').id).toBe('merged-fresh');
    expect(next.find((a) => a.id === 'taken')).toBe(occupied);
  });

  it('keeps the LARGER feature\'s name when merging', () => {
    // mid is shorter (400 nt) than left (500 nt) — left's name wins.
    const next = mergeAnnotations([left, mid], 'L', 'M');
    expect(next[0].name).toBe('Left');
  });

  it('refuses to merge non-adjacent features (returns input unchanged)', () => {
    const next = mergeAnnotations([left, far], 'L', 'F');
    expect(next).toHaveLength(2);
    expect(next).toEqual([left, far]);
  });

  it('order of args (left-to-right vs right-to-left) doesn\'t matter', () => {
    const a = mergeAnnotations([left, mid], 'L', 'M');
    const b = mergeAnnotations([left, mid], 'M', 'L');
    expect(a[0].start).toBe(b[0].start);
    expect(a[0].end).toBe(b[0].end);
  });

  it('preserves the third (untouched) feature when merging two of three', () => {
    const next = mergeAnnotations([left, mid, right], 'L', 'M');
    expect(next).toHaveLength(2); // {L+M} + R
    expect(next.find((a) => a.id === 'R')).toBeTruthy();
  });

  it('unknown ids are no-op', () => {
    expect(mergeAnnotations([left, mid], 'X', 'M')).toEqual([left, mid]);
    expect(mergeAnnotations([left, mid], 'L', 'Y')).toEqual([left, mid]);
  });
});
