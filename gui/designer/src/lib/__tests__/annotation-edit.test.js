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
} from '../annotation-edit.js';

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
  it('builds a valid region with auto-id', () => {
    const a = createAnnotation({ name: 'AmpR', type: 'CDS', start: 1626, end: 2486 }, SEQLEN);
    expect(a.id).toBe('region:1626:2486:CDS:AmpR');
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
  it('shallow-merges patch and regenerates id when coords/type/name shift', () => {
    const arr = [lacZ];
    const next = updateAnnotation(arr, lacZ.id, { start: 100, end: 469 }, SEQLEN);
    expect(next[0].start).toBe(100);
    expect(next[0].id).toBe('region:100:469:CDS:lacZα');
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
    expect(next[0].id).toBe('region:145:469:CDS:lacZ-renamed');
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
