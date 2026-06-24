/**
 * wfa.js — exact gap-affine pairwise alignment via the Wavefront Algorithm
 * (Marco-Sola, Moure, Moreto, Espinosa, «Fast gap-affine pairwise alignment
 * using the wavefront algorithm», Bioinformatics 2021). Pure, client-side.
 *
 * Why: classic DP is O(n·m); WFA is O(n·s) where s is the optimal alignment
 * COST. For HIGH-SIMILARITY inputs (Sanger read ≈ reference, plasmid vs a
 * near-identical version) s is tiny, so WFA is dramatically faster while
 * remaining EXACT — the literature-review fast path (§A2). For divergent inputs
 * it offers no win, so the engine only routes here when a cheap divergence
 * probe says the pair is similar (see align-pairwise dispatch).
 *
 * Scope: GLOBAL alignment only (end-to-end), cost model — match 0, mismatch
 * `x` (>0), a gap of length ℓ costs `o + ℓ·e` (open charges o+e on the first
 * base, e per extension). The caller converts our similarity scoring
 * (match/mismatch/gapOpen/gapExtend) ↔ this cost model; the transform is exact
 * for global alignment (derived + fuzz-checked against Gotoh in the tests).
 *
 * Convention: diagonal k = j − i (i = bases of A consumed, j = bases of B
 * consumed); the stored offset on a diagonal is i. A is the «pattern» P, B the
 * «text» T, so alignedA gets P bases (deletions = gap in B) and alignedB gets
 * T bases (insertions = gap in A) — matching alignPairwise's A/B roles.
 */

const NONE = -1;

/**
 * @param {string} A  sequence A (pattern)
 * @param {string} B  sequence B (text)
 * @param {{x:number,o:number,e:number}} pen  positive costs (mismatch, gap-open, gap-extend)
 * @param {number} [maxCost]  abort once the optimal cost would exceed this
 *   (divergent pair — WFA loses its edge; caller falls back to banded DP).
 *   Returns { aborted:true } in that case.
 * @returns {{cost:number, alignedA:string, alignedB:string, aborted?:boolean}}
 */
export function wfaGlobal(A, B, pen, maxCost = Infinity) {
  const P = A;
  const T = B;
  const n = P.length;
  const m = T.length;
  const { x, o, e } = pen;
  const SZ = n + m + 1;          // diagonal k ∈ [−n, m] → index k + n ∈ [0, n+m]
  const off = (k) => k + n;
  const kEnd = m - n;            // the diagonal of the end cell (i=n, j=m)

  // Edge case: an empty sequence → one full terminal gap (single run).
  if (n === 0 || m === 0) {
    const len = Math.max(n, m);
    const cost = len ? o + len * e : 0;
    return {
      cost,
      alignedA: n === 0 ? '-'.repeat(m) : P,
      alignedB: m === 0 ? '-'.repeat(n) : T,
    };
  }

  const extend = (i0, k) => {
    let i = i0;
    let j = i + k;
    while (i < n && j < m && P[i] === T[j]) { i += 1; j += 1; }
    return i;
  };
  const inRange = (i, k) => i >= 0 && i <= n && i + k >= 0 && i + k <= m;

  const newLayer = () => ({
    M: new Int32Array(SZ).fill(NONE),
    I: new Int32Array(SZ).fill(NONE),
    D: new Int32Array(SZ).fill(NONE),
  });

  const wf = [newLayer()];
  wf[0].M[off(0)] = extend(0, 0);

  const reached = (lay) => lay && lay.M[off(kEnd)] === n;

  let s = 0;
  while (!reached(wf[s])) {
    s += 1;
    if (s > maxCost) return { aborted: true, cost: Infinity, alignedA: '', alignedB: '' };
    const cur = newLayer();
    wf[s] = cur;
    const loM = s - o - e >= 0 ? wf[s - o - e] : null; // gap-open source (from M)
    const lge = s - e >= 0 ? wf[s - e] : null;         // gap-extend source (from I/D)
    const lmm = s - x >= 0 ? wf[s - x] : null;         // mismatch source (from M)
    for (let k = -n; k <= m; k++) {
      const kk = off(k);
      const kkPrev = k - 1 >= -n ? off(k - 1) : -1;
      const kkNext = k + 1 <= m ? off(k + 1) : -1;

      // Insertion — gap in A (consume B): diagonal k−1 → k, offset (i) unchanged.
      let iI = NONE;
      if (kkPrev >= 0) {
        const a1 = loM ? loM.M[kkPrev] : NONE;
        const a2 = lge ? lge.I[kkPrev] : NONE;
        iI = Math.max(a1, a2);
      }
      if (!inRange(iI, k)) iI = NONE;

      // Deletion — gap in B (consume A): diagonal k+1 → k, offset (i) +1.
      let iD = NONE;
      if (kkNext >= 0) {
        const b1 = loM ? loM.M[kkNext] : NONE;
        const b2 = lge ? lge.D[kkNext] : NONE;
        iD = Math.max(b1 >= 0 ? b1 + 1 : NONE, b2 >= 0 ? b2 + 1 : NONE);
      }
      if (!inRange(iD, k)) iD = NONE;

      cur.I[kk] = iI;
      cur.D[kk] = iD;

      // Match/mismatch: a mismatch step from M_{s−x}[k] (offset +1), or close a
      // gap opened this score (I/D on this layer); then free-extend matches.
      const cM = lmm ? lmm.M[kk] : NONE;
      let iM = Math.max(cM >= 0 ? cM + 1 : NONE, iI, iD);
      if (iM >= 0 && inRange(iM, k)) iM = extend(iM, k); else iM = NONE;
      cur.M[kk] = iM;
    }
  }

  // ── Traceback ───────────────────────────────────────────────────────────
  const aOut = [];
  const bOut = [];
  let cs = s;
  let ck = kEnd;
  let comp = 'M';
  let ci = n; // current offset (i)

  // guard against pathological non-termination
  for (let guard = 0; guard < (n + m + s) * 4 + 16; guard++) {
    if (comp === 'M') {
      const lmm = cs - x >= 0 ? wf[cs - x] : null;
      const cM = lmm ? lmm.M[off(ck)] : NONE;
      const iI = wf[cs].I[off(ck)];
      const iD = wf[cs].D[off(ck)];
      const pre = cs === 0 ? 0 : Math.max(cM >= 0 ? cM + 1 : NONE, iI, iD);
      // un-extend the matched run pre..ci (diagonal columns)
      let i = ci;
      while (i > pre) { aOut.push(P[i - 1]); bOut.push(T[(i - 1) + ck]); i -= 1; }
      ci = pre;
      if (cs === 0 && ck === 0 && ci === 0) break;
      if (cM >= 0 && cM + 1 === pre) {
        // mismatch column
        aOut.push(P[ci - 1]); bOut.push(T[(ci - 1) + ck]);
        ci -= 1; cs -= x; comp = 'M';
      } else if (iI === pre) {
        comp = 'I';
      } else {
        comp = 'D';
      }
    } else if (comp === 'I') {
      // insertion: emit gap in A vs T base at j−1 = (ci+ck)−1
      aOut.push('-'); bOut.push(T[(ci + ck) - 1]);
      const loM = cs - o - e >= 0 ? wf[cs - o - e] : null;
      const a1 = loM ? loM.M[off(ck - 1)] : NONE;
      ck -= 1;
      if (a1 === ci && cs - o - e >= 0) { cs -= (o + e); comp = 'M'; } else { cs -= e; comp = 'I'; }
    } else { // 'D'
      // deletion: emit P base at i−1 vs gap in B
      aOut.push(P[ci - 1]); bOut.push('-');
      const loM = cs - o - e >= 0 ? wf[cs - o - e] : null;
      const b1 = loM ? loM.M[off(ck + 1)] : NONE;
      ci -= 1; ck += 1;
      if (b1 === ci && cs - o - e >= 0) { cs -= (o + e); comp = 'M'; } else { cs -= e; comp = 'D'; }
    }
  }

  aOut.reverse();
  bOut.reverse();
  return { cost: s, alignedA: aOut.join(''), alignedB: bOut.join('') };
}

/**
 * Convert our similarity scoring (match/mismatch/gapOpen/gapExtend, where the
 * latter three are ≤ 0) to the WFA cost model, run WFA, and recover the
 * similarity SCORE. Exact for GLOBAL alignment. Returns null when the transform
 * isn't integer-clean (odd `match`) so the caller falls back to Gotoh.
 *
 *   x = match − mismatch ; o = gapExtend − gapOpen ; e = match/2 − gapExtend
 *   score = match·(|A|+|B|)/2 − cost
 */
export function wfaAlignByScore(A, B, scoring, maxCost = Infinity) {
  const { match, mismatch, gapOpen, gapExtend } = scoring;
  // WFA indexes wavefronts by integer score, so every penalty must be an
  // integer (and `match` even, for match/2). Otherwise decline → Gotoh.
  if (![match, mismatch, gapOpen, gapExtend].every(Number.isInteger)) return null;
  if (match % 2 !== 0) return null; // keep WFA costs integral
  const x = match - mismatch;
  const o = gapExtend - gapOpen;
  const e = match / 2 - gapExtend;
  if (x <= 0 || e <= 0 || o < 0) return null; // outside WFA's positive-cost model
  // The product only routes WFA where it equals Gotoh (coincidence regime,
  // 2e ≥ x); outside it WFA's relaxed model could differ, so decline.
  if (2 * e < x) return null;
  const res = wfaGlobal(A, B, { x, o, e }, maxCost);
  if (res.aborted) return null;
  const score = (match * (A.length + B.length)) / 2 - res.cost;
  return { score, alignedA: res.alignedA, alignedB: res.alignedB, cost: res.cost };
}
