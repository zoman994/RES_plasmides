/**
 * dna-linear-provider — puts the linear kernel on the sequence search path, behind the kernel seam
 * (SEARCH-GAPPED-DNA U4, U6-F). This is the SHIPPED sequence kernel: `sequence-kernel-seam` selects
 * it by default on the U6 measurement, and the seam's forced selection now exists to reach the
 * PRODUCTION engine (parity tests, differentials), not to reach this one.
 *
 * The pipeline, in order:
 *
 *   findOccurrences  ->  assertRawKernelOccurrences  ->  toSearchHitSummaries  ->  assertSequenceOccurrences
 *        raw               RAW GUARD (pre-merge)          merge +/- -> both,        summary gate
 *        per-strand        script vs counters, end        envelope + bestIndex      (§3.1 metrics)
 *
 * WHY THE RAW GUARD RUNS BEFORE THE MERGE. The merge fuses an equivalent `+`/`-` pair into one
 * `both` row and DROPS the script. A corrupted minus occurrence whose script disagrees with its
 * counters could otherwise merge with a clean plus, lose its script, and sail past the downstream
 * summary validator — which only ever sees counters and coordinates. So the script, the one field
 * that can catch this, is checked against M/X/I/D and the alignment length while it still exists.
 *
 * Any failure is a typed `MALFORMED_SEQUENCE_RESULT` throw — the incomplete signal, never a silent
 * `[]` (§3.3). Resource/abort throws from the kernel propagate unchanged.
 *
 * Pure: no worker, no store, no UI.
 */
import { findOccurrencesSteps } from './dna-linear-kernel';
import { toSearchHitSummariesSteps } from './search-hit-summary';
import {
  assertSequenceOccurrencesSteps, MALFORMED_SEQUENCE_RESULT,
} from './search-sequence-contract';

export { MALFORMED_SEQUENCE_RESULT };

function malformed(reason) {
  const e = new Error(`malformed kernel result: ${reason}`);
  e.code = MALFORMED_SEQUENCE_RESULT;
  return e;
}

const SCRIPT_CHARS = { '=': 'M', X: 'X', I: 'I', D: 'D' };

/** Count each edit-op character in a script, or `null` if it contains a foreign symbol. */
function scriptCounts(script) {
  const c = { M: 0, X: 0, I: 0, D: 0 };
  for (let i = 0; i < script.length; i++) {
    const field = SCRIPT_CHARS[script[i]];
    if (!field) return null;
    c[field] += 1;
  }
  return c;
}

/**
 * Validate every RAW kernel occurrence — while its script is still present — and return the list
 * unchanged, or throw typed. The `end` is checked against `start + span` under the document's
 * topology, because a wrong endpoint is corruption the summary validator cannot recover once the
 * segments are rebuilt from it.
 *
 * @param {unknown} occurrences — raw findOccurrences output
 * @param {{targetLength:number, circular:boolean}} doc
 * @throws {Error & {code:'MALFORMED_SEQUENCE_RESULT'}}
 */
/**
 * RESUMABLE form. Every loop over the whole occurrence array is a place a cancel has to be able to
 * land — the output budget admits 200 000 of them.
 */
export function* assertRawKernelOccurrencesSteps(occurrences, doc) {
  if (!Array.isArray(occurrences)) throw malformed('not an array');
  const { targetLength, circular } = doc;
  let seen = 0;
  for (const o of occurrences) {
    // A validator that walks 200 000 occurrences in one uninterruptible block is the same defect as
    // an unbounded scan: the yields upstream buy nothing if the finalisation cannot be cancelled.
    seen += 1;
    if ((seen & 1023) === 0) yield;
    if (!o || typeof o !== 'object') throw malformed('occurrence is not an object');
    const { M, X, I, D, alignmentLength: L, script, start, targetSpan, end } = o;
    if (![M, X, I, D, L, start, targetSpan, end].every((n) => Number.isInteger(n) && n >= 0)) {
      throw malformed('non-integer occurrence field');
    }
    if (typeof script !== 'string') throw malformed('script is not a string');
    if (script.length !== L) throw malformed('script length != alignmentLength');
    const counts = scriptCounts(script);
    if (!counts) throw malformed('script has a foreign symbol');
    if (counts.M !== M || counts.X !== X || counts.I !== I || counts.D !== D) {
      throw malformed('script counts != M/X/I/D');
    }
    const expectedEnd = circular ? ((start + targetSpan) % targetLength) : (start + targetSpan);
    if (end !== expectedEnd) throw malformed('end inconsistent with start + span');
  }
  return occurrences;
}

/** The same validation, drained. */
export function assertRawKernelOccurrences(occurrences, doc) {
  const gen = assertRawKernelOccurrencesSteps(occurrences, doc);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

/**
 * The options the kernel is given — built ONCE, for both drives.
 *
 * `budgets` used to be dropped here while `stateBudget` was forwarded, so a caller who armed the
 * four axes got an unbounded LINEAR run and a caller who armed the legacy combined cap got a bounded
 * one. Two entry points each assembling their own option object is how that happens; there is now
 * one builder and both call it.
 *
 * `telemetry` is forwarded for the same reason it exists at all: it is the only way to observe from
 * OUTSIDE that the kernel phase has finished and the run is now in its finalisation — which is what
 * the cancellation gate needs in order to prove a cancel landed in the tail rather than in the scan.
 */
function kernelOptions(opts, circular) {
  return {
    thresholdBps: opts.thresholdBps,
    bothStrands: opts.bothStrands !== false,
    circular,
    budgets: opts.budgets,
    stateBudget: opts.stateBudget,
    shouldCancel: opts.shouldCancel,
    telemetry: opts.telemetry,
  };
}

/**
 * Run ONE engine pass with the linear kernel and return the canonical locus ENVELOPE, or throw typed
 * on incomplete/malformed. The shape mirrors the production engine pass so the seam can swap them
 * without the orchestrator noticing: a POSITIONAL window, how many loci the molecule holds, and the
 * §3.2 winner named by index. The winner used to be implied by «first element», which was a second
 * contract for the same question and disagreed with production on a circle.
 *
 * @param {string} query
 * @param {string} seq
 * @param {{thresholdBps:number, bothStrands?:boolean, circular?:boolean, budgets?:object,
 *   stateBudget?:number, shouldCancel?:Function, telemetry?:object}} opts
 * @returns {{occurrences:Array<{location:{segments,strand,wrapsOrigin}, metrics:object}>,
 *   locationCount:number, bestIndex:number}}
 *
 * RESUMABLE form — the one the search phases drive. The kernel used to be reachable only
 * synchronously, so while it held the thread a worker could not take delivery of a cancel frame at
 * all; suspending inside it is what makes the linear verifier usable in production rather than only
 * in a benchmark.
 */
export function* runLinearSequenceSearchSteps(query, seq, opts) {
  const circular = !!opts.circular;
  const raw = yield* findOccurrencesSteps(query, seq, kernelOptions(opts, circular));
  yield* assertRawKernelOccurrencesSteps(raw, { targetLength: seq.length, circular });
  const envelope = yield* toSearchHitSummariesSteps(raw, seq.length);
  yield* assertSequenceOccurrencesSteps(envelope.occurrences, { sequenceLength: seq.length, circular });
  return envelope;
}

/**
 * The same, drained — one implementation, two drives. Existing synchronous callers and tests keep
 * working and cannot drift from the resumable path, because this IS that path run without pausing.
 */
export function runLinearSequenceSearch(query, seq, opts) {
  const gen = runLinearSequenceSearchSteps(query, seq, opts);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}
