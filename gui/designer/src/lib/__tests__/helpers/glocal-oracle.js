/**
 * glocal-oracle — TEST-ONLY reference for the SEARCH-GAPPED-DNA contract
 * (SPEC_GAPPED_DNA_SEARCH §2, §3.2). Never imported by production code.
 *
 * Two independent references, on purpose (Игорь, K0 review):
 *
 *   1. `microBrute` — literal enumeration of every alignment. Obviously right, uselessly slow.
 *      Hard-capped at 5×7 (Delannoy(5,7) = 7 183 paths). This is the thing that has no
 *      subtle-logic failure mode.
 *   2. `bestForSpan` / `oracleSearchLinear` — Pareto DP. Fast enough for the real matrix.
 *
 * The DP is differentially checked against `microBrute` in glocal-oracle.test.js. That is the
 * whole point of keeping both: a Pareto dominance bug would otherwise make the reference
 * silently wrong, and then every K1 differential test would agree with a lie.
 *
 * Why the first draft was scrapped: it brute-forced up to 12×18 ≈ 1.9e10 paths and called that
 * a guard. It did not stop under a Vitest timeout — two workers burned ~36 min of CPU each and
 * had to be killed by PID. Size limits here are therefore chosen from the actual path count,
 * not from a feeling.
 *
 * WHY THE PARETO DOMINANCE IS SOUND (this is the load-bearing argument — check it, do not
 * trust it). Inside one DP cell (i,j) the counts obey two identities:
 *     i = M+X+I      j = M+X+D
 * so `M+X` is pinned once `I` (resp. `D`) is fixed. Take a,b in the same cell with
 * a.M>=b.M, a.X<=b.X, a.I<=b.I, a.D<=b.D. Write L = M+X+I+D. Then
 *     M_a - M_b >= 0   and   L_a <= L_b,
 * so M/L can only improve. Any common suffix adds identical deltas to both,
 * so the ordering survives extension. `gapEvents` is not a pure count — it depends on run
 * structure — so the cell is additionally keyed by `lastOp`; only then does a shared suffix
 * add the same number of gap events to both candidates.
 *
 * Alignment model (§2.1): query-global / target-local. The WHOLE query is aligned; only target
 * flanks are free. For a candidate span [s,e) the query is aligned GLOBALLY against
 * target[s..e), so leading/trailing `D` cannot occur (they would just be a shorter span) —
 * which is exactly the §3.2 rule. Leading/trailing `I` are legal and counted.
 */

/** Path counts (Delannoy): 5×7 = 7 183; 6×8 = 40 081; 8×12 ≈ 1.2e6; 12×18 ≈ 1.9e10.
 * The brute force is only ever allowed the first of those. */
const BRUTE_MAX_QUERY = 5;
const BRUTE_MAX_TARGET = 7;
/**
 * Measured, not guessed. The Pareto DP is polynomial in states, but each cell can still hold
 * several non-dominated vectors, so the cap is deliberately close to what the K0 matrix
 * actually needs rather than an aspirational `64x512` (that number was never measured and,
 * before lex-min dedup, 20x20 alone took 92 s).
 *
 * §2.4's 20-mers are checked through `bestForSpan` on a single prescribed span — the reference
 * is never asked to SOLVE a pathological 20x20 search.
 */
const DP_MAX_QUERY = 24;
const DP_MAX_TARGET = 48;
/** Hard, deterministic ceilings on DP states. Independent of machine speed: a wall-clock limit
 * would be flaky under load and would not name the cause.
 *   MAX_STATES        — per single `bestForSpan` call.
 *   FULL_SEARCH_STATES — aggregate across every span of one `oracleSearchLinear`. A fast single
 *                        span does NOT prove a safe full search (the search runs O(targetLen^2)
 *                        spans), so the whole search is metered against this shared ceiling. */
const MAX_STATES = 200000;
const FULL_SEARCH_STATES = 2000000;

export const ORACLE_LIMITS = Object.freeze({
  BRUTE_MAX_QUERY, BRUTE_MAX_TARGET, DP_MAX_QUERY, DP_MAX_TARGET, MAX_STATES, FULL_SEARCH_STATES,
});

function guard(query, target, maxQ, maxT, who) {
  if (typeof query !== 'string' || typeof target !== 'string') {
    throw new TypeError(`${who}: query/target must be strings`);
  }
  if (query.length > maxQ || target.length > maxT) {
    throw new Error(
      `${who} is test-only: query<=${maxQ}, target<=${maxT} (got ${query.length}/${target.length})`,
    );
  }
}

/** `[s,e)` must be a real half-open window inside the target (§3.1 bounds). */
function guardSpan(s, e, targetLength, who) {
  if (!Number.isInteger(s) || !Number.isInteger(e)) {
    throw new RangeError(`${who}: span bounds must be integers (got ${s}, ${e})`);
  }
  if (s < 0 || e > targetLength || s > e) {
    throw new RangeError(`${who}: span [${s},${e}) outside 0..${targetLength}`);
  }
}

/**
 * Uppercase and NOTHING else (§2.5). Emphatically not `U`→`T`: the interactive engine is
 * ACGT-only, and a reference that silently repaired RNA would agree with a bug instead of
 * catching it.
 */
export function normalize(s) { return String(s || '').toUpperCase(); }

/** Column verdict for one aligned pair (§2.2, §2.5): literal equality, no third verdict. */
export function columnOp(qc, tc) { return qc === tc ? '=' : 'X'; }

/** Integer basis points — 80.00% MUST pass, 79.99% MUST NOT (§2.3). */
export function ratioBps(num, den) {
  if (den <= 0) return 0;
  return Math.floor((num * 10000) / den);
}

/** Build the public score object from raw counts + the REAL edit script (`=XID`). */
function makeScore({
  M, X, I, D, gapEvents, script, query, span, targetStart, targetEnd,
}) {
  const L = M + X + I + D;
  return {
    M, X, I, D, L,
    editDistance: X + I + D,
    indelEvents: gapEvents,
    indelBases: I + D,
    queryLength: query.length,
    targetSpan: span.length,
    targetStart,
    targetEnd,
    identity: L ? M / L : 0,
    acceptBps: ratioBps(M, L),
    script,
  };
}

/**
 * §3.2 canonical order. Lower is better; <0 means `a` wins.
 * Rule 7 compares the REAL edit script (`=XID`), not the routing skeleton — the first draft
 * compared `M/I/D` and could therefore pick the opposite alignment on a tie.
 */
export function compareCanonical(a, b) {
  const lhs = a.M * b.L;                               // 1 — cross multiplication, no float
  const rhs = b.M * a.L;
  if (lhs !== rhs) return rhs - lhs;
  if (a.M !== b.M) return b.M - a.M;                   // 2 — more matched bases
  if (a.editDistance !== b.editDistance) return a.editDistance - b.editDistance; // 3
  if (a.indelEvents !== b.indelEvents) return a.indelEvents - b.indelEvents;     // 4
  const da = Math.abs(a.targetSpan - a.queryLength);
  const db = Math.abs(b.targetSpan - b.queryLength);
  if (da !== db) return da - db;                       // 5
  if (a.targetEnd !== b.targetEnd) return a.targetEnd - b.targetEnd;             // 6
  return a.script < b.script ? -1 : a.script > b.script ? 1 : 0;                 // 7
}

// ─────────────────────────── reference 1: micro brute force ───────────────────────────

/**
 * Enumerate EVERY alignment of the full query against the full span, score each, return the
 * canonical winner. Hard-capped: this is the trusted-but-slow reference.
 */
export function microBrute(rawQuery, rawSpan, targetStart = 0) {
  guard(rawQuery, rawSpan, BRUTE_MAX_QUERY, BRUTE_MAX_TARGET, 'microBrute');
  const query = normalize(rawQuery);
  const span = normalize(rawSpan);

  let best = null;
  const walk = (qi, ti, ops) => {
    if (qi === query.length && ti === span.length) {
      if (ops[0] === 'D' || ops[ops.length - 1] === 'D') return; // §3.2 tight span
      let M = 0; let X = 0; let I = 0; let D = 0; let gapEvents = 0;
      const script = [];
      let qq = 0; let tt = 0;
      for (let k = 0; k < ops.length; k++) {
        const op = ops[k];
        if (op === 'I' || op === 'D') {
          if (k === 0 || ops[k - 1] !== op) gapEvents += 1;
          if (op === 'I') { I += 1; qq += 1; } else { D += 1; tt += 1; }
          script.push(op);
          continue;
        }
        const v = columnOp(query[qq], span[tt]);
        if (v === '=') M += 1; else X += 1;
        script.push(v); qq += 1; tt += 1;
      }
      const sc = makeScore({
        M, X, I, D, gapEvents, script: script.join(''), query, span,
        targetStart, targetEnd: targetStart + span.length,
      });
      if (!best || compareCanonical(sc, best) < 0) best = sc;
      return;
    }
    if (qi < query.length && ti < span.length) walk(qi + 1, ti + 1, [...ops, 'M']);
    if (qi < query.length) walk(qi + 1, ti, [...ops, 'I']);
    if (ti < span.length) walk(qi, ti + 1, [...ops, 'D']);
  };
  walk(0, 0, []);
  return best;
}

// ─────────────────────────── reference 2: Pareto DP ───────────────────────────

const dominates = (a, b) => (
  a.M >= b.M && a.X <= b.X && a.I <= b.I && a.D <= b.D
  && a.gapEvents <= b.gapEvents
  && (a.M > b.M || a.X < b.X || a.I < b.I || a.D < b.D || a.gapEvents < b.gapEvents)
);

const vectorKey = (c) => `${c.M},${c.X},${c.I},${c.D},${c.gapEvents}`;

/**
 * Insert into one cell (a Map keyed by numeric vector).
 *
 * The load-bearing rule (Игорь, oracle review): for the SAME numeric vector and the same
 * `lastOp`, keep ONLY the lexicographically smallest script. This is not a heuristic — it is
 * exact. Script length is `M+X+I+D`, so equal vectors ⇒ equal-length scripts; any common
 * suffix appends the same characters to both, so lexicographic order of the finished scripts
 * equals lexicographic order of the prefixes. §3.2 rule 7 would pick the smallest anyway, so
 * dropping the rest changes nothing except that equivalent paths stop multiplying — which is
 * what made a 20x20 span cost 92 s.
 */
function insertPareto(cell, cand) {
  const k = vectorKey(cand);
  const twin = cell.get(k);
  if (twin) {
    if (cand.script < twin.script) cell.set(k, cand); // lex-min wins; count stays 1
    return { added: 0, removed: 0 };
  }
  for (const x of cell.values()) if (dominates(x, cand)) return { added: 0, removed: 0 };
  let removed = 0;
  for (const [xk, x] of [...cell]) if (dominates(cand, x)) { cell.delete(xk); removed += 1; }
  cell.set(k, cand);
  return { added: 1, removed };
}

/**
 * Best alignment of `query` against `target[s..e)` by Pareto DP over (M,X,I,D,gapEvents),
 * keyed by `lastOp` so gap-run structure stays comparable.
 */
/**
 * @param {{stats?:object, budget?:number, account?:{accounted:number,budget:number}}} [opts]
 *   stats   — filled with `{ accountedStates, peakStates, transitions }`. `accountedStates` is
 *             the monotonic count of states ever accepted (conservative); `peakStates` is the
 *             max simultaneously held (add − remove). They are different numbers on purpose.
 *   budget  — per-call cap on `accountedStates`. Injectable so a TEST can force the
 *             `state budget exceeded` branch on a small input — otherwise the size guard fires
 *             first and that branch is never exercised (its mutation would stay GREEN).
 *   account — shared aggregate accumulator threaded by `oracleSearchLinear`; a fast single span
 *             does not prove a safe full search.
 */
export function bestForSpan(rawQuery, rawTarget, s, e, opts = {}) {
  guard(rawQuery, rawTarget, DP_MAX_QUERY, DP_MAX_TARGET, 'bestForSpan');
  const query = normalize(rawQuery);
  const target = normalize(rawTarget);
  guardSpan(s, e, target.length, 'bestForSpan');
  const span = target.slice(s, e);
  const n = query.length; const m = span.length;

  const { stats = null, account = null } = opts;
  const budget = opts.budget ?? MAX_STATES;

  const LAST = ['S', 'M', 'I', 'D'];
  const key = (i, j, last) => `${i}|${j}|${last}`;
  const cells = new Map();
  let live = 0; let peak = 0; let accounted = 0; let transitions = 0;
  const put = (i, j, last, cand) => {
    const k = key(i, j, last);
    if (!cells.has(k)) cells.set(k, new Map());
    const { added, removed } = insertPareto(cells.get(k), cand);
    live += added - removed;
    if (live > peak) peak = live;
    accounted += added;
    transitions += 1;
    if (stats) { stats.accountedStates = accounted; stats.peakStates = peak; stats.transitions = transitions; }
    if (account) {
      account.accounted += added;
      if (account.accounted > account.budget) {
        throw new Error(`glocal-oracle: aggregate state budget exceeded (${account.accounted} > ${account.budget})`);
      }
    }
    if (accounted > budget) {
      throw new Error(`bestForSpan: state budget exceeded (${accounted} > ${budget})`);
    }
  };
  put(0, 0, 'S', { M: 0, X: 0, I: 0, D: 0, gapEvents: 0, script: '' });

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      for (const last of LAST) {
        const here = cells.get(key(i, j, last));
        if (!here || !here.size) continue;
        for (const c of [...here.values()]) {
          if (i < n && j < m) {
            const v = columnOp(query[i], span[j]);
            put(i + 1, j + 1, 'M', {
              M: c.M + (v === '=' ? 1 : 0),
              X: c.X + (v === 'X' ? 1 : 0),
              I: c.I, D: c.D, gapEvents: c.gapEvents, script: c.script + v,
            });
          }
          if (i < n) {
            put(i + 1, j, 'I', {
              ...c, I: c.I + 1, gapEvents: c.gapEvents + (last === 'I' ? 0 : 1), script: `${c.script}I`,
            });
          }
          // `D` only strictly INSIDE the query (0 < i < n). A `D` at i===0 is a leading gap and
          // at i===n a trailing one — under target-local semantics those are free target flanks,
          // i.e. a different (shorter) span, not an edit (§3.2).
          //
          // This MUST be a DP transition rule, not a post-filter. As a post-filter it was a real
          // bug: for q=AC / t=GGTAA the illegal `DDD=X` (M=1) dominates the legal `XDDDX` (M=0)
          // on every Pareto axis, so the legal candidate was pruned away and the winner was then
          // thrown out by the filter — leaving nothing. Encoding the rule here means dominance
          // only ever compares candidates that are actually allowed to exist.
          if (j < m && i > 0 && i < n) {
            put(i, j + 1, 'D', {
              ...c, D: c.D + 1, gapEvents: c.gapEvents + (last === 'D' ? 0 : 1), script: `${c.script}D`,
            });
          }
        }
      }
    }
  }

  let best = null;
  for (const last of LAST) {
    for (const c of (cells.get(key(n, m, last)) || new Map()).values()) {
      // No filter here on purpose — the leading/trailing-D rule is enforced by the transition
      // above, so every candidate that reaches this point is already legal. Re-filtering here
      // is what hid the pruning bug.
      const sc = makeScore({ ...c, query, span, targetStart: s, targetEnd: e });
      if (!best || compareCanonical(sc, best) < 0) best = sc;
    }
  }
  return best;
}

/**
 * Endpoint-shadow pruning (SPEC §3.2.1), as an INDEPENDENT reference implementation.
 *
 * Deliberately kept separate from `oracleSearchLinear`, which still returns the RAW per-start set:
 * the semantic change introduced by §3.2.1 must be visible as its own step and verifiable on its
 * own, and the production engine must be differentially checked against `prune(raw)` rather than
 * against a pruned oracle that shares its code.
 *
 * B is dropped iff some A exists with the same physical target endpoint, a STRICTLY nested
 * interval in EITHER direction, and a strict win on the full §3.2 comparator. Equivalently: for
 * one `(strand, physicalEndpoint)` only the comparator-best candidate survives — neither "inner"
 * nor "outer" is privileged, because an outer-worse and an inner-worse hit are equally just
 * alternative explanations of the same endpoint's boundary. On a strict comparator tie NOTHING is
 * dropped.
 *
 * Sharing an endpoint means the intervals are `[E − span, E)`, so "strictly nested" reduces to
 * "different span"; and rule 6 of the comparator (smaller target end) is constant inside a group,
 * so it cannot discriminate — exactly as the spec requires, otherwise a ring rotation could change
 * the winner.
 *
 * This is endpoint shadow, NOT overlap clustering: hits with DIFFERENT endpoints never collapse,
 * so `AA` in `AAAA` keeps starts 0,1,2 (endpoints 2,3,4) and tandem repeats keep every copy.
 * Linear/single-strand by construction here; production also folds the circular endpoint modulo n
 * and prunes `+` and `−` separately.
 */
export function pruneEndpointShadows(hits) {
  const out = [];
  for (const b of hits) {
    let shadowed = false;
    for (const a of hits) {
      if (a === b) continue;
      if (a.targetEnd !== b.targetEnd) continue; //          2 — same physical endpoint
      if (a.targetSpan === b.targetSpan) continue; //        3 — strictly nested, either direction
      if (compareCanonical(a, b) < 0) { shadowed = true; break; } // 4 — A strictly wins
    }
    if (!shadowed) out.push(b);
  }
  return out;
}

/**
 * Reference glocal search over a LINEAR target, one strand. Returns the RAW per-start set;
 * apply `pruneEndpointShadows` to obtain the §3.2.1 result.
 * @param {{thresholdBps?:number}} [opts]
 */
export function oracleSearchLinear(rawQuery, rawTarget, opts = {}) {
  guard(rawQuery, rawTarget, DP_MAX_QUERY, DP_MAX_TARGET, 'oracleSearchLinear');
  const query = normalize(rawQuery);
  const target = normalize(rawTarget);
  const thresholdBps = opts.thresholdBps ?? 8000;
  if (!Number.isInteger(thresholdBps) || thresholdBps < 0 || thresholdBps > 10000) {
    throw new RangeError(`oracleSearchLinear: thresholdBps must be an integer 0..10000 (got ${thresholdBps})`);
  }
  // §2.7 — beyond this span every extra target base is a D: L grows while M cannot, so the
  // threshold is unreachable. Mirrors the production bound.
  const maxSpan = Math.min(target.length, Math.floor((query.length * 10000) / Math.max(thresholdBps, 1)));

  // Aggregate meter across every span. A single fast `bestForSpan` does not bound the whole
  // search — there are O(targetLen^2) spans — so they share one ceiling.
  const account = { accounted: 0, budget: opts.aggregateBudget ?? FULL_SEARCH_STATES };

  const byStart = new Map();
  for (let s = 0; s <= target.length; s++) {
    for (let e = s; e <= Math.min(target.length, s + maxSpan); e++) {
      const sc = bestForSpan(query, target, s, e, { account });
      if (!sc || sc.acceptBps < thresholdBps) continue;
      const prev = byStart.get(s);
      if (!prev || compareCanonical(sc, prev) < 0) byStart.set(s, sc);
    }
  }
  return [...byStart.values()].sort((a, b) => a.targetStart - b.targetStart);
}
