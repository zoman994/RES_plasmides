/**
 * dna-gapped-align-dkey — K3.2 PROTOTYPE. Same contract as `alignFromStart`, different state space.
 *
 * NOT WIRED TO PRODUCTION. It exists to be measured against the accepted K3.1 engine and the
 * oracle; `dna-gapped-search.js` reaches it only through an explicit opt-in.
 *
 * ── WHY A SECOND KERNEL AT ALL ────────────────────────────────────────────────────────────────
 * K3.1's admissible bound removed the branches that could no longer reach the threshold. What it
 * cannot remove — and should not — is the mass of states that are still formally reachable. On a
 * long, nearly-exact hit almost every state qualifies, so at q400 a SINGLE alignment consumed the
 * whole budget with the bound live. The remaining cost is not wasted exploration; it is the width
 * of the Pareto frontier itself.
 *
 * ── THE COLLAPSE ──────────────────────────────────────────────────────────────────────────────
 * The frontier exists because acceptance is a RATIO and `L` differs between states in one cell —
 * more `M` may come with more `L`, so neither dominates. But `L` only differs because the cell
 * key `(i,t,lastOp)` leaves `D` free. Add `D` to the key and the arithmetic closes:
 *
 *     S = t − D        (aligned columns)      X = S − M
 *     I = i − S                               L = S + I + D
 *
 * Every one of those is FIXED once `(i,t,D)` is fixed. Within such a cell only `M` and
 * `gapEvents` still vary, and `L` is a constant — so for any common suffix the final ratio
 * `(M+δM)/(L+δL)` is strictly increasing in `M`. §3.2 rule 1 therefore always prefers max `M`,
 * and the whole frontier collapses to ONE state per key:
 *
 *     max M  →  min gapEvents  →  lex-min script
 *
 * (`gapEvents` only breaks a tie because `lastOp` is part of the key, so a shared suffix adds the
 * same gap openings to both candidates; and equal `M` forces every other count to be equal too,
 * leaving rules 4 and 7 as the only discriminators.)
 *
 * MEASURED ceiling before this file was written — distinct `(i,t,D,lastOp)` keys vs states the
 * K3.1 frontier actually accepted, 1 Mb target at 80%: q20 11.6×, q100 32.6×, q200 24.3×,
 * q400 8.45×. That is the size of the prize, and it is independent of the bound.
 *
 * ── WHY THE DP ORDER IS SAFE ──────────────────────────────────────────────────────────────────
 * A cell can only be entered from `(i−1,t−1,D)` (match/sub), `(i−1,t,D)` (insert) or
 * `(i,t−1,D−1)` (delete). Rows are processed in ascending `i` and, within a row, ascending `t`,
 * so every incoming edge is applied BEFORE the cell is expanded. A cell is final when reached,
 * which is what makes «one state per key» implementable as an in-place update: nothing can
 * already be pointing at a value that later changes.
 *
 * Consequence for memory: only two rows are ever live, so the lookup planes are
 * `(maxSpan+1)·(k+1)·4` entries instead of a full matrix, and the arena stores 4 ints per state
 * instead of 8.
 */
import { chargeVerifier, chargeTraceback } from './dna-search-budget';

const LAST_M = 0; const LAST_I = 1; const LAST_D = 2; const LAST_S = 3;

// Same op encoding and lexical ranking as the production kernel — §3.2 rule 7 must not shift
// meaning between the two engines, or the differential would compare different contracts.
const OP_EQ = 0; const OP_SUB = 1; const OP_INS = 2; const OP_DEL = 3;
const OP_CHAR = ['=', 'X', 'I', 'D'];
const LEX = [0, 3, 2, 1];

const ST = 4; // M, gapEvents, parent, op
const F_M = 0; const F_G = 1; const F_PARENT = 2; const F_OP = 3;

function ratioBps(num, den) { return den <= 0 ? 0 : Math.floor((num * 10000) / den); }

// Budget axes are shared with the production kernel (U1, §3.3): the prototype must be measured
// against the SAME quotas, otherwise a swap would change the contract, not just the speed.

/** Reusable scratch for one SEARCH (many calls). Mirrors `createAlignScratch`'s role. */
export function createDKeyScratch() {
  return {
    buf: new Int32Array(1024 * ST),
    cap: 1024,
    slot: new Int32Array(0),  // (plane, t, D, lastOp) → arena index
    stamp: new Int32Array(0), // row generation that wrote it
    planeCap: 0,
    generation: 0,
  };
}

/**
 * @param {string} query validated A/C/G/T probe (§2.5)
 * @param {string} target uppercased target
 * @param {number} start first target index the region may consume
 * @param {number} k edit budget (band width)
 * @param {{ maxSpan?:number, thresholdBps?:number, scratch?:object }} [opts]
 * @param {{ states:number, budget:number|null } | null} [meter]
 * @returns {null | object} the same occurrence-shaped alignment `alignFromStart` returns
 */
export function alignFromStartDKey(query, target, start, k, opts = {}, meter = null) {
  const m = query.length;
  const n = target.length;
  if (m === 0 || start < 0 || start > n) return null;
  const budget = Math.max(0, Math.floor(k));
  const maxSpan = Math.min(n - start, opts.maxSpan ?? (m + budget));
  const boundBps = Math.max(0, Math.floor(opts.thresholdBps ?? 0));

  const dSpan = budget + 1;                 // D ∈ 0..k
  const planeSize = (maxSpan + 1) * dSpan * 4;
  const need = planeSize * 2;               // two live rows

  const sc = opts.scratch || createDKeyScratch();
  if (sc.planeCap < need || sc.generation > 0x3000_0000) {
    sc.slot = new Int32Array(need);
    sc.stamp = new Int32Array(need);
    sc.planeCap = need;
    sc.generation = 0;
  }
  // Each ROW gets its own stamp, so the two planes never need clearing: a stale entry left in
  // plane[i%2] from row i−2 carries the wrong stamp and reads as empty.
  const genBase = sc.generation + 1;
  sc.generation = genBase + m + 1;

  const slot = sc.slot;
  const stamp = sc.stamp;
  let buf = sc.buf;
  let cap = sc.cap;
  let nStates = 0;

  const slotIdx = (row, t, D, lastCode) => (row % 2) * planeSize
    + (((t * dSpan) + D) * 4) + lastCode;

  function pushState(M, G, parent, op) {
    if (nStates === cap) {
      cap *= 2;
      const grown = new Int32Array(cap * ST);
      grown.set(buf);
      buf = grown;
      sc.buf = grown;
      sc.cap = cap;
    }
    const o = nStates * ST;
    buf[o + F_M] = M; buf[o + F_G] = G; buf[o + F_PARENT] = parent; buf[o + F_OP] = op;
    return nStates++;
  }

  function pathOps(idx) {
    const out = [];
    for (let x = idx; x > 0; x = buf[(x * ST) + F_PARENT]) {
      chargeTraceback(meter); // AXIS TRACEBACK (§3.3)
      out.push(buf[(x * ST) + F_OP]);
    }
    out.reverse();
    return out;
  }

  /**
   * §3.2 rule 7 for two candidates that agree on every count. Equal counts ⇒ equal path length,
   * so walking both up in lockstep reaches their first divergence, and the ops recorded there
   * decide. No path is ever materialised in the hot loop.
   */
  function candIsLexSmaller(parentA, opA, idxB) {
    if (meter && meter.rule7Compares !== undefined) meter.rule7Compares += 1;
    let a = parentA; let ao = opA;
    let b = buf[(idxB * ST) + F_PARENT]; let bo = buf[(idxB * ST) + F_OP];
    while (a !== b) {
      if (meter && meter.parentLinks !== undefined) meter.parentLinks += 2;
      ao = buf[(a * ST) + F_OP]; a = buf[(a * ST) + F_PARENT];
      bo = buf[(b * ST) + F_OP]; b = buf[(b * ST) + F_PARENT];
    }
    return LEX[ao] < LEX[bo];
  }

  /** Insert or improve the single state living at `(row,t,D,lastCode)`. */
  function put(row, t, D, lastCode, M, G, parent, op) {
    if (meter && meter.attempts !== undefined) meter.attempts += 1;

    // Same admissible bound as K3.1 (§2.3) — kept verbatim so the two kernels differ ONLY in
    // their state space. `L` is derivable here: S = t − D, X = S − M, I = i − S.
    if (boundBps > 0) {
      const S = t - D;
      const r = m - row;
      const L = S + (row - S) + D; // = row + D
      if ((M + r) * 10000 < boundBps * (L + r)) {
        if (meter && meter.boundPruned !== undefined) meter.boundPruned += 1;
        return;
      }
    }

    const c = slotIdx(row, t, D, lastCode);
    const rowStamp = genBase + row;
    if (stamp[c] === rowStamp) {
      const idx = slot[c];
      const o = idx * ST;
      const oldM = buf[o + F_M];
      const oldG = buf[o + F_G];
      // max M → min gapEvents → lex-min script. Anything worse is discarded outright: with `L`
      // fixed by the key, a smaller `M` can never win rule 1 under any shared continuation.
      let better = false;
      if (M > oldM) better = true;
      else if (M === oldM && G < oldG) better = true;
      else if (M === oldM && G === oldG) better = candIsLexSmaller(parent, op, idx);
      if (!better) {
        if (meter && meter.rejectedDominated !== undefined) meter.rejectedDominated += 1;
        return;
      }
      // In-place: this cell has not been expanded yet (ascending i, then ascending t), so no
      // existing state can be pointing at the value being replaced.
      buf[o + F_M] = M; buf[o + F_G] = G; buf[o + F_PARENT] = parent; buf[o + F_OP] = op;
      if (meter && meter.updates !== undefined) meter.updates += 1;
      return;
    }

    slot[c] = pushState(M, G, parent, op);
    stamp[c] = rowStamp;
    if (meter && meter.accepted !== undefined) meter.accepted += 1;
    chargeVerifier(meter); // AXIS VERIFIER (§3.3)
  }

  try {
    // Root: i=0, t=0, D=0, lastOp=S. Arena index 0 doubles as the traceback terminator.
    pushState(0, 0, -1, 0);
    slot[slotIdx(0, 0, 0, LAST_S)] = 0;
    stamp[slotIdx(0, 0, 0, LAST_S)] = genBase;

    for (let i = 0; i <= m; i++) {
      const rowStamp = genBase + i;
      const tLo = Math.max(0, i - budget);
      const tHi = Math.min(maxSpan, i + budget);
      for (let t = tLo; t <= tHi; t++) {
        for (let D = 0; D < dSpan; D++) {
          const S = t - D;
          if (S < 0 || S > i) continue; // S = matched+substituted columns; I = i − S ≥ 0
          for (let lastCode = 0; lastCode < 4; lastCode++) {
            const c = slotIdx(i, t, D, lastCode);
            if (stamp[c] !== rowStamp) continue;
            const idx = slot[c];
            const o = idx * ST;
            const M = buf[o + F_M];
            const G = buf[o + F_G];

            if (i < m && t < maxSpan) { // match / substitution
              const eq = query[i] === target[start + t];
              put(i + 1, t + 1, D, LAST_M, M + (eq ? 1 : 0), G, idx, eq ? OP_EQ : OP_SUB);
            }
            if (i < m) { // insertion — leading/trailing I allowed
              put(i + 1, t, D, LAST_I, M, G + (lastCode === LAST_I ? 0 : 1), idx, OP_INS);
            }
            // deletion strictly inside the query: no leading/trailing D (§3.2)
            if (t < maxSpan && i > 0 && i < m && D + 1 < dSpan) {
              put(i, t + 1, D + 1, LAST_D, M, G + (lastCode === LAST_D ? 0 : 1), idx, OP_DEL);
            }
          }
        }
      }
    }
  } finally {
    if (meter && meter.arenaBytes !== undefined) {
      meter.arenaBytes = Math.max(
        meter.arenaBytes, buf.byteLength + slot.byteLength + stamp.byteLength,
      );
    }
  }

  // ── winner: free end, every state with the whole query consumed (i === m) ──────────────────
  function compareFinal(a, b) {
    const lhs = a.M * b.L; //                             1 identity ratio, cross-multiplied
    const rhs = b.M * a.L;
    if (lhs !== rhs) return rhs - lhs;
    if (a.M !== b.M) return b.M - a.M; //                 2 more matched bases
    const ea = a.X + a.I + a.D; const eb = b.X + b.I + b.D;
    if (ea !== eb) return ea - eb; //                     3 edit distance
    if (a.G !== b.G) return a.G - b.G; //                 4 indel events
    const da = Math.abs(a.targetSpan - m);
    const db = Math.abs(b.targetSpan - m);
    if (da !== db) return da - db; //                     5
    if (a.end !== b.end) return a.end - b.end; //         6 min target end
    const pa = pathOps(a.idx); const pb = pathOps(b.idx); // 7 lexical edit script
    const len = Math.min(pa.length, pb.length);
    for (let z = 0; z < len; z++) if (pa[z] !== pb[z]) return LEX[pa[z]] - LEX[pb[z]];
    return pa.length - pb.length;
  }

  let best = null;
  const finalStamp = genBase + m;
  for (let t = 0; t <= maxSpan; t++) {
    for (let D = 0; D < dSpan; D++) {
      const S = t - D;
      if (S < 0 || S > m) continue;
      for (let lastCode = 0; lastCode < 4; lastCode++) {
        const c = slotIdx(m, t, D, lastCode);
        if (stamp[c] !== finalStamp) continue;
        const idx = slot[c];
        const o = idx * ST;
        const M = buf[o + F_M];
        const X = S - M;
        const I = m - S;
        const cand = {
          M, X, I, D, G: buf[o + F_G], L: M + X + I + D,
          targetSpan: t, start, end: start + t, idx,
        };
        if (!best || compareFinal(cand, best) < 0) best = cand;
      }
    }
  }
  if (!best) return null;

  const ops = pathOps(best.idx);
  const script = ops.map((c) => OP_CHAR[c]).join('');
  const editRuns = [];
  const mismatchPositions = [];
  let pi = 0;
  let toff = 0;
  for (let z = 0; z < ops.length;) {
    const op = ops[z];
    const pStart = pi;
    const tStart = toff;
    let len = 0;
    while (z < ops.length && ops[z] === op) {
      if (op === OP_EQ || op === OP_SUB) {
        if (op === OP_SUB) mismatchPositions.push(best.start + toff);
        pi += 1; toff += 1;
      } else if (op === OP_INS) pi += 1;
      else toff += 1; // OP_DEL
      len += 1; z += 1;
    }
    editRuns.push({
      op: OP_CHAR[op],
      length: len,
      probeStart: pStart,
      probeEnd: pi,
      targetOffsetStart: tStart,
      targetOffsetEnd: toff,
    });
  }

  const L = best.L;
  return {
    start: best.start,
    end: best.end,
    script,
    editRuns,
    M: best.M,
    X: best.X,
    I: best.I,
    D: best.D,
    editDistance: best.X + best.I + best.D,
    indelEvents: best.G,
    indelBases: best.I + best.D,
    alignmentLength: L,
    queryLength: m,
    targetSpan: best.targetSpan,
    acceptBps: ratioBps(best.M, L),
    mismatchPositions,
  };
}
