/**
 * Tests for import-annotations: SnapGene/GenBank feature → region/detail/point model.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { importFeatures, normalizeType, normalizeDetailType } from '../import-annotations';
import { resetRegionCounter } from '../domain-detection';

beforeEach(() => resetRegionCounter());

// Helper: create a feature object
const feat = (type, start, end, qualifiers = {}, strand = 1) =>
  ({ type, start, end, strand, qualifiers });

describe('importFeatures', () => {
  it('CDS + sig_peptide → region + detail with correct regionId', () => {
    const features = [
      feat('CDS', 0, 3921, { label: 'AsCpf1' }),
      feat('sig_peptide', 0, 72, { label: 'Signal peptide' }),
    ];
    const { annotations } = importFeatures(features, 5000);

    const regions = annotations.filter(a => a.level === 'region');
    const details = annotations.filter(a => a.level === 'detail');

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toBe('AsCpf1');
    expect(regions[0].type).toBe('CDS');

    expect(details).toHaveLength(1);
    expect(details[0].name).toBe('Signal peptide');
    expect(details[0].type).toBe('signal_peptide');
    expect(details[0].regionId).toBe(regions[0].id);
  });

  it('promoter + TATA_signal → region + core_promoter detail', () => {
    const features = [
      feat('promoter', 0, 850, { label: 'PglaA' }),
      feat('TATA_signal', 815, 822, { label: 'TATA box' }),
    ];
    const { annotations } = importFeatures(features, 5000);

    const regions = annotations.filter(a => a.level === 'region');
    const details = annotations.filter(a => a.level === 'detail');

    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('promoter');

    expect(details).toHaveLength(1);
    expect(details[0].type).toBe('core_promoter');
    expect(details[0].regionId).toBe(regions[0].id);
  });

  it('small unknown type (500/5000bp) → detail', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'MainGene' }),
      feat('misc_RNA', 100, 600, { label: 'small_rna' }),
    ];
    const { annotations } = importFeatures(features, 5000);

    const rna = annotations.find(a => a.name === 'small_rna');
    expect(rna.level).toBe('detail');
  });

  it('large unknown type (2000/5000bp) not inside region → region', () => {
    const features = [
      feat('weird_feature', 0, 2000, { label: 'BigThing' }),
    ];
    const { annotations } = importFeatures(features, 5000);

    const big = annotations.find(a => a.name === 'BigThing');
    expect(big.level).toBe('region');
    expect(big.type).toBe('misc_feature');
    expect(big.id).toBeTruthy();
  });

  it('APE color preserved from /ApEinfo_fwdcolor', () => {
    const features = [
      feat('CDS', 0, 3000, { label: 'Gene', ApEinfo_fwdcolor: '#FF0000' }),
    ];
    const { annotations } = importFeatures(features, 5000, 'ape');

    expect(annotations[0].color).toBe('#FF0000');
  });

  it('primer_bind → extracted to primers array AND annotations as point', () => {
    const features = [
      feat('primer_bind', 100, 120, { label: 'Fwd_primer', primer_seq: 'ATGATGATGATG' }),
    ];
    const { annotations, primers } = importFeatures(features, 5000);

    // In annotations as point
    const point = annotations.find(a => a.level === 'point');
    expect(point).toBeDefined();
    expect(point.name).toBe('Fwd_primer');

    // In primers array
    expect(primers).toHaveLength(1);
    expect(primers[0].name).toBe('Fwd_primer');
    expect(primers[0].sequence).toBe('ATGATGATGATG');
    expect(primers[0].start).toBe(100);
  });

  it('source and gene (with CDS inside) → both skipped', () => {
    const features = [
      feat('source', 0, 5000, { organism: 'E. coli' }),
      feat('gene', 0, 3921, { gene: 'cpf1' }),
      feat('CDS', 0, 3921, { label: 'AsCpf1' }),
    ];
    const { annotations } = importFeatures(features, 5000);

    // Only CDS should be present — source and gene skipped
    expect(annotations).toHaveLength(1);
    expect(annotations[0].type).toBe('CDS');
    expect(annotations[0].name).toBe('AsCpf1');
  });

  it('gene WITHOUT overlapping CDS → kept as detail (unknown heuristic)', () => {
    const features = [
      feat('gene', 0, 1500, { gene: 'lacZ' }),
      // No CDS inside this gene — gene is NOT skipped
      // 1500/5000 = 30% > 10% → becomes region via heuristic
    ];
    const { annotations } = importFeatures(features, 5000);

    expect(annotations).toHaveLength(1);
    expect(annotations[0].level).toBe('region');
    expect(annotations[0].type).toBe('misc_feature');
  });

  it('nested CDS with mat_peptide + sig_peptide → region + 2 details', () => {
    const features = [
      feat('CDS', 0, 3921, { label: 'AsCpf1', product: 'Cpf1 nuclease' }),
      feat('sig_peptide', 0, 72, { label: 'Signal' }),
      feat('mat_peptide', 73, 3921, { label: 'Mature protein' }),
    ];
    const { annotations } = importFeatures(features, 5000);

    const regions = annotations.filter(a => a.level === 'region');
    const details = annotations.filter(a => a.level === 'detail');

    expect(regions).toHaveLength(1);
    expect(regions[0].name).toBe('AsCpf1');

    expect(details).toHaveLength(2);
    expect(details.every(d => d.regionId === regions[0].id)).toBe(true);

    const signal = details.find(d => d.type === 'signal_peptide');
    const mature = details.find(d => d.type === 'catalytic');
    expect(signal).toBeDefined();
    expect(mature).toBeDefined();
  });

  it('multiple regions preserved with correct types', () => {
    const features = [
      feat('promoter', 0, 850, { label: 'PglaA' }),
      feat('CDS', 851, 4771, { label: 'AsCpf1' }),
      feat('terminator', 4772, 5512, { label: 'TtrpC' }),
    ];
    const { annotations } = importFeatures(features, 5512);

    const regions = annotations.filter(a => a.level === 'region');
    expect(regions).toHaveLength(3);
    expect(regions.map(r => r.type)).toEqual(
      expect.arrayContaining(['promoter', 'CDS', 'terminator'])
    );
  });

  it('extractName uses feat.name from backend', () => {
    const features = [{ name: 'HygR', type: 'CDS', start: 0, end: 100, strand: 1 }];
    const { annotations } = importFeatures(features, 100);
    expect(annotations[0].name).toBe('HygR');
  });

  it('returns empty for null/empty input', () => {
    expect(importFeatures(null, 0)).toEqual({ annotations: [], primers: [] });
    expect(importFeatures([], 0)).toEqual({ annotations: [], primers: [] });
  });
});

describe('normalizeType', () => {
  it('maps known types correctly', () => {
    expect(normalizeType('CDS')).toBe('CDS');
    expect(normalizeType('gene')).toBe('CDS');
    expect(normalizeType('mRNA')).toBe('CDS');
    expect(normalizeType('promoter')).toBe('promoter');
    expect(normalizeType('terminator')).toBe('terminator');
    expect(normalizeType('rep_origin')).toBe('rep_origin');
    expect(normalizeType('oriT')).toBe('rep_origin');
    expect(normalizeType('regulatory')).toBe('regulatory');
  });

  it('defaults unknown to misc_feature', () => {
    expect(normalizeType('weird_thing')).toBe('misc_feature');
  });
});

describe('normalizeDetailType', () => {
  it('maps known detail types', () => {
    expect(normalizeDetailType('sig_peptide')).toBe('signal_peptide');
    expect(normalizeDetailType('signal_peptide')).toBe('signal_peptide');
    expect(normalizeDetailType('transit_peptide')).toBe('signal_peptide');
    expect(normalizeDetailType('mat_peptide')).toBe('catalytic');
    expect(normalizeDetailType('binding_site')).toBe('binding');
    expect(normalizeDetailType('TATA_signal')).toBe('core_promoter');
    expect(normalizeDetailType('polyA_signal')).toBe('poly_a');
    expect(normalizeDetailType('RBS')).toBe('regulatory');
  });

  it('passes through unknown types', () => {
    expect(normalizeDetailType('some_custom')).toBe('some_custom');
  });
});
