/**
 * gene-parser.js — frame-aware ab-initio gene parser (AUGUSTUS-style DP).
 *
 * The per-intron greedy decoder (gene-model.js) cannot assemble several closely
 * spaced short introns: the correct set is coherent only AS A WHOLE (only the
 * full set restores the reading frame), and scoring introns independently makes
 * a single long "merged" intron win on ORF gain. Real fungal genes (e.g. glaA,
 * 4 introns of ~55–75 bp) defeat it.
 *
 * This module instead threads the READING FRAME through the sequence with a
 * dynamic program. A parse is: a start ATG → alternating exons / GT-AG introns
 * → a stop codon, where the spliced CDS has NO internal stop codon. Introns are
 * scored by the supplied splice scorer (CNN or PWM). The objective is primarily
 * the CODING LENGTH of the spliced CDS (each exon base rewarded) — i.e. the
 * longest stop-free ORF reachable via GT-AG splicing — with the splice score a
 * tie-breaker and a per-intron penalty against over-splicing. This content-first
 * objective is what gene finders use, and it is essential when the splice SIGNAL
 * is weak: the vertebrate-insect CNN under-scores fungal acceptors (often
 * negative), so a score-only objective can't see real fungal introns, but
 * "splice out exactly the stop-containing regions to maximise clean coding" can.
 * Every intron must use real GT-AG sites AND keep the frame stop-free, so the
 * parser keeps coding exons (deleting one loses coding length) and rejects
 * premature acceptors (they break the frame). Organism = length prior + gate.
 *
 * State: (genomic position i, partial codon pc) where pc ∈ {'', 1 base, 2 bases}
 * is the CDS codon under construction. The partial codon is carried ACROSS an
 * intron (the frame continues), which is what lets a codon straddle a splice
 * junction. 21 pc values → small constant per position.
 *
 * Returns introns as {start, end} with start = donor G (intron first base) and
 * end = acceptor G + 1 (half-open) — the same convention as intron-detect.
 */

const BASE = { A: 0, C: 1, G: 2, T: 3 };
const STOPS = new Set(['TAA', 'TAG', 'TGA']);
const NEG = -Infinity;

/**
 * Organism presets — the parser is content-first (coding length) with a splice
 * signal; the organism mostly sets the INTRON-LENGTH prior + bounds and the site
 * gate. The vertebrate-insect CNN under-scores fungal acceptors, so fungi use a
 * low gate and lean on the coding model. Tuned/validated on real fungal genes
 * (T. reesei cbh1, A. niger glaA); other presets are reasonable defaults.
 */
export const ORGANISM_PRESETS = {
  fungi: { scoreGate: 0, codingReward: 0.3, spliceWeight: 1, intronPenalty: 20, lenMean: 65, lenWeight: 8, minIntron: 35, maxIntron: 1000, minPeakScore: 15 },
  plant: { scoreGate: 0, codingReward: 0.3, spliceWeight: 1, intronPenalty: 20, lenMean: 120, lenWeight: 5, minIntron: 40, maxIntron: 5000, minPeakScore: 15 },
  vertebrate: { scoreGate: 2, codingReward: 0.3, spliceWeight: 1, intronPenalty: 24, lenMean: 1000, lenWeight: 2, minIntron: 40, maxIntron: 50000, minPeakScore: 15 },
  invertebrate: { scoreGate: 2, codingReward: 0.3, spliceWeight: 1, intronPenalty: 22, lenMean: 200, lenWeight: 3, minIntron: 40, maxIntron: 20000, minPeakScore: 15 },
  generic: { scoreGate: 0, codingReward: 0.3, spliceWeight: 1, intronPenalty: 20, lenMean: 150, lenWeight: 4, minIntron: 35, maxIntron: 10000, minPeakScore: 15 },
};

/**
 * Parse the best gene on EITHER strand. Returns the winning strand's introns in
 * FORWARD coordinates (start = donor G, end = acceptor G + 1, half-open).
 * @param {string} seq
 * @param scorer  splice scorer (CNN or PWM)
 * @param {(s:string)=>string} reverseComplement
 * @param {object} [opts] organism preset opts (see ORGANISM_PRESETS) for parseGene.
 */
export function parseGeneBothStrands(seq, scorer, reverseComplement, opts = {}) {
  const s = String(seq || '').toUpperCase();
  const n = s.length;
  const fwd = parseGene(s, scorer, opts);
  const rev = parseGene(reverseComplement(s), scorer, opts);
  const useRev = rev.score > fwd.score + 1e-9;
  const ch = useRev ? rev : fwd;
  const strand = useRev ? -1 : 1;
  const introns = ch.introns
    .map((it) => (useRev ? { start: n - it.end, end: n - it.start, score: it.score } : it))
    .sort((a, b) => a.start - b.start);
  // The winning strand's CDS span (ATG…stop), mapped back to FORWARD coords —
  // a reverse interval [a,b) becomes [n−b, n−a), the same flip applied to the
  // introns above. Lets the annotator emit a translatable `gene` region so the
  // mature spliced protein renders on the AA track.
  const noGene = ch.cdsStart < 0;
  const cdsStart = noGene ? -1 : (useRev ? n - ch.cdsEnd : ch.cdsStart);
  const cdsEnd = noGene ? -1 : (useRev ? n - ch.cdsStart : ch.cdsEnd);
  return { strand, introns, score: ch.score, cdsStart, cdsEnd };
}

// encode a partial codon ('' | 'X' | 'XY') → 0..20
function pcEnc(pc) {
  if (pc === '') return 0;
  if (pc.length === 1) return 1 + BASE[pc];
  return 5 + BASE[pc[0]] * 4 + BASE[pc[1]];
}
function pcDec(e) {
  if (e === 0) return '';
  if (e < 5) return 'ACGT'[e - 1];
  const t = e - 5;
  return 'ACGT'[t >> 2] + 'ACGT'[t & 3];
}

/**
 * @param {string} seq   one strand, uppercase A/C/G/T (others break the frame).
 * @param {(s:string)=>{donors:Array<{pos,score}>, acceptors:Array<{pos,score}>}} scorer
 * @param {object} [opts] minIntron(20)/maxIntron(50000)/scoreGate(14 combined
 *   per intron)/intronPenalty(0)/lenMean(null)/lenWeight(0)/minScore(0 accept gate).
 * @returns {{introns:Array<{start,end,score}>, score:number, cdsStart:number,
 *            cdsEnd:number, splicedLen:number}}  empty introns ⇒ no gene found.
 */
export function parseGene(seq, scorer, opts = {}) {
  const s = String(seq || '').toUpperCase();
  const n = s.length;
  const minIntron = opts.minIntron ?? 20;
  const maxIntron = opts.maxIntron ?? 50000;
  const gate = opts.scoreGate ?? 14;
  const codingReward = opts.codingReward ?? 0; // reward per coding (exon) base — content model
  const intronPenalty = opts.intronPenalty ?? 0; // cost per intron (against over-splicing)
  const spliceWeight = opts.spliceWeight ?? 1; // weight of the splice-site signal
  const lenMean = opts.lenMean ?? null;
  const lenWeight = opts.lenWeight ?? 0;
  const minScore = opts.minScore ?? 0;
  // a real gene anchors on ≥1 genuinely strong splice site; pure-random parses
  // (all sites weak) are rejected. 0 disables.
  const minPeakScore = opts.minPeakScore ?? 0;
  const empty = { introns: [], score: 0, cdsStart: -1, cdsEnd: -1, splicedLen: 0 };
  if (n < 6) return empty;

  const { donors, acceptors } = scorer(s);
  const donorAt = new Map();
  for (const d of donors) if (!donorAt.has(d.pos) || d.score > donorAt.get(d.pos)) donorAt.set(d.pos, d.score);
  const acceptorAt = new Map();
  for (const a of acceptors) if (!acceptorAt.has(a.pos) || a.score > acceptorAt.get(a.pos)) acceptorAt.set(a.pos, a.score);
  const accPos = [...acceptorAt.keys()].sort((x, y) => x - y);
  const lower = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };

  // dp[i][e] = best total score reaching position i (next base = s[i]) with
  // partial codon e; back[i][e] = predecessor + optional intron used.
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(21).fill(NEG));
  const back = Array.from({ length: n + 1 }, () => new Array(21).fill(null));
  // start: every contiguous ATG begins a CDS (ATG = first codon, Met)
  for (let i = 0; i + 3 <= n; i++) {
    if (s[i] === 'A' && s[i + 1] === 'T' && s[i + 2] === 'G' && dp[i + 3][0] < 0) {
      dp[i + 3][0] = 0;
      back[i + 3][0] = { start: i };
    }
  }

  let bestScore = NEG;
  let bestBack = null; // {pi, ppc} state from which the stop codon completes
  for (let i = 0; i <= n; i++) {
    for (let e = 0; e < 21; e++) {
      const sc = dp[i][e];
      if (sc === NEG) continue;
      const pc = pcDec(e);
      // (a) extend the exon by one coding base (rewarded — the content model)
      if (i < n) {
        const c = s[i];
        if (c in BASE) {
          const np = pc + c;
          const ex = sc + codingReward;
          if (np.length === 3) {
            if (STOPS.has(np)) {
              if (ex > bestScore) { bestScore = ex; bestBack = { pi: i, ppc: e }; } // gene end (stop is coding)
            } else if (dp[i + 1][0] < ex) {
              dp[i + 1][0] = ex; back[i + 1][0] = { pi: i, ppc: e };
            }
          } else {
            const ne = pcEnc(np);
            if (dp[i + 1][ne] < ex) { dp[i + 1][ne] = ex; back[i + 1][ne] = { pi: i, ppc: e }; }
          }
        }
      }
      // (b) open an intron at a donor (G of GT at i); jump to each acceptor
      if (donorAt.has(i)) {
        const ds = donorAt.get(i);
        let k = lower(accPos, i + minIntron - 1); // intron len = q - i + 1
        for (; k < accPos.length; k++) {
          const q = accPos[k];
          const len = q - i + 1;
          if (len > maxIntron) break;
          if (len < minIntron) continue;
          const comb = ds + acceptorAt.get(q);
          if (comb < gate) continue;
          const lp = lenMean ? lenWeight * Math.abs(Math.log2(len / lenMean)) : 0;
          const w = sc + spliceWeight * comb - intronPenalty - lp;
          const tgt = q + 1; // exon resumes after the acceptor; frame (pc) preserved
          if (tgt <= n && dp[tgt][e] < w) { dp[tgt][e] = w; back[tgt][e] = { pi: i, ppc: e, intron: [i, q] }; }
        }
      }
    }
  }

  if (bestBack === null || bestScore < minScore) return empty;
  // backtrack: collect introns from the winning stop state to its ATG start
  const introns = [];
  let cur = bestBack;
  let cdsStart = -1;
  // first hop: the stop codon completed from state (bestBack.pi, bestBack.ppc)
  let node = back[cur.pi][cur.ppc];
  let pi = cur.pi; let ppc = cur.ppc;
  // walk predecessors
  let guard = 0;
  while (node && guard++ < n + 5) {
    if (node.intron) introns.push({ start: node.intron[0], end: node.intron[1] + 1 });
    if (node.start !== undefined) { cdsStart = node.start; break; }
    const npi = node.pi; const nppc = node.ppc;
    node = back[npi][nppc];
    pi = npi; ppc = nppc;
  }
  introns.reverse();
  // attach the per-intron splice scores for display
  let peak = -Infinity;
  for (const it of introns) {
    const d = donorAt.get(it.start); const a = acceptorAt.get(it.end - 1);
    it.score = Math.round(((d ?? 0) + (a ?? 0)) * 100) / 100;
    if (it.score > peak) peak = it.score;
  }
  // reject a parse with no strong anchoring intron (random-DNA guard)
  if (introns.length && peak < minPeakScore) return empty;
  return {
    introns,
    score: bestScore,
    cdsStart,
    cdsEnd: bestBack.pi + 1, // stop codon's last base + 1
    splicedLen: 0,
  };
}
