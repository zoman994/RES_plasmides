/**
 * search-locus-envelope — the per-document reply about WHERE a query was found, carrying the two
 * facts a truncation would otherwise destroy (P1-2 / P1-3).
 *
 * A repeat-rich molecule is truncated TWICE on the way to a row: the engine caps its payload, and
 * the orchestrator caps locations per entity. Each cap keeps a positional prefix, and a positional
 * prefix answers neither question the row asks:
 *
 *   HOW MANY loci exist — `occurrences.length` after a cap is the size of a window, not a count of
 *     sites. Showing «50 locations» for 51 real EcoRI sites is a wrong statement about the DNA.
 *   WHICH locus is canonical — §3.2 ends with a lexical tiebreak on the edit script, and the compact
 *     boundary drops the script by design (U4). Rule 7 therefore cannot be recomputed downstream at
 *     ANY later point, so the winner must be named where it is still decidable — and then survive
 *     every cap after it. That is what `bestIndex` is: not a hint, the only surviving evidence.
 *
 * Hence the envelope `{ occurrences, locationCount, bestIndex }`. It is a STRICTER contract than the
 * bare array it replaces, not a looser one: the shape is an exact allowlist, the two numbers are
 * range-checked against the payload they describe (`locationCount >= occurrences.length`,
 * `bestIndex` a real index or −1), and a reply that cannot satisfy that is refused at the boundary
 * exactly as a malformed occurrence is.
 *
 * `bestIndex === -1` means «this provider declares no canonical winner» — the honest answer for an
 * uncapped provider (protein / enzyme / feature) that never had a script to apply rule 7 to. It is
 * NOT the same as «index 0».
 *
 * Pure leaf: no engine, no store, no UI. Imported by the engine, the worker boundary, the
 * orchestrator and the ranker, so all four agree on one definition of «a locus».
 */

/** The envelope carries EXACTLY these keys — nothing may ride along. */
export const ENVELOPE_KEYS = Object.freeze(['occurrences', 'locationCount', 'bestIndex']);

/** A window size / count must be a real non-negative integer, never NaN, a float or a string. */
export function isSafeCount(v) {
  return Number.isSafeInteger(v) && v >= 0;
}

/**
 * A cap is only a cap when it is a POSITIVE safe integer. `0`, `-1`, `NaN`, `1.5` and `'50'` are all
 * programming errors, and each used to silently change the meaning of the truncation — `slice(0,
 * NaN)` empties the result, while a `length <= limit` guard written against the same value lets
 * EVERY occurrence through. Callers resolve an invalid limit to their documented default instead, so
 * the cap can never be switched off by accident.
 */
export function isValidLimit(v) {
  return Number.isSafeInteger(v) && v > 0;
}

/**
 * Is this occurrence a PLACE ON THE MOLECULE?
 *
 * Metadata dimensions — a name or a tag hit — also produce occurrences, but they carry no
 * coordinates. Counting one would tell a biologist there is a site on the DNA that does not exist.
 */
export function isPhysicalLocus(o) {
  const segs = o && o.location && o.location.segments;
  return Array.isArray(segs) && segs.length > 0;
}

/** How many of these occurrences are real places on the molecule. */
export function countPhysicalLoci(occurrences) {
  if (!Array.isArray(occurrences)) return 0;
  let n = 0;
  for (const o of occurrences) if (isPhysicalLocus(o)) n += 1;
  return n;
}

/**
 * Normalize a provider reply into an envelope.
 *
 * A provider that applies NO cap of its own (protein / enzyme, and the metadata dimensions) answers
 * with a plain array; its physical loci are exactly what it returned, and it declares no canonical
 * winner. A capped provider (the DNA engine) answers with an envelope and is taken at its word.
 *
 * @param {Array|Object|null|undefined} reply
 * @returns {{occurrences:Array, locationCount:number, bestIndex:number}}
 */
export function toLocusEnvelope(reply) {
  if (Array.isArray(reply)) {
    return { occurrences: reply, locationCount: countPhysicalLoci(reply), bestIndex: -1 };
  }
  if (reply && Array.isArray(reply.occurrences)) {
    const occurrences = reply.occurrences;
    const declared = reply.locationCount;
    const physical = countPhysicalLoci(occurrences);
    return {
      occurrences,
      // A declared count below what is actually carried is not believable — take the payload's word.
      locationCount: isSafeCount(declared) && declared >= physical ? declared : physical,
      bestIndex: Number.isSafeInteger(reply.bestIndex)
        && reply.bestIndex >= 0 && reply.bestIndex < occurrences.length ? reply.bestIndex : -1,
    };
  }
  return { occurrences: [], locationCount: 0, bestIndex: -1 };
}

/**
 * Truncate the retained window to `limit` WITHOUT dropping the declared canonical winner.
 *
 * This is the second cap. The first one already decided the winner while the edit script existed;
 * re-slicing positionally here would throw that decision away exactly as the first cap did — a hit
 * ending at the origin has the LARGEST start on a circle and is the first casualty of any positional
 * prefix. So the winner is moved into the last retained slot instead. Order is preserved by
 * construction: it comes from beyond the window, so its start is ≥ every start already inside.
 *
 * `locationCount` is untouched — it describes the molecule, not the window.
 *
 * @param {{occurrences:Array, locationCount:number, bestIndex:number}} env
 * @param {number} limit
 */
export function capLocusEnvelope(env, limit) {
  if (!isValidLimit(limit) || env.occurrences.length <= limit) return env;
  const occurrences = env.occurrences.slice(0, limit);
  let bestIndex = env.bestIndex;
  if (bestIndex >= limit) {
    occurrences[limit - 1] = env.occurrences[bestIndex];
    bestIndex = limit - 1;
  }
  return { occurrences, locationCount: env.locationCount, bestIndex };
}

/**
 * Is this a well-formed envelope about the payload it carries? A TRUST-BOUNDARY check: the reply is
 * data from another thread, so every claim it makes about itself is verified against the array it
 * came with, and no key outside the allowlist may appear.
 *
 * @param {unknown} env
 * @param {(occurrences:Array)=>boolean} [occurrencesOk] — the caller's own check on the payload
 */
export function isValidLocusEnvelope(env, occurrencesOk) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return false;
  const keys = Object.keys(env);
  if (keys.length !== ENVELOPE_KEYS.length) return false;
  if (!keys.every((k) => ENVELOPE_KEYS.includes(k))) return false;
  if (!Array.isArray(env.occurrences)) return false;
  if (!isSafeCount(env.locationCount)) return false;
  // The window can never claim to hold more places than the molecule has.
  if (env.locationCount < env.occurrences.length) return false;
  if (!Number.isSafeInteger(env.bestIndex)) return false;
  if (env.bestIndex < -1 || env.bestIndex >= env.occurrences.length) return false;
  // −1 is the only way to decline; a non-empty payload may still decline, an EMPTY one must.
  if (env.occurrences.length === 0 && env.bestIndex !== -1) return false;
  if (typeof occurrencesOk === 'function' && !occurrencesOk(env.occurrences)) return false;
  return true;
}
