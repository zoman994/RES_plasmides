/**
 * feature-detection-merge-v134.test.js — a local edit (substituted codon /
 * small indel) inside an incomplete feature fragment must NOT split it into
 * two `_part_` rows. `mergeCollinearPartials` glues collinear pieces of one
 * feature across a small gap (BOTH featureGap AND targetGap ≤
 * PARTIAL_MERGE_MAX_GAP); an honest large insertion (≥30 nt) stays split.
 *
 * Биолог (Игорь, приёмка partial 31.05): неполный фрагмент sfGFP с одним
 * заменённым кодоном выходил двумя огрызками вместо `superfolder GFP_part_7-684`.
 */
import { describe, it, expect } from 'vitest';
import { detectCommonFeatures, mergeCollinearPartials, PARTIAL_MERGE_MAX_GAP } from '../feature-detection';
import realDB from '../../public/common-features.json';

const feat = { name: 'GFP', type: 'reporter', length: 714 };

function piece(featureStart, featureEnd, start, end, identity = 1.0, strand = 1) {
  return {
    start, end, strand, identity,
    coverage: (featureEnd - featureStart) / feat.length,
    featureStart, featureEnd,
  };
}

describe('mergeCollinearPartials (V134) — unit', () => {
  it('PARTIAL_MERGE_MAX_GAP is 18', () => {
    expect(PARTIAL_MERGE_MAX_GAP).toBe(18);
  });

  it('single-codon (3 nt) feature-gap + small target-gap → one merged span', () => {
    const a = piece(6, 300, 106, 400);    // feature[6,300)  target[106,400)
    const b = piece(303, 684, 403, 784);  // gap 3 in BOTH feature and target
    const merged = mergeCollinearPartials([a, b], feat);
    expect(merged).toHaveLength(1);
    expect(merged[0].featureStart).toBe(6);   // → «GFP_part_7-684»
    expect(merged[0].featureEnd).toBe(684);
    expect(merged[0].start).toBe(106);
    expect(merged[0].end).toBe(784);
    expect(merged[0].coverage).toBeCloseTo((684 - 6) / 714, 5);
    // ~one substituted codon over 678 nt → high but <1
    expect(merged[0].identity).toBeGreaterThan(0.95);
    expect(merged[0].identity).toBeLessThanOrEqual(1);
  });

  it('large target-gap (90 nt honest insertion) → stays two pieces', () => {
    const a = piece(0, 300, 0, 300);
    const b = piece(303, 603, 390, 690);  // featureGap 3 (ok), targetGap 90 (>18)
    expect(mergeCollinearPartials([a, b], feat)).toHaveLength(2);
  });

  it('two distant copies of one feature → stays two (huge target-gap)', () => {
    const a = piece(0, 700, 0, 700);
    const b = piece(0, 700, 5000, 5700);
    expect(mergeCollinearPartials([a, b], feat)).toHaveLength(2);
  });

  it('opposite strands never merge', () => {
    const a = piece(0, 300, 0, 300, 1.0, 1);
    const b = piece(303, 603, 303, 603, 1.0, -1);
    expect(mergeCollinearPartials([a, b], feat)).toHaveLength(2);
  });

  it('three collinear pieces across small gaps collapse to one', () => {
    const a = piece(0, 200, 0, 200);
    const b = piece(206, 400, 206, 400);   // gap 6
    const c = piece(403, 600, 403, 600);   // gap 3
    const merged = mergeCollinearPartials([a, b, c], feat);
    expect(merged).toHaveLength(1);
    expect(merged[0].featureStart).toBe(0);
    expect(merged[0].featureEnd).toBe(600);
  });

  it('single piece passes through unchanged', () => {
    const a = piece(0, 300, 0, 300);
    const merged = mergeCollinearPartials([a], feat);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ featureStart: 0, featureEnd: 300, start: 0, end: 300 });
  });
});

// ── Integration: real detector path on a small mock DB ──────────────────────
const ORI_DNA = 'AAAGGATCTTCTTGAGATCCTTTTTTTCTGCGCGTAATCTGCTGCTTGCAAACAAAAAAACCACCGCTACCAGCGGTGGTTTGTTTGCCGGATCAAGAGCTACCAACTCTTTTTCCGAAGGTAACTGGCTTCAGCAGAGCGCAGATACCAAATACTGTTCTTCTAGTGTAGCCGTAGTTAGGCCACCACTTCAAGAACTCTGTAG';

const mockDB = {
  version: '2.0',
  features: [
    { name: 'ori', type: 'rep_origin', sequence: ORI_DNA, protein: null, length: ORI_DNA.length, description: 'pMB1 ori' },
  ],
};

describe('detectCommonFeatures merge (V134) — integration', () => {
  const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
  const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
  const mid = Math.floor(ORI_DNA.length / 2);

  it('small insertion (6 nt) inside ori → ONE dna_partial (merged), not two', () => {
    const broken = ORI_DNA.slice(0, mid) + 'TTGGCA' + ORI_DNA.slice(mid);
    const seq = prefix + broken + suffix;
    const ori = detectCommonFeatures(seq, mockDB).filter((r) => r.feature.name === 'ori');
    expect(ori).toHaveLength(1);
    expect(ori[0].method).toBe('dna_partial');
  });

  it('large insertion (90 nt foreign DNA) inside ori → TWO dna_partial (split survives)', () => {
    const insert = 'AGCT'.repeat(23).slice(0, 90); // 90 nt, not ori-like
    const broken = ORI_DNA.slice(0, mid) + insert + ORI_DNA.slice(mid);
    const seq = prefix + broken + suffix;
    const ori = detectCommonFeatures(seq, mockDB).filter((r) => r.feature.name === 'ori');
    expect(ori).toHaveLength(2);
  });
});

// ── X-drop extend (V134 Layer 1) — symptom B (dropped sliver) + clean boundary ──
describe('extendSeedPartial X-drop (V134) — symptoms A/B in extend', () => {
  const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
  const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
  const swap = (s) => s.split('').map((c) => ({ A: 'C', C: 'A', G: 'T', T: 'G' }[c] || c)).join('');

  it('symptom B: a sub-floor sliver past a 2-codon run is NOT dropped — ONE piece, full length', () => {
    // fragment = ori[30,205) with a 6-nt (2-codon) substitution run at feature 175.
    // Head feature[30,175) holds the seeds (≈51/102/153); tail feature[181,205) is
    // 24 nt (< 50-nt floor) with NO seed. Pre-X-drop the extend breaks at the run →
    // the tail is never anchored → lost («GFP_part_…-585», голова/хвост теряется).
    // X-drop bridges the 6-nt run (score −6, well within DNA xdrop 20) → one span.
    const frag = ORI_DNA.slice(30, 175) + swap(ORI_DNA.slice(175, 181)) + ORI_DNA.slice(181, 205);
    const seq = prefix + frag + suffix;
    const ori = detectCommonFeatures(seq, mockDB).filter((r) => r.feature.name === 'ori');
    expect(ori).toHaveLength(1);
    expect(ori[0].method).toBe('dna_partial');
    expect(ori[0].featureStart).toBeLessThanOrEqual(33);   // ≈ 30 (truncated start)
    expect(ori[0].featureEnd).toBeGreaterThanOrEqual(200); // tail preserved (not ~175)
  });

  it('clean boundary (CRIT regression): truncated fragment snaps to peak — no flank overrun', () => {
    // Clean ori[0,150) truncation, no internal edits. X-drop snap-to-peak ends the
    // span at the truncation; it must NOT ride into the (random) suffix flank.
    const seq = prefix + ORI_DNA.slice(0, 150) + suffix;
    const ori = detectCommonFeatures(seq, mockDB).filter((r) => r.feature.name === 'ori');
    expect(ori).toHaveLength(1);
    expect(ori[0].featureStart).toBeLessThanOrEqual(2);
    expect(ori[0].featureEnd).toBeGreaterThanOrEqual(147);
    expect(ori[0].featureEnd).toBeLessThanOrEqual(153); // tight — no overrun into suffix
  });
});

// Protein path (reporters / CDS) — the GFP acceptance scenario Игоря.
describe('detectCommonFeatures merge (V134) — protein path (sfGFP)', () => {
  const GFP = realDB.features.find((f) => /superfolder GFP/i.test(f.name));

  it('incomplete sfGFP fragment with a 2-codon substitution → ONE protein_partial, not two', () => {
    const dna = GFP.sequence.toUpperCase();
    // Drop 90 nt each end so the full-length fuzzy verifier can't fit → partial.
    let frag = dna.slice(90, dna.length - 90);
    // Substitute 2 codons mid-fragment → splits the partial into two pre-merge.
    const mid = Math.floor(frag.length / 2);
    const swap = (c) => ({ A: 'C', C: 'A', G: 'T', T: 'G' }[c] || c);
    frag = frag.slice(0, mid) + frag.slice(mid, mid + 6).split('').map(swap).join('') + frag.slice(mid + 6);
    const seq = 'ATGCAT'.repeat(4) + frag + 'TGACATGCAT'.repeat(3); // in-frame embed
    const db = { version: realDB.version, features: [GFP] };
    const hits = detectCommonFeatures(seq, db).filter((r) => r.feature.name === GFP.name);
    expect(hits).toHaveLength(1);
    expect(hits[0].method).toBe('protein_partial');
    // one contiguous span over the fragment (≈ feature [90, 624)), not two stubs
    expect(hits[0].featureEnd - hits[0].featureStart).toBeGreaterThan(400);
    expect(hits[0].identity).toBeGreaterThan(0.90);
  });
});
