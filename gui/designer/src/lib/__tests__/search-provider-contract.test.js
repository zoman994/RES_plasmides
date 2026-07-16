/**
 * REV #2 — S3-CLOSE / K3.0: the structural contract every biological provider must satisfy.
 *
 * A confirmed hit is a claim about a physical molecule: «this motif / protein / restriction site
 * is HERE, on THIS sequence, between THESE bases». Two ways a corrupted provider can forge that
 * claim survived K2:
 *
 *   1. COORDINATES. K2 checked `end > start` and integer-ness, but not the length of the actual
 *      sequence. `{start: 5_000_000, end: 5_000_006}` on a 360 bp plasmid passed as a real hit.
 *   2. OWNERSHIP. `library-search` enriches an occurrence with `{ targetRef: doc.ref, ...o }` —
 *      the spread runs LAST, so a provider-owned `o.targetRef` silently OVERWRITES the trusted
 *      ref and re-attributes the hit to a different molecule. That file is frozen, so ownership
 *      is enforced here, at the provider boundary: a ProviderOccurrence has no targetRef at all.
 *
 * Ground truth this contract is calibrated against (verified in code, not assumed): seq-match,
 * protein-match and re-match ALL emit `location: {segments, strand:'+'|'-', wrapsOrigin:boolean}`
 * and none of them emits `targetRef`. So the strict shape below accepts every real hit.
 *
 * Deliberately NOT enforced: segment count, sort order, monotonicity, or «wrapsOrigin ⇒ exactly
 * two segments» — a spliced protein hit legitimately has several non-adjacent exon segments, and
 * a circular origin hit legitimately runs [95,100) then [0,5).
 */
import { describe, it, expect } from 'vitest';
import { validateProviderOccurrences, validateProviderPayload } from '../search-provider-contract';

const LEN = 100;
const occ = (over = {}) => ({
  location: { segments: [{ start: 10, end: 16 }], strand: '+', wrapsOrigin: false },
  ...over,
});
const loc = (over) => occ({ location: { segments: [{ start: 10, end: 16 }], strand: '+', wrapsOrigin: false, ...over } });

describe('validateProviderOccurrences — the shapes a real engine produces', () => {
  it('a linear hit is valid', () => {
    expect(validateProviderOccurrences([occ()], LEN)).toBe(true);
  });

  it('a CIRCULAR origin-wrapping hit is valid (segments run past the end and resume at 0)', () => {
    const wrap = occ({ location: { segments: [{ start: 95, end: 100 }, { start: 0, end: 5 }], strand: '+', wrapsOrigin: true } });
    expect(validateProviderOccurrences([wrap], LEN)).toBe(true);
  });

  it('a SPLICED protein hit is valid: several non-adjacent exon segments, order not enforced', () => {
    const spliced = occ({ location: { segments: [{ start: 60, end: 75 }, { start: 10, end: 20 }], strand: '-', wrapsOrigin: false } });
    expect(validateProviderOccurrences([spliced], LEN)).toBe(true);
  });

  it('a segment ending exactly at sequenceLength is valid (end-exclusive boundary)', () => {
    expect(validateProviderOccurrences([loc({ segments: [{ start: 94, end: 100 }] })], LEN)).toBe(true);
  });

  it.each([['+'], ['-'], ['both']])('strand %s is valid', (strand) => {
    expect(validateProviderOccurrences([loc({ strand })], LEN)).toBe(true);
  });

  it('extra payload fields (metrics / protein / enzyme) are allowed and not inspected', () => {
    const rich = occ({ metrics: { identity: 1 }, protein: { cds: 'glaA' }, enzyme: { name: 'EcoRI' } });
    expect(validateProviderOccurrences([rich], LEN)).toBe(true);
  });

  it('a null-prototype occurrence is still a plain record', () => {
    const bare = Object.create(null);
    bare.location = { segments: [{ start: 1, end: 4 }], strand: '+', wrapsOrigin: false };
    expect(validateProviderOccurrences([bare], LEN)).toBe(true);
  });

  it('an EMPTY array is an honest miss — even for a document with NO sequence', () => {
    expect(validateProviderOccurrences([], LEN)).toBe(true);
    expect(validateProviderOccurrences([], undefined)).toBe(true); // «nothing to check here»
    expect(validateProviderOccurrences([], 0)).toBe(true);
    expect(validateProviderOccurrences([], null)).toBe(true);
  });
});

describe('validateProviderOccurrences — a forged claim is rejected', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { 0: occ() }],
    ['a Map', new Map()],
    ['a string', 'GAATTC'],
    ['a number', 3],
  ])('%s is not an occurrence array', (_l, value) => {
    expect(validateProviderOccurrences(value, LEN)).toBe(false);
  });

  // A non-empty array is a CLAIM about a sequence, so the sequence must exist and be measurable.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['zero', 0],
    ['negative', -1],
    ['a float', 10.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a string', '100'],
  ])('a hit claimed against a %s sequenceLength is rejected', (_l, len) => {
    expect(validateProviderOccurrences([occ()], len)).toBe(false);
  });

  it.each([
    ['[null]', [null]],
    ['[undefined]', [undefined]],
    ['[{}] — no location', [{}]],
    ['a string entry', ['hit']],
    ['a Date entry', [new Date()]],
    ['an array entry', [[]]],
  ])('%s is not a valid occurrence', (_l, value) => {
    expect(validateProviderOccurrences(value, LEN)).toBe(false);
  });

  it('an occurrence carrying its OWN targetRef is rejected — a provider may not choose the owner', () => {
    const spoof = occ({ targetRef: { kind: 'entry', id: 'some-other-plasmid' } });
    expect(validateProviderOccurrences([spoof], LEN)).toBe(false);
  });

  it('even a null/undefined own targetRef is rejected (the key must not be present at all)', () => {
    expect(validateProviderOccurrences([occ({ targetRef: null })], LEN)).toBe(false);
    expect(validateProviderOccurrences([occ({ targetRef: undefined })], LEN)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a Map', new Map()],
    ['a Date', new Date()],
    ['an array', []],
    ['a string', 'here'],
  ])('a %s location is rejected', (_l, location) => {
    expect(validateProviderOccurrences([{ location }], LEN)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', []],
    ['not an array', { 0: { start: 1, end: 2 } }],
  ])('%s segments are rejected', (_l, segments) => {
    expect(validateProviderOccurrences([loc({ segments })], LEN)).toBe(false);
  });

  it.each([
    ['null', [null]],
    ['a string', ['1-4']],
    ['a Date', [new Date()]],
  ])('a %s segment is rejected', (_l, segments) => {
    expect(validateProviderOccurrences([loc({ segments })], LEN)).toBe(false);
  });

  it.each([
    ['start < 0', { start: -1, end: 6 }],
    ['start === end (spans nothing)', { start: 6, end: 6 }],
    ['end < start (inverted)', { start: 9, end: 3 }],
    ['end > sequenceLength (off the molecule)', { start: 95, end: 101 }],
    ['start beyond the molecule', { start: 500, end: 506 }],
    ['float start', { start: 1.5, end: 6 }],
    ['float end', { start: 1, end: 6.5 }],
    ['NaN', { start: NaN, end: 6 }],
    ['Infinity', { start: 0, end: Infinity }],
    ['missing coords', {}],
  ])('a segment with %s is rejected', (_l, segment) => {
    expect(validateProviderOccurrences([loc({ segments: [segment] })], LEN)).toBe(false);
  });

  it('ONE bad segment poisons the whole occurrence (a partly-plausible hit is still forged)', () => {
    expect(validateProviderOccurrences([loc({ segments: [{ start: 0, end: 6 }, { start: 0, end: 500 }] })], LEN)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['numeric 1', 1],
    ['"top"', 'top'],
    ['"+1"', '+1'],
    ['empty', ''],
  ])('a %s strand is rejected', (_l, strand) => {
    expect(validateProviderOccurrences([loc({ strand })], LEN)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['"false"', 'false'],
    ['0', 0],
    ['1', 1],
  ])('a %s wrapsOrigin is rejected (it must be an explicit boolean)', (_l, wrapsOrigin) => {
    expect(validateProviderOccurrences([loc({ wrapsOrigin })], LEN)).toBe(false);
  });

  it('never throws — it always answers with a boolean', () => {
    const nasty = [Symbol('x'), () => {}, 0n, [[[[]]]], { location: { segments: [{ get start() { return 1; }, end: 4 }], strand: '+', wrapsOrigin: false } }];
    for (const v of nasty) expect(typeof validateProviderOccurrences(v, LEN)).toBe('boolean');
    expect(typeof validateProviderOccurrences([occ()], LEN)).toBe('boolean');
  });
});

describe('validateProviderPayload — a worker reply about the documents we actually sent', () => {
  const lengths = () => new Map([['entry:a', LEN], ['entry:b', 50]]);

  it('an empty payload is a valid honest miss across the whole library', () => {
    expect(validateProviderPayload({}, lengths())).toBe(true);
  });

  it('a well-formed payload validates each value against ITS OWN document length', () => {
    const byId = { 'entry:a': [loc({ segments: [{ start: 90, end: 100 }] })], 'entry:b': [loc({ segments: [{ start: 0, end: 50 }] })] };
    expect(validateProviderPayload(byId, lengths())).toBe(true);
  });

  it('a hit valid for one molecule but out of bounds on ANOTHER is rejected', () => {
    // 90..100 fits entry:a (100 bp) but not entry:b (50 bp) — the length must be per document.
    const byId = { 'entry:b': [loc({ segments: [{ start: 90, end: 100 }] })] };
    expect(validateProviderPayload(byId, lengths())).toBe(false);
  });

  it('a null-prototype record is a valid payload', () => {
    const bare = Object.create(null);
    bare['entry:a'] = [occ()];
    expect(validateProviderPayload(bare, lengths())).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a Map', new Map([['entry:a', [occ()]]])],
    ['a Date', new Date()],
    ['a string', 'entry:a'],
    ['a number', 7],
  ])('%s is not a valid payload', (_l, byId) => {
    expect(validateProviderPayload(byId, lengths())).toBe(false);
  });

  it('a key we never asked about is rejected — the reply is not about our document set', () => {
    expect(validateProviderPayload({ 'entry:ghost': [occ()] }, lengths())).toBe(false);
  });

  it('a present key with an EMPTY array is rejected (a real worker never writes empty keys)', () => {
    expect(validateProviderPayload({ 'entry:a': [] }, lengths())).toBe(false);
  });

  it('allowedLengthsByKey must be a real Map — a duck-typed object or a Set is refused', () => {
    const byId = { 'entry:a': [occ()] };
    expect(validateProviderPayload(byId, { 'entry:a': LEN })).toBe(false);
    expect(validateProviderPayload(byId, new Set(['entry:a']))).toBe(false);
    expect(validateProviderPayload(byId, undefined)).toBe(false);
    expect(validateProviderPayload(byId, { get: () => LEN, has: () => true })).toBe(false);
  });

  it('never throws', () => {
    expect(typeof validateProviderPayload(Symbol('x'), lengths())).toBe('boolean');
    expect(typeof validateProviderPayload({ 'entry:a': [null] }, lengths())).toBe('boolean');
  });
});
