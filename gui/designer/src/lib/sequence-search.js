/**
 * sequence-search — Sprint M-X.9 K1.
 *
 * Pure seed-and-extend DNA search per DEC-SEARCH-SEED-EXTEND-01.
 * No gaps (Smith-Waterman with gaps deferred — substitutions cover
 * 90 %+ of biolog use cases per the 10.05.2026 contract).
 *
 * Algorithm:
 *   • Adaptive seed = `min(8, floor(query.length / 2))`, ≥ 4.
 *   • Build a Map<seed, [pos, …]> over the target ONCE.
 *   • For each seed window in the query, look up positions in the
 *     index, then extend in both directions until either:
 *       (a) the score drops by ≥ DROP from the running max, or
 *       (b) `RUN_OF_K` consecutive mismatches.
 *   • Score = (+1 match, −2 mismatch).
 *   • Both query strands are searched (the second strand reuses
 *     the same target index — we revcomp the query).
 *   • A hit is kept iff identity ≥ identityThreshold (default 0.8).
 *   • Hits with overlapping target spans are deduplicated, keeping
 *     the longest.
 *
 * Hit shape:
 *   {
 *     entryId,            // optional, set by the index search wrapper
 *     strand,             // +1 or -1 (which query strand matched)
 *     targetStart,        // 0-based inclusive
 *     targetEnd,          // 0-based exclusive
 *     queryStart,         // 0-based inclusive (in original query)
 *     queryEnd,           // 0-based exclusive
 *     length,             // targetEnd - targetStart === queryEnd - queryStart
 *     matches,            // count
 *     mismatches,         // count
 *     identity,           // matches / length, 0..1
 *     mismatchPositions,  // array of target positions (absolute)
 *     coverage,           // queryEnd - queryStart (informational)
 *     threePrimeOk,       // bool: matches in last 3 nt of query (query.length ≤ 50)
 *                         //       null when irrelevant (long query)
 *   }
 *
 * The 3'-end indicator (DEC-SEARCH-3END-INFO-NOT-FILTER-01) is
 * informational only — hits are NOT filtered out when it's false.
 */

const DEFAULT_OPTS = Object.freeze({
  identityThreshold: 0.8,
  match: 1,
  mismatch: -2,
  // 11.05.2026 — was 5. Biolog reported intermittent «2 mismatches
  // break the search». Trace: pattern M,m,m near the start of an
  // extension drops score from 1 to -3 (drop=4), one more m hits
  // drop=5 → break before the run hits the consecutive-3 cliff.
  // Bumping to 8 lets up to ~3 isolated mm accumulate in a sliding
  // window before bail-out; `runOfK=3` still cuts off true
  // 3-in-a-row (which biologically signals «wrong region»).
  drop: 8,
  runOfK: 3,
  // 11.05.2026 — supersedes the «no gaps» guidance from
  // DEC-SEARCH-SEED-EXTEND-01. Allow at most one single-nt indel
  // PER EXTENSION DIRECTION (so up to two per hit: one in the
  // left-walk, one in the right-walk). A single inserted/deleted
  // nucleotide is the most common biological mismatch class and
  // strict-no-gap left it invisible (e.g. query 15 nt with one
  // extra A at the middle would surface as 9/15 instead of 14/15).
  // Affine-gap full Smith-Waterman is still off the table — this
  // is the cheapest fix that catches the dominant case.
  maxGapsPerSide: 1,
  gapPenalty: 3,            // score cost for opening a gap
  gapMinRecovery: 3,        // require ≥ this many matches in the lookahead window for gap to be accepted
  bothStrands: true,
  primerModeMaxLen: 50,
});

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };

export function reverseComplement(seq) {
  if (!seq) return '';
  const out = new Array(seq.length);
  for (let i = 0; i < seq.length; i++) {
    const c = seq[seq.length - 1 - i].toUpperCase();
    out[i] = COMPLEMENT[c] || c;
  }
  return out.join('');
}

export function adaptiveSeedLen(queryLen) {
  if (!Number.isFinite(queryLen) || queryLen < 8) return 4;
  return Math.max(4, Math.min(8, Math.floor(queryLen / 2)));
}

/**
 * Build a seed → positions index for one target sequence.
 * Returns `Map<string, number[]>`. Seed is uppercase.
 */
export function buildSeedIndex(target, seedLen) {
  const seq = (target || '').toUpperCase();
  const idx = new Map();
  if (!seq || seedLen <= 0 || seq.length < seedLen) return idx;
  for (let i = 0; i + seedLen <= seq.length; i++) {
    const seed = seq.slice(i, i + seedLen);
    if (seed.includes('N')) continue; // skip ambiguous seeds
    let arr = idx.get(seed);
    if (!arr) { arr = []; idx.set(seed, arr); }
    arr.push(i);
  }
  return idx;
}

/**
 * Lookahead helper for gap recovery — count how many of the next
 * `k` (q, t) positions match. Used to decide whether opening a
 * gap is worth the penalty.
 */
function lookaheadMatchesRight(query, target, q, t, k) {
  let m = 0;
  for (let i = 0; i < k; i++) {
    if (q + i >= query.length || t + i >= target.length) break;
    if (query[q + i] === target[t + i]) m += 1;
  }
  return m;
}
function lookaheadMatchesLeft(query, target, q, t, k) {
  let m = 0;
  for (let i = 0; i < k; i++) {
    if (q - i < 0 || t - i < 0) break;
    if (query[q - i] === target[t - i]) m += 1;
  }
  return m;
}

/**
 * Extend in either direction with limited single-nt gap support.
 * Returns:
 *   {
 *     qExt, tExt,                 // extents past the seed boundary
 *     matches, mismatches,        // counts INSIDE the extension only
 *     mismatchPositions,          // absolute target positions
 *     gapsInQuery, gapsInTarget,  // number of single-nt gaps used
 *   }
 *
 * `direction` is +1 (right) or -1 (left). q0/t0 are the start
 * positions just past the seed end (right) or just before the
 * seed start (left).
 */
function extendDirectional(query, target, q0, t0, direction, opts) {
  let q = q0;
  let t = t0;
  let score = 0;
  let best = 0;
  let bestQ = q0 - direction; // «not extended» state — bestQExt computed below
  let bestT = t0 - direction;
  let consecMm = 0;
  let gapsLeft = opts.maxGapsPerSide || 0;
  // Stats are recorded against the BEST point as we accept positions.
  // Since the best point can move backwards on a gap, stats need to
  // be recomputed lazily — keep a running tally and snapshot on best.
  let runMatches = 0;
  let runMismatches = 0;
  const runMm = []; // target positions of mismatches
  let bestMatches = 0;
  let bestMismatches = 0;
  let bestMmSnapshot = [];
  let gapsInQuery = 0;
  let gapsInTarget = 0;
  let bestGapsInQuery = 0;
  let bestGapsInTarget = 0;

  const inBounds = () => (
    direction > 0
      ? (q < query.length && t < target.length)
      : (q >= 0 && t >= 0)
  );
  const advance = () => { q += direction; t += direction; };

  const tryGapRecovery = () => {
    if (gapsLeft <= 0) return false;
    // Two candidate skips. Recovery point is `(bestQ, bestT) + direction`
    // (i.e., right after the last accepted match) plus a single skip
    // on either side.
    const baseQ = bestQ + direction;
    const baseT = bestT + direction;
    const lookahead = direction > 0
      ? lookaheadMatchesRight
      : lookaheadMatchesLeft;
    // Skip a target nt (gap-in-query: query has a deletion → align
    // bestQ.next vs bestT.next.next).
    const matchesIfTSkip = lookahead(query, target, baseQ, baseT + direction, opts.gapMinRecovery);
    // Skip a query nt (gap-in-target: query has an insertion).
    const matchesIfQSkip = lookahead(query, target, baseQ + direction, baseT, opts.gapMinRecovery);
    const candidates = [
      { name: 'skipTarget', matches: matchesIfTSkip, jumpQ: baseQ,           jumpT: baseT + direction },
      { name: 'skipQuery',  matches: matchesIfQSkip, jumpQ: baseQ + direction, jumpT: baseT },
    ];
    candidates.sort((a, b) => b.matches - a.matches);
    const winner = candidates[0];
    if (!winner || winner.matches < opts.gapMinRecovery) return false;
    // Roll state back to best, apply gap penalty, jump.
    score = best - opts.gapPenalty;
    runMatches = bestMatches;
    runMismatches = bestMismatches;
    runMm.length = 0;
    for (const p of bestMmSnapshot) runMm.push(p);
    if (winner.name === 'skipTarget') gapsInQuery += 1;
    else gapsInTarget += 1;
    q = winner.jumpQ;
    t = winner.jumpT;
    consecMm = 0;
    gapsLeft -= 1;
    return true;
  };

  while (inBounds()) {
    if (query[q] === target[t]) {
      score += opts.match;
      consecMm = 0;
      runMatches += 1;
    } else {
      score += opts.mismatch;
      consecMm += 1;
      runMismatches += 1;
      runMm.push(t);
    }
    if (score > best) {
      best = score;
      bestQ = q;
      bestT = t;
      bestMatches = runMatches;
      bestMismatches = runMismatches;
      bestMmSnapshot = runMm.slice();
      bestGapsInQuery = gapsInQuery;
      bestGapsInTarget = gapsInTarget;
    }
    const drop = best - score >= opts.drop;
    const runOut = consecMm >= opts.runOfK;
    if (drop || runOut) {
      if (tryGapRecovery()) {
        continue;
      }
      break;
    }
    advance();
  }

  const qExt = direction > 0
    ? Math.max(0, bestQ - q0 + 1)
    : Math.max(0, q0 - bestQ + 1);
  const tExt = direction > 0
    ? Math.max(0, bestT - t0 + 1)
    : Math.max(0, t0 - bestT + 1);
  return {
    qExt, tExt,
    matches: bestMatches,
    mismatches: bestMismatches,
    mismatchPositions: bestMmSnapshot,
    gapsInQuery: bestGapsInQuery,
    gapsInTarget: bestGapsInTarget,
  };
}

function extendRight(query, target, q0, t0, opts) {
  return extendDirectional(query, target, q0, t0, +1, opts);
}
function extendLeft(query, target, q0, t0, opts) {
  return extendDirectional(query, target, q0, t0, -1, opts);
}

function buildHit(query, target, queryStart, queryEnd, targetStart, targetEnd, strand, opts, stats) {
  const queryLen = Math.max(1, query.length);
  const queryCovered = queryEnd - queryStart;
  const targetCovered = targetEnd - targetStart;
  if (queryCovered <= 0 || targetCovered <= 0) return null;
  // 11.05.2026 (Фикс 7) — Identity position-independence.
  // Inside the extension we use precomputed stats (gap-aware).
  // OUTSIDE the extension, we extend the alignment 1:1 from each
  // boundary, counting matches/mismatches over the FULL query
  // window. This guarantees `queryIdentity = matches / queryLen`
  // is constant for fixed-K mismatches regardless of where they
  // fall (which BLAST does as a final pass after seed-extend).
  // Pre-anchor: where query[0] would map if alignment continued
  // 1:1 to the left of the seed.
  // Post-anchor: where query[queryLen-1] would map continuing
  // 1:1 to the right. Pre/post anchors can differ by the indel
  // shift count when the extension used a gap.
  const insideMatches = stats?.matches ?? 0;
  const insideMm = stats?.mismatchPositions || [];
  const gapsInQuery = stats?.gapsInQuery || 0;
  const gapsInTarget = stats?.gapsInTarget || 0;
  const preAnchor = targetStart - queryStart;
  const postAnchor = targetEnd - queryEnd;
  let extraMatches = 0;
  const extraMm = [];
  // Pre-extension: query[0..queryStart) ⟷ target[preAnchor..targetStart)
  let alignableStart = queryStart; // query indices < this are off-target (pre-overhang)
  for (let i = queryStart - 1; i >= 0; i--) {
    const ti = preAnchor + i;
    if (ti < 0) break; // off the start of target → pre-overhang, stop counting
    alignableStart = i;
    if (query[i] === target[ti]) extraMatches += 1;
    else extraMm.push(ti);
  }
  // Post-extension: query[queryEnd..queryLen) ⟷ target[targetEnd..)
  let alignableEnd = queryEnd; // query indices ≥ this are off-target (post-overhang)
  for (let i = queryEnd; i < queryLen; i++) {
    const ti = postAnchor + i;
    if (ti >= target.length) break; // off the end of target → post-overhang
    alignableEnd = i + 1;
    if (query[i] === target[ti]) extraMatches += 1;
    else extraMm.push(ti);
  }
  const totalMatches = insideMatches + extraMatches;
  const alignableLen = alignableEnd - alignableStart;
  // queryIdentity is over the FULL query length — position-independent.
  // queryCoverage reflects how much of the query maps to a valid
  // target position (= 1.0 unless the hit overhangs target edges).
  const queryIdentity = totalMatches / queryLen;
  const queryCoverage = alignableLen / queryLen;
  const mismatches = alignableLen - totalMatches - gapsInQuery - gapsInTarget;
  const mm = [...insideMm, ...extraMm].sort((a, b) => a - b);
  // Filter on queryIdentity so a tiny perfect-match subseed of a
  // long query no longer survives at low coverage.
  if (queryIdentity < opts.identityThreshold) return null;
  // Update queryStart/queryEnd to reflect the FULL alignable window
  // (not just where seed-extend stopped). UI uses these to show
  // `query[X..Y)` only when partial coverage (overhang).
  const fullQueryStart = alignableStart;
  const fullQueryEnd = alignableEnd;
  const fullTargetStart = preAnchor + fullQueryStart;
  const fullTargetEnd = postAnchor + fullQueryEnd;
  // Override the extension-derived spans with the alignment window.
  queryStart = fullQueryStart;
  queryEnd = fullQueryEnd;
  targetStart = fullTargetStart;
  targetEnd = fullTargetEnd;
  const length = alignableLen;
  // 3'-end indicator: only meaningful for primer-length queries.
  // Look at the last 3 nt of the ORIGINAL query — i.e. positions
  // `[query.length - 3, query.length)`. They may or may not be
  // covered by the hit; if uncovered, we treat the indicator as ✗.
  let threePrimeOk = null;
  if (query.length <= opts.primerModeMaxLen) {
    threePrimeOk = true;
    for (let k = Math.max(0, query.length - 3); k < query.length; k++) {
      const inHit = k >= queryStart && k < queryEnd;
      const tIdx = targetStart + (k - queryStart);
      if (!inHit || query[k] !== target[tIdx]) {
        threePrimeOk = false;
        break;
      }
    }
  }
  return {
    strand,
    targetStart,
    targetEnd,
    queryStart,
    queryEnd,
    length,
    matches: totalMatches,
    mismatches,
    // 11.05.2026 (Фикс 7) — `hitIdentity` removed. With full-window
    // alignment, matches/extensionLength is no longer a meaningful
    // secondary metric. `identity` stays as alias for queryIdentity
    // so non-UI callers (LibraryTopBar, tests using old field name)
    // continue to work.
    identity: queryIdentity,
    queryIdentity,
    queryCoverage,
    mismatchPositions: mm,
    // 11.05.2026 — gap counts. Surface to UI so biolog can tell
    // why the alignment isn't a clean run (e.g., «1 indel» tag).
    gapsInQuery,
    gapsInTarget,
    coverage: length,
    threePrimeOk,
  };
}

// Used as a fallback when stats are not provided (legacy / sanity).
// In the gap-aware path, callers always pass precomputed stats.
function countDirectMatches(query, target, queryStart, queryEnd, targetStart) {
  let m = 0;
  const len = queryEnd - queryStart;
  for (let i = 0; i < len; i++) {
    if (query[queryStart + i] === target[targetStart + i]) m += 1;
  }
  return m;
}

function spansOverlap(a, b) {
  // Half-open intervals [start, end). Touching edges DO NOT overlap.
  return a.targetStart < b.targetEnd && b.targetStart < a.targetEnd;
}

function dedupHits(hits) {
  // Drop coincidental shorter alignments that overlap a stronger
  // hit on the same strand. «Stronger» = more matches; ties
  // broken by longer span. This handles two failure modes from
  // multi-seed extension:
  //   (1) Identical hits from different seeds in the same region
  //       → kept only once.
  //   (2) Adjacent/coincidental shorter alignments produced by
  //       seeds near the boundary that extend into a flanking
  //       coincidental match — the «real» alignment wins.
  const sorted = hits.slice().sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return b.length - a.length;
  });
  const kept = [];
  for (const h of sorted) {
    const dominated = kept.some((k) =>
      k.strand === h.strand
      && spansOverlap(k, h)
      && (k.matches > h.matches
        || (k.matches === h.matches && k.length >= h.length
          && (k.targetStart !== h.targetStart || k.targetEnd !== h.targetEnd))),
    );
    if (!dominated) kept.push(h);
  }
  return kept.sort((a, b) => a.targetStart - b.targetStart);
}

function searchOneStrand(query, target, strand, opts, prebuiltIndex) {
  if (!query || !target) return [];
  const seedLen = adaptiveSeedLen(query.length);
  if (query.length < seedLen) return [];
  const idx = prebuiltIndex || buildSeedIndex(target, seedLen);
  const hits = [];
  const seen = new Set(); // dedupe by (qStart, tStart)
  for (let q = 0; q + seedLen <= query.length; q++) {
    const seed = query.slice(q, q + seedLen);
    if (seed.includes('N')) continue;
    const positions = idx.get(seed);
    if (!positions) continue;
    for (const pos of positions) {
      // Gap-tolerant extension on both sides. q-extent and t-extent
      // can differ when a single-nt indel was accepted.
      const right = extendRight(query, target, q + seedLen, pos + seedLen, opts);
      const left = extendLeft(query, target, q - 1, pos - 1, opts);
      const qS = q - left.qExt;
      const tS = pos - left.tExt;
      const qE = q + seedLen + right.qExt;
      const tE = pos + seedLen + right.tExt;
      const key = `${qS}:${tS}:${qE}:${tE}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Aggregate stats across LEFT extension + seed (perfect match) + RIGHT extension.
      const seedMatches = seedLen;
      const stats = {
        matches: left.matches + seedMatches + right.matches,
        mismatches: left.mismatches + right.mismatches,
        mismatchPositions: [...left.mismatchPositions, ...right.mismatchPositions].sort((a, b) => a - b),
        gapsInQuery: left.gapsInQuery + right.gapsInQuery,
        gapsInTarget: left.gapsInTarget + right.gapsInTarget,
      };
      const hit = buildHit(query, target, qS, qE, tS, tE, strand, opts, stats);
      if (hit) hits.push(hit);
    }
  }
  return dedupHits(hits);
}

/**
 * Top-level search. Searches both strands (default), returns hits
 * sorted by target start.
 */
export function searchSequence(query, target, options = {}) {
  if (typeof query !== 'string' || typeof target !== 'string') return [];
  const opts = { ...DEFAULT_OPTS, ...options };
  const Q = query.toUpperCase();
  const T = target.toUpperCase();
  if (Q.length < 8) return []; // min query length
  const seedLen = adaptiveSeedLen(Q.length);
  const prebuilt = buildSeedIndex(T, seedLen);
  const fwd = searchOneStrand(Q, T, +1, opts, prebuilt);
  if (!opts.bothStrands) return [...fwd].sort(_byQueryIdentityDesc);
  const Qrc = reverseComplement(Q);
  const rev = searchOneStrand(Qrc, T, -1, opts, prebuilt);
  // FAIL-fix-pass 6 — sort by per-query identity desc (primary
  // biolog metric), tie-break by hit identity desc (clean run
  // quality), then by absolute target position asc for stability.
  return [...fwd, ...rev].sort(_byQueryIdentityDesc);
}

function _byQueryIdentityDesc(a, b) {
  if (b.queryIdentity !== a.queryIdentity) return b.queryIdentity - a.queryIdentity;
  // Tie-break by alignment-window length (longer = more confidently
  // anchored), then by target position for stable ordering.
  if ((b.length || 0) !== (a.length || 0)) return (b.length || 0) - (a.length || 0);
  return a.targetStart - b.targetStart;
}

// ───────────────────────── Library-wide search ─────────────────────────

/**
 * Build a global index across many entries. Each entry is keyed
 * by id and contributes positions tagged with the same id.
 *
 * Returns: Map<seed, Array<{ entryId, pos }>>
 *
 * For very large libraries (>1 MB total) callers should run this
 * in a worker (see DEC-SEARCH-WORKER-PATTERN-01). Tests use the
 * sync path directly.
 */
export function buildGlobalIndex(entries, seedLen = 8) {
  const idx = new Map();
  if (!Array.isArray(entries)) return idx;
  for (const e of entries) {
    const id = e?.id;
    const seq = (e?.sequence || '').toUpperCase();
    if (!id || !seq || seq.length < seedLen) continue;
    for (let i = 0; i + seedLen <= seq.length; i++) {
      const seed = seq.slice(i, i + seedLen);
      if (seed.includes('N')) continue;
      let arr = idx.get(seed);
      if (!arr) { arr = []; idx.set(seed, arr); }
      arr.push({ entryId: id, pos: i });
    }
  }
  return idx;
}

/**
 * Run a query across all indexed entries. Re-extends per entry
 * (cheap — typical hit count ≪ 100).
 *
 * `entries` is the same array used to build the index — needed to
 * pull the sequence for extension. Returns hits flattened, each
 * carrying `entryId` for the consumer to navigate / group by.
 */
export function searchLibrary(query, entries, options = {}) {
  if (typeof query !== 'string' || query.length < 8) return [];
  if (!Array.isArray(entries)) return [];
  const all = [];
  for (const e of entries) {
    if (!e?.sequence) continue;
    const hits = searchSequence(query, e.sequence, options);
    for (const h of hits) {
      h.entryId = e.id;
      all.push(h);
    }
  }
  return all;
}

// ───────────────────────── Helpers exposed for UI ─────────────────────────

// FAIL-fix-pass 6 — buckets by per-query identity per the spec
// «90/80/70 thresholds, <70% серый». Callers pass `hit.queryIdentity`.
export function identityBucket(identity) {
  if (identity >= 0.9) return 'high';     // green
  if (identity >= 0.8) return 'mid';       // yellow
  if (identity >= 0.7) return 'orange';    // orange (was «low» pre-pass 6)
  return 'low';                             // grey
}

export function isDnaQuery(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 8) return false;
  return /^[ACGTUNRYWSKMBDHVacgtunrywskmbdhv]+$/.test(s);
}

export function hasIupacAmbiguity(s) {
  if (typeof s !== 'string') return false;
  return /[NRYWSKMBDHVnrywskmbdhv]/.test(s);
}
