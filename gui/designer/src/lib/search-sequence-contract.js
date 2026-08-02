/**
 * search-sequence-contract — the SEQUENCE-SPECIFIC boundary check (SEARCH-GAPPED-DNA U4, §3.1).
 *
 * `search-provider-contract` is shared by protein, enzyme and sequence, so it validates only the
 * identity/location boundary and never the metrics — a spliced protein hit has several non-adjacent
 * exon segments and its own arithmetic, and tightening that shared gate would reject legitimate
 * non-sequence biology. This module is the check that DOES know what a DNA occurrence must satisfy,
 * and it runs ONLY on the sequence dimension. The general validator is left untouched.
 *
 * What it proves, given the document's `{sequenceLength, circular}`:
 *   • M, X, I, D, alignmentLength, targetSpan, identityBps are non-negative integers;
 *   • the four equalities that tie them together hold —
 *       queryLength      = M + X + I
 *       alignmentLength  = M + X + I + D
 *       targetSpan       = M + X + D
 *       identityBps      = floor(10000 * M / alignmentLength);
 *   • TOPOLOGY: a LINEAR molecule never wraps — no `wrapsOrigin`, no two-origin segments, and a
 *     single segment running off the end is malformed, NOT silently reinterpreted as a circular
 *     wrap (a corrupted linear coordinate must fail closed, not be "healed" into biology it never
 *     had). A CIRCULAR wrap is accepted only in canonical form `[start, n) + [0, end)` whose two
 *     segments sum to `targetSpan <= n`.
 *
 * A malformed result is INCOMPLETE, never an honest zero: `assertSequenceOccurrences` throws a
 * typed `MALFORMED_SEQUENCE_RESULT` that the worker/facade turn into `incomplete`, so a corrupted
 * reply can never read as "this molecule has no site" (§3.3).
 *
 * Reuses the shared `validateProviderOccurrence` for the ownership/strand/plain-segment gate
 * (never loosening it), then adds the sequence-only metric and topology checks on top.
 *
 * Pure: no UI, no store.
 */
import { validateProviderOccurrence } from './search-provider-contract';
import { ENVELOPE_KEYS } from './search-locus-envelope';
import { isValidSequenceEnvelope } from './search-sequence-envelope';

export const MALFORMED_SEQUENCE_RESULT = 'MALFORMED_SEQUENCE_RESULT';

const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;

function isPlainRecord(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** One occurrence, against a known sequence length and topology. Assumes the shared provider gate
 * (ownership, strand ∈ {+,-,both}, plain in-bounds segments, boolean wrapsOrigin) has already
 * passed — this adds only the metric arithmetic and the topology rules. */
function isValidSequenceOccurrence(occ, sequenceLength, circular) {
  if (!isPlainRecord(occ.metrics)) return false;
  const { segments, wrapsOrigin } = occ.location;

  const m = occ.metrics;
  const { exactMatches: M, substitutions: X, insertions: I, deletions: D } = m;
  const { alignmentLength: L, queryLength, targetSpan, identityBps } = m;
  const { length, identity, coverage, indelBases, indelEvents, editDistance, mismatches, indels } = m;
  if (![M, X, I, D, L, queryLength, targetSpan].every(isNonNegInt)) return false;
  if (!isNonNegInt(identityBps)) return false;
  if (L <= 0) return false;

  // The core equalities.
  if (queryLength !== M + X + I) return false;
  if (L !== M + X + I + D) return false;
  if (targetSpan !== M + X + D) return false;
  if (identityBps !== Math.floor((10000 * M) / L)) return false;

  // Every remaining scalar the summary carries — validated, not trusted. `identity` is the exact
  // same float division the adapter performed, so `===` is bit-exact here, not fuzzy.
  if (length !== queryLength) return false;
  if (identity !== M / L) return false;
  if (coverage !== 1) return false;
  if (indelBases !== I + D) return false;
  if (indels !== I + D) return false;
  if (editDistance !== X + I + D) return false;
  if (mismatches !== X) return false;
  // A gap event count and its bases are two views of the same thing: no indel bases means no
  // event, and indel bases mean at least one event (and never more than one per base). `0` with
  // `I+D>0` is biologically impossible, not merely out of range.
  if (!isNonNegInt(indelEvents)) return false;
  if (I + D === 0 ? indelEvents !== 0 : (indelEvents < 1 || indelEvents > I + D)) return false;

  // Topology.
  if (!circular) {
    // A linear molecule cannot wrap: no flag, no second segment, and a single segment must stay
    // inside the molecule (an off-the-end coordinate is malformed, not a hidden wrap).
    if (wrapsOrigin) return false;
    if (segments.length !== 1) return false;
    const [seg] = segments;
    if (!isPlainRecord(seg)) return false;
    if (!Number.isInteger(seg.start) || !Number.isInteger(seg.end)) return false;
    if (!(seg.start >= 0 && seg.start < seg.end && seg.end <= sequenceLength)) return false;
    if (seg.end - seg.start !== targetSpan) return false;
    return true;
  }

  // Circular: either a plain in-bounds hit, or a canonical wrap.
  const n = sequenceLength;
  if (targetSpan > n) return false; // no second lap (§2.7)
  if (!wrapsOrigin) {
    if (segments.length !== 1) return false;
    const [seg] = segments;
    if (!Number.isInteger(seg.start) || !Number.isInteger(seg.end)) return false;
    if (!(seg.start >= 0 && seg.start < seg.end && seg.end <= n)) return false;
    if (seg.end - seg.start !== targetSpan) return false;
    return true;
  }
  // Canonical wrap: exactly [start, n) then [0, end), 0 < end, start < n, summing to targetSpan.
  if (segments.length !== 2) return false;
  const [a, b] = segments;
  if (!isPlainRecord(a) || !isPlainRecord(b)) return false;
  if (!(Number.isInteger(a.start) && Number.isInteger(a.end) && Number.isInteger(b.start) && Number.isInteger(b.end))) return false;
  if (a.end !== n) return false;               // first segment must reach the origin
  if (b.start !== 0) return false;             // second must resume at 0
  if (!(a.start >= 0 && a.start < a.end)) return false;
  if (!(b.start < b.end && b.end <= n)) return false;
  if ((a.end - a.start) + (b.end - b.start) !== targetSpan) return false;
  return true;
}

/**
 * Is `occurrences` a well-formed sequence result for a molecule of `sequenceLength` and topology?
 * `[]` is always valid — an honest miss. Never throws.
 *
 * @param {unknown} occurrences
 * @param {{sequenceLength:number, circular:boolean}} doc
 * @returns {boolean}
 */
export function* validateSequenceOccurrencesSteps(occurrences, doc) {
  try {
    if (!Array.isArray(occurrences)) return false;
    // The document is validated BEFORE an empty result is allowed. `[]` claims «no site here», and
    // an unknown or malformed topology cannot certify that claim — a missed origin-crossing hit is
    // exactly what a wrong/absent circular flag would hide. So a bad doc is malformed even when the
    // result is empty, never a free honest zero.
    const sequenceLength = doc && doc.sequenceLength;
    if (!(Number.isInteger(sequenceLength) && sequenceLength > 0)) return false;
    // Topology is a fact about the molecule, not a hint: `'false'` is truthy and would otherwise
    // read a linear plasmid as circular. Require a strict boolean.
    const circular = doc.circular;
    if (typeof circular !== 'boolean') return false;
    if (occurrences.length === 0) return true;
    // Per occurrence: the shared provider gate first — ownership (no targetRef), strand ∈
    // {+,-,both}, plain in-bounds segments, boolean wrapsOrigin — then the sequence-only checks on
    // top of it. Both run on the SAME element before moving on, so the pair can suspend between
    // occurrences instead of being two full sweeps that cannot.
    for (let i = 0; i < occurrences.length; i += 1) {
      if (i > 0 && (i & 255) === 0) yield;
      const occ = occurrences[i];
      if (!validateProviderOccurrence(occ, sequenceLength)) return false;
      if (!isValidSequenceOccurrence(occ, sequenceLength, circular)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** The same validation, DRAINED — one implementation, two drives. */
export function validateSequenceOccurrences(occurrences, doc) {
  const gen = validateSequenceOccurrencesSteps(occurrences, doc);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/**
 * Return `occurrences` unchanged if valid; otherwise throw a typed `MALFORMED_SEQUENCE_RESULT`.
 * The throw is the incomplete signal — a malformed result is never returned as `[]` (§3.3).
 *
 * @throws {Error & {code:'MALFORMED_SEQUENCE_RESULT'}}
 */
/**
 * RESUMABLE form. The validation walks every occurrence, and the payload cap admits 200 000 — so it
 * suspends like everything else on the path rather than being the one uninterruptible tail. The
 * suspensions are inside the WALK (`validateSequenceOccurrencesSteps`), not a counted-out row of
 * empty yields in front of a synchronous call: an empty yield gives the driver the thread back
 * before the work rather than during it, which is a cancel point that cannot catch anything.
 */
export function* assertSequenceOccurrencesSteps(occurrences, doc) {
  if (!(yield* validateSequenceOccurrencesSteps(occurrences, doc))) throwMalformed();
  return occurrences;
}

export function assertSequenceOccurrences(occurrences, doc) {
  if (!validateSequenceOccurrences(occurrences, doc)) throwMalformed();
  return occurrences;
}

function throwMalformed() {
  const e = new Error('sequence search returned a malformed result');
  e.code = MALFORMED_SEQUENCE_RESULT;
  throw e;
}

// ── production emit → canonical summary (U4) ──────────────────────────────────────────────────
//
// The gapped engine emits the primary counters and the edit `editRuns`, but no transport
// `identityBps`. This boundary DERIVES the canonical `SearchHitSummary` the app validates against
// (`search-hit-summary` already produces the same shape for the linear kernel), so the engine's
// metric emission is left untouched. Nothing is «healed»: every field is checked, not recomputed —
// `indelEvents` in particular is a fact about the alignment (one 3-base gap ≠ three 1-base gaps) and
// must never be inferred from `I + D`.

const OPS = new Set(['=', 'X', 'I', 'D']);
const isSafeNonNeg = (n) => Number.isSafeInteger(n) && n >= 0;

/**
 * Replay the edit runs ONCE against the coordinates they claim (§3.1) — no letter-by-letter probe.
 * Every run must have a valid op and positive length; offsets must be continuous; `=`/`X` consume a
 * probe AND a target base, `I` a probe only, `D` a target only; the walk must finish exactly at
 * `queryLength`/`targetSpan`; the per-op totals must equal M/X/I/D; and the number of I/D runs must
 * equal `indelEvents`.
 */
function editRunsConsistent(runs, { M, X, I, D, queryLength, targetSpan, indelEvents }) {
  if (!Array.isArray(runs) || runs.length === 0) return false;
  let probe = 0; let toff = 0;
  let sumM = 0; let sumX = 0; let sumI = 0; let sumD = 0; let idRuns = 0;
  let prevOp = null;
  for (const r of runs) {
    if (!isPlainRecord(r)) return false;
    const { op, length, probeStart, probeEnd, targetOffsetStart, targetOffsetEnd } = r;
    if (!OPS.has(op)) return false;
    // Canonical run-length encoding never places two runs of the SAME op back to back — they would
    // be one run. This matters biologically for gaps: two touching insertions are ONE continuous gap
    // event, not two, so `II`/`DD` must fail here (gap events SEPARATED by a match are fine, since a
    // run of a different op sits between them).
    if (op === prevOp) return false;
    prevOp = op;
    if (!(Number.isSafeInteger(length) && length > 0)) return false;
    if (probeStart !== probe || targetOffsetStart !== toff) return false; // continuity
    if (op === '=' || op === 'X') { probe += length; toff += length; } else if (op === 'I') { probe += length; } else { toff += length; }
    if (probeEnd !== probe || targetOffsetEnd !== toff) return false; // correct consumption
    if (op === '=') sumM += length;
    else if (op === 'X') sumX += length;
    else if (op === 'I') { sumI += length; idRuns += 1; } else { sumD += length; idRuns += 1; }
  }
  if (probe !== queryLength || toff !== targetSpan) return false;
  return sumM === M && sumX === X && sumI === I && sumD === D && idRuns === indelEvents;
}

/**
 * Turn ONE rich engine occurrence into the canonical `SearchHitSummary`, or return null if it is not
 * TRUE. Checks the raw counters/aliases, replays `editRuns` when present, verifies `queryLength`
 * both against `M+X+I` and against the actual query, derives `identityBps = floor(10000*M/L)`
 * (and, if the raw already carries one, requires it to agree), then builds a NEW object in the
 * canonical shape — no `editRuns`, no `script`, no `mismatchPositions`.
 */
function finalizeOne(raw, queryLength) {
  if (!isPlainRecord(raw) || !isPlainRecord(raw.location) || !isPlainRecord(raw.metrics)) return null;
  const m = raw.metrics;
  const M = m.exactMatches; const X = m.substitutions; const I = m.insertions; const D = m.deletions;
  const L = m.alignmentLength; const targetSpan = m.targetSpan; const indelEvents = m.indelEvents;
  const rawQL = m.queryLength;
  if (![M, X, I, D, L, targetSpan, indelEvents, rawQL].every(isSafeNonNeg)) return null;
  if (L <= 0) return null;
  // The core equalities — and queryLength must be the real query, not just internally consistent.
  if (rawQL !== M + X + I) return null;
  if (rawQL !== queryLength) return null;
  if (L !== M + X + I + D) return null;
  if (targetSpan !== M + X + D) return null;
  if (typeof m.identity !== 'number' || m.identity !== M / L) return null;
  // Aliases and the indel-event fact — verified, not recomputed.
  if (m.length !== queryLength) return null;
  if (m.coverage !== 1) return null;
  if (m.indelBases !== I + D || m.indels !== I + D) return null;
  if (m.editDistance !== X + I + D) return null;
  if (m.mismatches !== X) return null;
  if (I + D === 0 ? indelEvents !== 0 : (indelEvents < 1 || indelEvents > I + D)) return null;
  // The edit runs, checked ONCE before they are dropped.
  if (m.editRuns !== undefined && !editRunsConsistent(m.editRuns, { M, X, I, D, queryLength, targetSpan, indelEvents })) return null;
  const identityBps = Math.floor((10000 * M) / L);
  if (m.identityBps !== undefined && m.identityBps !== identityBps) return null;
  const loc = raw.location;
  return {
    location: {
      segments: Array.isArray(loc.segments) ? loc.segments.map((s) => ({ start: s.start, end: s.end })) : loc.segments,
      strand: loc.strand,
      wrapsOrigin: loc.wrapsOrigin,
    },
    metrics: {
      length: queryLength, queryLength, alignmentLength: L, targetSpan, identity: M / L, coverage: 1,
      exactMatches: M, substitutions: X, insertions: I, deletions: D,
      indelBases: I + D, indelEvents, editDistance: X + I + D, mismatches: X, indels: I + D, identityBps,
    },
  };
}

/**
 * Finalize a rich engine result for ONE document into canonical summaries, then run the full
 * `assertSequenceOccurrences` gate on them (topology + arithmetic + identityBps). A malformed hit
 * anywhere throws `MALFORMED_SEQUENCE_RESULT` — the caller discards the whole pass, never a partial.
 *
 * @param {unknown} rawReply — `seqMatch` output for one document: a locus envelope, or a bare array
 * @param {{sequenceLength:number, circular:boolean, queryLength:number}} facts
 * @returns {{occurrences:Array, locationCount:number, bestIndex:number}} canonical envelope
 * @throws {Error & {code:'MALFORMED_SEQUENCE_RESULT'}}
 */
export function finalizeSequenceOccurrences(rawReply, facts) {
  // FAIL CLOSED. The sequence engine answers with a locus envelope and nothing else, so anything
  // that is not one is malformed — including a bare ARRAY. Accepting an array here would be the
  // exact hole this function exists to close: it is what a stale or tampered engine produces, and
  // it silently means «no winner, count = whatever survived the cap», which is precisely the pair of
  // wrong answers P1-2/P1-3 were about. Likewise an unexpected key: a reply carrying fields we did
  // not define is not a reply we can reason about.
  if (!isPlainRecord(rawReply)) throwMalformed();
  const keys = Object.keys(rawReply);
  if (keys.length !== ENVELOPE_KEYS.length || !keys.every((k) => ENVELOPE_KEYS.includes(k))) throwMalformed();
  const envelope = rawReply;
  const rawOccurrences = envelope.occurrences;
  if (!Array.isArray(rawOccurrences)) throwMalformed();
  // The facts are validated BEFORE an empty result is allowed to short-circuit. `[]` claims «no site
  // here», and a garbage query length, a non-positive molecule length or a non-boolean topology
  // cannot certify that claim — a missed origin-crossing hit is exactly what a wrong circular flag
  // would hide. So an empty result over bad facts is malformed, never a free honest zero (§3.3).
  const queryLength = facts && facts.queryLength;
  const sequenceLength = facts && facts.sequenceLength;
  const circular = facts && facts.circular;
  if (!isSafeNonNeg(queryLength)) throwMalformed();
  if (!(Number.isInteger(sequenceLength) && sequenceLength > 0)) throwMalformed();
  if (typeof circular !== 'boolean') throwMalformed();
  if (rawOccurrences.length === 0) {
    // THE ONLY honest miss is exactly `{[], 0, -1}`. An empty window that claims 501 loci is not a
    // miss with a stale number attached — it is a reply whose two halves contradict each other, and
    // «repairing» it to `{[], 0, -1}` turned a malformed answer into a confirmed «nothing here».
    // That is the worst possible direction to be wrong in: the biologist is told the motif is absent
    // from a molecule the engine just said has 501 copies of it.
    if (envelope.locationCount !== 0 || envelope.bestIndex !== -1) throwMalformed();
    return EMPTY_FINALIZED;
  }
  const summaries = [];
  for (const raw of rawOccurrences) {
    const one = finalizeOne(raw, queryLength);
    if (one === null) throwMalformed();
    summaries.push(one);
  }
  // The canonical gate re-proves everything on the built objects — coordinates, topology, the
  // same equalities — so the finalizer cannot let a summary through that the linear kernel could not.
  const occurrences = assertSequenceOccurrences(summaries, { sequenceLength: facts.sequenceLength, circular: facts.circular });
  // Canonicalisation is 1:1 and order-preserving, so an index into the raw window is still the same
  // locus here — which is what lets the SAME leaf gate the boundary applies after structured-clone
  // run now, on the built objects. Applying it here rather than only post-clone matters: the inline
  // path and every direct caller of the finalizer would otherwise never see the `2n` ceiling or the
  // «declared winner must not lose on rules 1–6» check at all.
  const { locationCount, bestIndex } = envelope;
  if (!isValidSequenceEnvelope({ occurrences, locationCount, bestIndex },
    { length: sequenceLength, circular })) throwMalformed();
  return { occurrences, locationCount, bestIndex };
}

// The compact protocol carries EXACTLY this shape and nothing else. The allowlist is what stops a
// stale or tampered worker from smuggling alignment internals (`script`, `editRuns`,
// `mismatchPositions`) back across the boundary on otherwise-valid numbers — the fields were dropped
// at the worker-core boundary and must never reappear. Completeness of the 16 metrics is enforced by
// `validateSequenceOccurrences` (a missing field reads as `undefined` and fails its arithmetic), so
// allowlist + that validator together pin the shape exactly.
/** An honest miss, in the envelope shape — frozen so a caller cannot mutate the shared instance. */
const EMPTY_FINALIZED = Object.freeze({ occurrences: Object.freeze([]), locationCount: 0, bestIndex: -1 });

const OCCURRENCE_KEYS = new Set(['location', 'metrics']);
const LOCATION_KEYS = new Set(['segments', 'strand', 'wrapsOrigin']);
const SEGMENT_KEYS = new Set(['start', 'end']);
const METRIC_KEYS = new Set([
  'length', 'queryLength', 'alignmentLength', 'targetSpan', 'identity', 'coverage',
  'exactMatches', 'substitutions', 'insertions', 'deletions',
  'indelBases', 'indelEvents', 'editDistance', 'mismatches', 'indels', 'identityBps',
]);
const keysWithin = (obj, allowed) => Object.keys(obj).every((k) => allowed.has(k));

/** No key outside the canonical allowlist may appear on the occurrence, its location, its segments,
 * or its metrics. Rejects any smuggled alignment detail regardless of the numbers around it. */
function isCanonicalShape(occ) {
  if (!isPlainRecord(occ) || !isPlainRecord(occ.location) || !isPlainRecord(occ.metrics)) return false;
  if (!keysWithin(occ, OCCURRENCE_KEYS)) return false;
  if (!keysWithin(occ.location, LOCATION_KEYS)) return false;
  if (!keysWithin(occ.metrics, METRIC_KEYS)) return false;
  if (!Array.isArray(occ.location.segments)) return false;
  for (const s of occ.location.segments) {
    if (!isPlainRecord(s) || !keysWithin(s, SEGMENT_KEYS)) return false;
  }
  return true;
}

/**
 * Is a CLONED `byId` a well-formed canonical reply about exactly the request that produced it?
 * Used by the worker client after structured-clone: each key must be one we asked about, each hit in
 * strict canonical SHAPE (no smuggled alignment fields), canonical-valid for its molecule and
 * effective topology, and each `queryLength` the real query — so a plausible forgery (foreign query
 * length, a wrap on a linear doc, a coordinate off the end, an appended edit script) is caught even
 * though the message survived the boundary intact.
 *
 * @param {unknown} byId
 * @param {{docMeta: Map<string,{length:number, circular:boolean}>, queryLength:number}} req
 * @returns {boolean}
 */
export function validateSequencePayload(byId, req) {
  try {
    const docMeta = req && req.docMeta;
    const queryLength = req && req.queryLength;
    if (!(docMeta instanceof Map)) return false;
    if (!isPlainRecord(byId)) return false;
    for (const key of Object.keys(byId)) {
      const meta = docMeta.get(key);
      if (!meta) return false;
      // SEQUENCE envelope gate FIRST — the generic coherence rules PLUS the four the DNA dimension
      // needs: a non-empty window must name a winner (`bestIndex` is the only rule-7 evidence that
      // will ever exist), `locationCount` must fit what the algorithm can produce on a molecule of
      // this length (≤ 2n), the named winner must not LOSE to another retained occurrence on rules
      // 1–6, and the whole thing must be a plain record. Widening the payload did not widen trust.
      if (!isValidSequenceEnvelope(byId[key], meta, (occs) => {
        if (occs.length === 0) return false;
        for (const o of occs) if (!isCanonicalShape(o)) return false; // no smuggled alignment fields
        if (!validateSequenceOccurrences(occs, { sequenceLength: meta.length, circular: meta.circular })) return false;
        for (const o of occs) if (o.metrics.queryLength !== queryLength) return false;
        return true;
      })) return false;
    }
    return true;
  } catch {
    return false;
  }
}
