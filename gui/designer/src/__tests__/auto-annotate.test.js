import { describe, it, expect } from 'vitest';
import { generateAutoAnnotations } from '../auto-annotate';

// ═══ Helper: build a Part object ═══
const makePart = (overrides) => ({
  name: 'TestPart',
  type: 'CDS',
  sequence: '',
  ...overrides,
});

// ═══ Test sequences ═══
// Simple CDS: ATG + 30 codons + TAA = 96 nt
const SIMPLE_CDS = 'ATG' + 'GCC'.repeat(30) + 'TAA';
// CDS with His-tag at C-terminus: ...CACCACCACCACCACCAC + stop
const HIS_CDS = 'ATG' + 'GCC'.repeat(20) + 'CACCACCACCACCACCACCAC' + 'GCC'.repeat(5) + 'TAA';

// Promoter with TATA box at -28 from end
const PROM_TATA = 'GCGCGCGCGC'.repeat(8) + 'TATAAAG' + 'GCGCGCGCGCGCGCGCGCGCGCGCGC';
// Promoter with CCAAT box
const PROM_CAAT = 'GCGCGC'.repeat(5) + 'CCAAT' + 'GCGCGC'.repeat(12) + 'TATAAAG' + 'GC'.repeat(13);
// Prokaryotic promoter: -35 (TTGACA) ... 17nt ... -10 (TATAAT) ... spacer
const PROK_PROM = 'GCGCGCGC'.repeat(5) + 'TTGACA' + 'GCGCGCGCGCGCGCGCG' + 'TATAAT' + 'GCGCGCGCGCGC';
// Promoter with RBS
const RBS_PROM = 'GCGCGCGCGC'.repeat(8) + 'TATAAAG' + 'GCGCGCGCAGGAGGGCGCGCGC';

// Terminator with poly-A signal
const TERM_POLYA = 'GCGCGCGCGCGCGCGCGC' + 'AATAAA' + 'GCGCGCGCGCGCGCGCGCGCGCGCGCGC';
// Terminator without poly-A
const TERM_NO_POLYA = 'GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC';

describe('generateAutoAnnotations', () => {
  // ═══ Edge cases ═══
  it('returns existing annotations unchanged', () => {
    const existing = [{ name: 'MyAnnotation', type: 'CDS', start: 0, end: 100 }];
    const part = makePart({ annotations: existing });
    const result = generateAutoAnnotations(part);
    expect(result).toBe(existing);
  });

  it('returns empty array for part without sequence', () => {
    const part = makePart({ sequence: '' });
    expect(generateAutoAnnotations(part)).toEqual([]);
  });

  it('returns empty array for part with null sequence', () => {
    const part = makePart({ sequence: null });
    expect(generateAutoAnnotations(part)).toEqual([]);
  });

  // ═══ All annotations have auto: true ═══
  it('all annotations have auto: true', () => {
    const part = makePart({ sequence: SIMPLE_CDS });
    const result = generateAutoAnnotations(part);
    expect(result.length).toBeGreaterThan(0);
    result.forEach(ann => {
      expect(ann.auto).toBe(true);
    });
  });

  // ═══ CDS ═══
  describe('CDS annotations', () => {
    it('creates base CDS annotation covering full length', () => {
      const part = makePart({ sequence: SIMPLE_CDS });
      const result = generateAutoAnnotations(part);
      const base = result.find(a => a.type === 'CDS' && a.start === 0);
      expect(base).toBeDefined();
      expect(base.name).toBe('TestPart');
      expect(base.end).toBe(SIMPLE_CDS.length);
      expect(base.auto).toBe(true);
    });

    it('detects stop codon as sub-annotation', () => {
      const part = makePart({ sequence: SIMPLE_CDS });
      const result = generateAutoAnnotations(part);
      const stop = result.find(a => a.type === 'stop_codon');
      expect(stop).toBeDefined();
      expect(stop.name).toBe('Stop codon (TAA)');
      expect(stop.start).toBe(SIMPLE_CDS.length - 3);
      expect(stop.end).toBe(SIMPLE_CDS.length);
    });

    it('detects TAG stop codon', () => {
      const seq = 'ATG' + 'GCC'.repeat(10) + 'TAG';
      const part = makePart({ sequence: seq });
      const result = generateAutoAnnotations(part);
      const stop = result.find(a => a.type === 'stop_codon');
      expect(stop).toBeDefined();
      expect(stop.name).toBe('Stop codon (TAG)');
    });

    it('detects TGA stop codon', () => {
      const seq = 'ATG' + 'GCC'.repeat(10) + 'TGA';
      const part = makePart({ sequence: seq });
      const result = generateAutoAnnotations(part);
      const stop = result.find(a => a.type === 'stop_codon');
      expect(stop).toBeDefined();
      expect(stop.name).toBe('Stop codon (TGA)');
    });
  });

  // ═══ Protein tags ═══
  describe('protein tag detection', () => {
    it('detects His-tag in CDS', () => {
      const part = makePart({ sequence: HIS_CDS });
      const result = generateAutoAnnotations(part);
      const his = result.find(a => a.type === 'tag' && a.name.includes('His'));
      expect(his).toBeDefined();
      expect(his.detector).toBe('tag_scan');
    });

    it('does not detect tags in non-CDS parts', () => {
      const part = makePart({ type: 'promoter', sequence: PROM_TATA });
      const result = generateAutoAnnotations(part);
      const tags = result.filter(a => a.type === 'tag');
      expect(tags.length).toBe(0);
    });
  });

  // ═══ Promoter ═══
  describe('promoter annotations', () => {
    it('creates base promoter annotation', () => {
      const part = makePart({ type: 'promoter', sequence: PROM_TATA });
      const result = generateAutoAnnotations(part);
      const base = result.find(a => a.type === 'promoter' && a.start === 0);
      expect(base).toBeDefined();
      expect(base.end).toBe(PROM_TATA.length);
    });

    it('detects TATA box', () => {
      const part = makePart({ type: 'promoter', sequence: PROM_TATA });
      const result = generateAutoAnnotations(part);
      const tata = result.find(a => a.name === 'TATA box');
      expect(tata).toBeDefined();
      expect(tata.type).toBe('core_promoter');
      expect(tata.auto).toBe(true);
      // TATA box should be 7 nt long (TATAAWR)
      expect(tata.end - tata.start).toBe(7);
    });

    it('detects CAAT box', () => {
      const part = makePart({ type: 'promoter', sequence: PROM_CAAT });
      const result = generateAutoAnnotations(part);
      const caat = result.find(a => a.name === 'CAAT box');
      expect(caat).toBeDefined();
      expect(caat.type).toBe('core_promoter');
      expect(caat.end - caat.start).toBe(5);
    });

    it('detects prokaryotic -10 element', () => {
      const part = makePart({ type: 'promoter', sequence: PROK_PROM, organism: 'E. coli' });
      const result = generateAutoAnnotations(part);
      const m10 = result.find(a => a.name === '-10 element');
      expect(m10).toBeDefined();
      expect(m10.type).toBe('core_promoter');
    });

    it('detects prokaryotic -35 element', () => {
      const part = makePart({ type: 'promoter', sequence: PROK_PROM, organism: 'E. coli' });
      const result = generateAutoAnnotations(part);
      const m35 = result.find(a => a.name === '-35 element');
      expect(m35).toBeDefined();
      expect(m35.type).toBe('core_promoter');
    });

    it('detects RBS (Shine-Dalgarno)', () => {
      const part = makePart({ type: 'promoter', sequence: RBS_PROM, organism: 'E. coli' });
      const result = generateAutoAnnotations(part);
      const rbs = result.find(a => a.name.includes('RBS'));
      expect(rbs).toBeDefined();
      expect(rbs.type).toBe('regulatory');
    });

    it('promoter without TATA returns only base annotation', () => {
      const seq = 'GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC';
      const part = makePart({ type: 'promoter', sequence: seq });
      const result = generateAutoAnnotations(part);
      const promoterAnns = result.filter(a => a.type === 'promoter' || a.type === 'core_promoter');
      expect(promoterAnns.length).toBe(1); // only base
      expect(promoterAnns[0].start).toBe(0);
    });
  });

  // ═══ Terminator ═══
  describe('terminator annotations', () => {
    it('detects poly-A signal', () => {
      const part = makePart({ type: 'terminator', sequence: TERM_POLYA });
      const result = generateAutoAnnotations(part);
      const polyA = result.find(a => a.name === 'Poly-A signal');
      expect(polyA).toBeDefined();
      expect(polyA.type).toBe('polyA_signal');
      expect(polyA.end - polyA.start).toBe(6);
    });

    it('terminator without poly-A returns only base annotation', () => {
      const part = makePart({ type: 'terminator', sequence: TERM_NO_POLYA });
      const result = generateAutoAnnotations(part);
      const termAnns = result.filter(a => a.type === 'terminator' || a.type === 'polyA_signal');
      expect(termAnns.length).toBe(1); // only base
    });
  });

  // ═══ Marker ═══
  describe('marker annotations', () => {
    it('creates base marker annotation', () => {
      const seq = 'ATGGCCGCCGCC' + 'TAA';
      const part = makePart({ type: 'marker', name: 'KanR', sequence: seq });
      const result = generateAutoAnnotations(part);
      const base = result.find(a => a.type === 'marker');
      expect(base).toBeDefined();
      expect(base.name).toBe('KanR');
      expect(base.start).toBe(0);
      expect(base.end).toBe(seq.length);
    });
  });

  // ═══ Signature-based tags ═══
  describe('signature-based tag detection', () => {
    it('detects GST signature', () => {
      // GST starts with MSPILGYWKIKGLVQP — encode as DNA codons
      const gstDNA = 'ATGTCTCCAATTCTTGGTTATTGGAAAATTAAAGGTCTTGTTCAACCT';
      const seq = gstDNA + 'GCC'.repeat(30) + 'TAA';
      const part = makePart({ sequence: seq });
      const result = generateAutoAnnotations(part);
      const gst = result.find(a => a.name === 'GST');
      expect(gst).toBeDefined();
      expect(gst.type).toBe('tag');
    });

    it('detects MBP signature', () => {
      // MBP starts with MKIEEGKLVI
      const mbpDNA = 'ATGAAAATTGAAGAAGGTAAACTTGTTATT';
      const seq = mbpDNA + 'GCC'.repeat(30) + 'TAA';
      const part = makePart({ sequence: seq });
      const result = generateAutoAnnotations(part);
      const mbp = result.find(a => a.name === 'MBP');
      expect(mbp).toBeDefined();
      expect(mbp.type).toBe('tag');
    });
  });

  // ═══ Unknown type ═══
  describe('unknown part type', () => {
    it('creates base annotation with original type', () => {
      const part = makePart({ type: 'insulator', name: 'HS4', sequence: 'GCGCGCGCGCGCGCGCGCGC' });
      const result = generateAutoAnnotations(part);
      const base = result.find(a => a.start === 0 && a.end === 20);
      expect(base).toBeDefined();
      expect(base.type).toBe('insulator');
    });
  });
});
