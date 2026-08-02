/**
 * dna-linear-verify.js — the gapped-DNA linear kernel, EXACT-VERIFICATION half.
 *
 * ON THE PRODUCTION SEARCH PATH since U6-F: seq-match.js -> dna-linear-provider.js ->
 * dna-linear-kernel.js -> this module. The §4.2.0 length routing and the 100 nt approximate-search
 * limit are unchanged by that, and so are every budget and the client timeout; what changed is which
 * verifier runs behind them.
 *
 * Normative source: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.1, §2.3, §2.7, §3.2, §4.2.1(3).
 *
 * RESPONSIBILITY: given ONE candidate start, decide it exactly — Dinkelbach to the exact
 * identity maximum, the §3.2 counter comparator, and the lex-smallest traceback. Nothing here
 * proposes candidates (that is dna-linear-scan.js) and nothing here selects between
 * occurrences across starts (that is dna-linear-kernel.js). Do not mix those back in.
 *
 * Linear score <=> ratio acceptance (the hypothesis under test): M/L >= theta <=>
 * 10000*M - theta*L >= 0. With L = queryLength + D (the whole query is always aligned,
 * §2.1) this collapses to 10000*M - theta*D + const: X and I carry zero weight because they
 * only consume query and so suppress M implicitly. Maximising M/L is a fractional program,
 * solved exactly by Dinkelbach over integer (p,q)=(M*,L*).
 */

/** Cells cleared between suspensions when the suffix table is reset. */
const FILL_CHUNK = 1 << 20;

/* §3.2 comparator. endA/endB come from the caller: the raw unwrapped end in general, the
 * shared LIFTED endpoint inside a §3.2.1 bucket. Negative => a wins. */

/** Rules 1-6: all that is decidable from the counters, with no script (§4.2.1(3)). */
export function compareRules16(a, b, endA, endB) {
  const r = a.M * b.alignmentLength - b.M * a.alignmentLength;   // 1 identity, cross-mult
  if (r !== 0) return r > 0 ? -1 : 1;
  if (a.M !== b.M) return a.M > b.M ? -1 : 1;                    // 2 more M
  const ea = a.alignmentLength - a.M;                            // 3 smaller edit distance
  const eb = b.alignmentLength - b.M;
  if (ea !== eb) return ea < eb ? -1 : 1;
  if (a.gapEvents !== b.gapEvents) return a.gapEvents < b.gapEvents ? -1 : 1;  // 4
  const da = Math.abs(a.targetSpan - (a.M + a.X + a.I));         // 5 |span - queryLength|
  const db = Math.abs(b.targetSpan - (b.M + b.X + b.I));
  if (da !== db) return da < db ? -1 : 1;
  if (endA !== endB) return endA < endB ? -1 : 1;                // 6 smaller target end
  return 0;
}

/** Full 7-step §3.2 comparator; rule 7 is plain lexical order over '=','D','I','X'. */
export function compareCanonical(a, b, endA, endB) {
  const c = compareRules16(a, b, endA, endB);
  if (c !== 0) return c;
  if (a.script !== b.script) return a.script < b.script ? -1 : 1;
  return 0;
}

/* Per-start exact solver. Value key per DP cell = (S, M, -gapEvents) with S = q*M - p*D;
 * all three components are additive, which is what makes a lexicographic DP sound.
 * State = last op (0 diag, 1 I, 2 D, 3 nothing yet). Rules 1-4 fall out of this key. */

export class StartSolver {
  constructor(m, maxSpan, K) {
    const w = (maxSpan + 1) * 5;
    this.m = m;
    // Band |t - i| <= K. Exactly lossless: any ACCEPTED alignment has D <= E <= K and
    // I <= E <= K, and every optimum this DP is asked for is accepted by construction.
    this.K = K;
    this.pM = new Int32Array(w); this.pD = new Int32Array(w); this.pG = new Int32Array(w);
    this.pOk = new Uint8Array(w);
    this.cM = new Int32Array(w); this.cD = new Int32Array(w); this.cG = new Int32Array(w);
    this.cOk = new Uint8Array(w);
    this.endM = new Int32Array(maxSpan + 1);
    this.endD = new Int32Array(maxSpan + 1);
    this.endG = new Int32Array(maxSpan + 1);
    this.endOk = new Uint8Array(maxSpan + 1);
    this.sufM = null;
  }

  /**
   * Rolling prefix DP for one start; fills endM/endD/endG/endOk for t = 1..tMax (best over
   * final states {diag, I}: a trailing D is forbidden by §3.2). Returns the lex-best t or -1.
   * Stride 5: slots 0..2 = last op (diag / I / D), 3 = "nothing yet", 4 = aggregate best.
   * The diagonal delta is state-independent so it reads slot 4. For I and D the aggregate is
   * still exact: when it IS the same-run state, the +1 branch is dominated by the +0 branch.
   */
  prefix(q, ext, s, tMax, p, qq) {
    const m = this.m;
    const { pM, pD, pG, pOk, cM, cD, cG, cOk, endM, endD, endG, endOk } = this;
    const W = (tMax + 1) * 5;
    const K = this.K;
    pOk.fill(0, 0, W);
    pOk[3] = 1; pM[3] = 0; pD[3] = 0; pG[3] = 0;   // cell (0,0), state 3
    pOk[4] = 1; pM[4] = 0; pD[4] = 0; pG[4] = 0;
    for (let i = 1; i <= m; i++) {
      cOk.fill(0, 0, W);
      const qc = q[i - 1];
      const tLo = Math.max(0, i - K);
      const tHi = Math.min(tMax, i + K);
      for (let t = tLo; t <= tHi; t++) {
        const o = t * 5;
        if (t >= 1) {                                   // diagonal (= / X) from (i-1, t-1)
          const po = (t - 1) * 5 + 4;
          if (pOk[po]) {
            const tc = ext[s + t - 1];
            const isM = (tc < 4 && tc === qc) ? 1 : 0;
            this._relax(cM, cD, cG, cOk, o + 0, pM[po] + isM, pD[po], pG[po], p, qq);
          }
        }
        if (pOk[o + 1]) this._relax(cM, cD, cG, cOk, o + 1, pM[o + 1], pD[o + 1], pG[o + 1], p, qq);
        if (pOk[o + 4]) this._relax(cM, cD, cG, cOk, o + 1, pM[o + 4], pD[o + 4], pG[o + 4] + 1, p, qq);
        // deletion from (i, t-1). State 3 lives only in row 0, so the aggregate of a row
        // i >= 1 can never smuggle in a leading D (§3.2).
        if (t >= 1) {
          const lo = (t - 1) * 5;
          if (cOk[lo + 2]) this._relax(cM, cD, cG, cOk, o + 2, cM[lo + 2], cD[lo + 2] + 1, cG[lo + 2], p, qq);
          if (cOk[lo + 4]) this._relax(cM, cD, cG, cOk, o + 2, cM[lo + 4], cD[lo + 4] + 1, cG[lo + 4] + 1, p, qq);
        }
        for (let st = 0; st < 3; st++) {
          if (cOk[o + st]) this._relax(cM, cD, cG, cOk, o + 4, cM[o + st], cD[o + st], cG[o + st], p, qq);
        }
      }
      pM.set(cM.subarray(0, W)); pD.set(cD.subarray(0, W));
      pG.set(cG.subarray(0, W)); pOk.set(cOk.subarray(0, W));
    }
    let bestT = -1;
    endOk.fill(0, 0, tMax + 1);
    for (let t = Math.max(1, m - K); t <= Math.min(tMax, m + K); t++) {
      const o = t * 5;
      let bm = 0, bd = 0, bg = 0, ok = 0;
      for (let st = 0; st < 2; st++) {
        if (!pOk[o + st]) continue;
        if (!ok || this._better(pM[o + st], pD[o + st], pG[o + st], bm, bd, bg, p, qq)) {
          bm = pM[o + st]; bd = pD[o + st]; bg = pG[o + st]; ok = 1;
        }
      }
      endOk[t] = ok;
      if (!ok) continue;
      endM[t] = bm; endD[t] = bd; endG[t] = bg;
      if (bestT < 0) { bestT = t; continue; }
      if (this._better(bm, bd, bg, endM[bestT], endD[bestT], endG[bestT], p, qq)) bestT = t;
    }
    return bestT;
  }

  _better(m1, d1, g1, m2, d2, g2, p, qq) {
    const s1 = qq * m1 - p * d1;
    const s2 = qq * m2 - p * d2;
    if (s1 !== s2) return s1 > s2;
    if (m1 !== m2) return m1 > m2;
    return g1 < g2;
  }

  _relax(cM, cD, cG, cOk, idx, m1, d1, g1, p, qq) {
    if (!cOk[idx] || this._better(m1, d1, g1, cM[idx], cD[idx], cG[idx], p, qq)) {
      cM[idx] = m1; cD[idx] = d1; cG[idx] = g1; cOk[idx] = 1;
    }
  }

  /**
   * Suffix DP + forward walk taking the lex-smallest op consistent with the optimum: this
   * yields the rule-7 script without carrying strings in DP states (§4.2.1(3)). The table is
   * the ONLY rectangular allocation and exists only for a retained winner.
   */
  /**
   * RESUMABLE form. The suffix table is `(m+1) × (tEnd+1) × 4` cells and the walk crosses it once,
   * so on a long span this single call was one uninterruptible block at the very end of a search —
   * precisely where the result set, and therefore the cost, is largest. It suspends per row of the
   * fill and on a stride of the walk; `traceback` below is this generator drained, so the
   * synchronous and the cooperative paths cannot produce different scripts.
   */
  * tracebackSteps(q, ext, s, tEnd, p, qq, ctl) {
    const m = this.m;
    const W = tEnd + 1;
    const sz = (m + 1) * W * 4;
    // Charged by RECONSTRUCTION WORK, not once per occurrence: the suffix table this walk fills
    // is (m+1)x(tEnd+1), so a long span costs proportionally more and must say so. Cancellation
    // is checked here too — a traceback over a large span is heavy enough to outlive the moment
    // the user cared about the answer.
    // The suffix tables are sz = (m+1)*W*4 entries across three Int32Array and one Uint8Array,
    // i.e. 13 bytes each — real memory that the high-water mark previously ignored entirely.
    if (ctl) {
      ctl.chargeTraceback((m + 1) * W);
      ctl.noteTraceback(sz * 13);
      ctl.checkCancel();
    }
    if (!this.sufM || this.sufM.length < sz) {
      this.sufM = new Int32Array(sz); this.sufD = new Int32Array(sz);
      this.sufG = new Int32Array(sz); this.sufOk = new Uint8Array(sz);
    }
    const SM = this.sufM, SD = this.sufD, SG = this.sufG, SO = this.sufOk;
    // Clearing the reachability flags is itself proportional to the table, so it is chunked too —
    // one `fill` over a multi-megabyte view is exactly the kind of «one native call» that reads as
    // free and is not.
    for (let base = 0; base < sz; base += FILL_CHUNK) {
      if (base > 0) yield;
      SO.fill(0, base, Math.min(sz, base + FILL_CHUNK));
    }
    const at = (i, t, st) => ((i * W + t) * 4 + st);
    for (let st = 0; st < 2; st++) {          // base: (m, tEnd) reachable with final op != D
      const ix = at(m, tEnd, st);
      SM[ix] = 0; SD[ix] = 0; SG[ix] = 0; SO[ix] = 1;
    }
    if (m === 0) { const ix = at(0, tEnd, 3); SM[ix] = 0; SD[ix] = 0; SG[ix] = 0; SO[ix] = 1; }
    const put = (ix, m1, d1, g1) => {
      if (!SO[ix] || this._better(m1, d1, g1, SM[ix], SD[ix], SG[ix], p, qq)) {
        SM[ix] = m1; SD[ix] = d1; SG[ix] = g1; SO[ix] = 1;
      }
    };
    const K = this.K;
    for (let i = m; i >= 0; i--) {
      if (i < m) yield;                       // one suspension per row of the suffix fill
      const tHi = Math.min(tEnd, i + K);
      const tLo = Math.max(0, i - K);
      for (let t = tHi; t >= tLo; t--) {
        for (let st = 0; st < 4; st++) {
          if (i === m && t === tEnd) continue;
          const ix = at(i, t, st);
          if (i < m && t < tEnd) {
            const nx = at(i + 1, t + 1, 0);
            if (SO[nx]) {
              const tc = ext[s + t];
              const isM = (tc < 4 && tc === q[i]) ? 1 : 0;
              put(ix, SM[nx] + isM, SD[nx], SG[nx]);
            }
          }
          if (i < m) {
            const nx = at(i + 1, t, 1);
            if (SO[nx]) put(ix, SM[nx], SD[nx], SG[nx] + (st === 1 ? 0 : 1));
          }
          if (t < tEnd && st !== 3) {
            const nx = at(i, t + 1, 2);
            if (SO[nx]) put(ix, SM[nx], SD[nx] + 1, SG[nx] + (st === 2 ? 0 : 1));
          }
        }
      }
    }
    const root = at(0, 0, 3);
    if (!SO[root]) return null;
    const script = [];
    let i = 0, t = 0, st = 3;
    let walked = 0;
    while (i < m || t < tEnd) {
      walked += 1;
      if ((walked & 1023) === 0) yield;
      const ix = at(i, t, st);
      const nM = SM[ix], nD = SD[ix], nG = SG[ix];
      const step = (nx, dm, dd, dg) => (SO[nx]
        && SM[nx] + dm === nM && SD[nx] + dd === nD && SG[nx] + dg === nG);
      const diag = (i < m && t < tEnd);
      const tc = diag ? ext[s + t] : 255;
      const isM = (diag && tc < 4 && tc === q[i]) ? 1 : 0;
      // Ops are attempted in lexicographic order '=' < 'D' < 'I' < 'X', which makes the
      // first consistent move the rule-7 lex-min script without ranking whole paths.
      let moved = false;
      if (isM && step(at(i + 1, t + 1, 0), 1, 0, 0)) {
        script.push('='); i++; t++; st = 0; moved = true;
      }
      if (!moved && t < tEnd && st !== 3 && step(at(i, t + 1, 2), 0, 1, st === 2 ? 0 : 1)) {
        script.push('D'); t++; st = 2; moved = true;
      }
      if (!moved && i < m && step(at(i + 1, t, 1), 0, 0, st === 1 ? 0 : 1)) {
        script.push('I'); i++; st = 1; moved = true;
      }
      if (!moved && diag && !isM && step(at(i + 1, t + 1, 0), 0, 0, 0)) {
        script.push('X'); i++; t++; st = 0; moved = true;
      }
      if (!moved) return null;
    }
    return script.join('');
  }

  /** The same traceback, DRAINED — one implementation, two drives. */
  traceback(q, ext, s, tEnd, p, qq, ctl) {
    const gen = this.tracebackSteps(q, ext, s, tEnd, p, qq, ctl);
    let step = gen.next();
    while (!step.done) step = gen.next();
    return step.value;
  }
}

/**
 * Decide ONE candidate start exactly. Returns an occurrence with `script: null` (materialised
 * later, only for retained winners) or null if the start is not acceptable.
 */
/**
 * RESUMABLE form. Every place the synchronous version checked its cancel flag becomes a suspension:
 * pass 1 and each refinement step are separate pieces of DP work, and a cancel that can only be seen
 * between whole `solveStart` calls is a cancel the worker cannot deliver at all while the thread is
 * held. `solveStart` below is this generator drained, so there is one implementation, not two.
 */
export function* solveStartSteps(solver, q, ext, extLen, s, maxSpan, thr, n, circular, strand, iterBudget, ctl) {
  const m = q.length;
  const tMax = Math.min(maxSpan, extLen - s);
  if (tMax < 1) return null;
  const bandCells = m * Math.min(tMax + 1, 2 * solver.K + 1) + (tMax + 1);

  let p = thr; let qq = 10000;
  if (ctl) { ctl.chargeVerifier(bandCells); ctl.checkCancel(); }
  yield;
  let t = solver.prefix(q, ext, s, tMax, p, qq);
  if (t < 0) return null;
  let M = solver.endM[t]; let D = solver.endD[t];
  if (qq * M - p * (m + D) < 0) return null;

  const budget = iterBudget;
  p = M; qq = m + D;
  let converged = false;
  for (let it = 0; it < budget; it += 1) {
    if (ctl) { ctl.chargeVerifier(bandCells); ctl.checkCancel(); }
    yield;
    t = solver.prefix(q, ext, s, tMax, p, qq);
    if (t < 0) return null;
    M = solver.endM[t]; D = solver.endD[t];
    const val = qq * M - p * (m + D);
    if (val === 0) { converged = true; break; }
    if (val < 0) throw new Error(`dinkelbach invariant violated: val=${val} at start ${s}`);
    p = M; qq = m + D;
  }
  if (!converged) {
    const e = new Error(`RESOURCE_LIMIT: refinement did not converge within ${budget} iterations`);
    e.code = 'RESOURCE_LIMIT';
    e.axis = 'dinkelbach';
    throw e;
  }
  return finishStart(solver, m, t, tMax, thr, n, circular, strand, s, p, qq);
}

/** The shared tail: rules 5–6 among the ends that tie, then the occurrence record. */
function finishStart(solver, m, t, tMax, thr, n, circular, strand, s, p, qq) {
  const bM = solver.endM[t]; const bD = solver.endD[t]; const bG = solver.endG[t];
  let bestT = -1; let bestAbs = 0;
  for (let tt = 1; tt <= tMax; tt += 1) {
    if (!solver.endOk[tt]) continue;
    if (solver.endM[tt] !== bM || solver.endD[tt] !== bD || solver.endG[tt] !== bG) continue;
    const ab = Math.abs(tt - m);
    if (bestT < 0 || ab < bestAbs || (ab === bestAbs && tt < bestT)) { bestT = tt; bestAbs = ab; }
  }
  if (bestT < 0) return null;
  const span = bestT;
  const L = m + bD;
  const I = m - span + bD;
  const X = span - bD - bM;
  if (I < 0 || X < 0 || bM < 1) return null;
  if (bM * 10000 < thr * L) return null;
  if (circular && span > n) return null;
  const end = circular ? ((s + span) % n) : (s + span);
  return {
    strand,
    start: s,
    targetSpan: span,
    end,
    M: bM,
    X,
    I,
    D: bD,
    gapEvents: bG,
    alignmentLength: L,
    identityBps: Math.floor(bM * 10000 / L),
    script: null,
    _p: p,
    _q: qq,
  };
}

/**
 * The same solve, drained — one implementation, two drives. Existing synchronous callers and tests
 * keep working, and they cannot drift from the resumable path because there is nothing to drift
 * from: this IS that path, run without pausing.
 */
export function solveStart(solver, q, ext, extLen, s, maxSpan, thr, n, circular, strand, iterBudget, ctl) {
  const gen = solveStartSteps(solver, q, ext, extLen, s, maxSpan, thr, n, circular, strand, iterBudget, ctl);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}
