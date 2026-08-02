/**
 * search-worker-envelope — the REQUEST/REPLY boundary of the sequence-search worker.
 *
 * Extracted from `search-worker-client.js` by U4-CANCEL C2.1: the client had reached its size budget
 * and the corrective atom had to add protocol states, so the trust boundary — which is pure, has no
 * lifecycle and no worker handle — moved out first. A pure move plus the new frame predicates; the
 * validation rules themselves are unchanged.
 *
 * Everything here answers one question: «is this message a thing we asked for, in a shape we can
 * believe?» Nothing here owns a worker, a promise or a timer.
 */
import { entityRefKey } from './search-entity-key';
import { validateSequencePayload } from './search-sequence-contract';
import { MAX_APPROX_QUERY_LEN, resolveCircular } from './sequence-search-policy';

/** Distinct abort reasons so callers can tell a superseded search (drop it) from a real
 * provider failure (surface a "search failed" state, never a silent false negative). */
export const SEARCH_ABORT = Object.freeze({
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT',
  WORKER_FAILURE: 'WORKER_FAILURE',
  TERMINATED: 'TERMINATED',
  // Engine verdicts. Distinct from WORKER_FAILURE because the worker is HEALTHY — it answered.
  // The spec's resource-limit protocol names this step: client rejects as SEARCH_ABORT.RESOURCE_LIMIT
  // so the tracker can preserve the cause instead of flattening it into a generic provider error.
  RESOURCE_LIMIT: 'RESOURCE_LIMIT',
  INVALID_DNA: 'INVALID_DNA',
  REQUIRES_ALIGNMENT: 'REQUIRES_ALIGNMENT',
});

/** Rejection carried out of the client; `.reason` is a SEARCH_ABORT value. */
export class SearchAbortError extends Error {
  constructor(reason, message) {
    super(message || `search ${String(reason).toLowerCase()}`);
    this.name = 'SearchAbortError';
    this.reason = reason;
  }
}

/**
 * Rebuild a typed verdict from a worker envelope, or return null if the envelope is not one.
 *
 * A TRUST BOUNDARY, not a parser. The reply is data from another thread: it may be truncated,
 * from an older protocol, or corrupt. The dangerous shape is a plausible one — a forged
 * `REQUIRES_ALIGNMENT` would tell a biologist their 400-nt insert «needs alignment» about a search
 * that actually broke. So the code must be one we expect, and a reply may not claim both an answer
 * and a verdict. Anything else is refused and handled as a fault.
 *
 * The route is checked against THE REQUEST, not just against itself. Self-consistency is far too
 * weak: `{ maxApproxLength: 100, queryLength: 412 }` is made of individually true numbers, so it
 * passes any check that only looks inward — while describing somebody else's search. Answering a
 * 6-mer with it would open the alignment workspace on a hexamer as though it were a 412-nt insert.
 * A verdict is a claim ABOUT a request, so it is only believed when it describes the request we
 * actually made, at the limit the product actually enforces.
 *
 * @param {number} queryLength — length of the query THIS pending request asked about
 */
export function typedVerdict(error, byId, queryLength) {
  if (byId !== undefined) return null;                    // an answer AND a verdict is incoherent
  if (!error || typeof error !== 'object') return null;
  const { code } = error;
  if (code !== SEARCH_ABORT.RESOURCE_LIMIT && code !== SEARCH_ABORT.INVALID_DNA
      && code !== SEARCH_ABORT.REQUIRES_ALIGNMENT) return null;
  const err = new SearchAbortError(code);
  err.code = code; // the failure tracker keys the §4.2.0 route on `code`, transport on `reason`
  if (code === SEARCH_ABORT.REQUIRES_ALIGNMENT) {
    const { maxApproxLength: max, queryLength: len } = error;
    if (!Number.isInteger(len) || len !== queryLength) return null;  // about a DIFFERENT query
    if (max !== MAX_APPROX_QUERY_LEN) return null;                   // not the normative limit
    if (len <= max) return null;                                     // never routed out at all
    err.maxApproxLength = max;
    err.queryLength = len;
  }
  return err;
}

/** entityKey → sequence length, for exactly the docs handed to the engine. The bounds check is
 * only meaningful per document, so the length travels with the request (S3-CLOSE K3.0). */
export function toDocLengths(docs) {
  return new Map(docs.map((d) => [d.id, d.seq.length]));
}

/** entityKey → { length, circular }, for re-checking a canonical reply against the request it
 * answers. The circular flag uses the SAME `resolveCircular` the core used, so a wrap the core
 * produced under one topology can never be rejected as impossible under a different one (U4). */
export function toDocMeta(docs, ctx) {
  return new Map(docs.map((d) => [d.id, {
    length: d.seq.length, circular: resolveCircular(ctx && ctx.circular, d.topology),
  }]));
}

export function toWorkerDocs(documents) {
  return (documents || [])
    .filter((d) => d && d.ref && d.ref.id && d.sequence && d.sequence.seq)
    // Composite `<kind>:<id>` (§10.4) — the returned byId map must never merge an entry
    // and a same-id primer (facade looks it back up by entityRefKey too).
    .map((d) => ({ id: entityRefKey(d.ref), seq: d.sequence.seq, topology: d.sequence.topology }));
}

/** The ONLY keys a cancel acknowledgement may carry. */
const ACK_KEYS = ['id', 'cancelled'];

/**
 * Is this frame a CANCEL ACKNOWLEDGEMENT, in the exact shape the protocol defines (C2.1 P2)?
 *
 * Strict on purpose: `{ id, cancelled:true }` and NOTHING else. An ack that also carries `byId` or
 * `error` is claiming two contradictory things at once — «I abandoned the job» AND «here is its
 * answer» — and a worker that says that is not one whose next reply should be trusted.
 *
 * C2.1.1 makes «nothing else» literal, an own-key ALLOWLIST rather than a deny-list of the two
 * fields we happened to think of. A deny-list passes `{id, cancelled:true, byId:…}` under any name
 * the sender chooses — `results`, `partial`, a field from a protocol version this build predates —
 * and the whole point of the strict shape is that an ack we cannot fully account for is not an ack.
 */
export function isCancelAck(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.cancelled !== true) return false;
  const keys = Object.keys(data);
  return keys.length === ACK_KEYS.length && keys.every((k) => ACK_KEYS.includes(k));
}

/**
 * Did the worker deliver a BELIEVABLE terminal outcome for `meta`'s request — an answer or a
 * deliberate verdict (C2.1 P1-2)?
 *
 * Used for the cancel race: the worker may have finished the job microseconds before our cancel
 * frame reached it, so the only thing it will ever send is the ordinary terminal reply. That reply
 * proves the job is over just as well as an ack does — but ONLY if it validates, otherwise the
 * thread is unusable and must be torn down rather than silently trusted.
 *
 * @param {{docMeta:Map, queryLength:number}} meta what WE asked
 * @returns {boolean}
 */
export function isValidTerminal(byId, error, meta) {
  if (error !== undefined) return typedVerdict(error, byId, meta.queryLength) !== null;
  if (byId === undefined) return false;
  return validateSequencePayload(byId, { docMeta: meta.docMeta, queryLength: meta.queryLength });
}

/**
 * Does this frame prove the job we asked to CANCEL is over? `false` ⇒ treat the worker as faulty.
 *
 * COHERENCE FIRST. A frame that mentions `cancelled` at all is claiming to be an acknowledgement, so
 * it is held to the ack's exact shape and nothing else — otherwise `{id, cancelled:true, byId:{}}`
 * slips through as a "valid terminal", because an EMPTY `byId` is a legitimate honest miss. That is
 * the C2.1 P2 hole: the frame asserts both «I abandoned the job» and «here is its answer», and a
 * worker that says both is exactly the one whose next reply must not be believed.
 */
export function resolvesCancelledJob(data, meta) {
  if (!data) return false;
  if (data.cancelled !== undefined) return isCancelAck(data);
  return isValidTerminal(data.byId, data.error, meta);
}
