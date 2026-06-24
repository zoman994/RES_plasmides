/**
 * annotate-introns.test.js — the annotator glue: regions shifted into parent
 * coordinates by `offset` (selected-fragment scope).
 */
import { describe, it, expect } from 'vitest';
import { buildIntronAnnotations } from '../annotate-introns';

const EXON1 = `ATG${'GCT'.repeat(6)}CAG`;
const INTRON = 'GTAAGTTGACCC' + 'TTTTTTTTTT' + 'CAG';
const EXON2 = `${'GCT'.repeat(6)}TAA`;
const GENE = EXON1 + INTRON + EXON2; // donor@24, acceptor@48

describe('buildIntronAnnotations', () => {
  it('returns intron + exon regions in parent coords (offset applied)', () => {
    const { regions, intronCount } = buildIntronAnnotations(GENE, { offset: 100 });
    expect(intronCount).toBe(1);
    const intron = regions.find((r) => r.type === 'intron');
    expect(intron).toMatchObject({ start: 124, end: 149, strand: 1 }); // 24/49 + 100
    expect(regions.filter((r) => r.type === 'exon').map((e) => [e.start, e.end]))
      .toEqual([[100, 124], [149, 170]]);
  });

  it('offset 0 leaves coordinates unchanged', () => {
    const { regions } = buildIntronAnnotations(GENE);
    expect(regions.find((r) => r.type === 'intron')).toMatchObject({ start: 24, end: 49 });
  });
});
