/**
 * feature-dedup — featureMatchesExisting (SPEC_COMMON_FEATURES DEC-CF-04).
 * «Дедуп = детекция»: protein-pathway types compared by protein
 * (exact/fuzzy ≥0.90), everything else by DNA identity on both strands
 * (RC-aware) ≥ threshold (0.96 default); a PSO mismatch with a matching
 * name surfaces a `by:'name'` warning signal instead of a silent dupe.
 */
import { describe, it, expect } from 'vitest';
import { reverseComplement } from '../sequence-utils';
import { featureMatchesExisting } from '../lib/feature-dedup';

const DNA60 = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
function mutate(seq, positions) {
  const arr = seq.split('');
  for (const i of positions) arr[i] = arr[i] === 'A' ? 'T' : 'A';
  return arr.join('');
}

const PROT = 'MKLVTYACDEFGHIKLMNPQRS'; // 22 aa

describe('featureMatchesExisting — DNA pathway (non-CDS)', () => {
  it('identical sequence → matches, by:dna, identity 1', () => {
    const c = { name: 'ori', type: 'rep_origin', sequence: DNA60 };
    const e = { name: 'ori', type: 'rep_origin', sequence: DNA60 };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(true);
    expect(r.by).toBe('dna');
    expect(r.identity).toBeCloseTo(1, 5);
  });

  it('≥96% identity (1 mismatch / 60) → matches', () => {
    const c = { name: 'ori', type: 'misc', sequence: mutate(DNA60, [5]) };
    const e = { name: 'ori', type: 'misc', sequence: DNA60 };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(true);
    expect(r.by).toBe('dna');
  });

  it('reverse-complement match (RC-aware) → matches', () => {
    const c = { name: 'ori', type: 'misc', sequence: reverseComplement(DNA60) };
    const e = { name: 'ori', type: 'misc', sequence: DNA60 };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(true);
    expect(r.by).toBe('dna');
  });

  it('<96% identity, different name → no match, by:dna', () => {
    const c = { name: 'fooA', type: 'misc', sequence: mutate(DNA60, [2, 8, 14, 20]) };
    const e = { name: 'barB', type: 'misc', sequence: DNA60 };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(false);
    expect(r.by).toBe('dna');
  });
});

describe('featureMatchesExisting — protein pathway (CDS/marker/reporter)', () => {
  it('exact protein → matches, by:protein, identity 1', () => {
    const c = { name: 'GFP', type: 'CDS', protein: PROT, sequence: 'ATG' };
    const e = { name: 'GFP', type: 'CDS', protein: PROT, sequence: 'GGG' };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(true);
    expect(r.by).toBe('protein');
    expect(r.identity).toBeCloseTo(1, 5);
  });

  it('fuzzy protein ≥90% (1 aa diff / 22) → matches, by:protein', () => {
    const variant = 'MKLVTYACDEFGHIKLMNPQRT'; // last S→T
    const c = { name: 'GFP', type: 'reporter', protein: variant };
    const e = { name: 'GFP', type: 'reporter', protein: PROT };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(true);
    expect(r.by).toBe('protein');
  });

  it('protein-pathway gating: stray protein on a promoter stays on DNA path', () => {
    // type=promoter is NOT a protein-pathway type → compared by DNA even
    // though a stray protein field is present (mirrors detector gating).
    const c = { name: 'P', type: 'promoter', protein: PROT, sequence: DNA60 };
    const e = { name: 'P', type: 'promoter', protein: PROT, sequence: DNA60 };
    const r = featureMatchesExisting(c, e);
    expect(r.by).toBe('dna');
    expect(r.matches).toBe(true);
  });
});

describe('featureMatchesExisting — name-collision warning', () => {
  it('same name, divergent DNA → by:name, matches:false', () => {
    const c = { name: 'KanR', type: 'misc', sequence: mutate(DNA60, [1, 7, 13, 19, 25]) };
    const e = { name: 'KanR', type: 'misc', sequence: DNA60 };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(false);
    expect(r.by).toBe('name');
  });

  it('same name, divergent protein → by:name, matches:false', () => {
    const far = 'WWWWWWWWWWWWWWWWWWWWWW'; // 22 aa, fully divergent
    const c = { name: 'AmpR', type: 'CDS', protein: far };
    const e = { name: 'AmpR', type: 'CDS', protein: PROT };
    const r = featureMatchesExisting(c, e);
    expect(r.matches).toBe(false);
    expect(r.by).toBe('name');
  });

  it('null inputs → no match, by:none', () => {
    expect(featureMatchesExisting(null, {}).by).toBe('none');
    expect(featureMatchesExisting({}, null).by).toBe('none');
  });
});
