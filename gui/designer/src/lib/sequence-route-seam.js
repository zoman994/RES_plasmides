/**
 * sequence-route-seam — an INTERNAL benchmark switch for HOW the sequence provider routes a query
 * (SEARCH-GAPPED-DNA U7).
 *
 * Three benchmark routes address the same biological question, but differ in cost and in COMPLETENESS
 * behaviour — see the U7 verdict below, where SINGLE_PASS answers `RESOURCE_LIMIT` on a molecule that
 * EXACT_FIRST answers with 229 loci. All three are accepted by the setter; only the default ships.
 *
 *   EXACT_FIRST (default, shipped) — run a dedicated 100% pass, return its hits if any, otherwise
 *     run the approximate pass. Simple and obviously correct, but it sweeps the whole molecule
 *     TWICE whenever the query is not present verbatim, which is the common case for approximate
 *     search. MEASURED on 1 Mb / q100 / both strands: 1385 ms total = 469 ms exact + 867 ms
 *     approximate. The first sweep contributes nothing to the answer — it is pure tax.
 *
 *   SINGLE_PASS (prototype) — one approximate sweep answers both questions, because an exact
 *     match costs 0 edits and 0 ≤ k for every k: the approximate scan's candidate set is a strict
 *     SUPERSET of the exact one. Exact hits are then read off the result by `identity === 1`.
 *
 * ── MEASURED VERDICT (U7): DO NOT SWITCH. ────────────────────────────────────────────────────
 * The superset claim is TRUE and parity holds on 17 of 18 checked shapes — but the claim is about
 * which candidates are found, and says nothing about what they cost. Measured, 1 Mb, q100, both
 * strands:
 *
 *              q100 exact        q100 approximate
 *   exact-first   505 ms            1979 ms
 *   single-pass  1274 ms            1491 ms      (−25 % approximate, +152 % EXACT)
 *
 * It trades a large regression on the common, cheap case for a modest win on the expensive one,
 * because an exact query is answered by a k=0 band (one diagonal, no frontier) while single-pass
 * forces it through the full approximate DP. Worse, on a repeat-rich molecule that DP is
 * unaffordable: `dna-single-pass-parity.test.js` pins a tandem array where exact-first returns 229
 * exact loci and single-pass returns `RESOURCE_LIMIT` — a search that works today would start
 * reporting "incomplete".
 *
 * The tax it was built to remove is real (the molecule is swept twice), but the sweep is the
 * SHARED work — the DP is not. Removing the tax therefore means sharing the SCAN while keeping
 * the alignment conditional: one sweep that records candidates with score 0 separately from
 * candidates within k, aligning the exact ones on a k=0 band first. That is an engine change,
 * not a route change, and it is not attempted here. (It was eventually removed a third way — by
 * answering the exact question literally instead of with a DP at all; see the final verdict below.)
 *
 *   SHARED_SCANNER (U8) — the design that verdict pointed at: sweep once at the approximate budget
 *     but keep the score-0 candidates apart, verify those on a `k=0` band, and only build the
 *     approximate DP when nothing exact survived. Exact queries keep their cheap path (that is what
 *     U7 broke), while an approximate query stops paying for a second sweep.
 *
 * ── MEASURED VERDICT (U8): CORRECT AND USEFUL, BUT NOT THE DEFAULT YET. ──────────────────────
 * Parity holds on 17 of 17 checked shapes INCLUDING the tandem array that killed U7 (500 exact
 * loci, complete, on both routes). Measured, same corpus: q100 exact 529.6 → 491.2 ms (no
 * regression) and q100 approximate 1540.1 → 1163.5 ms (−24 %). The two-sweep tax is gone; what
 * remains is the approximate DP itself, so no further ROUTE change can move this number.
 *
 * ── FINAL VERDICT (U6/U7): THE SHIPPED ROUTE IS `EXACT_FIRST`. ───────────────────────────────
 * The U8 numbers above were measured against the OLD exact phase, which answered the 100 % question
 * by running the bit-parallel engine with a zero edit budget — and that is what SHARED_SCANNER was
 * cheaper than. The exact phase has since been rewritten as a corpus-wide LITERAL scan
 * (`dna-literal-exact.js`), proven envelope-identical, and the second sweep it removed was the whole
 * tax SHARED_SCANNER existed to collect. Re-measured on the real 2822-molecule base, the difference
 * between the two routes now sits INSIDE the measurement's own control envelope — there is no
 * remaining effect to switch for.
 *
 * So no decision here is deferred to a weak machine, and SHARED_SCANNER is not a pending change of
 * default. Neither route awaits anything: `EXACT_FIRST` ships. What used to dominate the approximate
 * pass — the verifier — was cut by a KERNEL change instead (`sequence-kernel-seam`, LINEAR), and cut
 * is the right word: 1.7× to 3.8× on ordinary approximate cells and 18× on repeat homology, not
 * removed. Approximate queries taking seconds still exist; the remaining cost is the alignment work
 * itself, and no ROUTE change can reach it.
 *
 * The seam stays for the same reason `sequence-kernel-seam` does — it is the instrument that
 * produced these verdicts and the gate any future attempt must pass. Same discipline: one
 * module-level variable, benchmark and parity use only, no user setting, no persistence, defaults to
 * the shipped route, and a fresh import always starts there.
 *
 * Pure: no store, no UI, no I/O.
 */

export const SEQUENCE_ROUTE = Object.freeze({
  EXACT_FIRST: 'exact-first',
  SINGLE_PASS: 'single-pass',
  SHARED_SCANNER: 'shared-scanner',
});

const DEFAULT_ROUTE = SEQUENCE_ROUTE.EXACT_FIRST;
let current = DEFAULT_ROUTE;

/** Which route the sequence provider should use right now. */
export function getSequenceRoute() {
  return current;
}

/**
 * Force a route — for benchmarks and parity tests only. Refuses anything but a known value, so the
 * seam can never be turned into a free-form flag.
 * @param {'exact-first'|'single-pass'|'shared-scanner'} route
 */
export function setSequenceRouteForBenchmark(route) {
  if (route !== SEQUENCE_ROUTE.EXACT_FIRST
      && route !== SEQUENCE_ROUTE.SINGLE_PASS
      && route !== SEQUENCE_ROUTE.SHARED_SCANNER) {
    throw new Error(`unknown sequence route: ${String(route)}`);
  }
  current = route;
}

/** Return to the default. Call in test teardown so a forced selection cannot leak between tests. */
export function resetSequenceRoute() {
  current = DEFAULT_ROUTE;
}
