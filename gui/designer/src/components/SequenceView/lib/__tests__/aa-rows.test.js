/**
 * aa-rows.test.js — buildCdsAARows, the 'single'-strategy AA row builder
 * extracted from AATrack.jsx and made splice-aware (Phase B).
 *
 * When a translatable region carries introns, the row map must hold the spliced
 * protein: intronic stops vanish, codons are numbered by mature-mRNA index, and
 * each amino acid anchors on its genomic middle base (skipping the intron gap).
 * A region with no introns must take the unchanged contiguous path.
 */
import { describe, it, expect } from 'vitest';
import { buildCdsAARows } from '../aa-rows';

const EXON1 = 'ATGGCGAAAGCGGCGAAAGCGGCGAAAGCG'; // 30nt, starts ATG
const INTRON = 'GTATAAGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCGGCGAAAGCAG';
const EXON2 = 'GCGAAAGCGGCGAAAGCGGCGAAAGCGTAA'; // 30nt, ends TAA
const GENOMIC = EXON1 + INTRON + EXON2;
const E1 = EXON1.length;
const EX2_G = E1 + INTRON.length; // genomic start of exon2
const GLEN = GENOMIC.length;

// the row that holds the translated CDS — it has the start methionine
function cdsRow(rows) {
  return rows.find((r) => [...r.map.values()].some((c) => c.isStart && c.aa === 'M'));
}

describe('buildCdsAARows — spliced CDS (intron inside)', () => {
  const cds = { id: 'cds1', type: 'CDS', level: 'region', start: 0, end: GLEN, strand: 1 };
  const intron = { id: 'i1', type: 'intron', level: 'region', start: E1, end: EX2_G, strand: 1 };
  const rows = buildCdsAARows(GENOMIC, [cds, intron], []);
  const row = cdsRow(rows);
  const recs = [...row.map.entries()].map(([position, c]) => ({ position, ...c }));

  it('translates the mature spliced protein (20 codons)', () => {
    expect(recs).toHaveLength(20);
    expect(recs.every((c) => c.spliced === true && c.regionId === 'cds1')).toBe(true);
  });

  it('has a single stop — the terminal one at the gene end, numbered 20', () => {
    const stops = recs.filter((c) => c.isStop);
    expect(stops).toHaveLength(1);
    // terminal codon spans [GLEN-3, GLEN); its middle base is GLEN-2
    expect(stops[0]).toMatchObject({ position: GLEN - 2, aaIndex: 20 });
  });

  it('places no amino acid inside the intron gap', () => {
    expect(recs.some((c) => c.position >= E1 && c.position < EX2_G)).toBe(false);
  });

  it('numbers amino acids by spliced index across the intron', () => {
    const c11 = recs.find((c) => c.aaIndex === 11); // first codon of exon2
    expect(c11.position).toBe(EX2_G + 1);
  });
});

describe('buildCdsAARows — terminal cut extends the gene to the rез (Игорь 22.06)', () => {
  const noStop = `ATG${'GCG'.repeat(9)}`; // 30 nt, M + 9×Ala, no internal stop
  const cdsClip = {
    id: 'gx', type: 'CDS', level: 'region', start: 0, end: 24, strand: 1,
  }; // annotated end clipped at 24 (6 bp short of the 30 bp terminus)
  const size = (rows) => rows.reduce((n, r) => n + r.map.size, 0);

  it('right cut → translates past the clipped end to the last full codon at seqLen', () => {
    expect(size(buildCdsAARows(noStop, [cdsClip], []))).toBe(8); // [0,24) = 8 codons
    expect(size(buildCdsAARows(noStop, [cdsClip], [], { terminalCut: { right: true } }))).toBe(10); // → [0,30)
  });

  it('no terminal cut → gene ends where annotated (no extension)', () => {
    expect(size(buildCdsAARows(noStop, [cdsClip], [], { terminalCut: { right: false } })))
      .toBe(size(buildCdsAARows(noStop, [cdsClip], [])));
  });

  it('a gene far from the terminus is NOT extended even with a right cut', () => {
    const longer = `${noStop}${'A'.repeat(60)}`; // 90 nt; gene end 24, gap 66 > NEAR
    expect(size(buildCdsAARows(longer, [cdsClip], [], { terminalCut: { right: true } })))
      .toBe(size(buildCdsAARows(longer, [cdsClip], [])));
  });

  it('left cut → extends a REVERSE gene clipped at the origin down to position 0', () => {
    // revcomp of 'CGC'×10 = 'GCG'×10 = all Ala, no stop on the (−) strand.
    const rev = 'CGC'.repeat(10); // 30 nt
    const revClip = {
      id: 'gr', type: 'CDS', level: 'region', start: 6, end: 30, strand: -1,
    }; // clipped 6 bp from the left origin
    expect(size(buildCdsAARows(rev, [revClip], []))).toBe(8); // [6,30) = 8 codons
    expect(size(buildCdsAARows(rev, [revClip], [], { terminalCut: { left: true } }))).toBe(10); // → [0,30)
  });
});

describe('buildCdsAARows — no introns takes the contiguous path', () => {
  // A clean CDS with no internal stop, no intron annotations.
  const clean = 'ATG' + 'GCG'.repeat(8) + 'TAA'; // 30nt, M + 8×A + stop
  const cds = { id: 'c2', type: 'CDS', level: 'region', start: 0, end: clean.length, strand: 1 };
  const rows = buildCdsAARows(clean, [cds], []);
  const row = cdsRow(rows);

  it('does not flag records as spliced and starts at M', () => {
    const recs = [...row.map.values()];
    expect(recs.every((c) => c.spliced === undefined)).toBe(true);
    expect(recs.find((c) => c.isStart).aa).toBe('M');
  });
});
