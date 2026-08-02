/**
 * search-sequence-envelope — the SEQUENCE-specific gate on a per-document locus envelope.
 *
 * The generic envelope check (`search-locus-envelope`) proves the shape is coherent with itself.
 * That is not enough for the DNA dimension, because the DNA dimension is the only one whose reply
 * carries a claim nothing downstream can re-derive: `bestIndex` IS §3.2 rule 7's verdict, decided
 * inside the engine while the edit script still existed and destroyed the moment the compact
 * boundary drops the script. A reply that declines to name a winner, or names the wrong one, cannot
 * be corrected later — it can only be believed or refused. So it is refused.
 *
 * Four sequence-only rules, none of which apply to protein/enzyme (they are uncapped, they never had
 * a script, and they legitimately declare nothing):
 *
 *   1. A NON-EMPTY DNA window must declare a winner. `-1` here is not modesty, it is the loss of the
 *      only rule-7 evidence that will ever exist.
 *   2. `locationCount` must be within what the algorithm can actually produce. On a molecule of
 *      length n a query can start at each of n positions on each of 2 strands, so 2n is the
 *      normative ceiling; a reply claiming more is describing a different molecule.
 *   3. The declared winner must not LOSE to another retained occurrence on the rules that survived
 *      the boundary (1–6). A tie is allowed — that is precisely where rule 7 decides and where the
 *      engine's word is the only evidence — but «worse on identity» is a forgery we can catch.
 *   4. The envelope must be a plain record, and the molecule facts it is judged against must be one
 *      too, with a BOOLEAN topology. A class instance or an array carrying the right keys is not a
 *      message, and a coerced topology is not a fact — `'false'` must not be able to assert
 *      «circular». Scope, stated exactly: this is a PROTOTYPE and a type check. Property
 *      DESCRIPTORS are not inspected, so a plain object whose `locationCount` is an accessor still
 *      passes; hardening that is a separate decision, not something this rule quietly implies.
 *
 * Pure: shape + §3.2, no engine, no store, no UI.
 */
import { isValidLocusEnvelope } from './search-locus-envelope';
import { compareSummaryOccurrence } from './search-occurrence-order';

/** A plain record — an object literal or `Object.create(null)`; never an array or a class instance. */
function isPlainRecord(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Is this envelope a believable SEQUENCE reply about a molecule of `meta.length`?
 *
 * @param {unknown} env
 * @param {{length:number, circular:boolean}} meta — the molecule the reply claims to be about
 * @param {(occurrences:Array)=>boolean} [occurrencesOk] — the caller's own payload check
 * @returns {boolean}
 */
export function isValidSequenceEnvelope(env, meta, occurrencesOk) {
  if (!isPlainRecord(env)) return false; //                                              rule 4
  if (!isValidLocusEnvelope(env, occurrencesOk)) return false;
  if (!isPlainRecord(meta)) return false;
  const n = meta.length;
  if (!Number.isSafeInteger(n) || n <= 0) return false;
  // TOPOLOGY IS A TYPE GATE, NOT A HINT. It decides whether a wrap is possible at all, and on a
  // circle rule 6 folds the §3.2 endpoint modulo the molecule — so a wrong answer here silently
  // re-ranks loci. Coercing with `!!` made the STRING `'false'` — the shape a query param, a form
  // field or a serialised preference arrives in — assert «circular», the opposite of what it says.
  // The validator cannot recover the truth from a coerced value, so it refuses to guess.
  if (typeof meta.circular !== 'boolean') return false;
  if (env.occurrences.length === 0) return false; // a real engine writes no key for a miss
  if (env.bestIndex < 0) return false; //                                                rule 1
  // rule 2 — at most one hit per start position per strand.
  if (env.locationCount > 2 * n) return false;
  // rule 3 — the declared winner may tie, but never lose, on the checkable rules.
  const cmpMeta = { circular: meta.circular, sequenceLength: n };
  const best = env.occurrences[env.bestIndex];
  for (const o of env.occurrences) {
    if (o === best) continue;
    if (compareSummaryOccurrence(o, best, cmpMeta, cmpMeta) < 0) return false;
  }
  return true;
}
