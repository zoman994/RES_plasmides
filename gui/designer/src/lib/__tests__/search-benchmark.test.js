/**
 * search-benchmark — P1.5 worker-decision harness (not a correctness test).
 *
 * Times the real search over a realistic corpus (100 × 10 kb ≈ 1 MB) to decide
 * whether the sequence dimension must move to a worker (>50 ms on the main thread)
 * or can stay main-thread + debounce. Logs numbers; asserts only that it ran.
 *
 * MEASURED DECISION (12.07, 1 MB corpus):
 *   metadata               ≈  2.5 ms   → stays main-thread (instant).
 *   short-seq 22nt (exhaustive) ≈ 385 ms → over the 50 ms gate ×7.7.
 *   long-seq 400nt (seed-extend) ≈ 408 ms → over the gate ×8.2.
 * ⇒ WORKER REQUIRED for the sequence dimension (metadata stays sync). The async
 *   facade (search-service) + the pure seqMatch provider are already worker-ready.
 */
import { describe, it, expect } from 'vitest';
import { runSearch } from '../library-search';
import { classifyQuery } from '../query-classify';
import { seqMatch } from '../seq-match';

const BASES = 'ACGT';
function randSeq(n) {
  let s = '';
  for (let i = 0; i < n; i += 1) s += BASES[(Math.random() * 4) | 0];
  return s;
}

function makeCorpus(count, len) {
  const docs = [];
  for (let i = 0; i < count; i += 1) {
    const seq = randSeq(len);
    docs.push({
      ref: { kind: 'entry', id: `e${i}` },
      title: `plasmid-${i}`,
      textFields: { name: `plasmid-${i}`, tags: ['bacterial', 'ampR'], status: 'release' },
      topology: i % 2 ? 'circular' : 'linear',
      sequence: { seq, topology: i % 2 ? 'circular' : 'linear' },
      features: [{ id: `f${i}`, name: 'AmpR', type: 'CDS', start: 10, end: 200 }],
    });
  }
  return docs;
}

function timeMs(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe('search benchmark — worker decision (P1.5)', () => {
  it('measures metadata + sequence search over ~1 MB', () => {
    const docs = makeCorpus(100, 10000);
    const bytes = docs.reduce((n, d) => n + d.sequence.seq.length, 0);

    // Pick a real 22-nt motif out of the first doc so it actually hits.
    const motif = docs[0].sequence.seq.slice(500, 522);

    const metadataMs = timeMs(() => runSearch(classifyQuery('plasmid ampR'), docs, { seqMatch }));
    const shortSeqMs = timeMs(() => runSearch(classifyQuery(`seq:${motif}`), docs, { seqMatch }));
    const longSeqMs = timeMs(() => runSearch(classifyQuery(docs[0].sequence.seq.slice(0, 400)), docs, { seqMatch }));

    // eslint-disable-next-line no-console
    console.log(`[BENCH] corpus=${(bytes / 1e6).toFixed(2)}MB  metadata=${metadataMs.toFixed(1)}ms  short-seq(22nt exhaustive)=${shortSeqMs.toFixed(1)}ms  long-seq(400nt seed-extend)=${longSeqMs.toFixed(1)}ms  GATE=50ms`);

    expect(bytes).toBeGreaterThan(900000);
    expect(Number.isFinite(metadataMs)).toBe(true);
  });
});
