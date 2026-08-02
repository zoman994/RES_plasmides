/**
 * dna-approx-scan — bit-parallel, SEED-FREE candidate scan for approximate DNA matching
 * (SEARCH-GAPPED-DNA K1, SPEC §4.1; K2 resource budget; K3.0 ACGT-only).
 *
 * The gapped search needs to know WHERE the whole query might align within an edit budget,
 * WITHOUT demanding a surviving exact k-mer (a hit can carry an edit in every window, §6.1(11)).
 * Myers' 1999 bit-vector algorithm computes, in O(n·⌈m/w⌉), the edit distance of the pattern
 * against the best-matching text substring ending at each position — no seed required.
 *
 * The occurrence model keys on the START of the match (§3.2), so this module scans STARTS by
 * running Myers over the pattern and text read RIGHT-TO-LEFT (a reverse-substring ending at
 * reverse-index j is a forward substring starting at `n − (j+1)`). It never materialises reversed
 * strings nor a target-sized distance array: the DP streams position by position and collects
 * qualifying starts inline (§4.3 — no O(target) allocation before the budget can fire).
 *
 * Columns match by LITERAL EQUALITY of characters (K3.0, §2.5): the interactive engine is
 * ACGT-only, so an unknown glyph — `N`, `R`, `U`, anything — simply never contributes an `Eq` bit
 * and therefore counts as a mismatch. It is NOT treated as «any base»: mask overlap would let a
 * poly-N stretch masquerade as a perfect hit, which is the opposite of what a biologist needs to
 * see. The scan stays a CONSERVATIVE FILTER: unrestricted Levenshtein is a lower bound on the
 * glocal edit count, so it may over-include a start (wasting one alignment), never under-include.
 *
 * A shared meter counts EVERY scanned text position on the SCAN axis (U1, §3.3), so a
 * low-complexity megabase target yields an honest `RESOURCE_LIMIT` (thrown) long before it can
 * exhaust memory or hang a weak machine, instead of a false "0 hits". The scan axis is its OWN
 * quota: sweeping a big molecule — twice, when both strands are searched — must never eat the
 * alignment verifier's budget and turn a cheap exact locus into a resource failure. Pure.
 */
import { chargeScan } from './dna-search-budget';
import { drainSync } from './dna-search-cooperative';
import { BlockMyers, blockCount } from './dna-myers-block';

/**
 * How many text positions the sweep runs between two suspension points (U4-CANCEL C1).
 *
 * This is the INTERIOR boundary that makes a cancel real. Yielding only between documents or
 * between candidates is not enough: a single 1 Mb molecule is ONE document and ONE uninterrupted
 * sweep, so a cancel arriving mid-scan would still wait for the whole megabase. 8192 positions is
 * ~0.2–0.4 ms of scan on the measured hardware — far inside the 100 ms cancel gate — while the
 * per-chunk suspension cost stays invisible against the recurrence itself.
 */
export const SCAN_CHUNK_POSITIONS = 8192;

/**
 * Stream Myers' bit-vector recurrence over a text of length `n`, calling `visit(j, score)` after
 * each position, where `score` is the edit distance of the pattern against the best text
 * substring ending at `j+1`. `pat[i]` is the pattern character at position `i` (already in scan
 * order); `charAt(j)` returns the text char at scan position `j`. No array allocation.
 *
 * RESUMABLE (U4-CANCEL C1): a generator that suspends every `chunk` positions. The recurrence
 * itself stays a tight `for` loop with no suspension inside it, so the hot path is unchanged —
 * the generator boundary is crossed once per chunk, not once per base. Draining it without ever
 * yielding (`drainSync`) is bit-for-bit the old synchronous sweep; that is the whole point.
 */
/**
 * Equal-position masks for a pattern of ARBITRARY symbols, discovered lazily.
 *
 * The block recurrence wants one contiguous row of words per symbol; the scan does not know its
 * alphabet in advance (the target may contain any glyph). Rows are therefore built the first time a
 * symbol is seen and cached, and a symbol the PATTERN does not contain gets no row at all — its base
 * is -1, which the recurrence reads as «all zeros». That is the literal-equality rule this module has
 * always enforced: an unknown glyph matches nothing rather than matching everything, so a poly-N
 * stretch can never masquerade as a perfect hit.
 */
function lazyPeq(pat, m, nb) {
  const bases = Object.create(null);
  let data = new Int32Array(nb * 4);
  let used = 0;
  return {
    get data() { return data; },
    baseOf(c) {
      const known = bases[c];
      if (known !== undefined) return known;
      let any = false;
      for (let i = 0; i < m; i += 1) if (pat[i] === c) { any = true; break; }
      if (!any) { bases[c] = -1; return -1; }
      if ((used + 1) * nb > data.length) {
        const grown = new Int32Array(Math.max(data.length * 2, (used + 1) * nb));
        grown.set(data);
        data = grown;
      }
      const base = used * nb;
      for (let i = 0; i < m; i += 1) if (pat[i] === c) data[base + (i >>> 5)] |= (1 << (i & 31));
      used += 1;
      bases[c] = base;
      return base;
    },
  };
}

/**
 * Stream Myers' bit-vector recurrence over a text of length `n`, calling `visit(j, score)` after
 * each position, where `score` is the edit distance of the pattern against the best text
 * substring ending at `j+1`. `pat[i]` is the pattern character at position `i` (already in scan
 * order); `charAt(j)` returns the text char at scan position `j`. No array allocation.
 *
 * RESUMABLE (U4-CANCEL C1): a generator that suspends every `chunk` positions. The recurrence
 * itself stays a tight `for` loop with no suspension inside it, so the hot path is unchanged —
 * the generator boundary is crossed once per chunk, not once per base. Draining it without ever
 * yielding (`drainSync`) is bit-for-bit the old synchronous sweep; that is the whole point.
 *
 * ARITHMETIC (U6-B): the recurrence runs on 32-bit words through the shared `BlockMyers`, not on one
 * arbitrary-width `BigInt`. A CPU profile of the shipped worker put 71.5 % of an approximate 1 Mb
 * pass inside the BigInt sweep — every position allocated fresh big integers for `Xv/Xh/Ph/Mh/Pv/Mv`.
 * The recurrence is the same one, in the same order, reporting the same distance at every position;
 * only the representation of the word changed. The cutoff is deliberately OFF here: this caller needs
 * the exact distance at EVERY position to separate exact starts from approximate ones, which is
 * precisely what an active-block cutoff stops reporting.
 */
function* runMyersSteps(m, pat, charAt, n, visit, chunk) {
  if (m === 0) {
    for (let j = 0; j < n;) {
      const stop = Math.min(n, j + chunk);
      for (; j < stop; j++) visit(j, 0);
      if (j < n) yield;
    }
    return;
  }
  const nb = blockCount(m);
  const state = new BlockMyers(m, 0);
  state.reset(false);
  const peq = lazyPeq(pat, m, nb);
  for (let j = 0; j < n;) {
    const stop = Math.min(n, j + chunk);
    for (; j < stop; j++) {
      const base = peq.baseOf(charAt(j));
      visit(j, state.advance(peq.data, base, false));
    }
    if (j < n) yield;
  }
}

/** The sweep with no suspension — the pre-C1 behaviour, kept for the non-resumable primitives. */
function runMyers(m, pat, charAt, n, visit) {
  drainSync(runMyersSteps(m, pat, charAt, n, visit, Infinity));
}

/**
 * Myers end-distances against `text` (forward), matching characters literally.
 * `out[j]` = edit distance of `pattern` vs the best text substring ending at `j+1`. Retained as a
 * primitive; the hot search path uses `scanCandidateStarts` (which never allocates this array).
 * @returns {number[]} length === text.length
 */
export function myersEndDistances(pattern, text) {
  const n = text.length;
  const out = new Array(n);
  runMyers(pattern.length, pattern, (j) => text[j], n, (j, s) => { out[j] = s; });
  return out;
}

/**
 * Forward START positions where the whole `query` aligns to `target` within `k` edits.
 * Seed-free, streaming. Sorted ascending, deduplicated.
 * @param {string} query validated A/C/G/T (§2.5)
 * @param {string} target uppercased target; any non-ACGT glyph simply matches nothing
 * @param {number} k max edit budget (non-negative integer)
 * @param {object|null} [meter] shared session meter (`dna-search-budget`); throws a typed
 *   RESOURCE_LIMIT once scanned positions push the SCAN axis past its quota (§3.3, §4.3)
 * @returns {number[]}
 */
/**
 * The same sweep, but keeping the two answers it already computes SEPARATELY (U8):
 * `exact` = starts whose edit distance is 0, `approx` = starts within `k` but not exact.
 *
 * The scan has always known both — `score` is computed at every position and then collapsed to a
 * single `score <= budget` test. Splitting it costs nothing and lets a caller verify the cheap
 * exact candidates on a `k=0` band before deciding whether the expensive approximate DP is needed
 * at all. That ordering is the whole point: on a repeat-rich molecule the approximate DP is
 * unaffordable, while the exact answer is one diagonal per candidate.
 *
 * `exact` and `approx` are DISJOINT. A caller that falls through to approximate verification must
 * verify their UNION, because the single-threshold scan it replaces returned both together — an
 * exact locus is also a legitimate approximate hit.
 *
 * @returns {{ exact:number[], approx:number[] }} both ascending and deduplicated
 */
export function* scanCandidateStartsSplitSteps(query, target, k, meter = null, chunk = SCAN_CHUNK_POSITIONS) {
  const n = target.length;
  const m = query.length;
  if (!query || !target || m > n + k) return { exact: [], approx: [] };
  const budget = Math.max(0, Math.floor(k));

  const pat = new Array(m);
  for (let i = 0; i < m; i++) pat[i] = query[m - 1 - i];
  const charAt = (j) => target[n - 1 - j];

  const exact = new Set();
  const approx = new Set();
  yield* runMyersSteps(m, pat, charAt, n, (j, score) => {
    chargeScan(meter);
    if (score > budget) return;
    const start = n - (j + 1);
    if (start < 0) return;
    (score === 0 ? exact : approx).add(start);
  }, chunk);
  // A query that is all trailing insertions can start at n; that is never an exact occurrence.
  if (m <= budget) approx.add(n);

  const asc = (s) => [...s].sort((a, b) => a - b);
  return { exact: asc(exact), approx: asc(approx) };
}

export function scanCandidateStartsSplit(query, target, k, meter = null) {
  return drainSync(scanCandidateStartsSplitSteps(query, target, k, meter, Infinity));
}

export function* scanCandidateStartsSteps(query, target, k, meter = null, chunk = SCAN_CHUNK_POSITIONS) {
  const n = target.length;
  const m = query.length;
  if (!query || !target || m > n + k) return [];
  const budget = Math.max(0, Math.floor(k));

  // Scan STARTS by reading both sequences right-to-left, without allocating reversed strings:
  // scan position i ↔ query[m−1−i] / target[n−1−j]; a reverse-end at j+1 ↔ forward start n−(j+1).
  const pat = new Array(m);
  for (let i = 0; i < m; i++) pat[i] = query[m - 1 - i];
  const charAt = (j) => target[n - 1 - j];

  const starts = new Set();
  yield* runMyersSteps(m, pat, charAt, n, (j, score) => {
    chargeScan(meter); // AXIS SCAN (§3.3) — throws typed RESOURCE_LIMIT past the scan quota
    if (score <= budget) {
      const start = n - (j + 1);
      if (start >= 0) starts.add(start);
    }
  }, chunk);
  // Distance for the empty reverse-prefix (forward start n) is the pattern length; a query that is
  // all trailing insertions could legitimately start at n, so include it when the budget allows.
  if (m <= budget) starts.add(n);

  return [...starts].sort((a, b) => a - b);
}

export function scanCandidateStarts(query, target, k, meter = null) {
  return drainSync(scanCandidateStartsSteps(query, target, k, meter, Infinity));
}
