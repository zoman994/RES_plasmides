/**
 * Tests for construct validation and primer quality checks.
 */
import { describe, it, expect } from 'vitest';
import { validateConstruct, checkPrimerQuality, pcrProductSize, groupIdenticalFragments, validateJunctionEnds } from '../validate';

describe('validateConstruct', () => {
  it('returns empty for valid simple construct', () => {
    const frags = [
      { name: 'P1', type: 'promoter', sequence: 'ATGATGATG', length: 9 },
      { name: 'G1', type: 'CDS', sequence: 'ATGGCGTAA', length: 9 },
      { name: 'T1', type: 'terminator', sequence: 'AAAAAAA', length: 7 },
    ];
    const w = validateConstruct(frags);
    expect(w.filter(x => x.startsWith('⚠'))).toHaveLength(0);
  });

  it('warns about missing ATG in CDS', () => {
    const frags = [{ name: 'G1', type: 'CDS', sequence: 'GCGGCGTAA', length: 9 }];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('ATG'))).toBe(true);
  });

  it('intron warning is host-aware (fungal splicing vs E. coli), not E.-coli-first', () => {
    const frags = [{ name: 'glaA', type: 'CDS', sequence: 'ATGGCGGCGTAA', length: 12, has_introns: true, introns: [{ start: 3, end: 6 }] }];
    const w = validateConstruct(frags);
    const line = w.find((x) => x.includes('интрон'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/грибн|A\. niger|T\. reesei|сплайсинг/);
    expect(line).toMatch(/E\. coli/);
  });

  it('warns about frameshift (length not divisible by 3)', () => {
    const frags = [{ name: 'G1', type: 'CDS', sequence: 'ATGGCGT', length: 7 }];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('делится на 3'))).toBe(true);
  });

  it('detects identical adjacent fragments', () => {
    const seq = 'ATGATGATGATG';
    const frags = [
      { name: 'A', type: 'CDS', sequence: seq },
      { name: 'B', type: 'CDS', sequence: seq },
    ];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('идентичны'))).toBe(true);
  });

  it('detects identical non-adjacent fragments', () => {
    const seq = 'ATGATGATGATG';
    const frags = [
      { name: 'A', type: 'CDS', sequence: seq },
      { name: 'B', type: 'CDS', sequence: 'GCGGCG' },
      { name: 'C', type: 'CDS', sequence: seq },
    ];
    const w = validateConstruct(frags);
    expect(w.some(x => x.includes('идентичны'))).toBe(true);
  });
});

describe('checkPrimerQuality', () => {
  it('returns empty for good primer', () => {
    // Sequence with GC clamp, no homopolymer, no self-complementarity
    const w = checkPrimerQuality({ bindingSequence: 'ATGAGTCAGTACGATCGC', length: 18 });
    expect(w).toHaveLength(0);
  });

  it('warns about homopolymer runs', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATGAAAAAGATCGATCGC', length: 18 });
    expect(w.some(x => x.includes('Гомополимер'))).toBe(true);
  });

  it('warns about missing GC clamp', () => {
    const w = checkPrimerQuality({ bindingSequence: 'GCGATCGATCGATCGATA', length: 18 });
    expect(w.some(x => x.includes('GC-клэмп'))).toBe(true);
  });
});

describe('pcrProductSize', () => {
  it('returns null for non-amplified fragments', () => {
    expect(pcrProductSize({ needsAmplification: false, length: 100 }, null, null)).toBeNull();
  });

  it('adds junction lengths to fragment size', () => {
    const frag = { needsAmplification: true, length: 500, sequence: 'A'.repeat(500) };
    const leftJ = { overlapLength: 30 };
    const rightJ = { overlapLength: 25 };
    expect(pcrProductSize(frag, leftJ, rightJ)).toBe(555);
  });
});

describe('groupIdenticalFragments', () => {
  it('groups identical sequences', () => {
    const frags = [
      { name: 'A', sequence: 'ATGATG', needsAmplification: true },
      { name: 'B', sequence: 'GCGGCG', needsAmplification: true },
      { name: 'C', sequence: 'ATGATG', needsAmplification: true },
    ];
    const groups = groupIdenticalFragments(frags);
    expect(groups.size).toBe(2); // two unique sequences
    const atgGroup = groups.get('ATGATG');
    expect(atgGroup.count).toBe(2);
    expect(atgGroup.indices).toEqual([0, 2]);
  });
});

describe('validateJunctionEnds', () => {
  const frag = (name, seq) => ({ name, sequence: seq, needsAmplification: true });

  it('detects identical fragments as error', () => {
    const frags = [frag('A', 'ATGCATGC'), frag('B', 'ATGCATGC')];
    const juncs = [{ type: 'overlap', overlapLength: 4 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.severity === 'error' && x.message.includes('идентичные'))).toBe(true);
  });

  it('warns on low GC overlap', () => {
    const frags = [frag('A', 'AAAAAATTTTTTAAAA'), frag('B', 'TTTTTTAAAAAA')];
    const juncs = [{ type: 'overlap', overlapLength: 10, overlapMode: 'split' }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.message.includes('GC%'))).toBe(true);
  });

  it('errors on missing RE enzyme', () => {
    const frags = [frag('A', 'ATGC'), frag('B', 'GCTA')];
    const juncs = [{ type: 're_ligation' }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.severity === 'error' && x.message.includes('не выбрана'))).toBe(true);
  });

  it('errors on duplicate GG overhangs', () => {
    const frags = [frag('A', 'ATGC'), frag('B', 'GCTA'), frag('C', 'TTAA')];
    const juncs = [
      { type: 'golden_gate', overhang: 'AATG' },
      { type: 'golden_gate', overhang: 'AATG' },
    ];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.severity === 'error' && x.message.includes('одинаковый'))).toBe(true);
  });

  it('returns empty for valid overlap junctions', () => {
    const frags = [
      frag('A', 'ATGCGATCGATCGATCGATCGATCGATCG'),
      frag('B', 'CGATCGATCGATCGATCGATCGATCGATG'),
    ];
    const juncs = [{ type: 'overlap', overlapLength: 20, overlapMode: 'split' }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.filter(x => x.severity === 'error')).toHaveLength(0);
  });
});

describe('validateJunctionEnds — end site scanning', () => {
  const frag = (name, seq) => ({ name, sequence: seq, needsAmplification: true });

  it('detects matching RE sites at fragment ends', () => {
    const leftSeq = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCGAATTC';  // 50bp, EcoRI at end
    const rightSeq = 'GAATTCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';  // 50bp, EcoRI at start
    const frags = [frag('A', leftSeq), frag('B', rightSeq)];
    const juncs = [{ type: 'overlap', overlapLength: 20 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.severity === 'info' && x.message.includes('EcoRI') && x.message.includes('RE лигирование'))).toBe(true);
  });

  it('detects compatible RE ends (different enzymes, same overhang)', () => {
    const leftSeq = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCGAATTC';  // 50bp, EcoRI at end
    const rightSeq = 'CAATTGATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';  // 50bp, MfeI at start
    const frags = [frag('A', leftSeq), frag('B', rightSeq)];
    const juncs = [{ type: 'overlap', overlapLength: 20 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.severity === 'info' && x.message.includes('совместимые'))).toBe(true);
  });

  it('does NOT detect RE sites deep inside fragments', () => {
    const leftSeq = 'ATGCGAATTCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
    const rightSeq = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCGAATTCATGC';
    const frags = [frag('A', leftSeq), frag('B', rightSeq)];
    const juncs = [{ type: 'overlap', overlapLength: 20 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.filter(x => x.message.includes('EcoRI') && x.message.includes('RE лигирование'))).toHaveLength(0);
  });

  it('does NOT scan fragments shorter than 50bp', () => {
    const leftSeq = 'GAATTCATGCATGCATGCATGC';
    const rightSeq = 'GAATTCATGCATGCATGCATGC';
    const frags = [frag('A', leftSeq), frag('B', rightSeq)];
    const juncs = [{ type: 'overlap', overlapLength: 10 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.filter(x => x.message.includes('RE лигирование'))).toHaveLength(0);
  });

  it('detects GG site at fragment end', () => {
    const leftSeq = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCGGTCTC';  // 50bp, BsaI at end
    const rightSeq = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCAT';  // 50bp
    const frags = [frag('A', leftSeq), frag('B', rightSeq)];
    const juncs = [{ type: 'overlap', overlapLength: 20 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.some(x => x.severity === 'info' && x.message.includes('BsaI') && x.message.includes('Golden Gate'))).toBe(true);
  });

  it('does NOT suggest GG if site is also in fragment body', () => {
    const leftSeq = 'ATGCGGTCTCATGCATGCATGCATGCATGCATGCATGCATGCATGCGGTCTC';  // 52bp, BsaI in body AND end
    const rightSeq = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';  // 52bp
    const frags = [frag('A', leftSeq), frag('B', rightSeq)];
    const juncs = [{ type: 'overlap', overlapLength: 20 }];
    const w = validateJunctionEnds(frags, juncs, false);
    expect(w.filter(x => x.message.includes('Golden Gate'))).toHaveLength(0);
  });

  it('BUG-47: detects IUPAC RE site at fragment ends', () => {
    // HincII = GTYRAC (Y=[CT], R=[AG]) — should match GTTAAC
    const leftSeq = 'AAAAAAAAAAAAAAAAAAAAAAAAAAGTTAAC';  // ends with GTTAAC
    const rightSeq = 'GTTAACAAAAAAAAAAAAAAAAAAAAAAAAAA';  // starts with GTTAAC
    const frags = [frag('L', leftSeq), frag('R', rightSeq)];
    const juncs = [{ type: 're_ligation', reEnzyme: 'HincII' }];
    const w = validateJunctionEnds(frags, juncs, false);
    // Should NOT warn "site not found" — GTTAAC matches IUPAC GTYRAC
    expect(w.some(x => x.message.includes('не найден'))).toBe(false);
  });
});
