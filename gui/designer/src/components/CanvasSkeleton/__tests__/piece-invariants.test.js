/**
 * piece-invariants.test.js — T1 K2. Pure hard-cap + shape validators
 * (validateCreate / validateUpdate / validateRangeOnContainer).
 *
 * Invariants are STRINGS-free (parallels assembly-invariants): they
 * return { ok, error?, code? }; the reducer (K3) localises via `code`.
 */
import { describe, it, expect } from 'vitest';
import {
  PIECE_CAPS, validateCreate, validateUpdate, validateRangeOnContainer,
} from '../lib/piece-invariants';

const container = { id: 'c-1', name: 'pUC', sequence: 'ACGT'.repeat(100) }; // 400 bp
const stateWith = (over = {}) => ({ containers: [container], pieces: [], ...over });
const goodRaw = (over = {}) => ({
  name: 'gRNA',
  sourceIds: ['c-1'],
  ranges: [{ sourceId: 'c-1', start: 10, end: 50, orientation: 'forward' }],
  origin: 'selection',
  acquisitionMethod: 'undefined',
  acquisitionParams: {},
  ...over,
});

describe('T1 K2 PIECE_CAPS', () => {
  it('exposes the spec hard caps and is frozen', () => {
    expect(PIECE_CAPS.MAX_PIECES).toBe(500);
    expect(PIECE_CAPS.MAX_RANGES_PER_PIECE).toBe(200);
    expect(PIECE_CAPS.MIN_RANGE_LENGTH).toBe(1);
    expect(PIECE_CAPS.MAX_NAME_LENGTH).toBe(200);
    expect(PIECE_CAPS.COLOR_COLLISION_THRESHOLD).toBe(12);
    expect(Object.isFrozen(PIECE_CAPS)).toBe(true);
  });
});

describe('T1 K2 validateRangeOnContainer', () => {
  it('accepts an in-bounds forward range', () => {
    expect(validateRangeOnContainer({ start: 0, end: 4, orientation: 'forward' }, container).ok).toBe(true);
  });
  it('rejects start < 0 / end past container / start >= end / bad orientation', () => {
    expect(validateRangeOnContainer({ start: -1, end: 4, orientation: 'forward' }, container).ok).toBe(false);
    expect(validateRangeOnContainer({ start: 0, end: 99999, orientation: 'forward' }, container).ok).toBe(false);
    expect(validateRangeOnContainer({ start: 10, end: 10, orientation: 'forward' }, container).ok).toBe(false);
    expect(validateRangeOnContainer({ start: 0, end: 4, orientation: 'sideways' }, container).ok).toBe(false);
  });
});

describe('T1 K2 validateCreate', () => {
  it('accepts a well-formed selection piece', () => {
    expect(validateCreate(stateWith(), goodRaw())).toEqual({ ok: true });
  });

  it('rejects when MAX_PIECES reached → code TOO_MANY', () => {
    const pieces = Array.from({ length: PIECE_CAPS.MAX_PIECES }, (_, i) => ({ id: `pc-${i}` }));
    const r = validateCreate(stateWith({ pieces }), goodRaw());
    expect(r.ok).toBe(false);
    expect(r.code).toBe('TOO_MANY');
  });

  it('rejects sourceIds/ranges length mismatch or empty → INVALID_RANGE', () => {
    expect(validateCreate(stateWith(), goodRaw({ sourceIds: [], ranges: [] })).code).toBe('INVALID_RANGE');
    expect(validateCreate(stateWith(), goodRaw({
      sourceIds: ['c-1', 'c-1'],
      ranges: [{ sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' }],
    })).code).toBe('INVALID_RANGE');
  });

  it('rejects an unknown sourceId → CONTAINER_NOT_FOUND', () => {
    const r = validateCreate(stateWith(), goodRaw({
      sourceIds: ['c-missing'],
      ranges: [{ sourceId: 'c-missing', start: 0, end: 4, orientation: 'forward' }],
    }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CONTAINER_NOT_FOUND');
  });

  it('rejects an out-of-bounds range → INVALID_RANGE', () => {
    const r = validateCreate(stateWith(), goodRaw({
      ranges: [{ sourceId: 'c-1', start: 0, end: 100000, orientation: 'forward' }],
    }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_RANGE');
  });

  it('rejects > MAX_RANGES_PER_PIECE → TOO_MANY_RANGES', () => {
    const many = Array.from({ length: PIECE_CAPS.MAX_RANGES_PER_PIECE + 1 }, () => ({
      sourceId: 'c-1', start: 0, end: 2, orientation: 'forward',
    }));
    const r = validateCreate(stateWith(), goodRaw({
      sourceIds: many.map(() => 'c-1'),
      ranges: many,
    }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('TOO_MANY_RANGES');
  });

  it('rejects an over-long name → NAME_TOO_LONG', () => {
    const r = validateCreate(stateWith(), goodRaw({ name: 'x'.repeat(PIECE_CAPS.MAX_NAME_LENGTH + 1) }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NAME_TOO_LONG');
  });

  it('rejects a bad acquisitionMethod and missing params for a real method → INVALID_METHOD', () => {
    expect(validateCreate(stateWith(), goodRaw({ acquisitionMethod: 'magic' })).code).toBe('INVALID_METHOD');
    const r = validateCreate(stateWith(), goodRaw({ acquisitionMethod: 'pcr', acquisitionParams: {} }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_METHOD');
  });

  it('rejects a bad origin enum', () => {
    expect(validateCreate(stateWith(), goodRaw({ origin: 'nonsense' })).ok).toBe(false);
  });

  it("accepts method 'direct' with empty params (spec §5.7 — no params needed)", () => {
    const r = validateCreate(stateWith(), goodRaw({ acquisitionMethod: 'direct', acquisitionParams: {} }));
    expect(r).toEqual({ ok: true });
  });

  it("T2 K1 — accepts origin 'legacy-migration' (already in T1 ORIGIN_ENUM)", () => {
    expect(validateCreate(stateWith(), goodRaw({ origin: 'legacy-migration' }))).toEqual({ ok: true });
  });

  it('T6 K3 — gap piece: empty source/ranges ok, gapLength validated', () => {
    const gap = (over = {}) => ({
      kind: 'gap', name: 'Гэп 12 нт', sourceIds: [], ranges: [],
      gapLength: 12, gapHint: 'linker', origin: 'manual-gap',
      acquisitionMethod: 'synthesis', acquisitionParams: { type: 'manual-gap' }, ...over,
    });
    expect(validateCreate(stateWith(), gap())).toEqual({ ok: true });
    expect(validateCreate(stateWith(), gap({ gapLength: -1 })).ok).toBe(false);
    expect(validateCreate(stateWith(), gap({ gapLength: 99999 })).ok).toBe(false);
  });
});

describe('T1 K2 validateUpdate', () => {
  const existing = {
    id: 'pc-1', name: 'g', sourceIds: ['c-1'],
    ranges: [{ sourceId: 'c-1', start: 0, end: 10, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
  };

  it('accepts a benign field change', () => {
    expect(validateUpdate(stateWith(), existing, { name: 'renamed' }).ok).toBe(true);
  });
  it('validates the merged shape: bad new range rejected', () => {
    const r = validateUpdate(stateWith(), existing, {
      ranges: [{ sourceId: 'c-1', start: 0, end: 999999, orientation: 'forward' }],
    });
    expect(r.ok).toBe(false);
  });
  it('rejects a ranges/sourceIds length divergence on update', () => {
    const r = validateUpdate(stateWith(), existing, {
      ranges: [
        { sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' },
        { sourceId: 'c-1', start: 5, end: 9, orientation: 'forward' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_RANGE');
  });
});

/**
 * PRIMER-LIVE-1 — a piece authored from two chosen primer landings.
 *
 * The origin has to be in the enum or `validateCreate` rejects the piece and
 * the whole «create PCR product» action is a silent no-op: the button appears
 * to work, a toast says nothing useful, and no piece is ever made.
 */
describe('PRIMER-LIVE-1 — pcr-occurrences origin', () => {
  it('accepts a piece authored from two chosen landings', () => {
    const raw = goodRaw({
      origin: 'pcr-occurrences',
      acquisitionMethod: 'pcr',
      acquisitionParams: { occurrenceKeys: ['f#1', 'r#1'] },
    });
    expect(validateCreate(stateWith(), raw)).toEqual({ ok: true });
  });

  it('still rejects an origin nobody defined', () => {
    const raw = goodRaw({ origin: 'pcr-vibes' });
    expect(validateCreate(stateWith(), raw).code).toBe('INVALID_ORIGIN');
  });

  it('accepts an origin-crossing product as TWO ranges on the same source', () => {
    // A ring cannot be one `start > end` range — the invariant forbids it, and
    // rightly so. The wrap is two real spans: [hi..len] and [0..lo].
    const raw = goodRaw({
      origin: 'pcr-occurrences',
      acquisitionMethod: 'pcr',
      acquisitionParams: { occurrenceKeys: ['f#1', 'r#1'] },
      sourceIds: ['c-1', 'c-1'],
      ranges: [
        { sourceId: 'c-1', start: 380, end: 400, orientation: 'forward' },
        { sourceId: 'c-1', start: 0, end: 40, orientation: 'forward' },
      ],
    });
    expect(validateCreate(stateWith(), raw)).toEqual({ ok: true });
  });

  it('rejects a wrap smuggled in as one inverted range', () => {
    const raw = goodRaw({
      origin: 'pcr-occurrences',
      acquisitionMethod: 'pcr',
      acquisitionParams: { occurrenceKeys: ['f#1', 'r#1'] },
      ranges: [{ sourceId: 'c-1', start: 380, end: 40, orientation: 'forward' }],
    });
    expect(validateCreate(stateWith(), raw).code).toBe('INVALID_RANGE');
  });
});
