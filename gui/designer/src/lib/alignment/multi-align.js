/**
 * multi-align — align N reads to one reference and aggregate per reference
 * column into a consensus (Игорь: «множественные чтения → консенсус,
 * обязательно»). The pairwise engine (`align-pairwise`) is reused per read; this
 * layer maps each read onto reference coordinates (`align-to-reference`) and
 * votes per column.
 *
 * The consensus is shaped like `readByRefPos` so it renders through the SAME
 * AlignmentReadTrack as an ordinary read (one «консенсус» row).
 */
import { alignPairwise } from './align-pairwise';
import { buildAlignToReference } from './align-to-reference';

// IUPAC degeneracy codes — a tie between bases is the proper ambiguity code
// (Игорь: «консенсус использует N, тогда как есть по IUPAC S и др.»). N stays
// for a 4-way tie / unknown bases only.
const IUPAC = {
  A: 'A', C: 'C', G: 'G', T: 'T',
  AG: 'R', CT: 'Y', CG: 'S', AT: 'W', GT: 'K', AC: 'M',
  CGT: 'B', AGT: 'D', ACT: 'H', ACG: 'V', ACGT: 'N',
};
function iupacCode(bases) {
  const key = [...new Set(bases)].filter((b) => 'ACGT'.includes(b)).sort().join('');
  return IUPAC[key] || 'N';
}

// Phred quality → vote weight = P(base is correct) = 1 − 10^(−Q/10)
// (литобзор §A4; Ewing & Green 1998). A high-quality base outvotes several
// low-quality ones, instead of one-read-one-vote. Reads without a quality
// track get DEFAULT_PHRED, so the weighting reduces EXACTLY to count-voting
// when no qualities are present (backward-compatible).
const DEFAULT_PHRED = 20; // ~99% accuracy
export function phredToWeight(q) {
  const Q = Math.max(0, Math.min(93, Number.isFinite(q) ? q : DEFAULT_PHRED));
  return 1 - 10 ** (-Q / 10);
}

/**
 * Align each read to the reference. Reads that fail to align are dropped.
 * @returns Array<{id,name,result,alignToRef,strand}>
 */
export function alignReadsToReference(refSeq, reads, settings = {}) {
  const ref = refSeq || '';
  const out = [];
  for (const rd of reads || []) {
    if (!rd || !rd.sequence) continue;
    try {
      const result = alignPairwise(ref, rd.sequence, { ...settings });
      const alignToRef = buildAlignToReference(result);
      // Phred track: a raw read may carry it directly, a Sanger trace via its
      // parsed chromatogram (PCON). Quality must index the SAME orientation the
      // aligner used — a reverse hit aligned revcomp(read), whose base i is
      // original base (len−1−i) — so it's reversed for reverse-strand hits.
      const rawQ = Array.isArray(rd.qualities)
        ? rd.qualities
        : (Array.isArray(rd.chromatogram?.qualities) ? rd.chromatogram.qualities : null);
      let qualities = rawQ;
      if (qualities && result.strand === 'reverse') qualities = qualities.slice().reverse();
      out.push({ id: rd.id, name: rd.name, result, alignToRef, strand: result.strand, qualities });
    } catch {
      // a read that can't be aligned is simply omitted from the pile-up
    }
  }
  return out;
}

/**
 * Vote per reference column across the aligned reads.
 * @returns { byRefPos: {pos -> {base,depth,agree,status,bi}}, refLen, maxDepth }
 */
export function buildConsensus(refSeq, perRead) {
  const ref = (refSeq || '').toUpperCase();
  const refLen = ref.length;
  const byRefPos = {};
  let maxDepth = 0;
  for (let p = 0; p < refLen; p++) {
    const weight = {}; // base → summed Phred weight (drives the winner)
    const counts = {}; // base → raw read count (depth / agree display)
    let depth = 0;
    let totalW = 0;
    for (const pr of perRead) {
      const r = pr.alignToRef && pr.alignToRef.readByRefPos[p];
      if (!r || !r.base || r.base === '-') continue;
      const b = r.base.toUpperCase();
      const q = (Array.isArray(pr.qualities) && r.bi != null && r.bi >= 0 && r.bi < pr.qualities.length)
        ? pr.qualities[r.bi]
        : undefined; // out-of-range / missing → DEFAULT_PHRED (don't fabricate a bogus index)
      const w = phredToWeight(q);
      weight[b] = (weight[b] || 0) + w;
      counts[b] = (counts[b] || 0) + 1;
      depth += 1;
      totalW += w;
    }
    if (depth === 0) continue;
    if (depth > maxDepth) maxDepth = depth;

    const EPS = 1e-9;
    let bestW = -1;
    for (const b of Object.keys(weight)) if (weight[b] > bestW) bestW = weight[b];
    const winners = Object.keys(weight).filter((b) => weight[b] > EPS && bestW - weight[b] <= EPS);

    let base;
    let agree;
    if (winners.length === 0) {
      // every contributing base had Q≈0 (pure noise) → fall back to raw counts.
      let bestN = 0;
      for (const b of Object.keys(counts)) if (counts[b] > bestN) bestN = counts[b];
      const top = Object.keys(counts).filter((b) => counts[b] === bestN);
      base = top.length === 1 ? top[0] : iupacCode(top);
      agree = bestN;
    } else if (winners.length === 1) {
      base = winners[0];
      agree = counts[base];
    } else {
      // weighted tie → IUPAC degeneracy code; report the best-supported count.
      base = iupacCode(winners);
      agree = Math.max(...winners.map((b) => counts[b]));
    }
    byRefPos[p] = {
      base,
      depth,
      agree,
      status: base === ref[p] ? 'match' : 'mismatch',
      bi: null,
      // weighted agreement fraction (1 = unanimous high-quality); drives UI later.
      confidence: totalW > 0 ? Math.round((bestW / totalW) * 1000) / 1000 : 0,
    };
  }
  return { byRefPos, refLen, maxDepth };
}

/**
 * Full multi-read alignment: per-read mappings + consensus + headline stats.
 */
export function buildMultiAlign(refSeq, reads, settings = {}) {
  const perRead = alignReadsToReference(refSeq, reads, settings);
  const consensus = buildConsensus(refSeq, perRead);
  const covered = Object.keys(consensus.byRefPos).length;
  const mismatches = Object.values(consensus.byRefPos).filter((c) => c.status === 'mismatch').length;
  const coverage = consensus.refLen > 0 ? (covered / consensus.refLen) * 100 : 0;
  return {
    perRead,
    consensus,
    stats: {
      reads: perRead.length,
      coverage,
      coveredColumns: covered,
      consensusMismatches: mismatches,
      maxDepth: consensus.maxDepth,
    },
  };
}
