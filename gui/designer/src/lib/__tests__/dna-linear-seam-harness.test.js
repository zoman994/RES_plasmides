/**
 * U4 item 3 — the real-path harness: each kernel, selected through the seam, runs through the ACTUAL
 * inline search path (createSearchWorkerClient → searchAllSequences → seqMatch →
 * runLinearSequenceSearch → raw guard → adapter → sequence validator), and:
 *
 *   • the two kernels produce PARITY results on the bio-significant fields;
 *   • the DEFAULT path is the linear one (U6-F.2), and production stays reachable for differentials;
 *   • a malformed kernel result becomes INCOMPLETE (a rejection), never an honest zero — proven
 *     in dna-linear-seam-malformed.test.js, which mocks findOccurrences to corrupt the raw output.
 *
 * This is the "malformed → incomplete" and "valid parity" proof the earlier propagation test could
 * not give: the sequence validator actually runs on the path here.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-seam-harness.test.js
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createSearchWorkerClient } from '../search-worker-client';
import { setSequenceKernelForBenchmark, resetSequenceKernel, SEQUENCE_KERNEL } from '../sequence-kernel-seam';

afterEach(() => resetSequenceKernel());

const QUERY = 'ACGTTGCAATCGGATCCTTA';                          // 20 nt
const MUT = `${QUERY.slice(0, 9)}A${QUERY.slice(10)}`;         // one substitution at index 9
// EXACT target: the query verbatim, so seq-match's exact-first pass answers.
const EXACT_TARGET = `GGGGGGGGGG${QUERY}TTTTTTTTTT`;
// APPROXIMATE target: ONLY the substituted copy, so exact-first finds nothing and BOTH kernels
// actually run the approximate pass — the path the linear kernel exists to prove.
const APPROX_TARGET = `GGGGGGGGGG${MUT}TTTTTTTTTT`;
const docsFor = (seq) => [{ ref: { kind: 'entry', id: 'plasmid-1' }, sequence: { seq, topology: 'linear' } }];

/** The fields a locator/ranker actually shows, and that BOTH engines emit — the only ones parity
 * is about (§5.3.1). `identity` (float M/L) is shared; production has no `identityBps` and the
 * summary has no `editRuns`, so neither is compared. */
function bioShape(result) {
  // U5-A — a document's answer is the summary model; the bio-shape lives in its occurrences.
  const occurrences = Array.isArray(result) ? result : (result?.occurrences || []);
  return occurrences
    .map((o) => ({
      strand: o.location.strand,
      segments: o.location.segments,
      wrapsOrigin: o.location.wrapsOrigin,
      M: o.metrics.exactMatches, X: o.metrics.substitutions,
      I: o.metrics.insertions, D: o.metrics.deletions,
      L: o.metrics.alignmentLength, identity: o.metrics.identity,
    }))
    .sort((a, b) => a.segments[0].start - b.segments[0].start || a.strand.localeCompare(b.strand));
}

async function run(kernel, target) {
  if (kernel) setSequenceKernelForBenchmark(kernel);
  else resetSequenceKernel();
  const client = createSearchWorkerClient(null);               // pure inline: the real seqMatch path
  const map = await client.searchSequences(QUERY, docsFor(target), { identityThreshold: 0.9, bothStrands: false });
  return map.get('entry:plasmid-1') || [];
}

describe('U4 — forced linear kernel reaches parity with production on the real path', () => {
  it('EXACT pass: the two kernels agree on the bio-significant fields', async () => {
    const production = bioShape(await run(SEQUENCE_KERNEL.PRODUCTION, EXACT_TARGET));
    const linear = bioShape(await run(SEQUENCE_KERNEL.LINEAR, EXACT_TARGET));
    expect(production.length, 'the exact locus is found').toBe(1);
    expect(production[0].identity, 'and at 100%').toBe(1);
    expect(linear).toEqual(production);
  });

  it('APPROXIMATE pass: the two kernels agree on a one-substitution hit', async () => {
    const production = bioShape(await run(SEQUENCE_KERNEL.PRODUCTION, APPROX_TARGET));
    const linear = bioShape(await run(SEQUENCE_KERNEL.LINEAR, APPROX_TARGET));
    expect(production.length, 'the substituted locus is found by the approximate pass').toBeGreaterThan(0);
    expect(production[0].X, 'one substitution').toBe(1);
    expect(production[0].M).toBe(19);
    expect(linear, 'the linear kernel must reach the same alignment').toEqual(production);
  });
});

// U6-F.2. This block used to be titled «with the seam OFF the default is unchanged» and asserted
// that the default and an explicit PRODUCTION selection agree — which, once the default became
// linear, proved nothing the two parity cases above had not already proved, under a title that was
// no longer true. What it should establish is the direction the seam now runs in: the shipped path
// is the LINEAR kernel, and the forced selection exists to reach production for differentials.
describe('U6-F.2 — the default IS the linear kernel, and production stays reachable', () => {
  it('an unforced search takes the linear path, not the production one', async () => {
    for (const target of [EXACT_TARGET, APPROX_TARGET]) {
      const def = bioShape(await run(null, target));
      const linear = bioShape(await run(SEQUENCE_KERNEL.LINEAR, target));
      expect(def).toEqual(linear);
    }
  });

  it('the default kernel is linear', async () => {
    resetSequenceKernel();
    const { getSequenceKernel } = await import('../sequence-kernel-seam');
    expect(getSequenceKernel()).toBe(SEQUENCE_KERNEL.LINEAR);
  });
});
