/**
 * junction-interlock-nonpalindrome — V170 / F1 (audit assembly-logic-audit
 * wf_cf2017e5-072, end-compat finding, 28.06). junctionInterlock used plain
 * string-equality of the overhang seq as a complementarity proxy — VALID only
 * for PALINDROMIC overhangs (the classical RE set: AATT==RC(AATT)). For the ~6
 * non-palindromic commercial cutters (BauI 5′ ACGA, BseYI 5′ CCAG, …) two
 * fragments storing the SAME 5′ ACGA were reported 'compatible' though identical
 * non-palindromic 5′ overhangs do NOT anneal. The model stores ONE overhang per
 * enzyme (palindromic assumption), so it genuinely cannot decide a non-palindromic
 * pair → the honest verdict is 'unknown' (manual check), mirroring the degenerate
 * (IUPAC) handling — never a silent false 'compatible'.
 */
import { describe, it, expect } from 'vitest';
import { junctionInterlock } from '../segment-overhangs.js';

const end = (type, seq, delta) => ({ type, seq, delta, label: `${type} ${seq}` });
const v = (a, b) => junctionInterlock(a, b).verdict;

describe('junctionInterlock — non-palindromic overhang safety (V170/F1)', () => {
  it('identical PALINDROMIC 5′ overhang still mates (regression guard)', () => {
    expect(v(end('5prime', 'AATT', 4), end('5prime', 'AATT', 4))).toBe('compatible'); // EcoRI
  });
  it('identical PALINDROMIC 3′ overhang still mates', () => {
    expect(v(end('3prime', 'TGCA', -4), end('3prime', 'TGCA', -4))).toBe('compatible'); // PstI
  });
  it('identical NON-palindromic 5′ overhang → unknown (cannot silently mate)', () => {
    // BauI-like 5′ ACGA — RC is TCGT, so two identical 5′ ACGA do NOT anneal.
    expect(v(end('5prime', 'ACGA', 4), end('5prime', 'ACGA', 4))).toBe('unknown');
  });
  it('non-palindromic on ONE side → unknown', () => {
    expect(v(end('5prime', 'ACGA', 4), end('5prime', 'AATT', 4))).toBe('unknown');
  });
  it('RC-complementary non-palindromic pair → still unknown (model stores one overhang/enzyme)', () => {
    // ACGA and its RC TCGT would anneal biologically, but the stored model cannot
    // confirm which half each end carries → safe = unknown, never a guess.
    expect(v(end('5prime', 'ACGA', 4), end('5prime', 'TCGT', 4))).toBe('unknown');
  });
  it('polarity mismatch is still decidable → incompatible (not masked by palindrome check)', () => {
    expect(v(end('5prime', 'ACGA', 4), end('3prime', 'ACGA', -4))).toBe('incompatible');
  });
  it('blunt + blunt still mates (palindrome check never reached)', () => {
    expect(v(end('blunt', '', 0), end('blunt', '', 0))).toBe('blunt');
  });
});
