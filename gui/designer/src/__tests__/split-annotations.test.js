/**
 * K6 (Sprint 1.6) — biologically correct annotation trimming on mutagenesis split.
 *
 * When a fragment is split into sub-fragments by the mutagenesis strategy
 * engine, some annotations become biologically meaningless if trimmed:
 *  - signal_peptide / transit_peptide / propeptide — N-terminal by definition
 *  - start_codon — only valid at position 0
 *  - stop_codon — only valid at the last codon
 *  - restriction_site / primer_bind — half a site doesn't cut/bind
 *  - mutation / variation — point markers, no meaning at edge
 *
 * Other features (linker, domain, marker, misc_feature, CDS/gene...) are
 * trimmed with a `trimmed: true` flag; CDS and gene get a human-readable
 * suffix like "(5' trimmed)" / "(3' trimmed)" / "(trimmed)".
 */
import { describe, it, expect } from 'vitest';
import { trimAnnotationsForSubFragment } from '../lib/split-annotations';

describe('trimAnnotationsForSubFragment — biological correctness', () => {
  // Setup: HygroR 1023 bp, signal peptide 0..93, CDS 0..1023
  //        split at 42: HygroR_1 (0..42), HygroR_2 (42..1023)
  const hygroR_anns = [
    { name: 'HygroR',         type: 'CDS',              start: 0,   end: 1023, level: 'region' },
    { name: 'Signal peptide', type: 'signal_peptide',   start: 0,   end: 93,   level: 'detail' },
    { name: 'Linker',         type: 'linker',           start: 340, end: 387,  level: 'detail' },
    { name: 'NdeI',           type: 'restriction_site', start: 450, end: 456,  level: 'point' },
  ];

  const sub1 = { templateStart: 0,  templateEnd: 42,   length: 42  }; // HygroR_1
  const sub2 = { templateStart: 42, templateEnd: 1023, length: 981 }; // HygroR_2

  it('CDS fully covering both subs is trimmed in both, renamed with 5\'/3\' suffix', () => {
    const a1 = trimAnnotationsForSubFragment(hygroR_anns, sub1);
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    const cds1 = a1.find(a => a.type === 'CDS');
    const cds2 = a2.find(a => a.type === 'CDS');
    expect(cds1.trimmed).toBe(true);
    expect(cds1.name).toContain("3' trimmed");
    expect(cds2.trimmed).toBe(true);
    expect(cds2.name).toContain("5' trimmed");
  });

  it('Signal peptide spans split: DROPPED in sub1 (partial overlap with N-terminal feature)', () => {
    const a1 = trimAnnotationsForSubFragment(hygroR_anns, sub1);
    expect(a1.find(a => a.type === 'signal_peptide')).toBeUndefined();
  });

  it('Signal peptide DOES NOT survive in sub2 (N-terminal, sub2 not at parent start)', () => {
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    expect(a2.find(a => a.type === 'signal_peptide')).toBeUndefined();
  });

  it('Signal peptide survives if fully inside a sub-fragment that starts at parent 0', () => {
    const splitAt150 = { templateStart: 0, templateEnd: 150, length: 150 };
    const a = trimAnnotationsForSubFragment(hygroR_anns, splitAt150);
    const sp = a.find(x => x.type === 'signal_peptide');
    expect(sp).toBeDefined();
    expect(sp.start).toBe(0);
    expect(sp.end).toBe(93);
  });

  it('Linker fully inside sub2 is preserved with re-based coordinates, NOT trimmed', () => {
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    const lnk = a2.find(a => a.type === 'linker');
    expect(lnk).toBeDefined();
    expect(lnk.trimmed).toBe(false);
    expect(lnk.start).toBe(340 - 42); // 298
    expect(lnk.end).toBe(387 - 42);   // 345
  });

  it('Restriction site fully inside sub2 is preserved', () => {
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    const rs = a2.find(a => a.type === 'restriction_site');
    expect(rs).toBeDefined();
    expect(rs.start).toBe(450 - 42);
  });

  it('Restriction site that spans a split boundary is DROPPED', () => {
    const splitMidRE = { templateStart: 0, templateEnd: 453, length: 453 };
    const a = trimAnnotationsForSubFragment(hygroR_anns, splitMidRE);
    expect(a.find(x => x.type === 'restriction_site')).toBeUndefined();
  });

  it('Start codon at parent pos 0: survives in sub starting at 0, dropped in sub not starting at 0', () => {
    const anns = [{ name: 'ATG', type: 'start_codon', start: 0, end: 3, level: 'point' }];
    const head = { templateStart: 0,   templateEnd: 100, length: 100 };
    const tail = { templateStart: 100, templateEnd: 500, length: 400 };
    const aH = trimAnnotationsForSubFragment(anns, head);
    const aT = trimAnnotationsForSubFragment(anns, tail);
    expect(aH.find(a => a.type === 'start_codon')).toBeDefined();
    expect(aT.find(a => a.type === 'start_codon')).toBeUndefined();
  });

  it('Stop codon at parent end: survives in sub ending there, dropped elsewhere', () => {
    const anns = [{ name: 'TAA', type: 'stop_codon', start: 1020, end: 1023, level: 'point' }];
    const head = { templateStart: 0,   templateEnd: 500,  length: 500 };
    const tail = { templateStart: 500, templateEnd: 1023, length: 523 };
    const aH = trimAnnotationsForSubFragment(anns, head);
    const aT = trimAnnotationsForSubFragment(anns, tail);
    expect(aH.find(a => a.type === 'stop_codon')).toBeUndefined();
    expect(aT.find(a => a.type === 'stop_codon')).toBeDefined();
  });

  it('Annotation completely outside the sub-fragment is not included', () => {
    const annsFar = [{ name: 'Far', type: 'misc_feature', start: 500, end: 600 }];
    const sub = { templateStart: 0, templateEnd: 100, length: 100 };
    expect(trimAnnotationsForSubFragment(annsFar, sub)).toHaveLength(0);
  });

  it('Empty parent annotations → empty result', () => {
    expect(trimAnnotationsForSubFragment([], { templateStart: 0, templateEnd: 100, length: 100 }))
      .toHaveLength(0);
  });

  it('Null annotations arg → empty result', () => {
    expect(trimAnnotationsForSubFragment(null, { templateStart: 0, templateEnd: 100, length: 100 }))
      .toHaveLength(0);
  });

  it('Primer bind that spans a boundary is dropped', () => {
    const anns = [{ name: 'seq_fwd', type: 'primer_bind', start: 40, end: 60, level: 'point' }];
    const sub = { templateStart: 0, templateEnd: 50, length: 50 };
    expect(trimAnnotationsForSubFragment(anns, sub).find(a => a.type === 'primer_bind')).toBeUndefined();
  });

  it('Mutation point inside sub is preserved with re-based coordinates', () => {
    const anns = [{ name: 'A100A', type: 'mutation', start: 300, end: 303, level: 'point' }];
    const sub = { templateStart: 100, templateEnd: 500, length: 400 };
    const a = trimAnnotationsForSubFragment(anns, sub);
    expect(a[0].start).toBe(200);
    expect(a[0].end).toBe(203);
  });

  it('Gene spanning boundary renamed with 3\' trimmed suffix for head fragment', () => {
    const anns = [{ name: 'HygroR', type: 'gene', start: 0, end: 1023 }];
    const headSub = { templateStart: 0, templateEnd: 42, length: 42 };
    const a = trimAnnotationsForSubFragment(anns, headSub);
    expect(a[0].name).toBe("HygroR (3' trimmed)");
    expect(a[0].trimmed).toBe(true);
  });

  it('Gene fully inside sub (middle chunk): renamed with (trimmed) — both ends cut', () => {
    const anns = [{ name: 'HygroR', type: 'gene', start: 0, end: 1023 }];
    const mid = { templateStart: 100, templateEnd: 500, length: 400 };
    const a = trimAnnotationsForSubFragment(anns, mid);
    expect(a[0].trimmed).toBe(true);
    expect(a[0].name).toContain("trimmed"); // "(trimmed)" — both 5' and 3'
  });

  it('Idempotency: re-trimming a fragment whose name already has "trimmed" does not double-append', () => {
    const anns = [{ name: "HygroR (5' trimmed)", type: 'CDS', start: 0, end: 500, trimmed: true }];
    const sub = { templateStart: 100, templateEnd: 300, length: 200 };
    const a = trimAnnotationsForSubFragment(anns, sub);
    expect(a[0].name).not.toContain("trimmed trimmed");
  });

  it('Variation point on boundary is dropped', () => {
    const anns = [{ name: 'SNP', type: 'variation', start: 99, end: 101, level: 'point' }];
    const sub = { templateStart: 0, templateEnd: 100, length: 100 };
    expect(trimAnnotationsForSubFragment(anns, sub).find(a => a.type === 'variation')).toBeUndefined();
  });

  it('modified_base point on boundary is dropped', () => {
    const anns = [{ name: 'mod', type: 'modified_base', start: 49, end: 51, level: 'point' }];
    const sub = { templateStart: 0, templateEnd: 50, length: 50 };
    expect(trimAnnotationsForSubFragment(anns, sub).find(a => a.type === 'modified_base')).toBeUndefined();
  });

  it('misc_feature marker is trimmed with flag (no rename)', () => {
    const anns = [{ name: 'enhancer region', type: 'misc_feature', start: 0, end: 500 }];
    const sub = { templateStart: 100, templateEnd: 300, length: 200 };
    const a = trimAnnotationsForSubFragment(anns, sub);
    expect(a[0].trimmed).toBe(true);
    expect(a[0].name).toBe('enhancer region'); // no suffix appended for misc_feature
    expect(a[0].start).toBe(0);
    expect(a[0].end).toBe(200);
  });

  it('Domain fully inside sub: not trimmed, no rename', () => {
    const anns = [{ name: 'Kinase domain', type: 'domain', start: 200, end: 400 }];
    const sub = { templateStart: 100, templateEnd: 500, length: 400 };
    const a = trimAnnotationsForSubFragment(anns, sub);
    expect(a[0].trimmed).toBe(false);
    expect(a[0].start).toBe(100);
    expect(a[0].end).toBe(300);
    expect(a[0].name).toBe('Kinase domain');
  });
});
