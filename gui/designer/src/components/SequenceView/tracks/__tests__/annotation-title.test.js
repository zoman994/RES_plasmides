import { describe, it, expect } from 'vitest';
import { buildAnnotationTitle } from '../annotation-title';

describe('buildAnnotationTitle (feature hover <title> in the sequence track)', () => {
  it('composes name · type · 1-based span · strand · identity% · description', () => {
    const t = buildAnnotationTitle({
      name: 'glaA', type: 'CDS', start: 0, end: 1499, strand: 1,
      identity: 0.92, description: 'glucoamylase',
    });
    expect(t).toContain('glaA');
    expect(t).toContain('CDS');
    expect(t).toContain('1..1499'); // 0-based [0,1499) → 1-based 1..1499
    expect(t).toContain('1499 bp');
    expect(t).toContain('+');
    expect(t).toContain('92%');
    expect(t).toContain('glucoamylase');
  });

  it('marks the reverse strand with −', () => {
    expect(buildAnnotationTitle({ name: 'x', type: 'CDS', start: 10, end: 20, strand: -1 })).toContain('−');
  });

  it('omits identity when absent or out of the 0..1 range', () => {
    expect(buildAnnotationTitle({ name: 'x', start: 0, end: 9 })).not.toMatch(/%/);
    expect(buildAnnotationTitle({ name: 'x', start: 0, end: 9, identity: 0 })).not.toMatch(/%/);
    expect(buildAnnotationTitle({ name: 'x', start: 0, end: 9, identity: 95 })).not.toMatch(/%/); // not a fraction
  });

  it('strips HTML from a SnapGene-style description', () => {
    const t = buildAnnotationTitle({
      name: 'AmpR', type: 'CDS', start: 0, end: 861, strand: 1,
      description: '<html><body>ampicillin resistance</body></html>',
    });
    expect(t).toContain('ampicillin resistance');
    expect(t).not.toContain('<');
  });

  it('falls back to qualifiers.note / .product when no description', () => {
    expect(buildAnnotationTitle({ name: 'g', start: 0, end: 9, qualifiers: { product: 'beta-lactamase' } }))
      .toContain('beta-lactamase');
  });

  it('uses type as name when name is missing, and never duplicates type', () => {
    const t = buildAnnotationTitle({ type: 'promoter', start: 0, end: 9 });
    expect(t.startsWith('promoter')).toBe(true);
    expect(t.match(/promoter/g)).toHaveLength(1); // not «promoter · promoter»
  });

  it('returns empty string for a nullish region', () => {
    expect(buildAnnotationTitle(null)).toBe('');
    expect(buildAnnotationTitle(undefined)).toBe('');
  });
});
