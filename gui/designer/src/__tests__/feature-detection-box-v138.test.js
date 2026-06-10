/**
 * feature-detection-box-v138.test.js — the CDS box of a protein_partial hit
 * must cover the WHOLE gene DNA, not snap to the codon grid. Биолог (Игорь, 31.05):
 * аннотатор подрезал бокс на ≤2 nt vs импорт голого сиквенса (`0..len`).
 *
 * Fix: in the protein_partial block, after the codon-grid ntStart/ntEnd, nt-refine
 * each edge outward ≤2 nt while the target still matches the feature's own DNA
 * (`feat.sequence`, strand-aware). Only protein_partial — exact/fuzzy (full gene,
 * codon-aligned) and dna_partial (already nt-precise) untouched.
 */
import { describe, it, expect } from 'vitest';
import { detectCommonFeatures } from '../feature-detection';
import { reverseComplement } from '../sequence-utils';
import realDB from '../../public/common-features.json';

const GFP = realDB.features.find((f) => /superfolder GFP/i.test(f.name));
const db = { version: realDB.version, features: [GFP] };
const DNA = GFP.sequence.toUpperCase();

const gfpHits = (seq) => detectCommonFeatures(seq, db).filter((r) => r.feature.name === GFP.name);

describe('V138 — protein_partial box covers whole gene DNA', () => {
  it('bare forward fragment cut mid-codon → box 0..len, featRange = real gene cut (not codon-grid)', () => {
    // gene[217:585]: 5′ cut mid-codon (217 % 3 = 1), 3′ codon-aligned.
    const frag = DNA.slice(217, 585); // 368 nt
    const hits = gfpHits(frag);
    expect(hits).toHaveLength(1);
    const h = hits[0];
    expect(h.method).toBe('protein_partial');
    expect(h.start).toBe(0);            // refined back from codon-grid 2
    expect(h.end).toBe(frag.length);    // 368 — whole fragment is gene DNA
    expect(h.strand).toBe(1);
    expect(h.featureStart).toBe(217);   // real cut, NOT codon-grid 219
    expect(h.featureEnd).toBe(585);
  });

  it('bare forward fragment cut mid-codon at BOTH edges → both edges refined', () => {
    const frag = DNA.slice(218, 586); // 368 nt, 218 % 3 = 2, 586 % 3 = 1
    const h = gfpHits(frag)[0];
    expect(h.method).toBe('protein_partial');
    expect(h.start).toBe(0);
    expect(h.end).toBe(frag.length);
    expect(h.featureStart).toBe(218);
    expect(h.featureEnd).toBe(586);
  });

  it('bare reverse fragment (rc) → strand -1, box 0..len, featRange correct', () => {
    const frag = reverseComplement(DNA.slice(217, 585));
    const h = gfpHits(frag)[0];
    expect(h.method).toBe('protein_partial');
    expect(h.strand).toBe(-1);
    expect(h.start).toBe(0);
    expect(h.end).toBe(frag.length);
    expect(h.featureStart).toBe(217);
    expect(h.featureEnd).toBe(585);
  });

  it('regression: full gene → exact/fuzzy box unchanged (refine does not touch it)', () => {
    const h = gfpHits(DNA)[0];
    expect(['protein_exact', 'protein_fuzzy']).toContain(h.method);
    expect(h.start).toBe(0);
    expect(h.end).toBe(DNA.length);
    expect(h.featureStart).toBeUndefined(); // partial-only field — proves not the refined path
  });

  it('regression: embedded fragment → box hugs the fragment, does NOT leak into flanks (cap 2)', () => {
    const flank = 10;
    const frag = DNA.slice(217, 585);
    const seq = 'TTTTTTTTTT' + frag + 'GGGGGGGGGG';
    const h = gfpHits(seq)[0];
    expect(h.method).toBe('protein_partial');
    // box stays within ±2 nt of the true fragment bounds [10, 10+368]
    expect(h.start).toBeGreaterThanOrEqual(flank - 2);
    expect(h.start).toBeLessThanOrEqual(flank);
    expect(h.end).toBeGreaterThanOrEqual(flank + frag.length);
    expect(h.end).toBeLessThanOrEqual(flank + frag.length + 2);
  });
});
