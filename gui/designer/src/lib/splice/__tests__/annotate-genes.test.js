/**
 * annotate-genes.test.js — buildGeneAnnotations emits a translatable gene
 * region so the auto path (🧠 Нейросеть) actually renders the mature spliced
 * protein, not just bare intron/exon ranges (Phase C).
 */
import { describe, it, expect } from 'vitest';
import { buildGeneAnnotations } from '../annotate-genes';
import { scoreSpliceSitesCNN } from '../cnn-scorer';
import { CBH1 } from './fixtures/genes.js';
import { getIntronsForRegion, spliceRegion } from '../../../intron-utils';
import { translateDNA } from '../../../codons';

const opts = { scorer: scoreSpliceSitesCNN, organism: 'fungi' };

describe('buildGeneAnnotations — translatable gene + spliced protein', () => {
  it('emits a translatable gene region spanning the CDS, introns inside it', () => {
    const res = buildGeneAnnotations(CBH1, opts);
    const gene = res.regions.find((r) => r.type === 'gene');
    expect(gene).toBeDefined();
    expect(gene.level).toBe('region');
    expect(gene.strand).toBe(1);
    expect(gene.start).toBe(0);
    expect(gene.end).toBeGreaterThan(1289);
    // the AA track resolves the gene's introns (now detail children, linked by regionId)
    expect(getIntronsForRegion(res.regions, gene)).toHaveLength(2);
  });

  it('emits introns as detail children linked to the gene (3-level model), no exon regions', () => {
    const res = buildGeneAnnotations(CBH1, opts);
    const gene = res.regions.find((r) => r.type === 'gene');
    const introns = res.regions.filter((r) => r.type === 'intron');
    expect(introns).toHaveLength(2);
    expect(res.intronCount).toBe(2);
    expect(introns.every((i) => i.level === 'detail' && i.regionId === gene.id)).toBe(true);
    // exons are implicit (gene − introns) → no separate exon regions
    expect(res.regions.some((r) => r.type === 'exon')).toBe(false);
  });

  it('applies the offset to the gene region', () => {
    const res = buildGeneAnnotations(CBH1, { ...opts, offset: 500 });
    const gene = res.regions.find((r) => r.type === 'gene');
    expect(gene.start).toBe(500);
  });

  it('the mature spliced CDS is stop-free except the terminal stop', () => {
    const res = buildGeneAnnotations(CBH1, opts);
    const gene = res.regions.find((r) => r.type === 'gene');
    const introns = res.regions.filter((r) => r.type === 'intron');
    const { spliced } = spliceRegion(CBH1, gene, introns);
    const protein = translateDNA(spliced);
    const internalStops = protein.slice(0, -1).split('').filter((c) => c === '*').length;
    expect(internalStops).toBe(0);
    expect(protein[0]).toBe('M');
  });
});
