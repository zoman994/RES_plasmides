/**
 * finalizeSequenceOccurrences — the production-engine → canonical SearchHitSummary boundary (U4).
 *
 * The gapped engine emits its full record: M/X/I/D counters, aliases, the edit `editRuns`, and an
 * `identity` float — but NO transport `identityBps`. This boundary DERIVES the canonical summary the
 * whole app validates against (`search-sequence-contract`), rather than changing the engine: it
 * checks every primary counter, replays the edit runs ONCE against the coordinates, computes the
 * one missing integer percent, and drops the alignment detail that has no place in a search result.
 *
 * A malformed hit is a FAULT, never an honest zero — `MALFORMED_SEQUENCE_RESULT`, which the worker
 * turns into WORKER_FAILURE and the inline path into incomplete. One corrupt hit poisons the pass.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The mock has to intercept `seqMatchSteps`, NOT `seqMatch`. `search-worker-core` drives the
// RESUMABLE generator (U4-CANCEL C2) and never calls the synchronous entry point, so stubbing
// `seqMatch` alone left the REAL engine running and the stub unconsulted: every test below claimed
// to inject a malformed result while actually exercising the genuine path, and passed for the wrong
// reason. The generator delegates to the same `vi.fn()`, so the `mockReturnValue` API is unchanged.
vi.mock('../seq-match', async (importOriginal) => {
  const actual = await importOriginal();
  const seqMatch = vi.fn();
  /* eslint-disable require-yield -- a stub has nothing to suspend on: it stands in for the engine
     and answers immediately. Giving it a `yield` would add a suspension the drive under test then
     has to absorb, which changes the thing being tested rather than the mock. */
  function* seqMatchSteps(...args) { return seqMatch(...args); }
  // The corpus sweep drives the PHASE primitives (exact across the whole library, then approximate),
  // so a stub attached only to the molecule route would never be consulted and this file would
  // quietly exercise the real engine while claiming to inject a corrupt result.
  function* seqMatchExactSteps(...args) { return seqMatch(...args); }
  function* seqMatchApproxSteps(...args) { return seqMatch(...args); }
  /* eslint-enable require-yield */
  return {
    ...actual, seqMatch, seqMatchSteps, seqMatchExactSteps, seqMatchApproxSteps,
  };
});

import { seqMatch, resolveCircular } from '../seq-match';
import {
  finalizeSequenceOccurrences, MALFORMED_SEQUENCE_RESULT,
} from '../search-sequence-contract';
import { searchAllSequences, handleSearchMessage } from '../search-worker-core';
import { createSearchWorkerClient, SEARCH_ABORT } from '../search-worker-client';

const QUERY = 'GAATTG'; // 6 nt, exact

/** A LOCUS ENVELOPE around a window (P1-2/P1-3). The engine answers with one, and the finalizer
 * refuses a bare array by design — that shape carries neither the true locus count nor the rule-7
 * winner, and accepting it is exactly the fail-open hole this boundary exists to close. */
const env = (occurrences) => ({ occurrences, locationCount: occurrences.length, bestIndex: occurrences.length ? 0 : -1 });

/** These cases are about the OCCURRENCES, so they hand the finalizer the envelope the engine would
 * have built around them. A NON-array is passed through untouched: the "broken engine returned {}"
 * cases must stay malformed for their own reason, not for the wrapper's. */
const finalize = (reply, facts) => finalizeSequenceOccurrences(Array.isArray(reply) ? env(reply) : reply, facts);

/** A RICH occurrence exactly as `seqMatch` emits it — counters, aliases, editRuns, identity float. */
const richHit = (start, over = {}) => ({
  location: { segments: [{ start, end: start + 6 }], strand: '+', wrapsOrigin: false, ...(over.location || {}) },
  metrics: {
    length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: 1, coverage: 1,
    exactMatches: 6, substitutions: 0, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, mismatchPositions: [],
    editRuns: [{ op: '=', length: 6, probeStart: 0, probeEnd: 6, targetOffsetStart: 0, targetOffsetEnd: 6 }],
    ...(over.metrics || {}),
  },
});
const FACTS = { sequenceLength: 12, circular: false, queryLength: 6 };
const deepHas = (v, key) => {
  if (Array.isArray(v)) return v.some((x) => deepHas(x, key));
  if (v && typeof v === 'object') return key in v || Object.values(v).some((x) => deepHas(x, key));
  return false;
};

describe('finalizeSequenceOccurrences — rich → canonical', () => {
  it('produces the canonical SearchHitSummary: identityBps present, editRuns/script gone', () => {
    const [hit] = finalize([richHit(3)], FACTS).occurrences;
    expect(hit.metrics.identityBps).toBe(10000);        // floor(10000 * 6/6)
    expect(deepHas(hit, 'editRuns')).toBe(false);
    expect(deepHas(hit, 'script')).toBe(false);
    expect(deepHas(hit, 'mismatchPositions')).toBe(false);
    expect(hit.location).toEqual({ segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false });
  });

  it('a mismatch-and-gap hit derives identityBps by floor, not rounding', () => {
    // 8-nt query, M=6 X=1 I=1 D=0 → L=8, identity=0.75, identityBps=7500. targetSpan=M+X+D=7.
    const hit = richHit(0, {
      location: { segments: [{ start: 0, end: 7 }], strand: '+', wrapsOrigin: false },
      metrics: {
        length: 8, queryLength: 8, alignmentLength: 8, targetSpan: 7, identity: 0.75,
        exactMatches: 6, substitutions: 1, insertions: 1, deletions: 0,
        indelBases: 1, indelEvents: 1, editDistance: 2, mismatches: 1, indels: 1, mismatchPositions: [3],
        editRuns: [
          { op: '=', length: 3, probeStart: 0, probeEnd: 3, targetOffsetStart: 0, targetOffsetEnd: 3 },
          { op: 'X', length: 1, probeStart: 3, probeEnd: 4, targetOffsetStart: 3, targetOffsetEnd: 4 },
          { op: 'I', length: 1, probeStart: 4, probeEnd: 5, targetOffsetStart: 4, targetOffsetEnd: 4 },
          { op: '=', length: 3, probeStart: 5, probeEnd: 8, targetOffsetStart: 4, targetOffsetEnd: 7 },
        ],
      },
    });
    const [out] = finalize([hit], { sequenceLength: 20, circular: false, queryLength: 8 }).occurrences;
    expect(out.metrics.identityBps).toBe(7500);
    expect(out.metrics.indelEvents).toBe(1); // one 1-base insertion run, NOT derived from I+D
  });
});

/** A fully self-consistent 7-mer exact hit: everything closes for a query of length 7. */
const sevenMer = (over = {}) => ({
  location: { segments: [{ start: 0, end: 7 }], strand: '+', wrapsOrigin: false, ...(over.location || {}) },
  metrics: {
    length: 7, queryLength: 7, alignmentLength: 7, targetSpan: 7, identity: 1, coverage: 1,
    exactMatches: 7, substitutions: 0, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0,
    editRuns: [{ op: '=', length: 7, probeStart: 0, probeEnd: 7, targetOffsetStart: 0, targetOffsetEnd: 7 }],
    ...(over.metrics || {}),
  },
});

describe('finalizeSequenceOccurrences — non-array and empty', () => {
  it('a non-array (broken engine returning {} or "") is malformed, not a miss', () => {
    expect(() => finalize({}, FACTS)).toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
    expect(() => finalize('', FACTS)).toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
    expect(() => finalize({ length: 0 }, FACTS)).toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
  });

  it('an empty ARRAY is an honest miss — but only after the facts are validated', () => {
    expect(finalize([], FACTS).occurrences).toEqual([]);
    // A bad fact cannot certify «no site here» — a missed origin-crossing hit is exactly what a
    // wrong circular flag would hide. So an empty result with garbage facts is malformed.
    expect(() => finalize([], { sequenceLength: 12, circular: false, queryLength: -1 }))
      .toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
    expect(() => finalize([], { sequenceLength: 0, circular: false, queryLength: 6 }))
      .toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
    expect(() => finalize([], { sequenceLength: 12, circular: 'nope', queryLength: 6 }))
      .toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
  });
});

describe('finalizeSequenceOccurrences — a hit that is not TRUE is a fault', () => {
  const malformed = (mk) => expect(() => finalize([mk], FACTS)).toThrow(
    expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }),
  );

  it('a query length that is not the real query — a SELF-CONSISTENT 7-mer for a 6-mer request', () => {
    // Everything closes for queryLength 7; ONLY the request-anchor (facts.queryLength = 6) rejects it.
    // Proves the check binds to the actual query, not just internal consistency.
    expect(() => finalize([sevenMer()], FACTS)).toThrow(
      expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }),
    );
    // …and the SAME occurrence is accepted when the request really is a 7-mer.
    expect(finalize([sevenMer()], { sequenceLength: 12, circular: false, queryLength: 7 }).occurrences).toHaveLength(1);
  });

  it('an unsafe (out-of-range) integer counter', () => {
    malformed(richHit(3, { metrics: { exactMatches: Number.MAX_SAFE_INTEGER + 2 } }));
  });

  it('an editRun whose coordinates do not consume correctly', () => {
    // An insertion must advance the probe but NOT the target; this one advances the target too.
    malformed(richHit(3, {
      metrics: {
        exactMatches: 5, insertions: 1, alignmentLength: 6, targetSpan: 5, queryLength: 6, identity: 5 / 6,
        indelBases: 1, indelEvents: 1, editDistance: 1, indels: 1,
        editRuns: [
          { op: '=', length: 5, probeStart: 0, probeEnd: 5, targetOffsetStart: 0, targetOffsetEnd: 5 },
          { op: 'I', length: 1, probeStart: 5, probeEnd: 6, targetOffsetStart: 5, targetOffsetEnd: 6 },
        ],
      },
    }));
  });

  it('an indelEvents that disagrees with the number of I/D runs', () => {
    malformed(richHit(3, { metrics: { indelEvents: 2 } })); // no indel runs at all
  });

  it('a present identityBps that contradicts M/L', () => {
    malformed(richHit(3, { metrics: { identityBps: 9000 } })); // must be 10000
  });

  // Two TOUCHING gap runs of the SAME op are one continuous gap split in two — canonical run-length
  // encoding never places same-op runs side by side. Everything else closes (indelEvents matches the
  // run count), so the split is the ONLY defect. Proven for BOTH gap directions.
  it.each([
    ['I/I (a 2-base insertion split in two)', richHit(0, {
      location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false },
      metrics: {
        length: 8, queryLength: 8, alignmentLength: 8, targetSpan: 6, identity: 6 / 8,
        exactMatches: 6, substitutions: 0, insertions: 2, deletions: 0,
        indelBases: 2, indelEvents: 2, editDistance: 2, mismatches: 0, indels: 2,
        editRuns: [
          { op: '=', length: 3, probeStart: 0, probeEnd: 3, targetOffsetStart: 0, targetOffsetEnd: 3 },
          { op: 'I', length: 1, probeStart: 3, probeEnd: 4, targetOffsetStart: 3, targetOffsetEnd: 3 },
          { op: 'I', length: 1, probeStart: 4, probeEnd: 5, targetOffsetStart: 3, targetOffsetEnd: 3 },
          { op: '=', length: 3, probeStart: 5, probeEnd: 8, targetOffsetStart: 3, targetOffsetEnd: 6 },
        ],
      },
    }), { sequenceLength: 20, circular: false, queryLength: 8 }],
    ['D/D (a 2-base deletion split in two)', richHit(0, {
      location: { segments: [{ start: 0, end: 8 }], strand: '+', wrapsOrigin: false },
      metrics: {
        length: 6, queryLength: 6, alignmentLength: 8, targetSpan: 8, identity: 6 / 8,
        exactMatches: 6, substitutions: 0, insertions: 0, deletions: 2,
        indelBases: 2, indelEvents: 2, editDistance: 2, mismatches: 0, indels: 2,
        editRuns: [
          { op: '=', length: 3, probeStart: 0, probeEnd: 3, targetOffsetStart: 0, targetOffsetEnd: 3 },
          { op: 'D', length: 1, probeStart: 3, probeEnd: 3, targetOffsetStart: 3, targetOffsetEnd: 4 },
          { op: 'D', length: 1, probeStart: 3, probeEnd: 3, targetOffsetStart: 4, targetOffsetEnd: 5 },
          { op: '=', length: 3, probeStart: 3, probeEnd: 6, targetOffsetStart: 5, targetOffsetEnd: 8 },
        ],
      },
    }), { sequenceLength: 20, circular: false, queryLength: 6 }],
  ])('two ADJACENT gap runs — %s — is one gap posing as two events', (_label, raw, facts) => {
    expect(() => finalize([raw], facts))
      .toThrow(expect.objectContaining({ code: MALFORMED_SEQUENCE_RESULT }));
  });

  it('two gap runs SEPARATED by a match ARE two legitimate events (control for the rule above)', () => {
    const raw = richHit(0, {
      location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false },
      metrics: {
        length: 8, queryLength: 8, alignmentLength: 8, targetSpan: 6, identity: 6 / 8,
        exactMatches: 6, substitutions: 0, insertions: 2, deletions: 0,
        indelBases: 2, indelEvents: 2, editDistance: 2, mismatches: 0, indels: 2,
        editRuns: [
          { op: '=', length: 3, probeStart: 0, probeEnd: 3, targetOffsetStart: 0, targetOffsetEnd: 3 },
          { op: 'I', length: 1, probeStart: 3, probeEnd: 4, targetOffsetStart: 3, targetOffsetEnd: 3 },
          { op: '=', length: 1, probeStart: 4, probeEnd: 5, targetOffsetStart: 3, targetOffsetEnd: 4 },
          { op: 'I', length: 1, probeStart: 5, probeEnd: 6, targetOffsetStart: 4, targetOffsetEnd: 4 },
          { op: '=', length: 2, probeStart: 6, probeEnd: 8, targetOffsetStart: 4, targetOffsetEnd: 6 },
        ],
      },
    });
    const [out] = finalize([raw], { sequenceLength: 20, circular: false, queryLength: 8 }).occurrences;
    expect(out.metrics.indelEvents).toBe(2);
    expect(deepHas(out, 'editRuns')).toBe(false);
  });
});

describe('searchAllSequences wires the finalizer — one corrupt doc poisons the pass', () => {
  beforeEach(() => { seqMatch.mockReset(); });

  it('a clean corpus is finalized to canonical summaries', () => {
    seqMatch.mockReturnValue(env([richHit(3)]));
    const byId = searchAllSequences(QUERY, [{ id: 'a', seq: 'AAAGAATTGCCC', topology: 'linear' }], {});
    // The per-document value is a LOCUS ENVELOPE, not a bare array (P1-2/P1-3).
    expect(byId.a.occurrences[0].metrics.identityBps).toBe(10000);
    expect(byId.a.locationCount).toBe(1);
    expect(byId.a.bestIndex).toBe(0);
    expect(deepHas(byId.a.occurrences, 'editRuns')).toBe(false);
  });

  it('the already-collected byId is discarded when a later doc is corrupt', () => {
    seqMatch.mockImplementation((_q, { seq }) => (
      seq === 'GOOD' ? env([richHit(0)]) : env([richHit(0, { metrics: { queryLength: 999 } })])
    ));
    expect(() => searchAllSequences(QUERY, [
      { id: 'a', seq: 'GOOD', topology: 'linear' }, { id: 'b', seq: 'BADX', topology: 'linear' },
    ], {})).toThrow();
  });

  it('worker and inline are the same boundary: a corrupt result faults through the worker too', () => {
    seqMatch.mockReturnValue(env([richHit(3, { metrics: { queryLength: 400 } })]));
    // handleSearchMessage re-throws anything that is not one of the three expected verdicts.
    expect(() => handleSearchMessage({ id: 1, seqQuery: QUERY, docs: [{ id: 'a', seq: 'AAAGAATTGCCC' }], ctx: {} })).toThrow();
  });
});

describe('resolveCircular is the one topology rule', () => {
  it('honours on / off / auto', () => {
    expect(resolveCircular('on', 'linear')).toBe(true);
    expect(resolveCircular('off', 'circular')).toBe(false);
    expect(resolveCircular('auto', 'circular')).toBe(true);
    expect(resolveCircular('auto', 'linear')).toBe(false);
  });

  it('the SAME wrap hit is accepted when circular, refused when linear', () => {
    // Query 6, wrap on a length-12 circular molecule: [10,12) + [0,4)... targetSpan must equal 6.
    const wrap = () => [richHit(0, {
      location: { segments: [{ start: 10, end: 12 }, { start: 0, end: 4 }], strand: '+', wrapsOrigin: true },
    })];
    seqMatch.mockImplementation((...a) => env(wrap(...a)));
    expect(() => searchAllSequences(QUERY, [{ id: 'a', seq: 'ACGTACGTACGT', topology: 'circular' }], { circular: 'auto' })).not.toThrow();
    expect(() => searchAllSequences(QUERY, [{ id: 'a', seq: 'ACGTACGTACGT', topology: 'circular' }], { circular: 'off' })).toThrow();
  });
});

describe('the client re-checks the cloned canonical reply', () => {
  const canonical = (over = {}) => ({
    location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false, ...(over.location || {}) },
    metrics: {
      length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: 1, coverage: 1,
      exactMatches: 6, substitutions: 0, insertions: 0, deletions: 0,
      indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, identityBps: 10000,
      ...(over.metrics || {}),
    },
  });
  const factoryReplying = (byId) => {
    const workers = [];
    const factory = () => {
      const w = {
        onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: false,
        postMessage(m) { w.posted.push(m); w.onmessage?.({ data: { id: m.id, byId } }); },
        terminate() { w.terminated = true; },
      };
      workers.push(w);
      return w;
    };
    factory.workers = workers;
    return factory;
  };
  // A fully self-consistent 7-mer hit (everything closes for a query of length 7) on the length-12
  // doc. Nothing internal is wrong with it — only whether it answers OUR request.
  const sevenMer = (over = {}) => ({
    location: { segments: [{ start: 3, end: 10 }], strand: '+', wrapsOrigin: false, ...(over.location || {}) },
    metrics: {
      length: 7, queryLength: 7, alignmentLength: 7, targetSpan: 7, identity: 1, coverage: 1,
      exactMatches: 7, substitutions: 0, insertions: 0, deletions: 0,
      indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, identityBps: 10000,
      ...(over.metrics || {}),
    },
  });
  const DOCS = [{ ref: { kind: 'entry', id: 'a' }, sequence: { seq: 'AAAGAATTGCCC', topology: 'linear' } }];

  it('a reply whose queryLength is not ours — a self-consistent 7-mer for our 6-mer request → WORKER_FAILURE', async () => {
    // The 7-mer closes perfectly on its own; ONLY the request-anchor (we asked for a 6-mer, QUERY) can
    // reject it. Deleting `o.metrics.queryLength === queryLength` from the client would let it through.
    const factory = factoryReplying({ 'entry:a': env([sevenMer()]) });
    const client = createSearchWorkerClient(factory);
    await expect(client.searchSequences(QUERY, DOCS, {})).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);
  });

  it('…and the SAME 7-mer reply RESOLVES when the request really is a 7-mer (control for the anchor)', async () => {
    // Proves the previous rejection is the anchor, not something intrinsically wrong with the 7-mer.
    const factory = factoryReplying({ 'entry:a': env([sevenMer()]) });
    const client = createSearchWorkerClient(factory);
    const map = await client.searchSequences('GAATTGA', DOCS, {}); // a real 7-mer query
    expect(map.get('entry:a').occurrences).toHaveLength(1);
  });

  it('a forged reply claiming a wrap on a linear doc → WORKER_FAILURE', async () => {
    const forged = canonical({ location: { segments: [{ start: 10, end: 12 }, { start: 0, end: 4 }], strand: '+', wrapsOrigin: true } });
    const client = createSearchWorkerClient(factoryReplying({ 'entry:a': env([forged]) }));
    await expect(client.searchSequences(QUERY, DOCS, {})).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
  });

  // The compact protocol carries ONLY the canonical shape. A stale or tampered worker that appends
  // internal alignment fields — even onto otherwise-valid numbers — must be rejected by the allowlist,
  // so edit-scripts and mismatch overlays never leak across the boundary.
  it.each([
    ['a top-level script field', () => { const o = canonical(); o.script = 'MMMMMM'; return o; }],
    ['metrics.editRuns', () => canonical({ metrics: { editRuns: [] } })],
    ['metrics.mismatchPositions', () => canonical({ metrics: { mismatchPositions: [] } })],
  ])('a reply smuggling %s → WORKER_FAILURE', async (_label, make) => {
    const factory = factoryReplying({ 'entry:a': env([make()]) });
    const client = createSearchWorkerClient(factory);
    await expect(client.searchSequences(QUERY, DOCS, {})).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);
  });
});
