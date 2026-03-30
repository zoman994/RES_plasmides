import { describe, it, expect } from 'vitest';
import { sequenceDiff, annotateAAChanges } from '../sequence-diff';

describe('sequenceDiff', () => {
  it('detects substitutions', () => {
    const r = sequenceDiff('ATGGCC', 'ATGACC');
    expect(r.substitutions).toHaveLength(1);
    expect(r.substitutions[0]).toEqual({ pos: 3, from: 'G', to: 'A' });
  });

  it('handles identical sequences', () => {
    const r = sequenceDiff('ATGATG', 'ATGATG');
    expect(r.substitutions).toHaveLength(0);
    expect(r.lengthDelta).toBe(0);
  });

  it('computes length delta', () => {
    const r = sequenceDiff('ATG', 'ATGATG');
    expect(r.lengthDelta).toBe(3);
  });

  it('computes GC delta', () => {
    const r = sequenceDiff('GGGG', 'AAAA');
    expect(r.parentGC).toBe(100);
    expect(r.childGC).toBe(0);
    expect(r.gcDelta).toBe(-100);
  });

  it('backward-compatible without cdsRegions', () => {
    const r = sequenceDiff('ATGGCC', 'ATGACC');
    expect(r.substitutions[0].aaChange).toBeUndefined();
  });

  it('annotates AA changes when cdsRegions provided', () => {
    const parent = 'ATGGCCGCC'; // M A A
    const child  = 'ATGACCGCC'; // M T A
    const r = sequenceDiff(parent, child, [{ start: 0, end: 9 }]);
    expect(r.substitutions[0].aaChange).toBeDefined();
    expect(r.substitutions[0].aaChange.from).toBe('A');
    expect(r.substitutions[0].aaChange.to).toBe('T');
    expect(r.substitutions[0].aaChange.position).toBe(2);
    expect(r.substitutions[0].aaChange.silent).toBe(false);
  });
});

describe('annotateAAChanges', () => {
  it('annotates missense mutation in CDS', () => {
    const parent = 'ATGGCCGCC'; // M A A
    const child  = 'ATGACCGCC'; // M T A (GCC→ACC)
    const subs = [{ pos: 3, from: 'G', to: 'A' }];
    const result = annotateAAChanges(subs, parent, child, [{ start: 0, end: 9 }]);
    expect(result[0].aaChange.from).toBe('A');   // GCC = Ala
    expect(result[0].aaChange.to).toBe('T');     // ACC = Thr
    expect(result[0].aaChange.position).toBe(2); // 2nd codon
    expect(result[0].aaChange.codonFrom).toBe('GCC');
    expect(result[0].aaChange.codonTo).toBe('ACC');
    expect(result[0].aaChange.silent).toBe(false);
  });

  it('detects silent mutations', () => {
    const parent = 'ATGGCCGCC'; // M A A
    const child  = 'ATGGCTGCC'; // M A A (GCC→GCT, both Ala)
    const subs = [{ pos: 5, from: 'C', to: 'T' }];
    const result = annotateAAChanges(subs, parent, child, [{ start: 0, end: 9 }]);
    expect(result[0].aaChange.silent).toBe(true);
    expect(result[0].aaChange.from).toBe('A');
    expect(result[0].aaChange.to).toBe('A');
  });

  it('skips substitutions outside CDS', () => {
    const parent = 'NNATGGCC';
    const child  = 'GGATGGCC';
    const subs = [{ pos: 0, from: 'N', to: 'G' }, { pos: 1, from: 'N', to: 'G' }];
    const result = annotateAAChanges(subs, parent, child, [{ start: 2, end: 8 }]);
    expect(result[0].aaChange).toBeUndefined();
    expect(result[1].aaChange).toBeUndefined();
  });

  it('handles empty cdsRegions', () => {
    const subs = [{ pos: 0, from: 'A', to: 'G' }];
    const result = annotateAAChanges(subs, 'ATGATG', 'GTGATG', []);
    expect(result[0].aaChange).toBeUndefined();
  });

  it('handles stop codon mutations', () => {
    const parent = 'ATGTAA'; // M *
    const child  = 'ATGCAA'; // M Q (TAA→CAA)
    const subs = [{ pos: 3, from: 'T', to: 'C' }];
    const result = annotateAAChanges(subs, parent, child, [{ start: 0, end: 6 }]);
    expect(result[0].aaChange.from).toBe('*');
    expect(result[0].aaChange.to).toBe('Q');
    expect(result[0].aaChange.silent).toBe(false);
  });
});
