/**
 * search-provider-contract — the structural gate every biological provider output must pass
 * (REV #2 S3-CLOSE K3.0).
 *
 * A confirmed hit is a claim about a physical molecule: «this motif / protein / restriction site
 * is HERE, on THIS sequence, between THESE bases». Two ways a corrupted provider could forge
 * that claim survived K2:
 *
 *   1. COORDINATES — K2 checked `end > start` and integer-ness, but never the length of the
 *      ACTUAL sequence. `{start: 5_000_000, end: 5_000_006}` on a 360 bp plasmid read as a real
 *      hit. So every segment is now checked against the length of the document being scanned.
 *   2. OWNERSHIP — `library-search` enriches an occurrence with `{ targetRef: doc.ref, ...o }`.
 *      The spread runs LAST, so a provider-owned `o.targetRef` OVERWRITES the trusted ref and
 *      re-attributes the hit to another molecule. That file is frozen (size + hash), so the rule
 *      is enforced here instead, at the boundary: a ProviderOccurrence has no `targetRef` at all.
 *      Only the orchestrator names the owner.
 *
 * Shared by the worker and the inline engines so neither is trusted more than the other.
 *
 * Calibrated against the real engines (verified, not assumed): `seq-match`, `protein-match` and
 * `re-match` all emit `location: {segments, strand:'+'|'-', wrapsOrigin:boolean}`, and none emits
 * `targetRef`. So this strict shape accepts every genuine hit.
 *
 * Deliberately NOT enforced — these are legitimate biology, not corruption:
 *   • segment count, sort order or monotonicity — a spliced protein hit has several non-adjacent
 *     exon segments, in whatever order the walker produced them;
 *   • «wrapsOrigin ⇒ exactly two segments» — a circular origin hit runs [95,100) then [0,5), but
 *     the shape is not the engine's contract to prove here.
 * Payload fields (`metrics`, `protein`, `enzyme`) are allowed and NOT inspected: K3 validates the
 * identity/location boundary only, never biological values.
 *
 * Pure: no UI, no store, no engine imports. Nothing imports back.
 */

/** A plain record: an object literal, or `Object.create(null)`. A Map/Date/Array/class instance
 * is not something an engine can produce, and `Object.entries()` would silently coerce it. */
function isPlainRecord(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** A length we can actually measure a claim against. */
function isUsableLength(n) {
  return Number.isInteger(n) && n > 0;
}

const STRANDS = new Set(['+', '-', 'both']);

function isValidSegment(seg, sequenceLength) {
  if (!isPlainRecord(seg)) return false;
  const { start, end } = seg;
  // Number.isInteger already rejects NaN / Infinity / floats.
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  // 0 <= start < end <= sequenceLength: end-exclusive, spans at least one base, and never
  // points off the molecule it claims to be on.
  return start >= 0 && start < end && end <= sequenceLength;
}

function isValidOccurrence(occ, sequenceLength) {
  if (!isPlainRecord(occ)) return false;
  // The provider does not get to choose the owner of its own hit. Presence of the key at all is
  // the violation — a `targetRef: undefined` would still win the spread in library-search.
  if ('targetRef' in occ) return false;
  const { location } = occ;
  if (!isPlainRecord(location)) return false;
  if (!STRANDS.has(location.strand)) return false;
  if (typeof location.wrapsOrigin !== 'boolean') return false;
  const { segments } = location;
  if (!Array.isArray(segments) || segments.length === 0) return false;
  for (const seg of segments) if (!isValidSegment(seg, sequenceLength)) return false;
  return true;
}

/**
 * Is `value` a well-formed occurrence list for a sequence of `sequenceLength`?
 *
 * `[]` is ALWAYS valid — an honest miss, including for a document with no sequence at all (the
 * provider legitimately answers «nothing to check here»). A NON-EMPTY list, by contrast, is a
 * claim, so the sequence must exist and be measurable: without a usable length there is nothing
 * the coordinates could be true about.
 *
 * Never throws — callers use it as a gate, not as a parser.
 *
 * @param {unknown} value
 * @param {unknown} sequenceLength — length of THIS document's sequence
 * @returns {boolean}
 */
export function validateProviderOccurrences(value, sequenceLength) {
  try {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return true;
    if (!isUsableLength(sequenceLength)) return false;
    for (const occ of value) if (!isValidOccurrence(occ, sequenceLength)) return false;
    return true;
  } catch {
    return false; // a hostile getter must not break the gate
  }
}

/**
 * Is `byId` a well-formed reply about exactly the documents that were sent?
 *
 * @param {unknown} byId — plain record `entityKey → occurrences`; `{}` is a valid honest miss
 * @param {Map<string, number>} allowedLengthsByKey — a REAL Map: entityKey → sequence length, for
 *   the docs actually handed to the engine. A duck-typed object or a Set is refused: the per-key
 *   length is what makes the bounds check meaningful, and a Set cannot carry it.
 * @returns {boolean}
 */
export function validateProviderPayload(byId, allowedLengthsByKey) {
  try {
    if (!(allowedLengthsByKey instanceof Map)) return false;
    if (!isPlainRecord(byId)) return false;
    for (const key of Object.keys(byId)) {
      // A key we never asked about means the reply is not about our document set at all.
      if (!allowedLengthsByKey.has(key)) return false;
      const occurrences = byId[key];
      // A real engine never writes an empty key (`if (occ.length) byId[d.id] = occ`), so an empty
      // array here is corruption — not «this molecule has no site».
      if (!Array.isArray(occurrences) || occurrences.length === 0) return false;
      if (!validateProviderOccurrences(occurrences, allowedLengthsByKey.get(key))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
