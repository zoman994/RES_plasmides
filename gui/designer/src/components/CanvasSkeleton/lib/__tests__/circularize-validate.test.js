/**
 * circularize-validate.test.js — M-CIRCULARIZE C4. Pure live biovalidation of a
 * chosen closure method against the actual fragment sequences: Golden Gate
 * internal-site scan (real go/no-go), Gibson/overlap distinguishability + length,
 * KLD single-fragment, blunt self-ligation warning. Surfaced as ✓/⚠/info in the
 * CircularizeModal so the biologist sees feasibility before realising.
 */
import { describe, it, expect } from 'vitest';
import { validateClosure } from '../circularize-validate';

const seg = (sequence, label) => ({ id: label, label, sequence });

describe('validateClosure', () => {
  it('linear → info (no closure reaction)', () => {
    expect(validateClosure({ method: 'gibson', circular: false, segments: [seg('AAAA', 'a')] }).level).toBe('info');
  });

  it('Golden Gate with NO internal BsaI site → ok', () => {
    const r = validateClosure({
      method: 'golden_gate', circular: true,
      segments: [seg('AAAACCCCTTTTGGGGAAAA', 'a'), seg('TTTTAAAACCCCGGGGTTTT', 'b')],
    });
    expect(r.level).toBe('ok');
  });

  it('Golden Gate WITH an internal BsaI site (GGTCTC) → warn + names the enzyme', () => {
    const r = validateClosure({
      method: 'golden_gate', circular: true,
      segments: [seg('AAAGGTCTCAAAATTTT', 'a'), seg('TTTTAAAACCCC', 'b')],
    });
    expect(r.level).toBe('warn');
    expect(r.message).toMatch(/BsaI/);
  });

  it('Gibson with identical last & first fragments → warn (indistinguishable)', () => {
    const dup = 'AAAACCCCGGGGTTTTAAAACCCC';
    const r = validateClosure({ method: 'gibson', circular: true, segments: [seg(dup, 'a'), seg(dup, 'b')] });
    expect(r.level).toBe('warn');
  });

  it('Gibson with distinct, long-enough fragments → ok', () => {
    const r = validateClosure({
      method: 'gibson', circular: true,
      segments: [seg('AAAACCCCGGGGTTTTAAAA', 'a'), seg('TTTTGGGGCCCCAAAATTTT', 'b')],
    });
    expect(r.level).toBe('ok');
  });

  it('Gibson with a too-short fragment (<20 bp) → warn', () => {
    const r = validateClosure({
      method: 'gibson', circular: true,
      segments: [seg('AAAACCCCGGGGTTTTAAAA', 'a'), seg('TTTT', 'b')],
    });
    expect(r.level).toBe('warn');
  });

  it('KLD on a single fragment → ok; on multiple → warn', () => {
    expect(validateClosure({ method: 'kld', circular: true, segments: [seg('AAAACCCC', 'a')] }).level).toBe('ok');
    expect(validateClosure({ method: 'kld', circular: true, segments: [seg('AAAA', 'a'), seg('CCCC', 'b')] }).level).toBe('warn');
  });

  it('blunt ligation → warn (self-ligation risk)', () => {
    expect(validateClosure({ method: 'direct_ligation', circular: true, segments: [seg('AAAA', 'a'), seg('CCCC', 'b')] }).level).toBe('warn');
  });

  it('RE-ligation → info', () => {
    expect(validateClosure({ method: 'restriction', circular: true, segments: [seg('AAAA', 'a'), seg('CCCC', 'b')] }).level).toBe('info');
  });
});
