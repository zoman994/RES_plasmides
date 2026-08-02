/**
 * dna-gapped-align — bounded query-global / target-local traceback for one candidate START
 * (SEARCH-GAPPED-DNA K1 + K3 kernel + K3.0 ACGT-only, SPEC §2.1–2.3, §2.5, §3.1, §3.2, §4.2.1).
 *
 * Given a start `s` produced by the seed-free scan, this aligns the WHOLE query against the
 * target beginning at `s`, with a FREE end, and returns the §3.2-canonical alignment. It is:
 *   • start-anchored — the first consumed target base is `s`; a leading `D` (a base before the
 *     region) is not an edit, it just moves the start, so it is disallowed (§3.2);
 *   • free-end — the alignment stops where the acceptance ratio is maximised; a trailing `D` is a
 *     free target flank and is disallowed, a trailing `I` (query base past the region) is allowed
 *     and penalised;
 *   • banded — every prefix obeys |t − i| = |D − I| ≤ k, so the DP width is O(k), never the full
 *     query×target matrix (which SPEC forbids in production);
 *   • ACGT-only (§2.5) — a column is `=` (literal identity) or `X`. There is no third verdict: the
 *     query is validated A/C/G/T before it reaches here, so a degenerate or otherwise unknown
 *     TARGET base can never equal it and simply scores as a mismatch. Identity is therefore always
 *     a defined number — the biologist never sees a hit whose identity is «unknown».
 *
 * WHY A FRONTIER AND NOT ONE STATE PER CELL. Acceptance is a RATIO, `M/L`, and a ratio is not
 * additive: appending the same suffix to two prefixes can reverse their order. So "keep the
 * locally best-scoring predecessor" is unsound here — even with an exact rational comparator.
 * Concretely, inside a cell `(i,t)` the counts satisfy `S = M+X`, `I = i−S`, `D = t−S`, hence
 * `L = i+t−S`: a state with more `M` may carry a larger `L`, and which one wins depends on what
 * follows. Pareto dominance over (M↑,X↓,I↓,D↓,gapEvents↓) IS additive and therefore survives
 * extension, so the frontier is a correctness device, not an optimisation.
 *
 * WHAT THE K3 KERNEL CHANGED (§4.2.1). States are score-only: a flat `Int32Array` arena of
 * `M,X,I,D,gapEvents,parent,op` — no edit script is ever concatenated during the DP (that was
 * an O(L) string copy per state and dominated both time and memory). The script and its edit runs
 * are materialised ONCE, for the winner, by walking parent pointers.
 *
 * Correctness is DIFFERENTIALLY VERIFIED against the exhaustive oracle, not asserted.
 *
 * The shared session meter charges accepted DP states to the VERIFIER axis and materialisation
 * walks to the TRACEBACK axis (U1, §3.3) — two different resources, two separate quotas, so a
 * rule-7 tie storm can no longer masquerade as scoring cost and neither can be starved by the
 * scan. Exceeding either throws a typed `RESOURCE_LIMIT`, so a pathological input becomes an
 * honest incomplete instead of a silent miss or a hang. Pure.
 */
import { chargeVerifier, chargeTraceback } from './dna-search-budget';
import { drainSync } from './dna-search-cooperative';

/**
 * How many EXPANDED DP states run between two suspension points (U4-CANCEL C1).
 *
 * The second mandatory interior boundary. A candidate-rich locus (tandem repeats, shared backbone)
 * spends millions of states inside ONE `alignFromStart` call, so suspending only between candidates
 * would leave a cancel waiting for the worst single alignment in the run. 4096 expansions is well
 * under a millisecond; the counter is one integer increment per state, which is noise next to the
 * frontier's dominance walk.
 */
export const VERIFIER_CHUNK_STATES = 4096;

const LAST = ['M', 'I', 'D', 'S'];

// Ops are carried as small integer CODES inside the DP; the character form exists only when the
// winner's script is finally materialised. `LEX` ranks a code by its CHARACTER order, so §3.2
// rule 7 ("stable lexical edit script") keeps meaning exactly what it meant when scripts were
// strings: '=' (61) < 'D' (68) < 'I' (73) < 'X' (88).
const OP_EQ = 0; const OP_SUB = 1; const OP_INS = 2; const OP_DEL = 3;
const OP_CHAR = ['=', 'X', 'I', 'D'];
const LEX = [0, 3, 2, 1];

function ratioBps(num, den) { return den <= 0 ? 0 : Math.floor((num * 10000) / den); }

// Arena layout: one Int32 record per state. `next` threads the per-cell frontier as an INTRUSIVE
// singly-linked list, so a cell costs one Int32 head slot and never allocates a Map/Array.
const ST = 8;
const F_M = 0; const F_X = 1; const F_I = 2; const F_D = 3;
const F_G = 4; const F_PARENT = 5; const F_OP = 6; const F_NEXT = 7;

const LAST_CODE = { M: 0, I: 1, D: 2, S: 3 };

/**
 * Reusable scratch for one SEARCH (many `alignFromStart` calls). Growing in chunks keeps a short
 * query from ever touching a multi-megabyte arena, while a long one still amortises its buffers
 * across starts. `cellStamp` carries a generation so cell heads never need clearing between calls.
 */
export function createAlignScratch() {
  return {
    buf: new Int32Array(1024 * ST),
    cap: 1024,
    cellHead: new Int32Array(0),
    cellStamp: new Int32Array(0),
    cellCap: 0,
    generation: 0,
    // CUMULATIVE bytes ever allocated for this arena. Peak (`meter.arenaBytes`) is a `Math.max`
    // and therefore cannot distinguish «reused once» from «allocated twice»; the whole point of
    // handing ONE scratch to both strand passes is that this number does not double (U1).
    allocatedBytes: 1024 * ST * 4,
  };
}

/**
 * @param {string} query validated A/C/G/T probe (§2.5)
 * @param {string} target uppercased target; a non-ACGT base can only ever score as `X`
 * @param {number} start first target index the region may consume
 * @param {number} k edit budget (band width)
 * @param {{ maxSpan?:number, thresholdBps?:number }} [opts] `thresholdBps` enables the admissible
 *   threshold bound (§2.3); omit it for an unbounded exploration
 * @param {{ states:number, budget:number|null } | null} [meter] shared state meter (throws
 *   RESOURCE_LIMIT past `budget`)
 * @param {number} [chunk] expanded states between suspension points (U4-CANCEL C1)
 * @returns {Generator<void, null | object>} occurrence-shaped alignment or null
 */
export function* alignFromStartSteps(query, target, start, k, opts = {}, meter = null, chunk = VERIFIER_CHUNK_STATES) {
  const m = query.length;
  const n = target.length;
  if (m === 0 || start < 0 || start > n) return null;
  const budget = Math.max(0, Math.floor(k));
  const maxSpan = Math.min(n - start, opts.maxSpan ?? (m + budget));
  // Absent/zero `thresholdBps` = no bound, i.e. the exact pre-K3.1 exploration. That is not a
  // test flag but a real configuration: an unbounded alignment is what you want when no
  // acceptance threshold applies — and it is also the mutation seam for the bound's gate.
  const boundBps = Math.max(0, Math.floor(opts.thresholdBps ?? 0));

  // ── reusable arena + generation-stamped cell heads (no per-cell allocation) ───────────────
  const sc = opts.scratch || createAlignScratch();
  const rowW = maxSpan + 1;
  const numCells = (m + 1) * rowW * 4;
  if (sc.cellCap < numCells) {
    sc.cellHead = new Int32Array(numCells);
    sc.cellStamp = new Int32Array(numCells);
    sc.cellCap = numCells;
    sc.generation = 0; // fresh arrays start unstamped
    sc.allocatedBytes = (sc.allocatedBytes || 0) + (numCells * 4 * 2);
  }
  sc.generation += 1;
  const gen = sc.generation;
  const head = sc.cellHead;
  const stamp = sc.cellStamp;
  let buf = sc.buf;
  let cap = sc.cap;
  let nStates = 0;

  const cellIdx = (i, t, lastCode) => (((i * rowW) + t) * 4) + lastCode;
  const headOf = (c) => (stamp[c] === gen ? head[c] : -1);
  const setHead = (c, v) => { head[c] = v; stamp[c] = gen; };

  /** Append-only: a state unlinked from a frontier STAYS here, because it may still be the parent
   * of an already-created candidate. Grows in chunks, so a short query never touches a big arena. */
  function pushState(M, X, I, D, G, parent, op, next) {
    if (nStates === cap) {
      cap *= 2;
      const grown = new Int32Array(cap * ST);
      grown.set(buf);
      buf = grown;
      sc.buf = grown;
      sc.cap = cap;
      sc.allocatedBytes = (sc.allocatedBytes || 0) + grown.byteLength;
    }
    const o = nStates * ST;
    buf[o + F_M] = M; buf[o + F_X] = X; buf[o + F_I] = I; buf[o + F_D] = D;
    buf[o + F_G] = G; buf[o + F_PARENT] = parent; buf[o + F_OP] = op; buf[o + F_NEXT] = next;
    return nStates++;
  }

  /** Ops from the root down to `idx`, FORWARD order. Only for the winner and for rule-7 ties at
   * the final cell — never inside the hot transition loop. */
  function pathOps(idx) {
    const out = [];
    for (let i = idx; i > 0; i = buf[(i * ST) + F_PARENT]) {
      chargeTraceback(meter); // AXIS TRACEBACK (§3.3) — one link walked, one unit charged
      out.push(buf[(i * ST) + F_OP]);
    }
    out.reverse();
    return out;
  }

  /**
   * §3.2 rule 7 between a candidate `(parentA, opA)` and an existing state with the SAME count
   * vector. Equal vectors ⇒ equal path length, so the earliest divergence decides. Both paths are
   * walked up in LOCKSTEP to their first common ancestor: the ops recorded there are precisely
   * that earliest divergence, so no full path has to be materialised.
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

  function put(i, t, lastCode, M, X, I, D, G, parent, op) {
    if (meter && meter.attempts !== undefined) meter.attempts += 1;

    // ── ADMISSIBLE THRESHOLD BOUND (K3.1, §2.3) ────────────────────────────────────────────
    // Drop a state only when NO completion of it can still reach the threshold. This changes
    // nothing about the biological answer — it declines to explore branches whose best possible
    // outcome is already below the bar.
    //
    // Why `(M+r)/(L+r)` is a true upper bound, r = m−i remaining query bases, L = M+X+I+D:
    // the query is aligned GLOBALLY, so all r remaining bases must be consumed, and each of them
    // costs at least one alignment column (`=`, `X` or `I`). The most optimistic finish makes
    // every one of them a match and adds no deletion, giving M_f = M+r and L_f = L+r. Any real
    // finish has M_f = M+a with a ≤ r and L_f = L+r+d with d ≥ 0 (deletions lengthen the
    // alignment without matching), so its ratio is ≤ (M+r)/(L+r). QED.
    //
    // Compared in the SAME integer form as acceptance (§2.3): a final state is accepted iff
    // `M_f·10000 ≥ t·L_f`, so we prune iff `(M+r)·10000 < t·(L+r)` — STRICTLY below. Equality
    // must survive: at threshold 8000 a state whose ceiling is exactly 80.00% is still a
    // candidate, and rounding it away would silently move the acceptance boundary.
    //
    // Two consequences, both load-bearing — check them, do not trust them:
    //
    // (a) NO ORPHANS. The ceiling never rises along a path: appending `=` leaves (M+r)/(L+r)
    //     unchanged (both grow by 1 and r drops by 1); `X` and `I` give (M+r−1)/(L+r); `D` gives
    //     (M+r)/(L+1+r). All ≤ the parent's. So a surviving child always has a surviving parent,
    //     and no kept state can point at a pruned ancestor.
    // (b) THE WINNER IS NEVER LOST. §3.2 rule 1 ranks by acceptance ratio first, so the canonical
    //     best alignment at a start is also its HIGHEST-ratio one. If any alignment there clears
    //     the threshold, the canonical winner does too, and by the argument above every state on
    //     its path survives. If none clears it, `strandPass` drops that start anyway.
    if (boundBps > 0) {
      const r = m - i;
      if ((M + r) * 10000 < boundBps * (M + X + I + D + r)) {
        if (meter && meter.boundPruned !== undefined) meter.boundPruned += 1;
        return;
      }
    }

    const c = cellIdx(i, t, lastCode);

    // One pass over the frontier: exact duplicate, or dominated by an incumbent?
    let prev = -1;
    for (let x = headOf(c); x !== -1;) {
      const o = x * ST;
      const xM = buf[o + F_M]; const xX = buf[o + F_X];
      const xI = buf[o + F_I]; const xD = buf[o + F_D]; const xG = buf[o + F_G];
      if (xM === M && xX === X && xI === I && xD === D && xG === G) {
        if (meter && meter.duplicates !== undefined) meter.duplicates += 1;
        if (candIsLexSmaller(parent, op, x)) { // keep the lex-min representative
          const idx = pushState(M, X, I, D, G, parent, op, buf[o + F_NEXT]);
          if (prev === -1) setHead(c, idx); else buf[(prev * ST) + F_NEXT] = idx;
        }
        return;
      }
      // Non-strict here is safe: an all-equal vector was already handled above.
      if (xM >= M && xX <= X && xI <= I && xD <= D && xG <= G) {
        if (meter && meter.rejectedDominated !== undefined) meter.rejectedDominated += 1;
        return;
      }
      prev = x; x = buf[o + F_NEXT];
    }

    // Not dominated → unlink everything it dominates (those states stay in the arena).
    prev = -1;
    for (let x = headOf(c); x !== -1;) {
      const o = x * ST;
      const nx = buf[o + F_NEXT];
      if (M >= buf[o + F_M] && X <= buf[o + F_X] && I <= buf[o + F_I]
        && D <= buf[o + F_D] && G <= buf[o + F_G]) {
        if (prev === -1) setHead(c, nx); else buf[(prev * ST) + F_NEXT] = nx;
        if (meter && meter.removedDominated !== undefined) {
          meter.removedDominated += 1; meter.liveFrontier -= 1;
        }
      } else prev = x;
      x = nx;
    }

    setHead(c, pushState(M, X, I, D, G, parent, op, headOf(c)));
    if (meter && meter.accepted !== undefined) {
      meter.accepted += 1;
      meter.liveFrontier += 1;
      if (meter.liveFrontier > meter.peakFrontier) meter.peakFrontier = meter.liveFrontier;
    }
    chargeVerifier(meter); // AXIS VERIFIER (§3.3) — throws typed RESOURCE_LIMIT past its own quota
  }

  setHead(cellIdx(0, 0, LAST_CODE.S), pushState(0, 0, 0, 0, 0, -1, 0, -1)); // root = index 0

  // The arena reading is taken in a `finally`: a budget exhaustion throws OUT of these loops, and
  // that is exactly the run whose memory anyone would want to know about. Recording it only on
  // the success path made every incomplete profile line read `arenaKB=0` — a number that says
  // «this used no memory» about the run that ran out of it.
  // ── the DP, as a RESUMABLE CHUNK (U4-CANCEL C1) ──────────────────────────────────────────
  // The cell cursor lives in the closure; every HOT variable stays a plain local of `runChunk`.
  // That placement is the whole performance story: a `yield` inside the innermost loop forces V8
  // to spill every live local of a four-deep nest onto the generator's heap object on each resume,
  // which measured ~200× slower on a 20-mer. The suspension therefore happens BETWEEN chunks —
  // exactly as in the Myers sweep — while the boundary stays interior to ONE alignment and bounded
  // by STATES, so a candidate-rich locus can still be abandoned mid-DP.
  //
  // `LAST` is indexed rather than iterated: `l` IS the lastCode (LAST[1]==='I', LAST[2]==='D'), so
  // the gap-event tests below read `l === 1` / `l === 2` for what used to be `last === 'I'` / `'D'`.
  let ci = 0; let ct = 0; let cl = 0; let cIdx = -1; let cInit = true;

  /** Expand up to `maxStates` frontier states; `true` ⇒ the DP is complete. */
  function runChunk(maxStates) {
    let i = ci; let t = ct; let l = cl; let idx = cIdx; let needInit = cInit;
    let work = 0;
    for (;;) {
      if (i > m) { ci = i; return true; }
      if (t > maxSpan) { i += 1; t = 0; l = 0; needInit = true; continue; }
      if (Math.abs(t - i) > budget) { t += 1; l = 0; needInit = true; continue; } // band |t−i| ≤ k
      if (l > 3) { t += 1; l = 0; needInit = true; continue; }
      if (needInit) { idx = headOf(cellIdx(i, t, l)); needInit = false; }
      if (idx === -1) { l += 1; needInit = true; continue; }

      const o = idx * ST;
      const M = buf[o + F_M]; const X = buf[o + F_X];
      const I = buf[o + F_I]; const D = buf[o + F_D]; const G = buf[o + F_G];
      const nextIdx = buf[o + F_NEXT];

      if (i < m && t < maxSpan) { // match / substitution — literal equality only (§2.5)
        const eq = query[i] === target[start + t];
        put(i + 1, t + 1, LAST_CODE.M,
          M + (eq ? 1 : 0), X + (eq ? 0 : 1), I, D, G, idx, eq ? OP_EQ : OP_SUB);
      }
      if (i < m) { // insertion (query-only) — leading/trailing I allowed
        put(i + 1, t, LAST_CODE.I, M, X, I + 1, D, G + (l === 1 ? 0 : 1), idx, OP_INS);
      }
      // deletion (target-only) only strictly inside the query: no leading/trailing D (§3.2)
      if (t < maxSpan && i > 0 && i < m) {
        put(i, t + 1, LAST_CODE.D, M, X, I, D + 1, G + (l === 2 ? 0 : 1), idx, OP_DEL);
      }
      idx = nextIdx;

      work += 1;
      if (work >= maxStates) { // INTERIOR boundary — bounded states (C1)
        ci = i; ct = t; cl = l; cIdx = idx; cInit = needInit;
        return false;
      }
    }
  }

  try {
    while (!runChunk(chunk)) yield;
  } finally {
    if (meter && meter.arenaBytes !== undefined) {
      meter.arenaBytes = Math.max(meter.arenaBytes, buf.byteLength + head.byteLength + stamp.byteLength);
    }
  }

  // ── winner: free end, any state with the whole query consumed (i === m) ───────────────────
  /** Full §3.2 order. Rules 1–6 are pure numbers; rule 7 materialises the two paths, and only
   * when everything else ties. Lower is better; `<0` ⇒ `a` wins. */
  function compareFinal(a, b) {
    const lhs = a.M * b.L; //                             1 identity ratio, cross-multiplied
    const rhs = b.M * a.L;
    if (lhs !== rhs) return rhs - lhs;
    if (a.M !== b.M) return b.M - a.M; //                 2 more matched bases
    const ea = a.X + a.I + a.D; const eb = b.X + b.I + b.D;
    if (ea !== eb) return ea - eb; //                     3 edit distance
    if (a.G !== b.G) return a.G - b.G; //                 4 indel events
    const da = Math.abs(a.targetSpan - a.queryLength);
    const db = Math.abs(b.targetSpan - b.queryLength);
    if (da !== db) return da - db; //                     5
    if (a.end !== b.end) return a.end - b.end; //         6 min target end
    const pa = pathOps(a.idx); const pb = pathOps(b.idx); // 7 lexical edit script
    const len = Math.min(pa.length, pb.length);
    for (let z = 0; z < len; z++) if (pa[z] !== pb[z]) return LEX[pa[z]] - LEX[pb[z]];
    return pa.length - pb.length;
  }

  let best = null;
  for (let t = 0; t <= maxSpan; t++) {
    for (const last of LAST) {
      let idx = headOf(cellIdx(m, t, LAST_CODE[last]));
      for (; idx !== -1; idx = buf[(idx * ST) + F_NEXT]) {
        const o = idx * ST;
        const M = buf[o + F_M]; const X = buf[o + F_X];
        const I = buf[o + F_I]; const D = buf[o + F_D];
        const cand = {
          M, X, I, D, G: buf[o + F_G], L: M + X + I + D,
          queryLength: m, targetSpan: t, start, end: start + t, idx,
        };
        if (!best || compareFinal(cand, best) < 0) best = cand;
      }
    }
  }
  if (!best) return null;

  // ── materialise the winner's script ONCE, then its canonical run-length edit runs (§3.1) ──
  //   • probeStart/probeEnd — half-open probe indices; advance on '=', 'X', 'I';
  //   • targetOffsetStart/targetOffsetEnd — half-open offsets from `start`; advance on '=', 'X',
  //     'D'. Physical target = start + offset. The same walk yields the physical X positions.
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

/**
 * The alignment with no suspension — identical instruction sequence, drained in one go. Every
 * pre-C1 caller and test keeps this exact entry point; `Infinity` disables the interior boundary,
 * so the counter can never fire and the hot loop is what it always was.
 * @returns {null | object}
 */
export function alignFromStart(query, target, start, k, opts = {}, meter = null) {
  return drainSync(alignFromStartSteps(query, target, start, k, opts, meter, Infinity));
}
