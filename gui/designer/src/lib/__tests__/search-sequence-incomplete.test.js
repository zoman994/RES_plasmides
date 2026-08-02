/**
 * U4 item 2 — a malformed sequence result becomes INCOMPLETE at the real collection boundary
 * (`searchAllSequences`), never an honest zero.
 *
 * The proof here is deliberately at the FINALIZER, not a pre-thrown code: `seq-match` is mocked to
 * RETURN a malformed value — a non-array `{}`, or a falsy-but-not-`[]` `{ length: 0 }` — exactly as a
 * broken engine would. It is `finalizeSequenceOccurrences` inside the collection loop that must turn
 * that garbage into a typed `MALFORMED_SEQUENCE_RESULT`. The collection loop swallows exactly one
 * code — `REQUIRES_ALIGNMENT`, the length route — and re-throws everything else, so the malformed
 * throw propagates out of the sweep, the already-collected `byId` is discarded, and it can never read
 * as "this molecule has no site".
 *
 * The regression this pins: `{ length: 0 }` must NOT be mistaken for an honest miss. A pre-finalizer
 * `if (!occ.length) continue` would have treated it as zero and published doc a's hit as a confirmed
 * half-truth (§3.3).
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/search-sequence-incomplete.test.js
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MALFORMED_SEQUENCE_RESULT } from '../search-sequence-contract';
import { searchAllSequences } from '../search-worker-core';

// Proven project pattern: a hoisted STATE object the factory closes over, not a hoisted vi.fn.
// `seen` is the call JOURNAL: the mock must be PROVEN to run, not assumed to. The previous version
// stubbed `seqMatch` while `search-worker-core` drives `seqMatchSteps`, so the stub was never
// consulted and every case below exercised the real engine while claiming to inject garbage.
const stub = vi.hoisted(() => ({ mode: 'clean', seen: [] }));
// A valid RICH engine occurrence (query 'ACGTACGT', 8 nt, exact) — the clean contrast case must
// carry the counters + edit runs the finalizer proves, since the boundary now FINALIZES every hit.
const HIT = [{
  location: { segments: [{ start: 0, end: 8 }], strand: '+', wrapsOrigin: false },
  metrics: {
    length: 8, queryLength: 8, alignmentLength: 8, targetSpan: 8, identity: 1, coverage: 1,
    exactMatches: 8, substitutions: 0, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0,
    editRuns: [{ op: '=', length: 8, probeStart: 0, probeEnd: 8, targetOffsetStart: 0, targetOffsetEnd: 8 }],
  },
}];
// A PARTIAL mock: every real export is kept (`resolveCircular`, `REQUIRES_ALIGNMENT`, the length
// policy…) and only the engine entry point is replaced. Hand-writing the other exports meant the
// test could silently drift from the module it claims to stand in for.
//
// What is replaced is `seqMatchSteps` — the RESUMABLE generator `search-worker-core` actually drives
// (U4-CANCEL C2). `seqMatch` is the synchronous drain and the core never calls it.
vi.mock('../seq-match', async (importOriginal) => {
  const actual = await importOriginal();
  /** `sequence.seq` is the doc's sequence; doc `b` is the one made malformed. The engine RETURNS the
   * malformed value — it does not throw. The finalizer is what must reject it, so `{}` and
   * `{length: 0}` cross UNWRAPPED: wrapping them would make them malformed for the wrapper's reason
   * rather than their own. */
  const reply = (query, sequence) => {
    stub.seen.push(sequence.seq);
    if (sequence.seq === 'TTTTGGGGCCCC') {
      if (stub.mode === 'nonarray-b') return {};              // a broken engine's non-array return
      if (stub.mode === 'lengthzero-b') return { length: 0 }; // falsy-but-not-[] — NOT an honest miss
      return { occurrences: [], locationCount: 0, bestIndex: -1 }; // the ONE honest-miss shape
    }
    return sequence.seq === 'ACGTACGTACGT'
      ? { occurrences: HIT, locationCount: HIT.length, bestIndex: 0 }
      : { occurrences: [], locationCount: 0, bestIndex: -1 };
  };
  /* eslint-disable require-yield -- a stub has nothing to suspend on: it stands in for the engine
     and answers immediately. Giving it a `yield` would add a suspension the drive under test then
     has to absorb, which changes the thing being tested rather than the mock. */
  function* seqMatchSteps(query, sequence) { return reply(query, sequence); }
  // The corpus sweep drives the PHASE primitives, not the molecule route — exact across the whole
  // library first, then approximate. Stubbing only `seqMatchSteps` would leave the stub unconsulted
  // and quietly test the real engine, which is the exact trap this file's header already describes
  // happening once before with `seqMatch`.
  function* seqMatchExactSteps(query, sequence) { return reply(query, sequence); }
  function* seqMatchApproxSteps(query, sequence) { return reply(query, sequence); }
  /* eslint-enable require-yield */
  return {
    ...actual, seqMatchSteps, seqMatchExactSteps, seqMatchApproxSteps, seqMatch: (q, s) => reply(q, s),
  };
});

const DOCS = [
  { id: 'a', seq: 'ACGTACGTACGT' },
  { id: 'b', seq: 'TTTTGGGGCCCC' },
];

beforeEach(() => { stub.mode = 'clean'; stub.seen = []; });

describe('U4 — a malformed sequence RESULT -> incomplete via the finalizer, not an honest zero', () => {
  it('a non-array {} returned by the engine becomes MALFORMED_SEQUENCE_RESULT, not swallowed to {}', () => {
    stub.mode = 'nonarray-b';
    let caught = null;
    try { searchAllSequences('ACGTACGT', DOCS, {}); } catch (e) { caught = e; }
    expect(caught, 'a malformed return must not be swallowed into {}').not.toBeNull();
    expect(caught.code).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('a { length: 0 } is NOT an honest miss — it faults, discarding the already-collected byId', () => {
    // Doc a returns a real hit; doc b returns { length: 0 }. A pre-finalizer `!occ.length` skip would
    // have read this as «no site» and published doc a alone — a confirmed half-truth (§3.3).
    stub.mode = 'lengthzero-b';
    expect(() => searchAllSequences('ACGTACGT', DOCS, {}))
      .toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
  });

  it('for contrast: a clean result is returned, and a pure miss is an honest empty map', () => {
    const byId = searchAllSequences('ACGTACGT', DOCS, {});
    // The mock is PROVEN to have run, for both documents — otherwise a green result here would only
    // mean the real engine happened to agree, which is exactly how this file went decorative.
    expect(stub.seen, 'seqMatchSteps must be the entry point the core drives').toEqual(['ACGTACGTACGT', 'TTTTGGGGCCCC']);
    expect(byId.a).toBeDefined();
    expect(byId.a.occurrences[0].metrics.identityBps, 'the clean hit is finalized to canonical').toBe(10000);
    expect(byId.a.locationCount).toBe(1);
    expect(byId.a.bestIndex).toBe(0);
    expect(byId.b, 'a genuine miss writes no key').toBeUndefined();
  });
});
