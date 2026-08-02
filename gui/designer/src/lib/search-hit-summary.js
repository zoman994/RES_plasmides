/**
 * search-hit-summary — adapt the linear kernel's per-strand occurrences to the compact
 * SearchHitSummary the search surfaces consume (SEARCH-GAPPED-DNA U4, SPEC §2.6, §5.3.1).
 *
 * The kernel deliberately emits `+` and `-` occurrences separately and materialises an edit
 * `script` for each retained winner (it needs the script for the §3.2 rule-7 tie-break and for
 * the differential against the oracle). The search surfaces want neither: one row per physical
 * site, and no alignment string — a dropdown is a LOCATOR, not an alignment viewer.
 *
 * ORDER IS LOAD-BEARING (fixed in review):
 *   1. merge `+`/`-` into `both` — but ONLY when they describe the SAME physical span AND the SAME
 *      alignment. The edit script is the witness that the alignments are equivalent; two strands
 *      that reach the same span through different edits are two real findings, not one.
 *   2. THEN drop the script and editRuns. Stripping first would leave nothing to merge by except
 *      the counters, and two different alignments can share M/X/I/D — fusing them would erase a
 *      biologically distinct hit.
 *
 * THE WINNER IS NAMED, NOT IMPLIED (U6-F.2). This boundary used to return an array sorted by the
 * §3.2 comparator and let «first» mean «canonical». Two things were wrong with that:
 *   • it is a different contract from the production engine's, which emits a POSITIONAL window with
 *     the winner travelling beside it as `bestIndex`. Two kernels that answer the same question must
 *     answer it in the same shape, and the two replies are compared byte-for-byte;
 *   • rule 6 was read off the DISPLAYED segment rather than the physical endpoint, so a locus ending
 *     exactly at the origin of a circle arrived as endpoint `n` instead of `0` and lost a comparison
 *     it wins. That hit has the LARGEST start on the molecule, so it is the one the rule exists for.
 * The envelope `{occurrences, locationCount, bestIndex}` is therefore built HERE, while the scripts
 * still exist, and this is the last place it could be built at all.
 *
 * The occurrence shape is the existing SearchOccurrence contract — `location: {segments, strand,
 * wrapsOrigin}, metrics` — so it passes `validateProviderPayload` and drops into the facade
 * unchanged. `segments` for a circular wrap are rebuilt here from `start`/`end`/`targetLength`,
 * because the kernel reports only the physical endpoint.
 *
 * Pure; no UI, no store. The imports are the §3.2 comparator and the shared positional order — this
 * boundary must rank and order by the same rules the production engine uses, and it is the last
 * place the edit script exists.
 */
import { compareOccurrence, comparePositional } from './dna-gapped-occurrence';
import { sortSteps } from './resumable-sort';

/** Two occurrences are the SAME finding iff same physical span AND same edit script. */
function mergeKey(o) {
  return `${o.start}|${o.targetSpan}|${o.script}`;
}

/** Physical segments for one occurrence. The kernel reports `o.end` MODULO targetLength, so it
 * cannot be used to build a segment: a hit ending exactly at the origin arrives as `end=0`, and
 * `[start, 0)` is coordinates the provider validator rejects. The physical endpoint is always
 * `start + span`; only when that runs STRICTLY past the molecule does the hit wrap into two
 * ordered segments. Ending exactly AT the length is the last base of a linear span, not a wrap. */
function segmentsOf(o, targetLength) {
  const physicalEnd = o.start + o.targetSpan;
  if (physicalEnd > targetLength) {
    return { segments: [{ start: o.start, end: targetLength }, { start: 0, end: physicalEnd - targetLength }], wraps: true };
  }
  return { segments: [{ start: o.start, end: physicalEnd }], wraps: false };
}

/** Compact metrics: everything a locator/ranker needs (§3.1), and no alignment string. */
function metricsOf(o) {
  const L = o.alignmentLength;
  return {
    length: o.M + o.X + o.I,       // query length
    queryLength: o.M + o.X + o.I,
    alignmentLength: L,
    targetSpan: o.targetSpan,
    identity: L > 0 ? o.M / L : 0,
    coverage: 1,
    exactMatches: o.M,
    substitutions: o.X,
    insertions: o.I,
    deletions: o.D,
    indelBases: o.I + o.D,
    indelEvents: o.gapEvents,
    editDistance: o.X + o.I + o.D,
    mismatches: o.X,               // legacy alias
    indels: o.I + o.D,             // legacy alias
    identityBps: o.identityBps,
  };
}

/**
 * The edit script, walked into the CANONICAL `editRuns` shape (§3.1) — the same walk the production
 * aligner performs, over the same alphabet, so both kernels describe one alignment the same way.
 *
 * This exists because `editRuns` is not decoration: the boundary validator reads it, the sequence
 * overlay draws its indel markers from it, and the result row renders its X/I/D breakdown from it.
 * The summary is the LAST place the script exists, so it is the only place the runs can still be
 * derived — dropping the script without deriving them first is what left the linear kernel's
 * occurrences missing the one metrics field every consumer downstream expects.
 *
 * `probe*` offsets advance on whatever the QUERY consumes (`=`, `X`, `I`); `targetOffset*` on
 * whatever the TARGET consumes (`=`, `X`, `D`).
 */
function editRunsFromScript(script) {
  const s = typeof script === 'string' ? script : '';
  const runs = [];
  let pi = 0;
  let toff = 0;
  for (let z = 0; z < s.length;) {
    const op = s[z];
    const pStart = pi;
    const tStart = toff;
    let len = 0;
    while (z < s.length && s[z] === op) {
      if (op === '=' || op === 'X') { pi += 1; toff += 1; } else if (op === 'I') pi += 1; else toff += 1;
      len += 1; z += 1;
    }
    runs.push({
      op, length: len, probeStart: pStart, probeEnd: pi, targetOffsetStart: tStart, targetOffsetEnd: toff,
    });
  }
  return runs;
}

function toSummary(o, strand, targetLength) {
  const { segments, wraps } = segmentsOf(o, targetLength);
  return {
    location: { segments, strand, wrapsOrigin: wraps },
    metrics: { ...metricsOf(o), editRuns: editRunsFromScript(o.script) },
  };
}

/** Elements handled between suspensions in the grouping and ranking walks. */
const CHUNK = 512;

/**
 * Kernel occurrences → the canonical locus ENVELOPE for one molecule.
 *
 * @param {Array<object>} occurrences — kernel occurrences (findOccurrences output), each with
 *   `strand, start, targetSpan, end, M, X, I, D, gapEvents, alignmentLength, identityBps, script`.
 *   `end` is the PHYSICAL endpoint the kernel computed — `(start + span) mod n` on a circle — and
 *   the provider's raw guard has already proven it consistent with `start + targetSpan` under the
 *   document's topology, which is what makes it usable here as rule 6's input.
 * @param {number} targetLength — length of the molecule the occurrences are on
 * @returns {{occurrences:Array<{location:Object, metrics:Object}>, locationCount:number,
 *   bestIndex:number}} the window in POSITIONAL order, how many loci it holds, and which one is the
 *   §3.2 winner
 *
 * RESUMABLE, and genuinely so: grouping, summary construction, `editRuns` materialisation, the
 * ranking scan and the final sort all walk the whole set, and the output budget admits 200 000
 * occurrences. A generator that yielded a few times and then called a synchronous function would
 * leave the one uninterruptible stretch of the pipeline exactly where the result set is largest —
 * which is what it used to do.
 */
export function* toSearchHitSummariesSteps(occurrences, targetLength) {
  if (!Array.isArray(occurrences) || occurrences.length === 0) {
    return { occurrences: [], locationCount: 0, bestIndex: -1 };
  }

  // Group by (span, script): a group of size 2 with one `+` and one `-` is a both-strand site.
  const groups = new Map();
  for (let i = 0; i < occurrences.length; i += 1) {
    if (i > 0 && (i % CHUNK) === 0) yield;
    const o = occurrences[i];
    const k = mergeKey(o);
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(o);
  }

  // Keep each summary paired with the SCRIPT and the PHYSICAL endpoint it came from, just long
  // enough to rank. The comparator reads `.metrics` and `.script`, so each entry carries both —
  // rule 7 runs inside the one shared implementation rather than being re-spelled here.
  const paired = [];
  let since = 0;
  for (const g of groups.values()) {
    since += g.length;
    if (since >= CHUNK) { since = 0; yield; }
    const plus = g.find((o) => o.strand === '+');
    const minus = g.find((o) => o.strand === '-');
    if (plus && minus && g.length === 2) {
      // Same span, same script on both strands → one physical site. Coordinates come from either
      // (they are identical by construction of the key), strand becomes `both`.
      const summary = toSummary(plus, 'both', targetLength);
      paired.push({
        summary, metrics: summary.metrics, script: plus.script, start: plus.start, end: plus.end, strand: 'both',
      });
    } else {
      for (const o of g) {
        const summary = toSummary(o, o.strand, targetLength);
        paired.push({
          summary, metrics: summary.metrics, script: o.script, start: o.start, end: o.end, strand: o.strand,
        });
      }
    }
  }

  // ── POSITIONAL ORDER, §3.2 WINNER BESIDE IT (U6-F.2) ─────────────────────────────────────────
  // The emitted window runs along the molecule — an in-molecule list of sites has to read that way,
  // and the production engine emits exactly this order, through the same `comparePositional`.
  yield* sortSteps(paired, (a, b) => comparePositional(a.start, a.end, a.strand, b.start, b.end, b.strand));

  // §3.2 ends with a lexical tiebreak on the edit script, and this function is the LAST place that
  // still has one: everything downstream sees the compact summary, by design (U4 keeps alignment
  // strings off the wire). So the verdict is computed here and carried as an INDEX. For two hits at
  // one locus with identical metrics, `=====X` beats `X=====` (5′→3′, `= < D < I < X`), which can be
  // the minus strand — a strand-based tiebreak invented downstream would answer `+`, a different
  // strand and therefore a different biological claim.
  //
  // Rule 6 reads `end`, the PHYSICAL endpoint, NOT the end of the last displayed segment. On a
  // circle those differ for the one hit the rule most matters to: a locus finishing exactly at the
  // origin has endpoint 0 and the largest start on the molecule.
  let bestIndex = 0;
  for (let i = 1; i < paired.length; i += 1) {
    if ((i % CHUNK) === 0) yield;
    if (compareOccurrence(paired[i], paired[bestIndex], paired[i].end, paired[bestIndex].end) < 0) bestIndex = i;
  }

  const out = [];
  for (let i = 0; i < paired.length; i += 1) {
    if (i > 0 && (i % CHUNK) === 0) yield;
    out.push(paired[i].summary);
  }
  return { occurrences: out, locationCount: out.length, bestIndex };
}

/** The same adaptation, DRAINED — one implementation, two drives. */
export function toSearchHitSummaries(occurrences, targetLength) {
  const gen = toSearchHitSummariesSteps(occurrences, targetLength);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}
