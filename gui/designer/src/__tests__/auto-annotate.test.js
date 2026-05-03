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
  // Sub-feature detection (-10, -35, RBS, TATA, CAAT) was removed — 6-bp
  // consensus matchers had >50% false-positive rate and produced label spam
  // on every plasmid. Types stay supported, but auto-annotator no longer
  // guesses them. See header note in auto-annotate.js.
  describe('promoter annotations', () => {
    it('creates base promoter annotation', () => {
      const part = makePart({ type: 'promoter', sequence: PROM_TATA });
      const result = generateAutoAnnotations(part);
      const base = result.find(a => a.type === 'promoter' && a.start === 0);
      expect(base).toBeDefined();
      expect(base.end).toBe(PROM_TATA.length);
    });

    it('does NOT auto-detect TATA / CAAT / -10 / -35 / RBS', () => {
      for (const seq of [PROM_TATA, PROM_CAAT, PROK_PROM, RBS_PROM]) {
        const part = makePart({ type: 'promoter', sequence: seq, organism: 'E. coli' });
        const result = generateAutoAnnotations(part);
        const noisy = result.filter(a =>
          a.name === 'TATA box' || a.name === 'CAAT box'
          || a.name === '-10 element' || a.name === '-35 element'
          || (a.name && a.name.includes('RBS'))
        );
        expect(noisy).toEqual([]);
      }
    });
  });

  // ═══ Terminator ═══
  // Poly-A signal detection (6-bp AATAAA scan) removed for the same reason —
  // 6-bp matches occur ~once per 4 kb of random DNA and were noise.
  describe('terminator annotations', () => {
    it('terminator returns only base annotation (no auto poly-A)', () => {
      for (const seq of [TERM_POLYA, TERM_NO_POLYA]) {
        const part = makePart({ type: 'terminator', sequence: seq });
        const result = generateAutoAnnotations(part);
        const polyA = result.find(a => a.type === 'polyA_signal');
        expect(polyA).toBeUndefined();
      }
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
