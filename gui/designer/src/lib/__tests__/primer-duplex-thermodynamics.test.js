import { describe, expect, it } from 'vitest';

import { calcTm } from '../../tm-calculator';
import { alignPrimerBinding } from '../primer-binding-alignment';
import {
  P6A_TM_CONDITIONS,
  evaluatePrimerDuplexThermodynamics,
} from '../primer-duplex-thermodynamics';

function evaluate(query, target = query) {
  return evaluatePrimerDuplexThermodynamics({
    alignment: alignPrimerBinding(query, target),
  });
}

describe('P6a structured primer duplex thermodynamics', () => {
  it('reports reproducible full-duplex and diagnostic 3\' anchor Tm for exact A/C/G/T', () => {
    const sequence = 'AGGCCCTTTCGTCTCGCACGTTTCG';
    const result = evaluate(sequence);

    expect(result.conditions).toEqual(P6A_TM_CONDITIONS);
    expect(result.fullDuplex).toEqual({
      status: 'calculated',
      tmC: calcTm(sequence),
      model: 'santalucia-1998-perfect-duplex',
      reason: null,
    });
    expect(result.threePrimeAnchor).toEqual({
      status: 'calculated',
      length: sequence.length,
      tmC: calcTm(sequence),
      model: 'santalucia-1998-perfect-duplex',
      diagnostic: true,
      reason: null,
    });
    expect(result.pcr).toEqual({ status: 'suitable', reasons: [] });
  });

  it('keeps a short exact duplex numeric but refuses its short 3\' anchor for standard PCR', () => {
    const result = evaluate('ATGC');

    expect(result.fullDuplex.status).toBe('calculated');
    expect(result.fullDuplex.tmC).toBe(calcTm('ATGC'));
    expect(result.threePrimeAnchor).toMatchObject({
      status: 'calculated', length: 4, tmC: calcTm('ATGC'), diagnostic: true,
    });
    expect(result.pcr).toEqual({
      status: 'refused',
      reasons: ['low-full-duplex-tm', 'short-three-prime-anchor'],
    });
  });

  it('keeps a low exact 10-mer as a thermal warning after it clears the P7 anchor gate', () => {
    const sequence = 'CTATAGTGAG';
    const result = evaluate(sequence);

    expect(result.fullDuplex).toMatchObject({
      status: 'calculated', tmC: calcTm(sequence), reason: null,
    });
    expect(result.fullDuplex.tmC).toBeLessThan(50);
    expect(result.threePrimeAnchor).toMatchObject({
      status: 'calculated', length: 10, tmC: calcTm(sequence), diagnostic: true,
    });
    expect(result.pcr).toEqual({
      status: 'warning',
      reasons: ['low-full-duplex-tm'],
    });
  });

  it('withholds full-duplex scalar Tm for an internal mismatch but keeps the exact 3\' anchor diagnostic', () => {
    const result = evaluate('ACGTTCGTACGT', 'ACGTACGTACGT');

    expect(result.fullDuplex).toMatchObject({
      status: 'not-calculated', tmC: null, reason: 'imperfect-duplex',
    });
    expect(result.threePrimeAnchor).toMatchObject({
      status: 'calculated', length: 7, tmC: calcTm('CGTACGT'), diagnostic: true,
    });
    expect(result.pcr).toEqual({
      status: 'refused',
      reasons: ['imperfect-duplex', 'short-three-prime-anchor'],
    });
  });

  it('refuses standard PCR for a terminal 3\' mismatch without blocking oligo thermodynamic inspection', () => {
    const result = evaluate('ACGTACGA', 'ACGTACGT');

    expect(result.fullDuplex).toMatchObject({
      status: 'not-calculated', tmC: null, reason: 'imperfect-duplex',
    });
    expect(result.threePrimeAnchor).toMatchObject({
      status: 'not-calculated', length: 0, tmC: null, diagnostic: true,
    });
    expect(result.pcr).toEqual({
      status: 'refused',
      reasons: ['no-three-prime-anchor'],
    });
  });

  it.each([
    ['insertion', 'ACGTAACGT', 'ACGTACGT', 'I'],
    ['deletion', 'ACGTACGT', 'ACGTAACGT', 'D'],
  ])('does not invent a scalar Tm for an internal %s', (_label, query, target, op) => {
    const alignment = alignPrimerBinding(query, target);
    expect(alignment.counts[op]).toBeGreaterThan(0);

    const result = evaluatePrimerDuplexThermodynamics({ alignment });
    expect(result.fullDuplex).toMatchObject({
      status: 'not-calculated', tmC: null, reason: 'imperfect-duplex',
    });
    expect(result.pcr.status).toBe('refused');
  });

  it('withholds the full-duplex scalar and measures the exact suffix after an IUPAC X', () => {
    const result = evaluate('ACGTNCGT', 'ACGTNCGT');

    expect(result.fullDuplex).toMatchObject({
      status: 'not-calculated', tmC: null, reason: 'noncanonical-base',
    });
    expect(result.threePrimeAnchor).toMatchObject({
      status: 'calculated', length: 3, reason: null,
    });
    expect(result.pcr).toEqual({
      status: 'refused',
      reasons: ['noncanonical-base', 'short-three-prime-anchor'],
    });
  });

  it('breaks a claimed physical 3-prime anchor at an IUPAC X', () => {
    const result = evaluate('ACGTNACGTACGTA');

    expect(result.threePrimeAnchor).toMatchObject({
      status: 'calculated', length: 9, reason: null,
    });
    expect(result.pcr).toEqual({
      status: 'refused',
      reasons: ['noncanonical-base', 'short-three-prime-anchor'],
    });
  });

  it.each([
    [9, 'refused', ['low-full-duplex-tm', 'short-three-prime-anchor']],
    [10, 'warning', ['low-full-duplex-tm']],
  ])('uses the same 9/10 boundary for an exact %i-nt 3-prime anchor', (length, status, reasons) => {
    const sequence = 'ACGTACGTAA'.slice(0, length);
    const result = evaluate(sequence);

    expect(result.threePrimeAnchor.length).toBe(length);
    expect(result.pcr).toEqual({ status, reasons });
  });

  it('fails closed without alignment evidence and never reuses a saved scalar', () => {
    const result = evaluatePrimerDuplexThermodynamics({
      alignment: null,
      savedTm: 63.2,
    });

    expect(result.fullDuplex).toMatchObject({
      status: 'not-calculated', tmC: null, reason: 'alignment-required',
    });
    expect(result.threePrimeAnchor).toMatchObject({
      status: 'not-calculated', length: 0, tmC: null,
    });
    expect(result.pcr).toEqual({
      status: 'refused',
      reasons: ['alignment-required', 'no-three-prime-anchor'],
    });
  });
});
