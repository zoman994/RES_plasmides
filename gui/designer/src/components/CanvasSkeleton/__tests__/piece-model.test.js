/**
 * piece-model.test.js — T1 K1 pure helpers (createPiece / computePieceSize /
 * generatePieceColor / clonePiece / autoPieceName).
 *
 * Pure layer — no state, no validation (that is piece-invariants, K2).
 * Parallels assembly-model.test.js conventions.
 */
import { describe, it, expect } from 'vitest';
import {
  createPiece, computePieceSize, generatePieceColor,
  clonePiece, autoPieceName,
} from '../lib/piece-model';

const rawSelectionPiece = (over = {}) => ({
  name: 'U3 gRNA',
  sourceIds: ['c-1'],
  ranges: [{ sourceId: 'c-1', start: 100, end: 200, orientation: 'forward' }],
  origin: 'selection',
  acquisitionMethod: 'undefined',
  acquisitionParams: {},
  ...over,
});

describe('T1 K1 piece-model.createPiece', () => {
  it('stamps pc- id, color, timestamps, null zoneId/derivedReactionId', () => {
    const p = createPiece(rawSelectionPiece(), []);
    expect(p.id).toMatch(/^pc-/);
    expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(p.createdAt).toBeTypeOf('number');
    expect(p.updatedAt).toBe(p.createdAt);
    expect(p.zoneId).toBeNull();
    expect(p.derivedReactionId).toBeNull();
  });

  it('preserves caller-supplied fields verbatim (no validation, no mutation)', () => {
    const raw = rawSelectionPiece({ functionalLabel: 'guide' });
    const p = createPiece(raw, []);
    expect(p.name).toBe('U3 gRNA');
    expect(p.sourceIds).toEqual(['c-1']);
    expect(p.ranges).toEqual([{ sourceId: 'c-1', start: 100, end: 200, orientation: 'forward' }]);
    expect(p.origin).toBe('selection');
    expect(p.acquisitionMethod).toBe('undefined');
    expect(p.functionalLabel).toBe('guide');
    // pure: caller object not mutated
    expect(raw.id).toBeUndefined();
  });

  it('does not throw on minimal raw data (validation is K2 concern)', () => {
    expect(() => createPiece({}, [])).not.toThrow();
    const p = createPiece({}, []);
    expect(p.id).toMatch(/^pc-/);
  });

  it('generates unique ids across calls', () => {
    const a = createPiece(rawSelectionPiece(), []);
    const b = createPiece(rawSelectionPiece(), []);
    expect(a.id).not.toBe(b.id);
  });
});

describe('T1 K1 piece-model.computePieceSize', () => {
  it('sums a single range length (end - start)', () => {
    expect(computePieceSize({ ranges: [{ start: 100, end: 200 }] })).toBe(100);
  });
  it('sums multiple ranges (OV-PCR derived piece)', () => {
    const piece = { ranges: [{ start: 0, end: 50 }, { start: 275, end: 280 }] };
    expect(computePieceSize(piece)).toBe(55);
  });
  it('returns 0 for missing / empty ranges', () => {
    expect(computePieceSize({})).toBe(0);
    expect(computePieceSize({ ranges: [] })).toBe(0);
    expect(computePieceSize(null)).toBe(0);
  });
});

describe('T1 K1 piece-model.generatePieceColor', () => {
  it('is deterministic for the same id and returns #RRGGBB', () => {
    const a = generatePieceColor('pc-abc');
    const b = generatePieceColor('pc-abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it('different ids generally produce valid distinct hex', () => {
    const a = generatePieceColor('pc-aaaaaaaa');
    const b = generatePieceColor('pc-zzzzzzzz');
    expect(a).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(b).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(a).not.toBe(b);
  });
  it('shifts hue to avoid a collision when >12 existing colors include the base', () => {
    const base = generatePieceColor('pc-collide');
    const existing = Array.from({ length: 13 }, () => base);
    const shifted = generatePieceColor('pc-collide', existing);
    expect(shifted).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(shifted).not.toBe(base);
  });
});

describe('T1 K1 piece-model.clonePiece', () => {
  const original = () => ({
    ...createPiece(rawSelectionPiece({ name: 'src' }), []),
    derivedReactionId: 'op-99',
    zoneId: 'z-1',
  });

  it('deep-copies with new id, new color, null derivedReactionId, suffixed name, fresh timestamps', () => {
    const o = original();
    const c = clonePiece(o);
    expect(c.id).not.toBe(o.id);
    expect(c.id).toMatch(/^pc-/);
    expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(c.derivedReactionId).toBeNull();
    expect(c.name).toBe('src (копия)');
    expect(c.zoneId).toBe('z-1'); // inherits original zone by default
    expect(c.ranges).toEqual(o.ranges);
    expect(c.ranges).not.toBe(o.ranges); // deep copy, not shared ref
    expect(c.createdAt).toBeTypeOf('number');
  });

  it('honours overrides.name and overrides.zoneId', () => {
    const c = clonePiece(original(), { name: 'My copy', zoneId: 'z-2' });
    expect(c.name).toBe('My copy');
    expect(c.zoneId).toBe('z-2');
  });
});

describe('T1 K1 piece-model.autoPieceName', () => {
  it('formats {containerName}({start}-{end})', () => {
    const name = autoPieceName({ name: 'pUC19' }, { start: 100, end: 200 });
    expect(name).toBe('pUC19(100-200)');
  });
});

// T6 K2 — kind/gap shape extension (DEC-T6-02).
describe('T6 K2 piece-model kind/gap', () => {
  it('createPiece defaults kind:"sourced"', () => {
    expect(createPiece(rawSelectionPiece(), []).kind).toBe('sourced');
  });
  it('createPiece kind:"gap" carries gapLength/gapHint, empty source/ranges ok', () => {
    const g = createPiece({
      kind: 'gap', name: 'Гэп 12 нт', sourceIds: [], ranges: [],
      gapLength: 12, gapHint: 'linker', origin: 'manual-gap',
      acquisitionMethod: 'synthesis', acquisitionParams: { type: 'manual-gap' },
    }, []);
    expect(g.kind).toBe('gap');
    expect(g.gapLength).toBe(12);
    expect(g.gapHint).toBe('linker');
    expect(g.sourceIds).toEqual([]);
    expect(g.ranges).toEqual([]);
  });
  it('clonePiece preserves kind + gap fields', () => {
    const g = createPiece({ kind: 'gap', name: 'g', gapLength: 5, gapHint: 'unknown', origin: 'manual-gap', acquisitionMethod: 'synthesis', acquisitionParams: { type: 'manual-gap' } }, []);
    const c = clonePiece(g);
    expect(c.kind).toBe('gap');
    expect(c.gapLength).toBe(5);
  });
});

// T2 K2 — frozen shape extension (DEC-T2-13 / R-T2-6).
describe('T2 K2 piece-model frozen extension', () => {
  it('createPiece defaults frozen:false (pieces are created unfrozen)', () => {
    const p = createPiece(rawSelectionPiece(), []);
    expect(p.frozen).toBe(false);
  });
  it('clonePiece resets frozen:false and drops any frozenSequence', () => {
    const frozen = {
      ...createPiece(rawSelectionPiece({ name: 'src' }), []),
      frozen: true,
      frozenSequence: 'ACGT',
    };
    const c = clonePiece(frozen);
    expect(c.frozen).toBe(false);
    expect(c.frozenSequence == null).toBe(true);
  });
});
