/**
 * K3 — container ↔ GenBank serialization with COMMENT provenance.
 */
import { describe, it, expect } from 'vitest';
import {
  writeContainerToGenBank,
  readContainerFromGenBank,
} from '../bodge-container-genbank';
import {
  decodeProvenanceComment,
  simulateThirdPartyRoundTrip,
  compareGenBankRoundTrip,
} from '../bodge-snapgene-loss-detect';

const SAMPLE_CONTAINER = {
  id: 'c01XYZABCDEF',
  name: 'pET-28b',
  description: 'Expression vector with His-tag, KanR selection.',
  sequence: 'ATGCATATGAAGCTTTAATACGACTCACTATAGGGGAATTGTGAGCGGATAACAATTCCC',
  topology: 'circular',
  version: 1,
  keywords: ['plasmid', 'expression', 'kanamycin'],
  annotations: [
    {
      id: '01ABCDEF',
      name: 'T7 promoter',
      type: 'promoter',
      start: 16,
      end: 51,
      strand: 1,
      color: '#E8A85F',
      note: 'Phi 10 promoter',
    },
    {
      id: '01DEFGHI',
      name: '6xHis-tag',
      type: 'CDS',
      start: 79,
      end: 262,
      strand: 1,
      color: '#D4C8A0',
      parentId: '01ABCDEF',
      level: 'detail',
    },
    {
      id: '01PRMR01',
      name: 'T7-rev',
      type: 'primer_bind',
      start: 119,
      end: 145,
      strand: -1,
      sequence: 'ATACAAAATCTGTATTTCAGGGCATGGGCAGCAGC',
    },
  ],
  provenance: {
    baseSnapshotHash: 'sha256-aaa',
    currentHash: 'sha256-zzz',
    topology: 'circular',
    ends: null,
    origin: { kind: 'imported', source: 'addgene-13522' },
    commits: [{ id: '01CMT01', parent: null, kind: 'import_baseline' }],
  },
};

describe('K3 — writeContainerToGenBank', () => {
  it('produces a valid GenBank file with LOCUS / FEATURES / ORIGIN', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    expect(gb).toMatch(/^LOCUS\s+pET-28b\s+60 bp DNA\s+circular/);
    expect(gb).toContain('DEFINITION  Expression vector');
    expect(gb).toContain('ACCESSION   c01XYZABCDEF');
    expect(gb).toContain('VERSION     c01XYZABCDEF.1');
    expect(gb).toContain('KEYWORDS    plasmid; expression; kanamycin.');
    expect(gb).toContain('FEATURES             Location/Qualifiers');
    expect(gb).toContain('ORIGIN');
    expect(gb).toMatch(/\/\/\s*$/);
  });

  it('emits /label /bodge_id /color /parent_feature qualifiers', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    expect(gb).toContain('/label="T7 promoter"');
    expect(gb).toContain('/bodge_id="01ABCDEF"');
    expect(gb).toContain('/color="#E8A85F"');
    expect(gb).toContain('/parent_feature="01ABCDEF"');
    expect(gb).toContain('/bodge_level="detail"');
  });

  it('emits /note="sequence:..." for primer_bind features', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    expect(gb).toContain('/note="sequence:ATACAAAATCTGT');
  });

  it('emits COMMENT provenance block when provenance is provided', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    expect(gb).toContain('COMMENT');
    expect(gb).toContain('##BodgeGene-Provenance-START##');
    expect(gb).toContain('##BodgeGene-Provenance-END##');
  });

  it('skips COMMENT block when provenance is null', () => {
    const noProv = { ...SAMPLE_CONTAINER, provenance: null };
    const gb = writeContainerToGenBank(noProv);
    expect(gb).not.toContain('##BodgeGene-Provenance-START##');
  });

  it('formats complement locations for reverse-strand features', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    expect(gb).toContain('complement(120..145)');
  });

  it('writes 60-char ORIGIN lines with 10-char chunks', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const originIdx = gb.indexOf('ORIGIN');
    const originBody = gb.slice(originIdx).split('\n').slice(1, -2);
    expect(originBody[0]).toMatch(/^\s+1 atgcatatga agctttaata/);
  });
});

describe('K3 — readContainerFromGenBank', () => {
  it('round-trips the container losslessly', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(gb);
    expect(back.id).toBe(SAMPLE_CONTAINER.id);
    expect(back.name).toBe(SAMPLE_CONTAINER.name);
    expect(back.topology).toBe('circular');
    expect(back.sequence.toUpperCase()).toBe(SAMPLE_CONTAINER.sequence);
    expect(back.annotations).toHaveLength(3);
  });

  it('round-trips annotations with /label /bodge_id /color', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(gb);
    const promoter = back.annotations.find(a => a.name === 'T7 promoter');
    expect(promoter).toBeTruthy();
    expect(promoter.id).toBe('01ABCDEF');
    expect(promoter.color).toBe('#E8A85F');
    expect(promoter.type).toBe('promoter');
    expect(promoter.start).toBe(16);
    expect(promoter.end).toBe(51);
    expect(promoter.strand).toBe(1);
  });

  it('preserves /parent_feature for sub-features', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(gb);
    const his = back.annotations.find(a => a.name === '6xHis-tag');
    expect(his.parentId).toBe('01ABCDEF');
    expect(his.level).toBe('detail');
  });

  it('preserves primer_bind /note=sequence: as ann.sequence', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(gb);
    const primer = back.annotations.find(a => a.type === 'primer_bind');
    expect(primer.sequence).toBe('ATACAAAATCTGTATTTCAGGGCATGGGCAGCAGC');
  });

  it('decodes provenance COMMENT bit-perfect', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const back = readContainerFromGenBank(gb);
    expect(back.provenance).toBeTruthy();
    expect(back.provenance.containerId).toBe(SAMPLE_CONTAINER.id);
    expect(back.provenance.commits[0].id).toBe('01CMT01');
  });

  it('derives stable annotation IDs when /bodge_id is missing', () => {
    const c = {
      ...SAMPLE_CONTAINER,
      annotations: [
        { name: 'mystery', type: 'misc_feature', start: 10, end: 20, strand: 1 },
      ],
      provenance: null,
    };
    const gb = writeContainerToGenBank(c);
    const cleaned = gb.replace(/\/bodge_id="[^"]+"\n/g, '');
    const back = readContainerFromGenBank(cleaned);
    expect(back.annotations[0].id).toMatch(/^derived-/);
  });

  it('honors idResolver opt for /bodge_id-less features', () => {
    const c = { ...SAMPLE_CONTAINER, provenance: null };
    const gb = writeContainerToGenBank(c).replace(/\/bodge_id="[^"]+"\n/g, '');
    const back = readContainerFromGenBank(gb, {
      idResolver: a => `resolved-${a.name}`,
    });
    expect(back.annotations[0].id).toBe('resolved-T7 promoter');
  });
});

describe('K3 — third-party round-trip survives COMMENT provenance', () => {
  it('SnapGene-style 79-col wrap preserves provenance', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(gb, 'snapgene');
    const back = readContainerFromGenBank(reformatted);
    expect(back.provenance).toBeTruthy();
    expect(back.provenance.containerId).toBe(SAMPLE_CONTAINER.id);
  });

  it('ApE-style 64-col wrap with 5-space indent preserves provenance', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(gb, 'ape');
    const prov = decodeProvenanceComment(reformatted);
    expect(prov.payload).toBeTruthy();
    expect(prov.payload.containerId).toBe(SAMPLE_CONTAINER.id);
  });

  it('Geneious-style reflow preserves provenance', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(gb, 'geneious');
    const back = readContainerFromGenBank(reformatted);
    expect(back.provenance).toBeTruthy();
  });

  it('pLannotate-style COMMENT strip → provenance is lost (expected)', () => {
    const gb = writeContainerToGenBank(SAMPLE_CONTAINER);
    const stripped = simulateThirdPartyRoundTrip(gb, 'plannotate');
    const back = readContainerFromGenBank(stripped);
    expect(back.provenance).toBeNull();
    // Sequence + features still preserved — only provenance lost.
    expect(back.sequence.toUpperCase()).toBe(SAMPLE_CONTAINER.sequence);
    expect(back.annotations.length).toBeGreaterThan(0);
  });

  it('compareGenBankRoundTrip confirms bit-perfect SnapGene survival', () => {
    const original = writeContainerToGenBank(SAMPLE_CONTAINER);
    const reformatted = simulateThirdPartyRoundTrip(original, 'snapgene');
    const cmp = compareGenBankRoundTrip(original, reformatted);
    expect(cmp.sequenceMatch).toBe(true);
    expect(cmp.featuresPreserved).toBe(true);
    expect(cmp.qualifiersPreserved).toBe(true);
    expect(cmp.provenancePreserved).toBe(true);
    expect(cmp.provenancePayloadMatch).toBe(true);
  });
});
