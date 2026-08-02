/**
 * dna-search-budget — the FOUR INDEPENDENT resource axes of the gapped DNA search
 * (SEARCH-GAPPED-DNA U1, SPEC §3.3, §4.2.1).
 *
 * WHY THIS MODULE EXISTS. Until U1 the engine had exactly ONE counter, `meter.states`, incremented
 * both once per SCANNED TEXT POSITION (`dna-approx-scan`) and once per ACCEPTED DP STATE
 * (`dna-gapped-align`), checked against a single 4 000 000 ceiling. Those are not the same
 * resource: the scan is a linear sweep whose cost is fixed by the molecule and paid TWICE when
 * both strands are searched, while the verifier's cost is fixed by how hard the alignment is.
 * Sharing one meter meant an ordinary 100 nt probe on a ~1 Mb molecule spent ~2·10⁶ of the ceiling
 * on scanning alone and bailed with `RESOURCE_LIMIT` on a locus that is EXACT and cheap — a false
 * resource failure. Raising the shared ceiling would have hidden the coupling, not removed it.
 *
 * So each axis now carries its own quota, its own counter and its own NAME:
 *   • scan      — text positions visited by the Myers sweep (both strands + circular overlay);
 *   • verifier  — DP states accepted into the alignment frontier;
 *   • traceback — parent links walked while materialising a script (winner + rule-7 ties);
 *   • output    — occurrences materialised for emission.
 * No axis may consume another's remaining quota, and exhausting ANY of them produces the identical
 * §3.3 outcome: typed `RESOURCE_LIMIT`, `incomplete:true`, `occurrences:[]` — plus `limitedAxis`,
 * so a reader can tell a scan blow-up from a verifier blow-up instead of guessing.
 *
 * LEGACY `stateBudget` is preserved verbatim as a FIFTH, opt-in, COMBINED cap over
 * `scan + verifier` (`meter.states` / `meter.budget`). It is only armed when a caller passes it,
 * which is what keeps the K2 budget tests and the K3.1 threshold-bound mutation gate meaningful:
 * those tests deliberately compare scan positions and DP states against one shared number.
 *
 * Pure; no worker, no store, no React.
 */

export const RESOURCE_LIMIT = 'RESOURCE_LIMIT';

/** Canonical axis order — also the order used in telemetry. */
export const BUDGET_AXES = ['scan', 'verifier', 'traceback', 'output'];

/**
 * Per-axis defaults. NOT "pick a big number": each is derived from MEASURED telemetry on this
 * engine, against the declared live boundary (approximate query ≤ 100 nt, shipped identity
 * threshold 0.8, molecule up to 1 Mb, both strands), with a stated headroom factor.
 *
 *   scan       24 000 000 — the sweep is linear in target length and paid once per strand, so the
 *                honest unit is "molecule × strands". MEASURED: 1 Mb both strands = 2 000 000
 *                positions exactly. The declared 10 Mb stress corpus on both strands is 20·10⁶;
 *                24·10⁶ covers it plus the circular origin overlay, and leaves the live 1 Mb case
 *                using 8 % of its quota. Past this it is not an interactive search.
 *
 *   verifier    5 000 000 — MEASURED accepted DP states, q100 @80 %, 1 Mb, both strands:
 *                2 270 349 on random background, 2 510 544 on a low-complexity background (the
 *                worse of the two — repeat-rich molecules cost more, not less). 5·10⁶ is 1.99× the
 *                worst measured live case, so a corpus-dependent surprise of up to 2× still
 *                completes. It deliberately sits BELOW the 7 094 370 that the same probe needs at
 *                a 75 % threshold, and below what q200/q400 need: work outside the declared live
 *                boundary bails typed on THIS axis instead of grinding, which is the honest answer
 *                until U6 measures those regimes.
 *                This is NOT the old 4·10⁶ ceiling raised. That one was SHARED: on a 1 Mb
 *                both-strand search the scan consumed 2·10⁶ of it first, leaving the verifier
 *                ~2·10⁶ — LESS than the 2.27–2.51·10⁶ the live case demonstrably needs. That
 *                deficit is precisely the false RESOURCE_LIMIT U1 removes.
 *                MEASURED AND DELIBERATELY NOT COVERED: a 1 Mb SHARED-BACKBONE corpus (100 near
 *                identical 10 kb repeats, ~2 % divergence) exceeds 20·10⁶ states and runs ~29 s,
 *                because every copy yields a whole ladder of shifted candidate starts. Sizing the
 *                default to swallow that would mean promising a 30-second "interactive" search;
 *                it bails typed on the verifier axis instead, which is the honest answer until the
 *                U3/U6 kernel work makes that regime affordable. Recorded here so the next reader
 *                does not mistake it for an unknown.
 *
 *   traceback   8 000 000 — one unit per parent link walked. MEASURED: 31 081 for the live q100 /
 *                1 Mb case, and 411 957 for an 80 kb tandem array of 4 000 copies (~103 links per
 *                materialised locus). Extrapolating that rate to a FULL 1 Mb tandem array
 *                (~50 000 copies) gives ~5.15·10⁶; 8·10⁶ is 1.55× that, and 257× the live case.
 *
 *   output       200 000 — occurrences MATERIALISED (`limit` truncates a completed ranking and
 *                stays complete; blowing this axis means enumeration never finished). MEASURED:
 *                45 for q100 / 1 Mb, and 19 998 for the 4 000-copy tandem array (both strands).
 *                A full 1 Mb tandem array is ~50 000 loci × 2 strands ≈ 10⁵; 200 000 is 2× that,
 *                and 200× the default `limit` of 1000.
 */
export const DEFAULT_BUDGETS = Object.freeze({
  scan: 24_000_000,
  verifier: 5_000_000,
  traceback: 8_000_000,
  output: 200_000,
});

/**
 * Typed exhaustion. The axis travels ON the error (`err.axis`) AND is recorded on the meter, so
 * the session can name it even when the throw is re-shaped on the way out.
 */
export function resourceLimitError(meter, axis) {
  if (meter && meter.limitedAxis === null) meter.limitedAxis = axis;
  const e = new Error('RESOURCE_LIMIT');
  e.code = RESOURCE_LIMIT;
  e.axis = axis;
  return e;
}

export const INVALID_BUDGET = 'INVALID_BUDGET';

/**
 * A quota is legal only as `undefined` (default), `null` (that axis unbounded) or a finite
 * non-negative INTEGER. Everything else is refused fail-closed.
 *
 * WHY THIS IS A GUARD AND NOT A COERCION. Every gate reads `used > budget`, and that comparison
 * is ALWAYS false against `NaN` and against `Infinity`. The previous `Math.max(0, Math.floor(v))`
 * mapped NaN, ±Infinity, strings, objects and arrays onto exactly those two values, so a
 * malformed budget did not clamp — it switched the axis OFF while telemetry still reported a
 * quota. Silent unlimited is the one outcome a resource guard must never produce, so a bad value
 * stops the call before any search work begins instead of being repaired into something plausible.
 */
function requireQuota(value, where) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    const e = new Error(`${INVALID_BUDGET}: ${where} must be undefined, null or a non-negative integer`);
    e.code = INVALID_BUDGET;
    e.where = where;
    throw e;
  }
  return value;
}

/** Legacy combined scan+verifier cap; same three legal shapes, same fail-closed refusal. */
export function resolveStateBudget(value) {
  return requireQuota(value, 'stateBudget') ?? null;
}

/**
 * `opts.budgets` → a complete per-axis map. `undefined` on an axis = that axis's own default;
 * `null` = unbounded on that axis. One axis being unbounded never widens another.
 * Throws typed `INVALID_BUDGET` on any other shape (see `requireQuota`).
 */
export function resolveBudgets(raw) {
  const out = {};
  for (const axis of BUDGET_AXES) {
    const v = requireQuota(raw ? raw[axis] : undefined, `budgets.${axis}`);
    out[axis] = v === undefined ? DEFAULT_BUDGETS[axis] : v;
  }
  return out;
}

/**
 * Fresh per-session meter: the deterministic resource budget (§3.3) AND the bench breakdown
 * (§4.2.1) — a `<1 s` miss must say WHERE the work went, not merely that it was slow.
 *
 * @param {{scan:number|null, verifier:number|null, traceback:number|null, output:number|null}} b
 * @param {number|null} statesBudget legacy combined scan+verifier cap; `null` = not armed
 */
export function makeMeter(b, statesBudget = null) {
  return {
    // ── the four independent axes ────────────────────────────────────────────────────────────
    scanUsed: 0,
    scanBudget: b.scan,
    verifierUsed: 0,
    verifierBudget: b.verifier,
    tracebackUsed: 0,
    tracebackBudget: b.traceback,
    outputUsed: 0,
    outputBudget: b.output,
    limitedAxis: null,
    // ── legacy combined cap (armed only when a caller passes `stateBudget`) ───────────────────
    states: 0,
    budget: statesBudget,
    // ── breakdown counters (never gate anything) ─────────────────────────────────────────────
    scanPositions: 0,
    dpStates: 0,
    rawStarts: 0,
    alignCalls: 0,
    beforePrune: 0,
    retained: 0,
    scanMs: 0,
    alignMs: 0,
    pruneMs: 0,
    // frontier accounting (§4.2.1) — attempts vs accepted says whether the cost is real work or
    // churn; peakFrontier says whether Pareto width is the remaining problem.
    attempts: 0,
    accepted: 0,
    duplicates: 0,
    rejectedDominated: 0,
    removedDominated: 0,
    liveFrontier: 0,
    peakFrontier: 0,
    rule7Compares: 0,
    parentLinks: 0,
    updates: 0, // D-key kernel: in-place improvements of an existing cell
    arenaBytes: 0, // PEAK arena footprint
    scratchBytesAllocated: 0, // CUMULATIVE arena allocation (proves scratch reuse, not peak)
    boundPruned: 0, // states the admissible threshold bound refused (§2.3)
  };
}

/**
 * AXIS SCAN — one scanned text position. Called from the innermost Myers visit, so it stays flat
 * field arithmetic; a meter that predates U1 (plain `{states, budget}`) is tolerated.
 */
export function chargeScan(meter, n = 1) {
  if (!meter) return;
  meter.states += n;
  if (meter.scanPositions !== undefined) meter.scanPositions += n;
  if (meter.scanUsed !== undefined) {
    meter.scanUsed += n;
    if (meter.scanBudget != null && meter.scanUsed > meter.scanBudget) {
      throw resourceLimitError(meter, 'scan');
    }
  }
  if (meter.budget != null && meter.states > meter.budget) throw resourceLimitError(meter, 'scan');
}

/** AXIS VERIFIER — one DP state accepted into the frontier. */
export function chargeVerifier(meter, n = 1) {
  if (!meter) return;
  meter.states += n;
  if (meter.dpStates !== undefined) meter.dpStates += n;
  if (meter.verifierUsed !== undefined) {
    meter.verifierUsed += n;
    if (meter.verifierBudget != null && meter.verifierUsed > meter.verifierBudget) {
      throw resourceLimitError(meter, 'verifier');
    }
  }
  if (meter.budget != null && meter.states > meter.budget) {
    throw resourceLimitError(meter, 'verifier');
  }
}

/**
 * AXIS TRACEBACK — parent links walked while materialising a path. Deliberately NOT charged to the
 * verifier: scoring a state and reconstructing its script are different resources, and a rule-7
 * tie storm can walk far more links than the DP ever accepted states.
 */
export function chargeTraceback(meter, n = 1) {
  if (!meter || meter.tracebackUsed === undefined) return;
  meter.tracebackUsed += n;
  if (meter.tracebackBudget != null && meter.tracebackUsed > meter.tracebackBudget) {
    throw resourceLimitError(meter, 'traceback');
  }
}

/**
 * AXIS OUTPUT — one occurrence MATERIALISED. This is a resource ceiling, categorically unlike
 * `opts.limit`: `limit` truncates a ranking that was completed (session stays complete), whereas
 * blowing this axis means enumeration never finished and the session must bail typed + empty.
 */
export function chargeOutput(meter, n = 1) {
  if (!meter || meter.outputUsed === undefined) return;
  meter.outputUsed += n;
  if (meter.outputBudget != null && meter.outputUsed > meter.outputBudget) {
    throw resourceLimitError(meter, 'output');
  }
}

/** Per-axis telemetry, AGGREGATED over both strands and the circular overlay. */
export function budgetsOf(meter) {
  return {
    scan: { used: meter.scanUsed, budget: meter.scanBudget },
    verifier: { used: meter.verifierUsed, budget: meter.verifierBudget },
    traceback: { used: meter.tracebackUsed, budget: meter.tracebackBudget },
    output: { used: meter.outputUsed, budget: meter.outputBudget },
  };
}

/**
 * Full session profile (§4.2.1). Wall-clock lives here, which is why it is opt-in
 * (`collectStats`): the session shape ordinary callers compare must stay deterministic (§3.3).
 */
export function statsOf(meter, query, target, thresholdBps, totalMs, reason) {
  return {
    queryLength: query.length,
    targetLength: target.length,
    thresholdBps,
    scanMs: +meter.scanMs.toFixed(1),
    scanPositions: meter.scanPositions,
    rawStarts: meter.rawStarts,
    alignCalls: meter.alignCalls,
    alignMs: +meter.alignMs.toFixed(1),
    scoreStates: meter.dpStates,
    tracebackCount: meter.alignCalls, // today every alignment tracebacks; the kernel will cut this
    tracebackLinks: meter.tracebackUsed,
    beforePrune: meter.beforePrune,
    retainedLoci: meter.retained,
    pruneMs: +meter.pruneMs.toFixed(1),
    totalMs: +totalMs.toFixed(1),
    attempts: meter.attempts,
    accepted: meter.accepted,
    duplicates: meter.duplicates,
    rejectedDominated: meter.rejectedDominated,
    removedDominated: meter.removedDominated,
    peakFrontier: meter.peakFrontier,
    rule7Compares: meter.rule7Compares,
    parentLinks: meter.parentLinks,
    boundPruned: meter.boundPruned,
    updates: meter.updates,
    arenaKB: Math.round(meter.arenaBytes / 1024),
    scratchBytesAllocated: meter.scratchBytesAllocated,
    budgets: budgetsOf(meter),
    limitedAxis: meter.limitedAxis,
    reason,
  };
}
