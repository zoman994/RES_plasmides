/**
 * Tests for CDS validation.
 */
import { describe, it, expect } from 'vitest';
import { validateCDS } from '../cds-validation';

// Normal CDS: ATG + codons + TAA stop
const NORMAL_CDS = 'ATGGCGAAAGCGTAA'; // M A K A * (15bp, divisible by 3)

describe('validateCDS', () => {
  it('normal CDS (ATG...TAA, no internal stops) → no warnings', () => {
    const warnings = validateCDS(NORMAL_CDS);
    expect(warnings).toHaveLength(0);
  });

  it('internal stop codons → error with positions', () => {
    // ATG TAA GCG AAA TAA → * at pos 2 (premature), * at pos 5 (terminal)
    const seq = 'ATGTAAGCGAAATAA';
    const warnings = validateCDS(seq);

    const premature = warnings.find(w => w.type === 'premature_stop');
    expect(premature).toBeDefined();
    expect(premature.level).toBe('error');
    expect(premature.details).toHaveLength(1); // one internal stop (pos 2)
    expect(premature.details[0]).toContain('Позиция 2');
    expect(premature.actions.some(a => a.action === 'detect_introns')).toBe(true);
  });

  it('no stop codon at end → warning with +TAA/+TGA/+TAG actions', () => {
    const seq = 'ATGGCGAAAGCG'; // no stop (12bp, %3=0)
    const warnings = validateCDS(seq);

    const noStop = warnings.find(w => w.type === 'no_stop');
    expect(noStop).toBeDefined();
    expect(noStop.level).toBe('warning');
    expect(noStop.actions).toHaveLength(3);
    expect(noStop.actions.map(a => a.label)).toEqual(['+TAA', '+TGA', '+TAG']);
  });

  it('no start ATG → warning with +ATG action', () => {
    const seq = 'GCGGCGAAATAA'; // starts with GCG, not ATG
    const warnings = validateCDS(seq);

    const noStart = warnings.find(w => w.type === 'no_start');
    expect(noStart).toBeDefined();
    expect(noStart.level).toBe('warning');
    expect(noStart.actions[0].action).toBe('add_start_ATG');
  });

  it('length not divisible by 3 → error', () => {
    const seq = 'ATGGCGAA'; // 8bp, 8%3=2
    const warnings = validateCDS(seq);

    const frameshift = warnings.find(w => w.type === 'frameshift');
    expect(frameshift).toBeDefined();
    expect(frameshift.level).toBe('error');
    expect(frameshift.hint).toContain('2 нт');
  });

  it('multiple problems at once', () => {
    // GCG TAA GCG AT → no start, internal stop, no terminal stop, frameshift (11bp)
    const seq = 'GCGTAAGCGAT';
    const warnings = validateCDS(seq);

    expect(warnings.some(w => w.type === 'no_start')).toBe(true);
    expect(warnings.some(w => w.type === 'frameshift')).toBe(true);
    // no_stop might also appear depending on last 3 chars
  });

  it('empty/null → empty array', () => {
    expect(validateCDS('')).toEqual([]);
    expect(validateCDS(null)).toEqual([]);
  });

  it('case insensitive', () => {
    const warnings = validateCDS('atggcgaaagcgtaa');
    expect(warnings).toHaveLength(0);
  });
});
