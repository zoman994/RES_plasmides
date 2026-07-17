/**
 * Audit close-out 29.05.2026 — write-path id closure (TD-IMPORTER-NO-ID,
 * ⚓ DEC-ANN-10). Every annotation a writer produces — region / detail /
 * point — must carry a string id; not deferred to the read-path net.
 */
import { describe, it, expect } from 'vitest';
import { importFeatures } from '../import-annotations';
import { autoAnnotate } from '../auto-annotate';
import { generateRegionId } from '../domain-detection';

const allHaveStringId = (anns) =>
  anns.every((a) => typeof a.id === 'string' && a.id.length > 0);

describe('write-path id factory (generateRegionId → makeId)', () => {
  it('returns non-empty, unique strings', () => {
    const a = generateRegionId();
    const b = generateRegionId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('importFeatures — every level gets an id', () => {
  it('region + detail + point all carry a string id', () => {
    const features = [
      { type: 'CDS', start: 0, end: 300, strand: 1, qualifiers: { label: 'gene' } },
      { type: 'sig_peptide', start: 0, end: 60, strand: 1, qualifiers: { label: 'sp' } },
      { type: 'primer_bind', start: 10, end: 30, strand: 1, qualifiers: { label: 'p1' } },
    ];
    const { annotations } = importFeatures(features, 300);
    expect(annotations.length).toBeGreaterThan(0);
    expect(allHaveStringId(annotations)).toBe(true);
    expect(annotations.some((a) => a.level === 'detail' && a.id)).toBe(true);
  });
});

describe('autoAnnotate — details and points get ids', () => {
  it('CDS start/stop codon points + RE sites all carry a string id', () => {
    const seq = 'ATG' + 'GAATTC' + 'AAACCCGGGTTT'.repeat(3) + 'TAA';
    const anns = autoAnnotate({ name: 'x', type: 'CDS', sequence: seq });
    expect(anns.length).toBeGreaterThan(1);
    expect(allHaveStringId(anns)).toBe(true);
    expect(anns.some((a) => a.level === 'point' && a.id)).toBe(true);
  });
});
