/**
 * piece-authoring.test.js — T5 K1. Pure builders for the 4 ways to
 * author a piece (selection / feature / existing-primers / new-primers).
 * Return PARTIAL piece data (id/color/timestamps added by CREATE_PIECE).
 */
import { describe, it, expect } from 'vitest';
import {
  buildPieceFromSelection, buildPieceFromFeature,
  buildPieceFromExistingPrimers, buildPieceFromNewPrimers, buildPieceFromPcrProduct,
} from '../lib/piece-authoring';
import { resolvePcrProduct } from '../../../lib/pcr-amplicon';
import { alignPrimerBinding } from '../../../lib/primer-binding-alignment';

const C = { id: 'c-1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTTACGTACGT' };

describe('T5 K1 buildPieceFromSelection', () => {
  it('builds a selection piece (range normalized, origin/method)', () => {
    const p = buildPieceFromSelection(C, 8, 4);
    expect(p.sourceIds).toEqual(['c-1']);
    expect(p.ranges).toEqual([{ sourceId: 'c-1', start: 4, end: 8, orientation: 'forward' }]);
    expect(p.origin).toBe('selection');
    expect(p.acquisitionMethod).toBe('undefined');
    expect(p.acquisitionParams).toEqual({});
  });
  it('honours explicit orientation', () => {
    expect(buildPieceFromSelection(C, 0, 4, 'reverse').ranges[0].orientation).toBe('reverse');
  });
});

describe('T5 K1 buildPieceFromFeature', () => {
  it('pre-fills name + functionalLabel + reverse on minus strand', () => {
    const p = buildPieceFromFeature(C, { name: 'AmpR', start: 10, end: 20, strand: -1, type: 'CDS' });
    expect(p.name).toBe('AmpR');
    expect(p.ranges[0]).toEqual({ sourceId: 'c-1', start: 10, end: 20, orientation: 'reverse' });
    expect(p.origin).toBe('feature');
    expect(p.functionalLabel).toBe('CDS');
  });
});

describe('T5 K1 buildPieceFromExistingPrimers', () => {
  it('finds amplicon by fwd indexOf + revRC downstream', () => {
    // fwd = AAAACCCC (0..8); rev binds revRC = ACGTACGT (end). rev primer
    // = reverseComplement(ACGTACGT) = ACGTACGT (palindromic here) → use a
    // real downstream site: revRC must appear after fwd.
    const p = buildPieceFromExistingPrimers(C, 'AAAACCCC', 'ACGTACGT');
    expect(p.origin).toBe('existing-primers');
    expect(p.acquisitionMethod).toBe('pcr');
    expect(p.ranges[0].start).toBe(0);
    expect(p.ranges[0].end).toBeGreaterThan(8);
    expect(p.acquisitionParams.primerPairId).toEqual({ forward: 'AAAACCCC', reverse: 'ACGTACGT' });
  });
  it('throws when forward primer not found', () => {
    expect(() => buildPieceFromExistingPrimers(C, 'ZZZZ', 'ACGTACGT')).toThrow(/Прямой/);
  });
  it('throws when reverse not found downstream of forward', () => {
    expect(() => buildPieceFromExistingPrimers(C, 'TTTTACGT', 'CCCC')).toThrow(/Обратный/);
  });
});

describe('T5 K1 buildPieceFromNewPrimers', () => {
  it('builds a new-primers piece from a written pair + selection range', () => {
    const p = buildPieceFromNewPrimers(
      C,
      { forward: { sequence: 'AAAACCCC' }, reverse: { sequence: 'ACGTACGT' } },
      { start: 0, end: 24 },
    );
    expect(p.origin).toBe('new-primers');
    expect(p.acquisitionMethod).toBe('pcr');
    expect(p.ranges[0]).toEqual({ sourceId: 'c-1', start: 0, end: 24, orientation: 'forward' });
    expect(p.acquisitionParams.primerPairId).toEqual({ forward: 'AAAACCCC', reverse: 'ACGTACGT' });
  });
});

describe('P5 — resolved PCR evidence is frozen into the authored piece', () => {
  it('deep-copies segments, verified alignment and binding model into both snapshots', () => {
    const anchor = 'ACGTGACCTAGCTTGA';
    const forwardBinding = 'ACGTACCTAGCTTGA'; // one internal D, then an 11-nt 3′ anchor
    const reverseTop = 'TTTTGGAATTCC';
    const reverseBinding = 'GGAATTCCAAAA';
    const template = `TT${anchor}${'C'.repeat(8)}${reverseTop}GG`;
    const forwardSegments = [{ start: 2, end: 18 }];
    const forwardAlignment = alignPrimerBinding(forwardBinding, anchor);
    const reverseAlignment = alignPrimerBinding(reverseBinding, reverseBinding);
    const resolved = resolvePcrProduct({
      template,
      topology: 'linear',
      occurrences: [{
        key: 'f#site', primerId: 'f', start: 2, end: 10, strand: 1,
        segments: forwardSegments, alignment: forwardAlignment,
      }, {
        key: 'r#site', primerId: 'r', start: 26, end: 38, strand: -1,
        segments: [{ start: 26, end: 38 }], alignment: reverseAlignment,
      }],
      primersById: {
        f: {
          id: 'f', name: 'fwd', sequence: forwardBinding,
          bindingSequence: forwardBinding, bindingModel: 'aligned-v1', tail: '',
        },
        r: {
          id: 'r', name: 'rev', sequence: reverseBinding,
          bindingSequence: reverseBinding, bindingModel: 'aligned-v1', tail: '',
        },
      },
    });
    expect(resolved.ok).toBe(true);

    const piece = buildPieceFromPcrProduct({ id: 'c-replay', sequence: template }, resolved);
    const snapshot = piece.acquisitionParams.primerSnapshots.forward;
    expect(snapshot).toMatchObject({
      bindingModel: 'aligned-v1',
      segments: [{ start: 2, end: 18 }],
      alignment: expect.objectContaining({ editDistance: 1 }),
    });
    expect(snapshot.segments).not.toBe(resolved.product.forward.segments);
    expect(snapshot.alignment).not.toBe(resolved.product.forward.alignment);
    expect(snapshot.alignment.runs).not.toBe(resolved.product.forward.alignment.runs);
    expect(piece.acquisitionParams.primerSnapshots.reverse).toMatchObject({
      bindingModel: 'aligned-v1',
      segments: [{ start: 26, end: 38 }],
      alignment: expect.objectContaining({ editDistance: 0 }),
    });

    resolved.product.forward.segments[0].start = 99;
    resolved.product.forward.alignment.runs[0].op = 'X';
    expect(snapshot.segments).toEqual([{ start: 2, end: 18 }]);
    expect(snapshot.alignment.runs[0].op).toBe('M');
  });
});
