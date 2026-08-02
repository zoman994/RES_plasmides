/**
 * dna-glocal-oracle.js — INDEPENDENT reference oracle for SEARCH-GAPPED-DNA.
 *
 * Normative source: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.1-2.7, §3.1, §3.2, §3.2.1, §6.
 * Test-only. Production imports nothing from this file.
 *
 * WHY A SECOND ORACLE NEXT TO helpers/glocal-oracle.js
 * ----------------------------------------------------
 * `helpers/glocal-oracle.js` is the K1-K3 oracle for the PRODUCTION engine, and it prunes its
 * DP by Pareto dominance. Dominance is an argument that can be subtly wrong. This file exists to
 * check the EXPERIMENTAL linear/Dinkelbach kernel (dna-linear-kernel.js) against a reference that
 * shares no code and no reduction with it, so that a shared mistake cannot hide:
 *
 *   1. Acceptance is literally `M * 10000 >= thresholdBps * L`, integer cross multiplication.
 *      There is NO linear score, NO theta-weighted match/error weights, NO Dinkelbach iteration
 *      and NO fractional programming anywhere in this file. If the linear reformulation under
 *      test is wrong, this oracle cannot be wrong in the same direction.
 *   2. Spans are enumerated literally: every start x every legal end. No candidate scan, no
 *      Myers, no plateau grouping, no banding, no threshold-as-pruning.
 *   3. Inside one span every alignment is enumerated. Two enumerators are exported and are
 *      differentially cross-checked by the test file:
 *        - `bruteSpan` : literal recursion over every alignment path (capped 6x8);
 *        - `dpSpan`    : DP retaining EVERY distinct (M,X,I,D,gapEvents) vector per
 *                        (i, j, lastOp) cell, with NO dominance pruning at all.
 *
 * §DP-EXACTNESS — the only reduction performed, and why it is exact.
 *    Inside cell (i,j) with a given lastOp, two partial paths with the SAME vector
 *    (M,X,I,D,gapEvents) are interchangeable: any common suffix appends the same characters and
 *    the same gap-event increments (identical lastOp), so both finish with the same final vector.
 *    Comparator rules 1-6 depend only on the final vector, so they tie; rule 7 then picks the
 *    lexicographically smaller script. Script length equals M+X+I+D, so equal-vector prefixes are
 *    equal length and a shared suffix preserves lexicographic order. Therefore keeping only the
 *    lex-min script per (cell, lastOp, vector) changes no final answer. Nothing else is dropped.
 *
 * SIZE. Intended for query <= 12, target <= 20. That is not a limitation to work around; it is
 * the contract of a reference. `findOccurrences` throws above the caps.
 */

// ───────────────────────────── caps and guards ─────────────────────────────

export const ORACLE_CAPS = Object.freeze({
  MAX_QUERY: 12,
  MAX_TARGET: 20,
  BRUTE_MAX_QUERY: 6,
  BRUTE_MAX_WINDOW: 8,
});

function fail(msg) { throw new Error(`oracle: ${msg}`); }

// ───────────────────────────── alphabet (§2.5) ─────────────────────────────

/** Trim + uppercase, and NOTHING else. No U->T, no gap stripping (§2.5). */
export function normalize(s) { return String(s ?? '').trim().toUpperCase(); }

const ACGT = new Set(['A', 'C', 'G', 'T']);

/**
 * §2.2/§2.5: a column is `=` only when both bases are literal, equal ACGT. Any target symbol
 * outside ACGT is `X` and can never prove a match. The query is ACGT-only by contract, so the
 * `ACGT.has(qc)` half is a fail-closed assertion, not a feature.
 */
export function columnOp(qc, tc) {
  return (qc === tc && ACGT.has(qc) && ACGT.has(tc)) ? '=' : 'X';
}

const COMP = { A: 'T', C: 'G', G: 'C', T: 'A' };

/** Concrete-only reverse complement of an ACGT query (§2.5, §2.6). */
export function reverseComplement(q) {
  let out = '';
  for (let i = q.length - 1; i >= 0; i--) {
    const c = COMP[q[i]];
    if (!c) fail(`reverseComplement: non-ACGT base '${q[i]}'`);
    out += c;
  }
  return out;
}

// ───────────────────────────── integer ratio (§2.3) ─────────────────────────────

/** floor(num/den) in basis points. Integer only — 80.00% passes, 79.99% does not. */
export function ratioBps(num, den) {
  if (den <= 0) return 0;
  return Math.floor((num * 10000) / den);
}

/** Acceptance, cross-multiplied, no division: M/L >= thresholdBps/10000. */
export function accepts(M, L, thresholdBps) {
  return M * 10000 >= thresholdBps * L;
}

// ───────────────────────────── §3.2 comparator, literal 7 steps ─────────────────────────────

/**
 * Lower is better; <0 means `a` wins, >0 means `b` wins, 0 means comparator-equal.
 * Every step is integer. No float, no division, no localeCompare.
 *
 * Required fields: M, L, editDistance, indelEvents, targetSpan, queryLength, targetEnd, script.
 * `targetEnd` is the value rule 6 is allowed to see; the caller decides whether that is the raw
 * unwrapped end (per-start canonical choice) or the shared lifted endpoint E (§3.2.1 pruning).
 */
export function compareCanonical(a, b) {
  // 1 — higher identity ratio M/L, by cross multiplication
  const lhs = a.M * b.L;
  const rhs = b.M * a.L;
  if (lhs !== rhs) return rhs - lhs;
  // 2 — more matched bases
  if (a.M !== b.M) return b.M - a.M;
  // 3 — smaller edit distance
  if (a.editDistance !== b.editDistance) return a.editDistance - b.editDistance;
  // 4 — fewer indel events
  if (a.indelEvents !== b.indelEvents) return a.indelEvents - b.indelEvents;
  // 5 — smaller |targetSpan - queryLength|
  const da = Math.abs(a.targetSpan - a.queryLength);
  const db = Math.abs(b.targetSpan - b.queryLength);
  if (da !== db) return da - db;
  // 6 — smaller target end
  if (a.targetEnd !== b.targetEnd) return a.targetEnd - b.targetEnd;
  // 7 — lexicographically smaller edit script (column-expanded, over '=','X','I','D')
  if (a.script < b.script) return -1;
  if (a.script > b.script) return 1;
  return 0;
}

/** Assemble a comparable record from raw counts. */
function makeRecord({ M, X, I, D, gapEvents, script }, queryLength, targetSpan, targetEnd) {
  const L = M + X + I + D;
  if (L !== script.length) fail(`record: L=${L} but script.length=${script.length}`);
  if (M + X + I !== queryLength) fail(`record: M+X+I=${M + X + I} != queryLength=${queryLength}`);
  if (M + X + D !== targetSpan) fail(`record: M+X+D=${M + X + D} != targetSpan=${targetSpan}`);
  return {
    M, X, I, D, L,
    gapEvents,
    editDistance: X + I + D,
    indelEvents: gapEvents,
    queryLength,
    targetSpan,
    targetEnd,
    identityBps: ratioBps(M, L),
    script,
  };
}

/** gapEvents recomputed from a finished script — maximal runs of I or of D (§3.2 rule 4). */
export function countGapEvents(script) {
  let n = 0;
  for (let k = 0; k < script.length; k++) {
    const op = script[k];
    if (op !== 'I' && op !== 'D') continue;
    if (k === 0 || script[k - 1] !== op) n += 1;
  }
  return n;
}

// ───────────────────────────── enumerator 1: literal brute force ─────────────────────────────

/**
 * Enumerate EVERY alignment path of the FULL probe against the FULL window, score each, return
 * the comparator-best. Leading/trailing `D` are rejected (§3.2: under target-local semantics a
 * boundary target base is a free flank, i.e. a different, shorter span — not an edit).
 *
 * Obviously correct, hopelessly slow. Used to check the DP.
 */
export function bruteSpan(probe, window, targetEnd) {
  if (probe.length > ORACLE_CAPS.BRUTE_MAX_QUERY || window.length > ORACLE_CAPS.BRUTE_MAX_WINDOW) {
    fail(`bruteSpan is capped at ${ORACLE_CAPS.BRUTE_MAX_QUERY}x${ORACLE_CAPS.BRUTE_MAX_WINDOW}`
      + ` (got ${probe.length}x${window.length})`);
  }
  const n = probe.length;
  const m = window.length;
  let best = null;

  const walk = (qi, ti, script) => {
    if (qi === n && ti === m) {
      if (script[0] === 'D' || script[script.length - 1] === 'D') return;
      let M = 0; let X = 0; let I = 0; let D = 0;
      for (const op of script) {
        if (op === '=') M += 1;
        else if (op === 'X') X += 1;
        else if (op === 'I') I += 1;
        else D += 1;
      }
      if (M + X + I + D === 0) return;
      const s = script.join('');
      const rec = makeRecord({ M, X, I, D, gapEvents: countGapEvents(s), script: s }, n, m, targetEnd);
      if (!best || compareCanonical(rec, best) < 0) best = rec;
      return;
    }
    if (qi < n && ti < m) walk(qi + 1, ti + 1, [...script, columnOp(probe[qi], window[ti])]);
    if (qi < n) walk(qi + 1, ti, [...script, 'I']);
    if (ti < m) walk(qi, ti + 1, [...script, 'D']);
  };
  walk(0, 0, []);
  return best;
}

// ───────────────────────────── enumerator 2: exhaustive DP ─────────────────────────────

/**
 * Same answer as `bruteSpan`, computed by DP that retains EVERY distinct state vector per
 * (i, j, lastOp) cell — no dominance pruning at all (see §DP-EXACTNESS in the header).
 *
 * Leading/trailing `D` is a TRANSITION rule (`0 < i < n`), never a post-filter: as a post-filter
 * an illegal path can outrank and hide a legal one, and then the filter deletes the winner and
 * leaves nothing.
 */
export function dpSpan(probe, window, targetEnd) {
  const n = probe.length;
  const m = window.length;
  if (n === 0 || m === 0) return null;

  const LAST = ['S', 'M', 'I', 'D'];
  const cells = new Map(); // "i|j|lastOp" -> Map(vectorKey -> state)
  const put = (i, j, last, st) => {
    const ck = `${i}|${j}|${last}`;
    let cell = cells.get(ck);
    if (!cell) { cell = new Map(); cells.set(ck, cell); }
    const vk = `${st.M},${st.X},${st.I},${st.D},${st.gapEvents}`;
    const twin = cell.get(vk);
    if (!twin || st.script < twin.script) cell.set(vk, st); // lex-min per vector: exact, see header
  };

  put(0, 0, 'S', { M: 0, X: 0, I: 0, D: 0, gapEvents: 0, script: '' });

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      for (const last of LAST) {
        const cell = cells.get(`${i}|${j}|${last}`);
        if (!cell || cell.size === 0) continue;
        for (const c of [...cell.values()]) {
          if (i < n && j < m) {
            const v = columnOp(probe[i], window[j]);
            put(i + 1, j + 1, 'M', {
              M: c.M + (v === '=' ? 1 : 0),
              X: c.X + (v === 'X' ? 1 : 0),
              I: c.I,
              D: c.D,
              gapEvents: c.gapEvents,
              script: c.script + v,
            });
          }
          if (i < n) {
            put(i + 1, j, 'I', {
              M: c.M, X: c.X, I: c.I + 1, D: c.D,
              gapEvents: c.gapEvents + (last === 'I' ? 0 : 1),
              script: `${c.script}I`,
            });
          }
          if (j < m && i > 0 && i < n) {
            put(i, j + 1, 'D', {
              M: c.M, X: c.X, I: c.I, D: c.D + 1,
              gapEvents: c.gapEvents + (last === 'D' ? 0 : 1),
              script: `${c.script}D`,
            });
          }
        }
      }
    }
  }

  let best = null;
  for (const last of LAST) {
    const cell = cells.get(`${n}|${m}|${last}`);
    if (!cell) continue;
    for (const c of cell.values()) {
      const rec = makeRecord(c, n, m, targetEnd);
      if (!best || compareCanonical(rec, best) < 0) best = rec;
    }
  }
  return best;
}

// ───────────────────────────── §3.2.1 endpoint-shadow pruning ─────────────────────────────

/**
 * Literal §3.2.1. Candidate B is dropped iff there exists A such that ALL of:
 *   1. A is on the SAME strand as B;
 *   2. A and B share the same PHYSICAL target endpoint;
 *   3. their single-lap target intervals are STRICTLY nested — in EITHER direction;
 *   4. A strictly wins the full §3.2 comparator.
 * On a strict comparator tie NOTHING is dropped. Different endpoints NEVER merge.
 *
 * Circular: the physical endpoint is (start + span) mod n, and both intervals are lifted to the
 * group's shared unwrapped endpoint E and compared as [E - span, E). Sharing E means "strictly
 * nested" reduces exactly to "different span", and rule 6 of the comparator is constant inside
 * the group — so the winner cannot depend on where the origin happens to sit.
 *
 * This is endpoint shadow, NOT overlap clustering: `AA` in `AAAA` keeps starts 0,1,2 because
 * their endpoints are 2,3,4 — different, so nothing collapses.
 */
export function pruneEndpointShadows(occs) {
  const groups = new Map();
  for (const o of occs) {
    const k = `${o.strand}|${o.end}`; // strand + PHYSICAL endpoint
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const dropped = new Set();
  for (const [, group] of groups) {
    const E = group[0].end; // shared lifted endpoint; rule 6 sees the same value for everyone
    for (const b of group) {
      for (const a of group) {
        if (a === b) continue;
        if (a.targetSpan === b.targetSpan) continue; // 3 — strictly nested, either direction
        const ra = { ...a, targetEnd: E };
        const rb = { ...b, targetEnd: E };
        if (compareCanonical(ra, rb) < 0) { dropped.add(b); break; } // 4 — strict win
      }
    }
  }
  return occs.filter((o) => !dropped.has(o));
}

// ───────────────────────────── the search ─────────────────────────────

const STRAND_ORDER = { '+': 0, '-': 1 };

/**
 * findOccurrences(query, target, opts) -> Occurrence[]
 *
 * opts = { thresholdBps:int 5000..10000, circular:boolean, bothStrands:boolean, spanSolver?:fn }
 *
 * Occurrence = { strand, start, targetSpan, end, M, X, I, D, gapEvents,
 *                alignmentLength, identityBps, script }
 *
 * Pipeline, in the normative order:
 *   for each strand -> for each normalized start -> for every legal span
 *     -> enumerate ALL alignments of the whole probe against that window
 *     -> comparator-best alignment for that (strand, start, span)
 *     -> keep only spans whose alignment passes M/L >= threshold
 *     -> comparator-best across spans = the ONE canonical alignment for (strand, start) [§3.2]
 *   -> §3.2.1 endpoint-shadow pruning, per strand
 *   -> deterministic sort by (strand, start)
 */
export function findOccurrences(query, target, opts = {}) {
  const thresholdBps = opts.thresholdBps ?? 8000;
  const circular = !!opts.circular;
  const bothStrands = opts.bothStrands !== false;
  const spanSolver = opts.spanSolver ?? dpSpan;

  if (!Number.isInteger(thresholdBps) || thresholdBps < 5000 || thresholdBps > 10000) {
    fail(`thresholdBps must be an integer 5000..10000 (got ${thresholdBps})`);
  }

  const q = normalize(query);
  const t = normalize(target);
  for (const ch of q) if (!ACGT.has(ch)) fail(`query must be ACGT-only (found '${ch}')`);
  if (q.length > ORACLE_CAPS.MAX_QUERY || t.length > ORACLE_CAPS.MAX_TARGET) {
    fail(`reference is small-input only: query<=${ORACLE_CAPS.MAX_QUERY},`
      + ` target<=${ORACLE_CAPS.MAX_TARGET} (got ${q.length}/${t.length})`);
  }
  const n = t.length;
  if (q.length === 0 || n === 0) return [];

  // §2.7 — past this span every extra target base is a D: L grows while M cannot, so the
  // threshold becomes unreachable. Enumerating further would only waste time, never add a hit.
  const maxSpan = Math.min(n, Math.floor((q.length * 10000) / thresholdBps));
  if (maxSpan < 1) return [];

  const strands = bothStrands ? ['+', '-'] : ['+'];
  const out = [];

  for (const strand of strands) {
    // The probe is what actually runs along INCREASING target coordinates (§2.6): the query on
    // '+', its reverse complement on '-'. The script is therefore 5'->3' along the probe, and the
    // query length scalar is identical on both strands.
    const probe = strand === '+' ? q : reverseComplement(q);

    for (let start = 0; start < n; start++) {
      let bestRec = null;
      let bestSpan = 0;

      const spanCap = circular ? maxSpan : Math.min(maxSpan, n - start);
      for (let span = 1; span <= spanCap; span++) {
        // §2.7: span <= n already, so no physical base is ever consumed twice and a second lap
        // around the circle is impossible.
        let window = '';
        for (let k = 0; k < span; k++) window += t[(start + k) % n];

        // Rule 6 during per-start selection sees the RAW unwrapped end. For a fixed start this is
        // monotone in span, so it is rotation-independent by construction.
        const rec = spanSolver(probe, window, start + span);
        if (!rec) continue;
        if (!accepts(rec.M, rec.L, thresholdBps)) continue;
        if (!bestRec || compareCanonical(rec, bestRec) < 0) { bestRec = rec; bestSpan = span; }
      }

      if (!bestRec) continue;
      out.push({
        strand,
        start,
        targetSpan: bestSpan,
        end: circular ? (start + bestSpan) % n : start + bestSpan, // PHYSICAL endpoint
        M: bestRec.M,
        X: bestRec.X,
        I: bestRec.I,
        D: bestRec.D,
        gapEvents: bestRec.gapEvents,
        alignmentLength: bestRec.L,
        identityBps: bestRec.identityBps,
        script: bestRec.script,
        // comparator-visible mirrors, kept so pruning can reuse compareCanonical unchanged
        L: bestRec.L,
        editDistance: bestRec.editDistance,
        indelEvents: bestRec.indelEvents,
        queryLength: bestRec.queryLength,
        targetEnd: bestRec.targetEnd,
      });
    }
  }

  const kept = pruneEndpointShadows(out);
  kept.sort((a, b) => (STRAND_ORDER[a.strand] - STRAND_ORDER[b.strand]) || (a.start - b.start));
  return kept.map((o) => ({
    strand: o.strand,
    start: o.start,
    targetSpan: o.targetSpan,
    end: o.end,
    M: o.M, X: o.X, I: o.I, D: o.D,
    gapEvents: o.gapEvents,
    alignmentLength: o.alignmentLength,
    identityBps: o.identityBps,
    script: o.script,
  }));
}
