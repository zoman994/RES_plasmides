/**
 * dna-literal-exact — 100 % identity without the approximate machinery.
 *
 * WHY. At a 100 % threshold the gapped engine's edit budget is zero, so its band collapses to the
 * diagonal and it does a bit-parallel pass that is, mathematically, a substring search. It is still
 * a bit-parallel pass: on the real plasmid base (2822 molecules / 16.5 Mb) an exact search costs
 * 2.6–3.4 s. Answering the same question directly is an order of magnitude cheaper, and exact search
 * is the common case — a biologist pasting a sequence they already have.
 *
 * WHAT IS SHARED. The occurrence itself is built by `occurrenceFrom` and the §3.2.1 endpoint rule is
 * `physicalEndpointOf`, both from `dna-gapped-occurrence`; the alphabet rule and the target
 * normalisation are the engine's own. What is NOT imported is the strand merge or the winner search:
 * for exact hits both reduce to something much simpler than the general rules — two hits at the same
 * start are the same site because their scripts are identical by construction, and the §3.2
 * comparator's rules 1–5 and 7 all tie, leaving rule 6, the physical endpoint. Those reductions are
 * LOCAL, deliberately, and `u6e1-literal-exact-differential` is what proves each of them equals the
 * general rule it stands in for.
 *
 * THE FOUR PROPERTIES THIS HAS TO KEEP, each of which a straightforward `indexOf` loop loses:
 *
 *   • FULL CIRCLE. A hit may cross the origin and use every physical base exactly once
 *     (`targetSpan === n`). Only a query LONGER than the molecule is impossible, because that would
 *     need a second turn. Guarding on `n > m` instead of `m <= n` silently deleted every full-length
 *     rotation: `GCAT` really is `ATGC` read as a ring.
 *
 *   • BOUNDED WORK BETWEEN SUSPENSIONS — independently of the QUERY. A window of `STEP + m - 1`
 *     characters is bounded only while `m` is small, and the exact route has no length limit: a
 *     500 000-nt exact query made one `next()` do half a megabase of matching. So the scan is
 *     adaptive. Short probes use the platform's own substring search over a window bounded by
 *     construction; long ones stream through a KMP automaton that advances a fixed number of text
 *     positions per suspension and never looks at more. Both feed ONE semantic stream of candidate
 *     starts, in positional order, for both strands at once. Pattern preprocessing and the reverse
 *     complement of a long query are chunked too — otherwise the unbounded stretch simply moves in
 *     front of the first suspension point.
 *
 *   • BOUNDED RETENTION. `limit` is a ceiling on what is RETAINED and MATERIALISED — not on the
 *     scan, which must still visit the whole molecule to count loci honestly. Nothing here holds an
 *     array of all starts or all occurrences: loci are counted as they stream past, a positional
 *     window of `limit` descriptors is kept, and `occurrenceFrom` runs once per survivor after the
 *     window is final. An absent or malformed `limit` resolves to the engine's own documented
 *     default, never to «unlimited».
 *
 *   • BUDGETS. A literal pass spends no verifier and no traceback — there is no DP state and no
 *     alignment to walk back — but it does spend SCAN (positions examined, once per strand pass
 *     actually performed) and OUTPUT (occurrences materialised). Both are charged through the
 *     engine's own meter BEFORE the work they pay for, so an exhausted budget stops at the boundary
 *     rather than after one more window, and nothing partial is published.
 *
 * IUPAC in the target stays a mismatch against A/C/G/T: a literal character comparison gives that
 * for free, and it must not be «helpfully» relaxed.
 */
import { occurrenceFrom, physicalEndpointOf } from './dna-gapped-occurrence';
import {
  resolveBudgets, resolveStateBudget, makeMeter, chargeScan, chargeOutput,
} from './dna-search-budget';
import { isValidLimit } from './search-locus-envelope';
// The alphabet rule and the target normalisation are the ENGINE's, imported rather than restated:
// two definitions of «valid DNA» in one product is how the two scans start disagreeing.
import { normalizeDna, INVALID_DNA } from './dna-gapped-session-steps';

const ACGT = /^[ACGT]+$/;

/** Text positions advanced between suspension points. */
const STEP = 16384;
/**
 * The longest probe still scanned with the platform's substring search. Above it the per-window
 * slice would grow with the query and the work between suspensions would stop being bounded, so long
 * probes stream instead. 4096 keeps the native window under ~20 k characters.
 */
const NATIVE_MAX = 4096;
/** Characters of pattern preprocessing per suspension — the prologue must be interruptible too. */
const PREP_STEP = 65536;
/** The engine's session default, so an absent `limit` means the same thing on both paths. */
const DEFAULT_LIMIT = 1000;

const COMPLEMENT = { A: 'T', C: 'G', G: 'C', T: 'A' };

/** Reverse complement of an ACGT probe. */
export function reverseComplementQuery(q) {
  let out = '';
  for (let i = q.length - 1; i >= 0; i -= 1) out += (COMPLEMENT[q[i]] || q[i]);
  return out;
}

/**
 * The same, in interruptible chunks. A 500 000-nt query makes even this a visible piece of work, and
 * it happens before any matching, so doing it in one go would put an unbounded stretch in front of
 * the first suspension point.
 */
function* reverseComplementSteps(q, meter) {
  if (q.length <= PREP_STEP) { chargeScan(meter, q.length); return reverseComplementQuery(q); }
  const parts = [];
  for (let end = q.length; end > 0; end -= PREP_STEP) {
    const from = Math.max(0, end - PREP_STEP);
    let piece = '';
    for (let i = end - 1; i >= from; i -= 1) piece += (COMPLEMENT[q[i]] || q[i]);
    parts.push(piece);
    chargeScan(meter, end - from);   // building the complement is work, and it is charged as work
    yield;
  }
  return parts.join('');
}

/**
 * The raw alignment an exact match implies. Every field is forced by the match itself: an exact hit
 * of length `m` is `m` `=` columns, no substitutions, no indels, no mismatch positions.
 *
 * Built in the SAME shape `dna-gapped-align` returns so `occurrenceFrom` cannot tell the two apart —
 * including `script` and `editRuns`, which are not decoration: the strand reduction below relies on
 * every exact hit carrying an identical script.
 */
function exactAlignment(start, m) {
  return {
    start,
    end: start + m,
    script: '='.repeat(m),
    editRuns: [{
      op: '=', length: m, probeStart: 0, probeEnd: m, targetOffsetStart: 0, targetOffsetEnd: m,
    }],
    M: m,
    X: 0,
    I: 0,
    D: 0,
    editDistance: 0,
    indelEvents: 0,
    indelBases: 0,
    alignmentLength: m,
    queryLength: m,
    targetSpan: m,
    mismatchPositions: [],
  };
}

/**
 * KMP failure function, built in interruptible chunks and CHARGED.
 *
 * Preprocessing is real work — O(m) per probe, and a 500 000-nt query makes that visible. Leaving it
 * off the meter would let `scanPositions` understate the cost of exactly the case the long-query
 * bound exists to police, so every comparison and every failure transition is counted here too.
 */
function* failureTableSteps(p, meter) {
  const f = new Int32Array(p.length);
  let k = 0;
  let work = 0;
  for (let i = 1; i < p.length; i += 1) {
    while (k > 0 && p[i] !== p[k]) { k = f[k - 1]; work += 1; }
    if (p[i] === p[k]) k += 1;
    f[i] = k;
    work += 1;
    if (i % PREP_STEP === 0) { chargeScan(meter, work); work = 0; yield; }
  }
  chargeScan(meter, work);
  return f;
}

/**
 * A view of the VIRTUAL text — the molecule, plus its first `m - 1` bases again when the search is
 * circular. The extension is virtual on purpose: materialising `target + target.slice(0, m - 1)` for
 * a query the size of the molecule doubles a megabase for no reason, and a full circle must not cost
 * a full copy.
 */
function makeText(target, m, circular) {
  const n = target.length;
  return {
    length: circular ? n + m - 1 : n,
    charAt: (i) => (i < n ? target[i] : target[i - n]),
    /** A bounded window `[from, to)`, assembled from at most two slices. */
    slice: (from, to) => {
      if (to <= n) return target.slice(from, to);
      if (from >= n) return target.slice(from - n, to - n);
      return target.slice(from, n) + target.slice(0, to - n);
    },
  };
}

/**
 * ONE stream of candidate starts, both strands, in positional order — with a hard bound on the work
 * done per resumption.
 *
 * `emit(start, strand)` is called for every locus in ascending order; `'both'` is passed when the two
 * probes match at the same start, which for exact hits is exactly the general merge condition (same
 * location, and scripts identical by construction).
 *
 * @param {{length:number, charAt:Function, slice:Function}} text
 * @param {string} plus  the query
 * @param {string|null} minus  its reverse complement, or null when one pass answers for both
 * @param {number} limitStart  starts at or above this belong to no locus
 * @param {number} strandPasses how many scan passes a step really performs — 1 or 2
 */
function* candidateStarts(text, plus, minus, limitStart, meter, strandPasses, emit) {
  const m = plus.length;
  if (m <= NATIVE_MAX) {
    for (let pos = 0; pos < limitStart; pos += STEP) {
      const owned = Math.min(STEP, limitStart - pos);
      const stop = Math.min(pos + STEP + m - 1, text.length);
      // Charged BEFORE the work, so an exhausted axis stops at this boundary rather than after one
      // more window; charged once per pass actually performed; and charged for the characters the
      // matcher will really LOOK AT, overlap included. Counting only the owned positions would make
      // `scanPositions` describe progress rather than work, and then it could not be used to bound
      // the work done between two suspensions — which is the one thing it has to be able to do.
      chargeScan(meter, Math.max(0, stop - pos) * strandPasses);
      if (stop - pos >= m) {
        const chunk = text.slice(pos, stop);
        let ap = chunk.indexOf(plus);
        let am = minus ? chunk.indexOf(minus) : -1;
        for (;;) {
          const pOk = ap !== -1 && ap < owned;
          const mOk = am !== -1 && am < owned;
          if (!pOk && !mOk) break;
          if (pOk && mOk && ap === am) {
            emit(pos + ap, 'both');
            ap = chunk.indexOf(plus, ap + 1);
            am = chunk.indexOf(minus, am + 1);
          } else if (pOk && (!mOk || ap < am)) {
            emit(pos + ap, '+');
            ap = chunk.indexOf(plus, ap + 1);
          } else {
            emit(pos + am, '-');
            am = chunk.indexOf(minus, am + 1);
          }
        }
      }
      yield;
    }
    return;
  }

  // Long probe: stream. Two automatons walk the SAME text together, so the merge is free and the
  // work per resumption is a fixed number of text positions no matter how long the query is.
  const fp = yield* failureTableSteps(plus, meter);
  const fm = minus ? yield* failureTableSteps(minus, meter) : null;
  let kp = 0;
  let km = 0;
  let sinceYield = 0;
  // FAILURE TRANSITIONS ARE WORK. Charging one unit per target position would describe progress, not
  // cost: a probe that keeps falling back does many comparisons per character, and the whole point of
  // this counter is to bound the work done between two suspensions. So the baseline is charged
  // BEFORE the step (that is what stops an exhausted budget at the boundary) and the surplus
  // transitions the step really performed are charged after it.
  let surplus = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (sinceYield === 0) chargeScan(meter, Math.min(STEP, text.length - i) * strandPasses);
    const ch = text.charAt(i);
    while (kp > 0 && ch !== plus[kp]) { kp = fp[kp - 1]; surplus += 1; }
    if (ch === plus[kp]) kp += 1;
    let hitP = false;
    if (kp === m) { hitP = true; kp = fp[m - 1]; surplus += 1; }
    let hitM = false;
    if (minus) {
      while (km > 0 && ch !== minus[km]) { km = fm[km - 1]; surplus += 1; }
      if (ch === minus[km]) km += 1;
      if (km === m) { hitM = true; km = fm[m - 1]; surplus += 1; }
    }
    if (hitP || hitM) {
      const start = i - m + 1;
      if (start < limitStart) emit(start, hitP && hitM ? 'both' : (hitP ? '+' : '-'));
    }
    sinceYield += 1;
    if (sinceYield >= STEP) {
      chargeScan(meter, surplus);
      surplus = 0;
      sinceYield = 0;
      yield;
    }
  }
  chargeScan(meter, surplus);
}

/**
 * Exact search of one query against one sequence, as a resumable generator.
 *
 * @param {string} rawQuery — A/C/G/T after trimming and upper-casing; anything else is refused
 * @param {string} rawTarget — the molecule as stored (IUPAC allowed; it simply will not match)
 * @param {{bothStrands?:boolean, circular?:boolean, limit?:number, budgets?:object,
 *   stateBudget?:number|null, collectStats?:boolean}} opts
 * @returns {Generator<undefined, {occurrences:Array, locationCount:number, bestIndex:number,
 *   incomplete:false, reason:null, stats?:object}>} the same session shape the gapped engine
 *   returns, so the caller cannot tell which scan produced it
 * @throws {Error & {code:'INVALID_DNA'}} a query that is not DNA
 * @throws {Error & {code:'RESOURCE_LIMIT', axis:'scan'|'output'}} an exhausted axis — never a
 *   partial answer
 * @throws {Error & {code:'INVALID_BUDGET'}} a malformed budget, unchanged from the engine
 */
export function* literalExactSessionSteps(rawQuery, rawTarget, opts = {}) {
  // Normalisation and the alphabet guard belong HERE: they used to live inside
  // `dnaGappedSessionSteps`, and moving the exact pass off that engine silently took them with it.
  // Without them a lowercase query would stop matching and a query containing `N` would be scanned
  // literally instead of refused — «no matches» for a query that was never valid DNA is exactly the
  // false answer §2.5 exists to prevent.
  const query = rawQuery ? String(rawQuery).trim().toUpperCase() : '';
  const target = normalizeDna(rawTarget);
  const m = query.length;
  const n = target.length;
  // Budgets resolve BEFORE the empty-input shortcut so a malformed budget is still an error rather
  // than an accidental pass: `INVALID_BUDGET` is about the request, not about the molecule.
  const meter = makeMeter(resolveBudgets(opts.budgets), resolveStateBudget(opts.stateBudget));
  const limit = isValidLimit(opts.limit) ? opts.limit : DEFAULT_LIMIT;

  let occurrencesBuilt = 0;
  let peakRetained = 0;
  const finish = (occurrences, locationCount, bestIndex) => {
    const done = {
      occurrences, locationCount, bestIndex, incomplete: false, reason: null,
    };
    if (opts.collectStats) {
      done.stats = {
        occurrencesBuilt,
        peakRetained,
        scanPositions: meter.scanPositions,
        outputUsed: meter.outputUsed,
        limitedAxis: meter.limitedAxis,
      };
    }
    return done;
  };

  if (!m || !n || m > n) return finish([], 0, -1); // empty input, or a query that cannot fit at all
  if (!ACGT.test(query)) {
    const bad = new Error('INVALID_DNA');
    bad.code = INVALID_DNA;
    throw bad;
  }

  // A hit may cross the origin ONCE (§2.7), and a full turn is a legitimate hit: `targetSpan === n`
  // uses every base exactly once. `m > n` was refused above — it would need a second turn.
  const circular = opts.circular === true;
  const bothStrands = opts.bothStrands !== false;
  const minus = bothStrands ? yield* reverseComplementSteps(query, meter) : null;
  // A palindromic query IS its own reverse complement, so one pass answers for both strands and the
  // second probe is genuinely eliminated — which is why it is then charged as one pass, not two.
  const palindromic = minus !== null && minus === query;
  const strandPasses = bothStrands && !palindromic ? 2 : 1;
  const text = makeText(target, m, circular);

  const retained = [];                 // at most `limit` descriptors — never all of them
  let locationCount = 0;
  let bestStart = -1;
  let bestStrand = null;
  let bestIndexInStream = -1;
  let bestEnd = Infinity;

  yield* candidateStarts(text, query, palindromic ? null : minus, n, meter, strandPasses,
    (start, strandRaw) => {
      const strand = palindromic ? 'both' : strandRaw;
      // The §3.2 winner, decided while streaming. For exact hits the comparator's rules 1–5 and 7
      // all tie by construction — identical metrics, identical `'='×m` script — so it reduces to
      // rule 6, the physical endpoint, with the earlier locus keeping a tie.
      const end = physicalEndpointOf(start, m, n, circular);
      if (end < bestEnd) {
        bestEnd = end; bestStart = start; bestStrand = strand; bestIndexInStream = locationCount;
      }
      if (retained.length < limit) {
        retained.push({ start, strand });
        if (retained.length > peakRetained) peakRetained = retained.length;
      }
      locationCount += 1;
    });

  // ── the final window FIRST, then one materialisation per survivor ─────────────────────────────
  //
  // The order matters for the output budget. Building the window and then rebuilding the winner
  // charged output twice for a payload of one, so a cap of one with an output budget of one failed
  // on work that never reached the answer.
  const final = retained.slice();
  let bestIndex = -1;
  if (locationCount > 0) {
    if (bestIndexInStream >= limit) {
      // `capLocusEnvelope`'s rule, applied at the source: the winner takes the last retained slot
      // rather than being lost, and the window stays ascending because its start is ≥ every start
      // already inside.
      final[limit - 1] = { start: bestStart, strand: bestStrand };
      bestIndex = limit - 1;
    } else {
      bestIndex = bestIndexInStream;
    }
  }
  const occurrences = final.map(({ start, strand }) => {
    chargeOutput(meter, 1);
    occurrencesBuilt += 1;
    return occurrenceFrom(exactAlignment(start, m), m, strand, n, circular);
  });
  return finish(occurrences, locationCount, bestIndex);
}
