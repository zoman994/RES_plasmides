/**
 * U4 item 3 — malformed kernel result -> INCOMPLETE on the real path, never an honest zero.
 *
 * findOccurrences is mocked to return a corrupted raw occurrence (a script that disagrees with its
 * counters). The full path then runs for real: the corpus exact phase completes with no hit (it is a
 * literal scan and does not use a kernel), then the APPROXIMATE phase -> runLinearSequenceSearch
 * -> assertRawKernelOccurrences THROWS typed -> searchAllSequences re-throws (it swallows only the
 * length route) -> the inline client REJECTS. A rejection is what the facade turns into `incomplete`;
 * it is not an empty resolve, so no confirmed row can appear. This is the proof the earlier
 * propagation test could not give: the validator actually ran and caught real corruption.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-seam-malformed.test.js
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSearchWorkerClient } from '../search-worker-client';
import { setSequenceKernelForBenchmark, resetSequenceKernel, SEQUENCE_KERNEL } from '../sequence-kernel-seam';
import { MALFORMED_SEQUENCE_RESULT } from '../search-sequence-contract';

// A hoisted state object the mock closes over (the proven project pattern).
const stub = vi.hoisted(() => ({ mode: 'clean' }));
vi.mock('../dna-linear-kernel', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    // The provider drives the RESUMABLE entry point now, so that is what has to be stubbed. Leaving
    // the stub on `findOccurrences` alone would leave it unconsulted and quietly test the real
    // kernel — the same trap this suite's own history records twice already.
    * findOccurrencesSteps(query, target, opts) {
      if (stub.mode === 'bad-script') {
        return [{
          strand: '-', start: 0, targetSpan: 20, end: 20,
          M: 20, X: 0, I: 0, D: 0, gapEvents: 0, alignmentLength: 20, identityBps: 10000,
          script: '===================X',
        }];
      }
      if (stub.mode === 'not-array') return { nope: true };
      return yield* actual.findOccurrencesSteps(query, target, opts);
    },
    findOccurrences: (query, target, opts) => {
      if (stub.mode === 'bad-script') {
        // A minus occurrence whose script lies about its counters: L=20, M=20, but the script
        // carries an X. The raw guard must catch this BEFORE the adapter strips the script.
        return [{
          strand: '-', start: 0, targetSpan: 20, end: 20,
          M: 20, X: 0, I: 0, D: 0, gapEvents: 0, alignmentLength: 20, identityBps: 10000,
          script: '===================X',
        }];
      }
      if (stub.mode === 'not-array') return { nope: true };
      return actual.findOccurrences(query, target, opts);
    },
  };
});

afterEach(() => { stub.mode = 'clean'; resetSequenceKernel(); });

const QUERY = 'ACGTTGCAATCGGATCCTTA';
// One substitution, so there is NO exact occurrence. That matters now: the corpus runs its exact
// phase over the whole library first, and the exact phase is a literal scan that never consults a
// kernel at all — so a target containing the query verbatim would be answered before the linear
// kernel was ever reached, and this file would silently stop testing anything.
const NEAR = `${QUERY.slice(0, 5)}A${QUERY.slice(6)}`;   // position 5 is G → A, a real difference
const TARGET = `GGGGGGGGGG${NEAR}TTTTTTTTTT`;
const DOCS = [{ ref: { kind: 'entry', id: 'p1' }, sequence: { seq: TARGET, topology: 'linear' } }];

async function search() {
  setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
  const client = createSearchWorkerClient(null);
  // Approximate, not exact: the kernel seam only governs the approximate phase now.
  return client.searchSequences(QUERY, DOCS, { identityThreshold: 0.8, bothStrands: false });
}

describe('U4 — malformed linear result -> incomplete on the real inline path', () => {
  it('a script that disagrees with its counters REJECTS, typed', async () => {
    stub.mode = 'bad-script';
    const err = await search().then(() => null, (e) => e);
    expect(err, 'a malformed reply must reject, not resolve to an empty map').not.toBeNull();
    expect(err.code, 'the typed incomplete signal survives to the boundary').toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('a non-array raw result REJECTS, not resolves empty', async () => {
    stub.mode = 'not-array';
    const settled = await search().then((map) => ({ ok: map }), (e) => ({ err: e }));
    expect(settled.ok, 'must not resolve to a (false) honest-zero result map').toBeUndefined();
    expect(settled.err.code).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('with the same mock, a CLEAN result still resolves normally', async () => {
    stub.mode = 'clean';
    const map = await search();
    expect(map.get('entry:p1'), 'the clean path is unaffected by the mock').toBeDefined();
  });
});
