/**
 * Tests for TYPE_MAP rework (Stage 1.2).
 *
 * Covers: new region types (mRNA, tRNA, rRNA, ncRNA, misc_RNA, oriT, repeat_region,
 * mobile_element, D-loop), corrected detail mappings (mat_peptide, transit_peptide,
 * domain, region, motif), gene-classification by qualifiers, expanded gene-filter
 * for RNA children, revcolor support, strand on details/points, exon-bearing types.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { importFeatures, normalizeType, normalizeDetailType } from '../import-annotations';
import { resetRegionCounter } from '../domain-detection';

beforeEach(() => resetRegionCounter());

const feat = (type, start, end, qualifiers = {}, strand = 1) =>
  ({ type, start, end, strand, qualifiers });

// ═══ Group A: region types ═══

describe('TYPE_MAP — region types', () => {
  it('gene with CDS inside → only CDS kept (gene filtered)', () => {
    const features = [
      feat('gene', 0, 3000, { gene: 'lacZ' }),
      feat('CDS', 0, 3000, { label: 'LacZ' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].type).toBe('CDS');
  });

  it('gene with tRNA child → only tRNA kept (RNA-child filter)', () => {
    const features = [
      feat('gene', 100, 200, { gene: 'alaT' }),
      feat('tRNA', 100, 200, { product: 'tRNA-Ala' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].type).toBe('tRNA');
  });

  it('gene without children, no RNA qualifiers → region type="gene"', () => {
    const features = [
      feat('gene', 0, 1500, { gene: 'orfX' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].level).toBe('region');
    expect(annotations[0].type).toBe('gene');
    expect(annotations[0].name).toBe('orfX');
  });

  it('gene with /ncRNA_class → region type="ncRNA"', () => {
    const features = [
      feat('gene', 0, 100, { ncRNA_class: 'miRNA', gene: 'mir-21' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations[0].type).toBe('ncRNA');
    expect(annotations[0].name).toBe('mir-21');
  });

  it('gene with /product="tRNA-Ala" → region type="tRNA"', () => {
    const features = [
      feat('gene', 0, 76, { product: 'tRNA-Ala', gene: 'alaT' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations[0].type).toBe('tRNA');
  });

  it('gene with /product="16S ribosomal RNA" → region type="rRNA"', () => {
    const features = [
      feat('gene', 0, 1500, { product: '16S ribosomal RNA', gene: 'rrsA' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations[0].type).toBe('rRNA');
  });

  it('mRNA + oriT + repeat_region → three regions with correct types', () => {
    const features = [
      feat('mRNA', 0, 1000, { label: 'transcript1' }),
      feat('oriT', 2000, 2200, { label: 'conjugation' }),
      feat('repeat_region', 3000, 3100, { label: 'IR' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const regions = annotations.filter(a => a.level === 'region');
    expect(regions).toHaveLength(3);
    expect(regions.map(r => r.type).sort()).toEqual(['mRNA', 'oriT', 'repeat_region']);
  });
});

// ═══ Group B: detail types ═══

describe('DETAIL_TYPE_MAP — corrected mappings', () => {
  it('mat_peptide inside CDS → detail type="mat_peptide" (not catalytic)', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('mat_peptide', 100, 2900, { label: 'Mature' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('mat_peptide');
  });

  it('transit_peptide → detail type="transit_peptide" (not signal_peptide)', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('transit_peptide', 0, 80, { label: 'Chloroplast TP' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('transit_peptide');
  });

  it('domain → detail type="domain" (not catalytic)', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('domain', 500, 1500, { label: 'Kinase domain' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('domain');
  });

  it('motif → detail type="motif" (not binding)', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('motif', 100, 120, { label: 'NLS motif' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('motif');
  });

  it('active_site → detail type="active_site" (regression)', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('active_site', 150, 153, { label: 'Active' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('active_site');
  });
});

// ═══ Group C: new detail types ═══

describe('DETAIL_TYPE_MAP — new types', () => {
  it('CAAT_signal inside promoter → detail type="core_promoter"', () => {
    const features = [
      feat('promoter', 0, 200, { label: 'P' }),
      feat('CAAT_signal', 80, 86, { label: 'CAAT' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('core_promoter');
  });

  it('polyA_site → detail type="poly_a"', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('polyA_site', 2990, 3000, { label: 'pA' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('poly_a');
  });

  it('unsure → detail type="unsure"', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }),
      feat('unsure', 1000, 1005, { label: 'ambiguous' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.type).toBe('unsure');
  });
});

// ═══ Group D: color + strand ═══

describe('color + strand handling', () => {
  it('reverse-strand feature with /ApEinfo_revcolor → color from revcolor', () => {
    const features = [
      feat('CDS', 0, 3000,
        { label: 'Gene', ApEinfo_fwdcolor: '#FF0000', ApEinfo_revcolor: '#00FF00' },
        -1),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations[0].color).toBe('#00FF00');
  });

  it('forward-strand feature with both colors → color from fwdcolor', () => {
    const features = [
      feat('CDS', 0, 3000,
        { label: 'Gene', ApEinfo_fwdcolor: '#FF0000', ApEinfo_revcolor: '#00FF00' },
        1),
    ];
    const { annotations } = importFeatures(features, 5000);
    expect(annotations[0].color).toBe('#FF0000');
  });

  it('detail-level annotation has strand field', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Main' }, 1),
      feat('mat_peptide', 100, 2900, { label: 'Mature' }, -1),
    ];
    const { annotations } = importFeatures(features, 5000);
    const detail = annotations.find(a => a.level === 'detail');
    expect(detail.strand).toBe(-1);
  });
});

// ═══ Group E: exons + round-trip ═══

describe('EXON_BEARING_TYPES + round-trip', () => {
  it('mRNA with exons → region + intron details in gaps', () => {
    const features = [
      feat('mRNA', 0, 1000, {
        label: 'transcript',
        exons: [
          { start: 0, end: 300 },
          { start: 500, end: 800 },
          { start: 900, end: 1000 },
        ],
      }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const regions = annotations.filter(a => a.level === 'region');
    const details = annotations.filter(a => a.level === 'detail');
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('mRNA');
    expect(details).toHaveLength(2);
    expect(details.every(d => d.type === 'intron')).toBe(true);
    expect(details[0].start).toBe(300);
    expect(details[0].end).toBe(500);
    expect(details[1].start).toBe(800);
    expect(details[1].end).toBe(900);
  });

  it('promoter + TATA + CAAT + -35 + -10 → 1 region + 4 details, all share regionId', () => {
    const features = [
      feat('promoter', 0, 200, { label: 'P' }),
      feat('TATA_signal', 150, 156, { label: 'TATA' }),
      feat('CAAT_signal', 80, 86, { label: 'CAAT' }),
      feat('-35_signal', 20, 26, { label: '-35' }),
      feat('-10_signal', 50, 56, { label: '-10' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const regions = annotations.filter(a => a.level === 'region');
    const details = annotations.filter(a => a.level === 'detail');
    expect(regions).toHaveLength(1);
    expect(details).toHaveLength(4);
    expect(details.every(d => d.regionId === regions[0].id)).toBe(true);
    expect(details.every(d => d.type === 'core_promoter')).toBe(true);
  });
});
