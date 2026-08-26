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

  it('FEAT-QUALIFIERS — preserves INSDC qualifiers (/gene //product //note) onto the annotation', () => {
    const features = [
      feat('CDS', 0, 1500, { label: 'glaA', gene: 'glaA', product: 'glucoamylase', note: 'fungal secreted', EC_number: '3.2.1.3', ApEinfo_fwdcolor: '#ff0000' }),
      feat('sig_peptide', 0, 60, { label: 'signal', product: 'secretion signal' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const region = annotations.find((a) => a.level === 'region');
    const detail = annotations.find((a) => a.level === 'detail');
    expect(region.qualifiers).toMatchObject({ gene: 'glaA', product: 'glucoamylase', note: 'fungal secreted', EC_number: '3.2.1.3' });
    // already-mapped qualifiers are NOT duplicated into the bag
    expect(region.qualifiers.label).toBeUndefined();
    expect(region.qualifiers.ApEinfo_fwdcolor).toBeUndefined();
    expect(detail.qualifiers).toMatchObject({ product: 'secretion signal' });
  });

  it('FEAT-QUALIFIERS — no qualifiers bag when the feature carries none portable', () => {
    const { annotations } = importFeatures([feat('CDS', 0, 100, { label: 'x' })], 5000);
    expect(annotations[0].qualifiers).toBeUndefined();
  });

  it('FEAT-QUALIFIERS — persists /codon_start + /transl_table (P4.0 — reading frame + genetic code)', () => {
    // GenBank keeps these on a CDS to pin the reading frame (codon_start 1|2|3)
    // and genetic code (transl_table). They were dropped on import; protein
    // search (aa:) needs them to translate the CDS the way the file intends.
    const features = [
      feat('CDS', 0, 900, { label: 'mtGene', gene: 'cox1', codon_start: '2', transl_table: '4' }),
    ];
    const { annotations } = importFeatures(features, 5000);
    const region = annotations.find((a) => a.level === 'region');
    expect(region.qualifiers).toMatchObject({ codon_start: '2', transl_table: '4' });
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
      feat('weird_feature', 100, 600, { label: 'small_rna' }),
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

  it('gene WITHOUT overlapping CDS → region with type="gene"', () => {
    const features = [
      feat('gene', 0, 1500, { gene: 'lacZ' }),
      // No CDS/RNA inside this gene — gene passes filter and becomes its own region.
    ];
    const { annotations } = importFeatures(features, 5000);

    expect(annotations).toHaveLength(1);
    expect(annotations[0].level).toBe('region');
    expect(annotations[0].type).toBe('gene');
    expect(annotations[0].name).toBe('lacZ');
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
    const mature = details.find(d => d.type === 'mat_peptide');
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
    expect(normalizeType('mRNA')).toBe('mRNA');
    expect(normalizeType('promoter')).toBe('promoter');
    expect(normalizeType('terminator')).toBe('terminator');
    expect(normalizeType('rep_origin')).toBe('rep_origin');
    expect(normalizeType('oriT')).toBe('oriT');
    expect(normalizeType('regulatory')).toBe('regulatory');
  });

  it('gene requires feat context for qualifier-based classification', () => {
    expect(normalizeType('gene', { qualifiers: {} })).toBe('gene');
    expect(normalizeType('gene', { qualifiers: { ncRNA_class: 'miRNA' } })).toBe('ncRNA');
    expect(normalizeType('gene', { qualifiers: { product: 'tRNA-Ala' } })).toBe('tRNA');
    expect(normalizeType('gene', { qualifiers: { product: '16S ribosomal RNA' } })).toBe('rRNA');
    // Without feat, gene falls through TYPE_MAP (which intentionally omits it) → misc_feature.
    expect(normalizeType('gene')).toBe('misc_feature');
  });

  it('defaults unknown to misc_feature', () => {
    expect(normalizeType('weird_thing')).toBe('misc_feature');
  });
});

describe('normalizeDetailType', () => {
  it('maps known detail types', () => {
    expect(normalizeDetailType('sig_peptide')).toBe('signal_peptide');
    expect(normalizeDetailType('signal_peptide')).toBe('signal_peptide');
    expect(normalizeDetailType('transit_peptide')).toBe('transit_peptide');
    expect(normalizeDetailType('mat_peptide')).toBe('mat_peptide');
    expect(normalizeDetailType('binding_site')).toBe('binding');
    expect(normalizeDetailType('TATA_signal')).toBe('core_promoter');
    expect(normalizeDetailType('polyA_signal')).toBe('poly_a');
    expect(normalizeDetailType('RBS')).toBe('regulatory');
  });

  it('passes through unknown types', () => {
    expect(normalizeDetailType('some_custom')).toBe('some_custom');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ANN-0J Block 2 — ONE qualifier matrix.
//
// Provenance must survive on EVERY level, not only on the two the importer
// happened to shape first. An arbitrary key (a lab's own `/plasmid_id`), a
// repeated key and a valueless flag are checked on region, detail, point and
// the unknown/fallback branch in a single pass.
// ═══════════════════════════════════════════════════════════════════════════

const RICH_Q = {
  label: 'probe',
  plasmid_id: 'LAB-7781',              // arbitrary, not on any allow-list
  note: ['first', 'second'],           // repeated → ordered array
  pseudo: true,                        // valueless flag
  db_xref: 'GO:0004339',
};

const DOC = { length: 5000, topology: 'linear' };

describe('ANN-0J/2 — qualifiers survive on every annotation level', () => {
  const cases = [
    ['region', 'CDS', 100, 400],
    ['detail', 'sig_peptide', 100, 160],
    ['point', 'variation', 200, 201],
    // unknown INSDC type → the heuristic fallback branch
    ['fallback', 'operon', 300, 340],
  ];

  it.each(cases)('%s keeps arbitrary, repeated and flag qualifiers', (label, type, start, end) => {
    const { annotations } = importFeatures(
      [feat(type, start, end, { ...RICH_Q })], 5000, 'genbank', DOC,
    );
    const ann = annotations.find((a) => a.name === 'probe');
    expect(ann, `${label}: annotation missing`).toBeTruthy();

    expect(ann.qualifiers, `${label}: qualifiers dropped`).toBeTruthy();
    expect(ann.qualifiers.plasmid_id).toBe('LAB-7781');
    expect(ann.qualifiers.note).toEqual(['first', 'second']);
    expect(ann.qualifiers.pseudo).toBe(true);
    expect(ann.qualifiers.db_xref).toBe('GO:0004339');
  });

  it('mapped fields are not duplicated into qualifiers but survive elsewhere', () => {
    const { annotations } = importFeatures([feat('CDS', 100, 400, {
      label: 'mapped', ApEinfo_fwdcolor: '#ff0000', primer_seq: 'ACGT',
    })], 5000, 'genbank', DOC);
    const ann = annotations.find((a) => a.name === 'mapped');

    // label → name, colour → color: preserved, just not repeated as qualifiers
    expect(ann.name).toBe('mapped');
    expect(ann.color).toBe('#ff0000');
    expect(ann.qualifiers?.label).toBeUndefined();
    expect(ann.qualifiers?.ApEinfo_fwdcolor).toBeUndefined();
    expect(ann.qualifiers?.primer_seq).toBeUndefined();
  });

  it('prototype-polluting keys never reach the model', () => {
    const hostile = { label: 'evil' };
    hostile.__proto__ = 'x';           // eslint-disable-line no-proto
    hostile.constructor = 'y';
    hostile.prototype = 'z';
    const { annotations } = importFeatures(
      [feat('CDS', 100, 400, hostile)], 5000, 'genbank', DOC,
    );
    const ann = annotations.find((a) => a.name === 'evil');
    const q = ann.qualifiers || {};

    expect(Object.prototype.hasOwnProperty.call(q, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(q, 'prototype')).toBe(false);
    expect({}.polluted).toBeUndefined();
  });

  it('non-JSON-safe values are refused rather than persisted', () => {
    const { annotations } = importFeatures([feat('CDS', 100, 400, {
      label: 'fn', weird: () => 1, nested: { a: 1 }, ok: 'kept',
    })], 5000, 'genbank', DOC);
    const q = annotations.find((a) => a.name === 'fn').qualifiers || {};

    expect(q.ok).toBe('kept');
    expect(q.weird).toBeUndefined();
    expect(q.nested).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ANN-0J Block 3 (model half) — identity, not name.
// ═══════════════════════════════════════════════════════════════════════════

describe('ANN-0J/3 — a rejected primer never deletes a valid namesake', () => {
  // ANN-0L C1 supersedes the ANN-0J assumption that a refused location also
  // deletes the primer. The gate judges COORDINATES; the oligo and its
  // provenance are separate facts it never examined. What ANN-0J root 4
  // actually protected — that refusing one `P` must not take an unrelated `P`
  // with it — still holds and is asserted below.
  it('keeps BOTH `P` records, and marks only the refused one as unusable', () => {
    const good = feat('primer_bind', 100, 118, { label: 'P', primer_seq: 'ACGTACGTACGTACGTAC' });
    // same NAME, impossible location → refused by the gate
    const bad = feat('primer_bind', 9000, 9018, { label: 'P', primer_seq: 'TTTTTTTTTTTTTTTTTT' });

    const { primers, rejected, annotations } = importFeatures([good, bad], 5000, 'genbank', DOC);

    expect(rejected.some((r) => r.name === 'P')).toBe(true);
    // the ANNOTATION is refused — exactly one `P` is drawable
    expect(annotations.filter((a) => a.name === 'P')).toHaveLength(1);
    // …while both oligos survive as records, each keeping its own sequence
    expect(primers).toHaveLength(2);
    const seqs = primers.map((p) => p.sequence).sort();
    expect(seqs).toEqual(['ACGTACGTACGTACGTAC', 'TTTTTTTTTTTTTTTTTT']);
    const refused = primers.find((p) => p.sequence === 'TTTTTTTTTTTTTTTTTT');
    expect(refused.locationRejected).toBe(true);
    expect(refused.start).toBe(null);
    // the valid neighbour is untouched by its namesake's refusal
    const kept = primers.find((p) => p.sequence === 'ACGTACGTACGTACGTAC');
    expect(kept.locationRejected).toBe(false);
    expect(kept.start).toBe(100);
  });

  it('a refused primer_bind yields a record with no usable location', () => {
    const bad = feat('primer_bind', 9000, 9018, { label: 'onlyBad', primer_seq: 'ACGT' });
    const { primers, annotations } = importFeatures([bad], 5000, 'genbank', DOC);
    // the row exists so the user can see and manage the oligo…
    expect(primers).toHaveLength(1);
    expect(primers[0].sequence).toBe('ACGT');
    // …and nothing is drawn anywhere on the molecule
    expect(primers[0].locationRejected).toBe(true);
    expect(primers[0].location).toBe(null);
    expect(annotations).toHaveLength(0);
  });

  it('carries the note through so the supported sequence form can be read', () => {
    const p = feat('primer_bind', 100, 118, {
      label: 'noted', note: 'sequence: ACGTACGTACGTACGTAC',
    });
    const { primers } = importFeatures([p], 5000, 'genbank', DOC);
    expect(primers[0].note).toBe('sequence: ACGTACGTACGTACGTAC');
  });
});

// ---------------------------------------------------------------------------
// ANN-0L C1 - a refused location rejects the ANNOTATION, never the primer.
//
// The gate exists so an out-of-range or reversed span is not drawn on a
// molecule it does not describe. Deleting the whole primer as well threw away
// the oligo and its provenance - facts the bad coordinates never touched.
// ---------------------------------------------------------------------------
describe('ANN-0L C1 - a primer_bind with an unusable location', () => {
  const SEQ = 'ACGT'.repeat(25); // 100 nt

  const features = [
    {
      type: 'primer_bind', name: 'bad-locus',
      start: 90, end: 400,                      // runs off the end of a linear molecule
      strand: 1,
      qualifiers: { primer_seq: 'GGGGCCCCAAAA', note: 'ordered 2026-04' },
    },
    {
      type: 'primer_bind', name: 'good-locus',
      start: 10, end: 22, strand: 1,
      qualifiers: { primer_seq: 'ACGTACGTACGT' },
    },
  ];

  function run() {
    return importFeatures(features, SEQ.length, 'genbank', { length: SEQ.length, topology: 'linear' });
  }

  it('keeps the primer record even though its annotation was refused', () => {
    const { primers } = run();
    expect(primers.map((p) => p.name)).toContain('bad-locus');
  });

  it('keeps the oligo and its provenance', () => {
    const { primers } = run();
    const bad = primers.find((p) => p.name === 'bad-locus');
    expect(bad.sequence).toBe('GGGGCCCCAAAA');
    expect(bad.note).toBe('ordered 2026-04');
  });

  it('marks the location as unusable rather than passing bad coordinates on', () => {
    const { primers } = run();
    const bad = primers.find((p) => p.name === 'bad-locus');
    // no usable site: the row exists, the glyph does not
    expect(bad.locationRejected).toBe(true);
  });

  it('still refuses the annotation itself', () => {
    const { annotations } = run();
    expect(annotations.map((a) => a.name)).not.toContain('bad-locus');
  });

  it('leaves the valid neighbour untouched', () => {
    const { primers, annotations } = run();
    expect(primers.map((p) => p.name)).toContain('good-locus');
    expect(annotations.map((a) => a.name)).toContain('good-locus');
  });
});
