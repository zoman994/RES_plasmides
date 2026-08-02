/**
 * sequence-kernel-seam — an INTERNAL benchmark switch for which DNA kernel the sequence provider
 * runs (SEARCH-GAPPED-DNA U4).
 *
 * The linear kernel had to be measurable before it could be trusted as the default (U6); it now IS
 * the default, and the seam's remaining job is the other direction — reaching the production engine
 * for parity tests, differentials and benchmarks. Either way this is a measurement seam, NOT a
 * product feature: a single module-level variable, with no user setting, no localStorage and no
 * persistence of any kind. A forced selection lasts only until reset, and a fresh import always
 * starts at the default below. There is no user-facing toggle.
 *
 * Pure: no store, no UI, no I/O.
 */

export const SEQUENCE_KERNEL = Object.freeze({
  PRODUCTION: 'production',
  LINEAR: 'linear',
});

/**
 * LINEAR since U6-F.2, on measurement.
 *
 * The switch was made twice. The first time (U6-F.1) it went in ahead of two contracts that were
 * still open — the canonical winner on a circle, and a positional order missing its strand term —
 * so it was reverted to production for the corrective and turned back on only as its last edit.
 *
 * The two kernels answer identically — ten cells compared by SHA-256 of the complete canonical
 * reply, payloads from 24 B to 765 kB, 10/10 the same. SEVEN of those cells ran on the full
 * 2822-molecule base; the three long-exact controls ran on a synthetic 1 MB target, because a
 * 500 000-nt query has no meaning against real plasmids. So this is a choice of cost, not of
 * biology. On the cells where the kernel is actually used it is 1.7× to 3.8× cheaper, and on the
 * repeat-homology case — one plasmid carrying three byte-identical copies of the same fluorescent
 * protein — it is 18× cheaper and completes where the previous verifier exhausted its budget:
 * fifteen near-identical explanations of one locus are no longer given a separate DP each. On exact cells, where no kernel runs, the two are inside the measurement's own
 * control envelope.
 *
 * The cost side is stated too, and stated for what it is: on the heaviest full-corpus case the
 * browser's AGGREGATE working set grew +105 MB above idle against +54 MB for production. That is a
 * sum over all Chrome processes, sampled by `tasklist` — NOT a worker heap peak, and not evidence
 * about any overall memory ceiling. It says linear holds more, not how much the worker holds.
 *
 * What did NOT change with it: `EXACT_FIRST`, the 100 nt approximate limit, every budget, and the
 * 15 s client timeout.
 */
const DEFAULT_KERNEL = SEQUENCE_KERNEL.LINEAR;
let current = DEFAULT_KERNEL;

/** Which kernel the sequence provider should use right now. */
export function getSequenceKernel() {
  return current;
}

/**
 * Force a kernel — for benchmarks and parity tests only. Refuses anything but a known value, so
 * the seam can never be turned into a free-form flag.
 * @param {'production'|'linear'} kernel
 */
export function setSequenceKernelForBenchmark(kernel) {
  if (kernel !== SEQUENCE_KERNEL.PRODUCTION && kernel !== SEQUENCE_KERNEL.LINEAR) {
    throw new Error(`unknown sequence kernel: ${String(kernel)}`);
  }
  current = kernel;
}

/** Return to the default. Call in test teardown so a forced selection cannot leak between tests. */
export function resetSequenceKernel() {
  current = DEFAULT_KERNEL;
}
