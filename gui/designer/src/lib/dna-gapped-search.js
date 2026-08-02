/**
 * dna-gapped-search — glocal DNA search over both strands, linear and circular molecules, with a
 * deterministic resource budget (SEARCH-GAPPED-DNA K1+K2+K3.0, SPEC §2, §3).
 *
 * Pipeline (SPEC §4.1) per strand: derive an edit budget from the threshold → seed-free scan for
 * candidate STARTS → one bounded traceback per start → keep the §3.2-canonical occurrence per
 * start → filter by exact identity → sort → cap. One occurrence per
 * `(strand, normalizedStart)` (§3.2).
 *
 * ACGT-ONLY (§2.5). This engine is the interactive DNA search, and it deals in A/C/G/T only. The
 * query is validated in the core, fail-closed, so bypassing the UI guard cannot smuggle a
 * degenerate motif in: an invalid query is a typed `INVALID_DNA` throw, never "no matches". The
 * target is only uppercased — nothing is rewritten or stripped, so a `U` or an `N` in the molecule
 * stays a real base that simply mismatches (an `X` column), and identity keeps meaning M/L exactly.
 * Degenerate-base support lives on in `lib/iupac.js` for primers, enzymes and protein search.
 *
 * K2 additions:
 *   • both strands — `bothStrands:true` also searches the reverse complement; a `+` and a `−`
 *     occurrence at the same location with an equivalent alignment merge into one `strand:'both'`
 *     (§2.6). The engine default is single-strand; the product default (both) is applied by the
 *     caller in K3.
 *   • circular — `circular:true` lets one hit cross the origin once, returning two ordered
 *     segments; `targetSpan ≤ targetLength`, no second lap (§2.7).
 *   • resource budget — four INDEPENDENT deterministic axes (`dna-search-budget`): scan work,
 *     verifier states, traceback/materialisation and emitted output. On exhaustion of ANY of them
 *     the engine yields a typed `RESOURCE_LIMIT` incomplete session with NO sequence hits, never a
 *     silent zero (§3.3), and NAMES the axis that ran out (`limitedAxis`).
 *
 * ── WHERE THE CODE LIVES SINCE U4-CANCEL C1 ──────────────────────────────────────────────────
 * This file is the PUBLIC FACADE and the synchronous entry point. The pipeline itself moved to
 * `dna-gapped-session-steps.js`, where it is a RESUMABLE generator that suspends at bounded
 * interior points (inside the Myers sweep and inside the frontier verifier), and the occurrence
 * canonicalisation rules (§3.1/§3.2/§3.2.1) moved to `dna-gapped-occurrence.js`.
 *
 * Nothing about the biology changed: `dnaGappedSearchSession` is that generator drained WITHOUT
 * ever suspending, so it executes the same instructions in the same order and returns the same
 * bytes. The worker drives the same generator a slice at a time, which is what finally lets a
 * cancel stop the CPU instead of waiting ~2 s for Chromium's forced worker termination.
 *
 * Threshold is compared in integer basis points (§2.3). Pure; no worker, no store, no React.
 */
import { RESOURCE_LIMIT } from './dna-search-budget';
import { drainSync } from './dna-search-cooperative';
import { dnaGappedSessionSteps, INVALID_DNA } from './dna-gapped-session-steps';

export { RESOURCE_LIMIT, INVALID_DNA };
export { normalizeDna, editBudget, maxTargetSpan } from './dna-gapped-session-steps';
export { pruneEndpointShadows } from './dna-gapped-occurrence';

/**
 * Map a probe edit-run range back to indices of the ORIGINAL query (§3.1, §2.6). On `+` the probe
 * IS the query. On `−` the probe is the reverse complement, so probe index i ↔ query index
 * (queryLength−1−i); a half-open probe run maps to the mirrored half-open query window.
 */
export function queryRangeForRun(run, strand, queryLength) {
  if (strand === '-') {
    return { queryStart: queryLength - run.probeEnd, queryEnd: queryLength - run.probeStart };
  }
  return { queryStart: run.probeStart, queryEnd: run.probeEnd };
}

/**
 * Full search session (§3.3), drained synchronously. Returns
 * `{ occurrences, incomplete, reason, limitedAxis }`. On resource exhaustion of ANY axis:
 * `occurrences:[]`, `incomplete:true`, `reason:RESOURCE_LIMIT`, and `limitedAxis` naming the axis —
 * every partial sequence hit is discarded (a partial candidate must not be selectable, and a false
 * "0 hits" is worse than an honest incomplete).
 *
 * A query that is not A/C/G/T throws `INVALID_DNA` (§2.5): the UI blocks it long before this, so
 * reaching here means a guard was bypassed, and answering "no matches" would be a lie about the
 * molecule. An EMPTY query is not an error — it is simply no search.
 *
 * @param {{ thresholdBps?:number, limit?:number, bothStrands?:boolean,
 *   circular?:boolean, topology?:'linear'|'circular', stateBudget?:number|null,
 *   budgets?:{ scan?:number|null, verifier?:number|null, traceback?:number|null,
 *              output?:number|null } }} [opts] `budgets` sets the four independent axes; an
 *   omitted axis takes its own default, `null` makes that axis unbounded (§3.3)
 * @throws {Error & {code:'INVALID_DNA'}}
 */
export function dnaGappedSearchSession(rawQuery, rawTarget, opts = {}) {
  return drainSync(dnaGappedSessionSteps(rawQuery, rawTarget, opts));
}

/**
 * Back-compatible array API (K1): the occurrences of a session, ascending by start. Incompleteness
 * is only visible on `dnaGappedSearchSession`; an incomplete pass returns `[]` here.
 * @returns {Array<object>}
 */
export function dnaGappedSearch(rawQuery, rawTarget, opts = {}) {
  return dnaGappedSearchSession(rawQuery, rawTarget, opts).occurrences;
}
