/**
 * splice-sites.js — ab-initio splice-SITE scoring (literature-review §Phase-1).
 * Position-weight matrices over the canonical vertebrate consensus score every
 * GT (5' donor) and AG (3' acceptor) dinucleotide; the gene-model decoder then
 * stitches high-scoring sites into an intron/exon structure. Pure, client-side.
 *
 * This is the PWM baseline behind a stable interface — a tiny CNN (minisplice
 * port) or OpenSpliceAI-via-ONNX can drop in later returning the same shape,
 * without touching the decoder.
 *
 * Convention: a DONOR is reported at the position of the intron's first base
 * (the G of GT); an ACCEPTOR at the intron's last base (the G of AG). So an
 * intron spans [donorPos … acceptorPos] inclusive, length = acceptorPos −
 * donorPos + 1.
 *
 * Scores are log2-odds vs a 0.25 uniform background (sum over motif positions);
 * 0 ≈ background, positive = consensus-like. They are NOT probabilities — the
 * decoder compares them and thresholds; a logistic `pSite()` is offered for UI.
 */

const BG = 0.25;
const EPS = 1e-3;
const log2 = (x) => Math.log(x) / Math.LN2;

// Donor (5' splice site), 9 nt: exon[-3..-1] + intron[+1..+6]; +1/+2 = G,T
// (invariant). Vertebrate consensus frequencies {A,C,G,T} per position.
const DONOR_FREQ = [
  { A: 0.34, C: 0.36, G: 0.18, T: 0.12 }, // -3
  { A: 0.60, C: 0.13, G: 0.14, T: 0.13 }, // -2
  { A: 0.09, C: 0.03, G: 0.80, T: 0.08 }, // -1
  { A: 0.00, C: 0.00, G: 1.00, T: 0.00 }, // +1  G (required)
  { A: 0.00, C: 0.00, G: 0.00, T: 1.00 }, // +2  T (required)
  { A: 0.59, C: 0.03, G: 0.35, T: 0.03 }, // +3
  { A: 0.71, C: 0.08, G: 0.12, T: 0.09 }, // +4
  { A: 0.07, C: 0.06, G: 0.80, T: 0.07 }, // +5
  { A: 0.16, C: 0.17, G: 0.21, T: 0.46 }, // +6
];
const DONOR_EXON = 3; // bases before the GT covered by the matrix

// Acceptor (3' splice site), 12 nt of intron ending in AG: polypyrimidine
// tract … [-2]=A [-1]=G. Window is intron[-11..0] relative to the AG's G.
const ACCEPTOR_FREQ = [
  { A: 0.09, C: 0.33, G: 0.13, T: 0.45 }, // -11  pyrimidine tract …
  { A: 0.08, C: 0.34, G: 0.12, T: 0.46 }, // -10
  { A: 0.08, C: 0.35, G: 0.11, T: 0.46 }, // -9
  { A: 0.08, C: 0.35, G: 0.10, T: 0.47 }, // -8
  { A: 0.07, C: 0.36, G: 0.10, T: 0.47 }, // -7
  { A: 0.07, C: 0.36, G: 0.09, T: 0.48 }, // -6
  { A: 0.09, C: 0.34, G: 0.10, T: 0.47 }, // -5
  { A: 0.25, C: 0.30, G: 0.13, T: 0.32 }, // -4
  { A: 0.10, C: 0.42, G: 0.06, T: 0.42 }, // -3  (C/T)
  { A: 1.00, C: 0.00, G: 0.00, T: 0.00 }, // -2  A (required)
  { A: 0.00, C: 0.00, G: 1.00, T: 0.00 }, // -1  G (required)
];
const ACCEPTOR_LEN = ACCEPTOR_FREQ.length;

const odds = (freqRow, base) => log2((freqRow[base] ?? 0) + EPS) - log2(BG);

function scoreMotif(seq, start, freq) {
  let s = 0;
  for (let i = 0; i < freq.length; i++) {
    const ch = seq[start + i];
    if (ch === undefined) return null; // ran off the end
    s += odds(freq[i], ch);
  }
  return s;
}

/** Logistic squash of a log-odds score → pseudo-probability for UI/thresholds. */
export function pSite(score) { return 1 / (1 + 2 ** -score); }

/**
 * Score every canonical splice site in `seq`.
 * @param {string} seq  UPPERCASE A/C/G/T (others break the local window).
 * @returns {{donors:Array<{pos:number,score:number}>, acceptors:Array<{pos:number,score:number}>}}
 *   donor.pos = index of the G in GT (intron start); acceptor.pos = index of the
 *   G in AG (intron end).
 */
export function scoreSpliceSites(seq, opts = {}) {
  const s = String(seq || '').toUpperCase();
  const n = s.length;
  const donors = [];
  const acceptors = [];
  for (let i = 0; i + 1 < n; i++) {
    if (s[i] === 'G' && s[i + 1] === 'T') {
      // motif starts DONOR_EXON before the G
      const score = scoreMotif(s, i - DONOR_EXON, DONOR_FREQ);
      if (score != null) donors.push({ pos: i, score });
    }
    if (s[i] === 'A' && s[i + 1] === 'G') {
      // acceptor reported at the G (i+1); motif ends there
      const gPos = i + 1;
      const score = scoreMotif(s, gPos - (ACCEPTOR_LEN - 1), ACCEPTOR_FREQ);
      if (score != null) acceptors.push({ pos: gPos, score });
    }
  }
  return { donors, acceptors };
}
