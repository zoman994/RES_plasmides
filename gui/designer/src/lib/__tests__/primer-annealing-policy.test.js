import { describe, expect, it } from 'vitest';

import { alignPrimerBinding } from '../primer-binding-alignment';
import {
  MIN_STANDARD_PCR_THREE_PRIME_MATCH,
  evaluateStandardPcrAnnealing,
} from '../primer-annealing-policy';

describe('P7 canonical standard-PCR annealing policy', () => {
  it('keeps alignment truth but refuses an exact 9-nt physical 3-prime anchor', () => {
    const alignment = alignPrimerBinding('ACGTACGTA', 'ACGTACGTA');

    expect(alignment.runs).toEqual([expect.objectContaining({ op: 'M' })]);
    expect(evaluateStandardPcrAnnealing(alignment)).toEqual({
      status: 'non-annealing',
      reason: 'short-three-prime-anchor',
      threePrimeMatchLength: 9,
      minimumMatchLength: 10,
    });
  });

  it('accepts 10 consecutive canonical M operations at the physical 3-prime end', () => {
    const alignment = alignPrimerBinding('ACGTACGTAA', 'ACGTACGTAA');

    expect(MIN_STANDARD_PCR_THREE_PRIME_MATCH).toBe(10);
    expect(evaluateStandardPcrAnnealing(alignment)).toEqual({
      status: 'annealing',
      reason: null,
      threePrimeMatchLength: 10,
      minimumMatchLength: 10,
    });
  });

  it('distinguishes no physical 3-prime pairing from a short exact anchor', () => {
    const alignment = alignPrimerBinding('ACGTACGTT', 'ACGTACGTA');

    expect(evaluateStandardPcrAnnealing(alignment)).toMatchObject({
      status: 'non-annealing', reason: 'no-three-prime-anchor', threePrimeMatchLength: 0,
    });
  });

  it('treats a noncanonical base as X and measures only the exact 3-prime suffix', () => {
    const alignment = alignPrimerBinding('ACGTNACGTACGTA', 'ACGTNACGTACGTA');

    expect(evaluateStandardPcrAnnealing(alignment)).toMatchObject({
      status: 'non-annealing',
      reason: 'short-three-prime-anchor',
      threePrimeMatchLength: 9,
    });
  });

  it('allows noncanonical sequence outside a canonical 10-nt physical 3-prime suffix', () => {
    const alignment = alignPrimerBinding('NACGTACGTAA', 'NACGTACGTAA');

    expect(evaluateStandardPcrAnnealing(alignment)).toMatchObject({
      status: 'annealing', reason: null, threePrimeMatchLength: 10,
    });
  });

  it('fails closed when a claimed anchor has no usable query evidence', () => {
    expect(evaluateStandardPcrAnnealing({ threePrimeMatchLength: 12 })).toMatchObject({
      status: 'non-annealing', reason: 'invalid-three-prime-anchor-evidence',
    });
  });
});
