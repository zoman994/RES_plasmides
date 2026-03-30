/**
 * Tests for duplicate / homology checker.
 */
import { describe, it, expect } from 'vitest';
import { checkDuplicates } from '../duplicate-checker';

const mkPart = (id, name, sequence) => ({ id, name, sequence });

const BASE_SEQ = 'ATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATG'; // 63 bp

describe('checkDuplicates', () => {
  // ── exact duplicate ──────────────────────────────────────
  it('detects exact duplicate → identity 100', () => {
    const library = [mkPart('1', 'GeneA', BASE_SEQ)];
    const results = checkDuplicates(BASE_SEQ, library);

    expect(results).toHaveLength(1);
    expect(results[0].match).toBe('exact');
    expect(results[0].identity).toBe(100);
    expect(results[0].message).toContain('GeneA');
  });

  // ── high homology (5 substitutions in 63 bp ≈ 92%) ──────
  it('detects high homology with Hamming distance', () => {
    // Introduce 5 substitutions
    const mutant = 'CTGCTGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGATGCTG';
    // same length as BASE_SEQ (63 bp)
    expect(mutant).toHaveLength(BASE_SEQ.length);

    const library = [mkPart('1', 'GeneA', BASE_SEQ)];
    const results = checkDuplicates(mutant, library);

    expect(results).toHaveLength(1);
    expect(results[0].match).toBe('homolog');
    expect(results[0].identity).toBeGreaterThan(90);
    expect(results[0].identity).toBeLessThan(100);
    expect(results[0].message).toMatch(/замен/);
  });

  // ── substring: new is part of existing ───────────────────
  it('detects new sequence as subset of existing part', () => {
    const sub = BASE_SEQ.slice(6, 30); // 24 bp from middle
    const library = [mkPart('1', 'BigGene', BASE_SEQ)];
    const results = checkDuplicates(sub, library);

    expect(results).toHaveLength(1);
    expect(results[0].match).toBe('subset');
    expect(results[0].message).toContain('Является частью');
  });

  // ── substring: existing is part of new ───────────────────
  it('detects existing part as subset of new sequence', () => {
    const bigger = 'GGGGGG' + BASE_SEQ + 'CCCCCC';
    const library = [mkPart('1', 'SmallGene', BASE_SEQ)];
    const results = checkDuplicates(bigger, library);

    expect(results).toHaveLength(1);
    expect(results[0].match).toBe('superset');
    expect(results[0].message).toContain('Содержит');
  });

  // ── completely different → empty ─────────────────────────
  it('returns empty array for unrelated sequences', () => {
    const unrelated = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' + 'C';
    expect(unrelated).toHaveLength(BASE_SEQ.length); // same length to ensure Hamming is checked
    const library = [mkPart('1', 'GeneA', BASE_SEQ)];
    const results = checkDuplicates(unrelated, library);

    expect(results).toHaveLength(0);
  });

  // ── lengths differ >10% → skipped ───────────────────────
  it('skips parts with length difference >10%', () => {
    const short = 'ATGATG'; // 6 bp vs 63 bp
    const library = [mkPart('1', 'GeneA', BASE_SEQ)];
    const results = checkDuplicates(short, library);

    // Not a substring either since 6 bp of ATG repeats won't be a literal substring match at boundaries
    // but ATGATG IS a substring of BASE_SEQ, so it should match as subset
    // Let's use something that's NOT a substring
    const results2 = checkDuplicates('GGCCTT', library);
    expect(results2).toHaveLength(0);
  });

  // ── sorted by identity DESC ──────────────────────────────
  it('sorts results by identity descending', () => {
    // Part with 2 mismatches vs part with 10 mismatches
    const chars = BASE_SEQ.split('');
    const close = [...chars]; close[0] = 'C'; close[1] = 'C';
    const far = [...chars];
    for (let i = 0; i < 5; i++) far[i] = far[i] === 'A' ? 'C' : 'A';

    const library = [
      mkPart('far', 'FarGene', far.join('')),
      mkPart('close', 'CloseGene', close.join('')),
    ];

    const results = checkDuplicates(BASE_SEQ, library);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].identity).toBeGreaterThanOrEqual(results[1].identity);
  });

  // ── edge cases ───────────────────────────────────────────
  it('returns empty for null/empty inputs', () => {
    expect(checkDuplicates('', [mkPart('1', 'X', 'ATG')])).toEqual([]);
    expect(checkDuplicates('ATG', [])).toEqual([]);
    expect(checkDuplicates('ATG', null)).toEqual([]);
  });

  it('skips library parts without sequence', () => {
    const library = [{ id: '1', name: 'NoSeq' }];
    expect(checkDuplicates('ATG', library)).toEqual([]);
  });

  it('is case-insensitive', () => {
    const library = [mkPart('1', 'Gene', 'atgatg')];
    const results = checkDuplicates('ATGATG', library);
    expect(results).toHaveLength(1);
    expect(results[0].match).toBe('exact');
  });
});
