/**
 * dna-linear-control — the per-call resource, telemetry and cancel hooks of the linear kernel.
 *
 * Extracted from the kernel in U6-F.1 — mechanically, not as a rewrite: the kernel had grown past
 * its size budget while the biology and the plumbing lived in one file, and the plumbing is the part
 * that has nothing to do with what an occurrence is. It was byte-for-byte what the kernel ran at the
 * time of the move; `resolveStateBudget` replaced a local truthiness test in the same package, and
 * the header used to claim otherwise.
 *
 * This runs on the PRODUCTION search path — the linear kernel is the shipped one since U6-F.2.
 *
 * Kept in one object so the scanner, the verifier loop and the traceback all charge the SAME meter
 * without any of them owning it.
 */
import {
  makeMeter, resolveBudgets, resolveStateBudget,
  chargeScan, chargeVerifier, chargeTraceback, chargeOutput,
} from './dna-search-budget';
import { abortError } from './dna-linear-abort';

export /** Per-call resource/telemetry/cancel hooks. Kept in one object so the scanner, the verifier
 * loop and the traceback all charge the SAME meter without any of them owning it. */
function makeControl(opts, telemetry, inputBytes) {
  // `stateBudget` is ARMED, not ignored: a run stopped by an exhausted budget has not established
  // an absence, so it must refuse in a typed way rather than report «nothing found».
  //
  // Resolved by the ENGINE's own rule, not by a local truthiness test. The local one silently
  // rewrote two shapes into «no limit»: a budget of `0` — a caller asking for an immediate typed
  // refusal — and every malformed value, which the shared resolver refuses with `INVALID_BUDGET`
  // instead of quietly running unbounded.
  const meter = makeMeter(resolveBudgets(opts.budgets), resolveStateBudget(opts.stateBudget));
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : null;

  // Concurrently live allocations are SUMMED, not maxed. The solver, the scanner and the current
  // window DP exist at the same moment, so reporting only the largest of them understates the
  // real peak — and understating is the one direction a memory guard must not err in. Buffered
  // OBJECTS (dedup entries, occurrences) are counted separately rather than converted into a
  // guessed byte size: a JS object has no honest sizeof, and a fabricated one would read as a
  // measurement.
  let fixedBytes = 0;
  let windowBytes = 0;
  let tracebackBytes = 0;
  let peakBytes = 0;
  let peakObjects = 0;
  // §4.2.1 pipeline counters — the natural seams of the new scanner/verifier, summed across strands.
  // Each is charged at ITS OWN stage so the funnel is observable: every scanner END, every admissible
  // window START (pre-`recent`-dedup), every UNIQUE start actually verified, every locus RETAINED
  // after §3.2.1 pruning, and every real traceback MATERIALISED (rules-7 tie-breaks included).
  let candidateEnds = 0;
  let rawStarts = 0;
  let verifiedStarts = 0;
  let retainedLoci = 0;
  let tracebacksMaterialized = 0;
  // All three CO-EXIST: the solver and scanner live for the whole strand, the window arrays live
  // for the current chunk, and the suffix tables are retained on the solver once allocated, so
  // they overlap every later window. Summing is therefore the honest peak; taking a max of them
  // reported roughly the largest single allocation and hid the rest.
  const notePeak = () => {
    const now = fixedBytes + windowBytes + tracebackBytes;
    if (now > peakBytes) peakBytes = now;
  };

  const ctl = {
    meter,
    charge: (k = 1) => chargeScan(meter, k),
    chargeVerifier: (k = 1) => chargeVerifier(meter, k),
    chargeTraceback: (k = 1) => chargeTraceback(meter, k),
    chargeOutput: (k = 1) => chargeOutput(meter, k),
    cancelStride: 4096,
    checkCancel: () => { if (shouldCancel && shouldCancel()) throw abortError(); },
    noteFixed: (bytes) => { fixedBytes += bytes; notePeak(); },
    noteWindow: (bytes) => { windowBytes = bytes; notePeak(); },
    noteTraceback: (bytes) => { if (bytes > tracebackBytes) tracebackBytes = bytes; notePeak(); },
    noteObjects: (count) => { if (count > peakObjects) peakObjects = count; },
    noteCandidateEnd: () => { candidateEnds += 1; },
    noteRawStart: () => { rawStarts += 1; },
    noteVerifiedStart: () => { verifiedStarts += 1; },
    noteRetained: (k) => { retainedLoci += k; },
    noteTracebackMaterialised: () => { tracebacksMaterialized += 1; },
    finish: () => {
      if (!telemetry) return;
      telemetry.inputBytes = inputBytes;
      telemetry.workspaceHighWaterBytes = peakBytes;
      telemetry.workspaceTypedArrayBytes = peakBytes;
      telemetry.bufferedObjectHighWater = peakObjects;
      telemetry.scanUsed = meter.scanUsed;
      telemetry.verifierUsed = meter.verifierUsed;
      telemetry.tracebackUsed = meter.tracebackUsed;
      telemetry.outputUsed = meter.outputUsed;
      telemetry.limitedAxis = meter.limitedAxis;
      // §4.2.1 counters — always published (a cancelled / budget-starved run keeps its numbers).
      telemetry.candidateEnds = candidateEnds;
      telemetry.rawStarts = rawStarts;
      telemetry.verifiedStarts = verifiedStarts;
      telemetry.retainedLoci = retainedLoci;
      telemetry.tracebacksMaterialized = tracebacksMaterialized;
    },
  };
  return ctl;
}
