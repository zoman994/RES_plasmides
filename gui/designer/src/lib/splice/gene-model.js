/**
 * gene-model.js — turn per-site splice scores into a coherent intron/exon
 * structure for ONE gene (Phase 1 decoder). Two layers:
 *   1. chooseIntrons — weighted-interval-scheduling DP that picks the highest
 *      summed-score set of NON-OVERLAPPING canonical introns (GT…AG, length
 *      bounds, per-intron score gate).
 *   2. ORF coupling — the «quality» signal for a single gene: a real intron,
 *      when removed, lengthens the spliced reading frame; a spurious one
 *      shortens it. detectGeneStructure greedily drops introns that don't earn
 *      their keep under a combined (splice + ORF) objective.
 * Pure, client-side; scorer-agnostic — pass `opts.scorer` (a seq→{donors,
 * acceptors} function, e.g. the minisplice CNN) to override the PWM baseline.
 */
import { scoreSpliceSites } from './splice-sites';

const STOP = new Set(['TAA', 'TAG', 'TGA']);

/**
 * Pick non-overlapping introns maximising the selection objective.
 *
 * A flat Σ(donor+acceptor) splice sum over-calls badly: on non-gene DNA the
 * O(n²) donor×acceptor pairs yield many chance high-summing sets (measured: a
 * random 6 kb gives ~80 false introns). The fix is ORF-AWARE selection — when
 * `opts.orfScore(start,end)` is supplied (by detectGeneStructure), each
 * candidate is ranked by `splice + orfScore`, so the DP prefers boundaries whose
 * removal lengthens the reading frame (this also fixes premature-acceptor picks
 * on real genes). The per-pair combined `scoreGate` then requires genuinely
 * strong canonical sites — what random DNA lacks. `score` stays the raw splice
 * sum (for display/downstream); `sel` is the ORF-aware ranking value.
 *
 * @returns {Array<{start:number,end:number,score:number,sel:number,donorScore:number,acceptorScore:number}>}
 *   start = donor G (intron first base), end = acceptor G (intron last base), inclusive.
 */
export function chooseIntrons(donors, acceptors, opts = {}) {
  const minIntron = opts.minIntron ?? 20;
  const maxIntron = opts.maxIntron ?? 50000;
  const scoreGate = opts.scoreGate ?? 4; // min combined donor+acceptor site score
  const orfScore = typeof opts.orfScore === 'function' ? opts.orfScore : null;

  const cands = [];
  for (const d of donors) {
    for (const a of acceptors) {
      const len = a.pos - d.pos + 1;
      if (len < minIntron || len > maxIntron) continue;
      const w = d.score + a.score;
      if (w < scoreGate) continue; // strong-site gate (cheap) — runs before orfScore
      const sel = orfScore ? w + orfScore(d.pos, a.pos) : w; // ORF-aware ranking
      cands.push({ start: d.pos, end: a.pos, score: w, sel, donorScore: d.score, acceptorScore: a.score });
    }
  }
  if (!cands.length) return [];
  cands.sort((x, y) => x.end - y.end || x.start - y.start);

  // pred[i] = index of the last candidate whose end < cands[i].start (binary search).
  const pred = cands.map((c) => {
    let lo = 0; let hi = cands.length - 1; let res = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (cands[m].end < c.start) { res = m; lo = m + 1; } else hi = m - 1; }
    return res;
  });
  const best = new Array(cands.length + 1).fill(0);
  const from = new Array(cands.length + 1).fill(0);
  for (let i = 1; i <= cands.length; i++) {
    const incl = cands[i - 1].sel + best[pred[i - 1] + 1]; // maximise the ORF-aware objective
    const excl = best[i - 1];
    if (incl > excl) { best[i] = incl; from[i] = 1; } else { best[i] = excl; from[i] = 0; }
  }
  const chosen = [];
  let i = cands.length;
  while (i > 0) {
    if (from[i] === 1) { chosen.push(cands[i - 1]); i = pred[i - 1] + 1; } else { i -= 1; }
  }
  chosen.reverse();
  return chosen;
}

/** Remove intron intervals [start..end] (inclusive) and concatenate the exons. */
export function spliceOut(seq, introns) {
  if (!introns || !introns.length) return seq;
  const sorted = [...introns].sort((a, b) => a.start - b.start);
  let out = '';
  let cur = 0;
  for (const it of sorted) { out += seq.slice(cur, it.start); cur = it.end + 1; }
  out += seq.slice(cur);
  return out;
}

/** Longest ORF length in amino acids over the 3 forward frames (ATG→stop). */
export function longestOrf(seq) {
  const s = String(seq || '').toUpperCase();
  let best = 0;
  for (let f = 0; f < 3; f++) {
    let atg = -1;
    for (let i = f; i + 3 <= s.length; i += 3) {
      const cod = s.slice(i, i + 3);
      if (atg < 0) { if (cod === 'ATG') atg = i; } else if (STOP.has(cod)) { best = Math.max(best, (i - atg) / 3); atg = -1; }
    }
  }
  return best;
}

/**
 * Detect the intron/exon structure of `seq` (one strand). ORF-guided by default:
 *
 * The objective rewards the ORF GAIN from splicing — `longestOrf(spliced) −
 * longestOrf(unspliced)` — NOT the absolute spliced-ORF length. Random DNA has
 * long ORFs with zero splicing, so the old absolute term credited every chance
 * intron set; the gain term is ~0 on non-genes but large on a real gene. Three
 * coupled gates make this scorer-agnostic (PWM and CNN alike):
 *   1. a combined per-pair site gate (`scoreGate`, default 14) — real introns
 *      have strong canonical sites; chance pairs do not;
 *   2. ORF-aware selection (`orfScore` fed to chooseIntrons) — the DP prefers
 *      boundaries that lengthen the frame (fixes premature-acceptor picks);
 *   3. a relative null gate — if total ORF gain < `minOrfGain` (default 1 aa),
 *      emit nothing («this is not a spliced gene»).
 * All thresholds are opts; `orfGuided:false` disables the ORF machinery for
 * power users. minOrfGain is RELATIVE (gain>0), not an absolute aa floor, so it
 * does not penalise small genes whose exons are short.
 *
 * @returns {{introns:Array, donors:Array, acceptors:Array, splicedSeq:string,
 *            orf:number, spliceScore:number, score:number}}
 */
export function detectGeneStructure(seq, opts = {}) {
  const orfGuided = opts.orfGuided !== false;
  const orfWeight = opts.orfWeight ?? 1.0;       // weight of the ORF-gain term
  const minOrfGain = opts.minOrfGain ?? 1;       // relative null gate: splicing must help the ORF
  const scoreGate = opts.scoreGate ?? 14;        // combined site gate (raised from 4 — see header)
  const scorer = opts.scorer || scoreSpliceSites;
  const { donors, acceptors } = scorer(seq);

  const baseOrf = longestOrf(seq);
  const orfScore = orfGuided
    ? (start, end) => orfWeight * Math.max(0, longestOrf(spliceOut(seq, [{ start, end }])) - baseOrf)
    : null;
  const chosen = chooseIntrons(donors, acceptors, { ...opts, scoreGate, orfScore });

  const splScore = (set) => set.reduce((s, it) => s + it.score, 0);
  const gainOf = (set) => Math.max(0, longestOrf(spliceOut(seq, set)) - baseOrf);
  const modelScore = (set) => splScore(set) + (orfGuided ? orfWeight * gainOf(set) : 0);

  let introns = chosen;
  if (orfGuided && chosen.length) {
    let cur = chosen.slice();
    let curScore = modelScore(cur);
    let improved = true;
    while (improved && cur.length) {
      improved = false;
      let dropIdx = -1;
      let bestS = curScore;
      for (let k = 0; k < cur.length; k++) {
        const trial = cur.filter((_, j) => j !== k);
        const sc = modelScore(trial);
        if (sc > bestS) { bestS = sc; dropIdx = k; }
      }
      if (dropIdx >= 0) { cur = cur.filter((_, j) => j !== dropIdx); curScore = bestS; improved = true; }
    }
    introns = cur;
  }
  // relative null gate — a real spliced gene lengthens the reading frame; a
  // strong-site chance set that does not improve the ORF is rejected wholesale.
  if (orfGuided && introns.length && gainOf(introns) < minOrfGain) introns = [];

  const splicedSeq = spliceOut(seq, introns);
  return {
    introns,
    donors,
    acceptors,
    splicedSeq,
    orf: longestOrf(splicedSeq),
    spliceScore: splScore(introns),
    score: modelScore(introns),
  };
}
