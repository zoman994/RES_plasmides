/**
 * Gate U4 · Proof 1 — cross-path TRANSPORT parity.
 *
 * A DNA query is answerable through four transports that all wrap the SAME pure engine
 * (`searchAllSequences` → `finalizeSequenceOccurrences` → canonical locus envelope):
 *   • WORKER   — `createSearchWorkerClient(factory)` directly (the raw client + worker protocol);
 *   • INLINE   — `createSearchWorkerClient(null)` → `runInline` (no worker);
 *   • GLOBAL   — `coordinator.channel('global')`  → client → worker;
 *   • POPOVER  — `coordinator.channel('popover')` → client → worker.
 * The pure engine, driven directly, is the BASELINE all four are compared against — not a fifth
 * path: it is the answer the wrappers must not change.
 *
 * The compute is identical; only the transport/validation wrapper differs. This pins that the
 * wrapper NEVER changes the answer:
 *   • SUCCESS: the `Map<entityKey, LocusEnvelope>` is BIT-EXACT across all four. Since P1-2/P1-3 the
 *     value is an ENVELOPE, so parity means the whole of it — the retained window, the true
 *     `locationCount` measured before the payload cap, and the `bestIndex` naming the §3.2 winner.
 *     Comparing only `occurrences` is what let those two facts drift out of the shipped surfaces:
 *     they cannot be recomputed downstream, so a wrapper that dropped either would be undetectable
 *     anywhere else;
 *   • VERDICT: `RESOURCE_LIMIT`, `REQUIRES_ALIGNMENT`, `INVALID_DNA` surface with the SAME `code`
 *     on all three. (The worker path rejects a `SearchAbortError` carrying `.reason===.code`; the
 *     inline path rejects the raw engine `Error` carrying `.code` only — so parity is asserted on
 *     `err.code`, never `err.reason`.)
 *
 * Each path runs on its OWN coordinator/client, so there is no single-stream supersede between the
 * global and popover channels — they are compared as independent wrappers of the one engine.
 *
 * Pure lib-level (no React / happy-dom). Fixtures were verified bit-exact against the real engine.
 */
import { describe, it, expect } from 'vitest';
import { createSearchWorkerClient } from '../search-worker-client';
import { createSequenceSearchCoordinator } from '../sequence-search-coordinator';
import { handleSearchMessage, searchAllSequences } from '../search-worker-core';

// A fake worker that answers for real, through the same core the production worker runs.
function controllableWorker() {
  const w = {
    onmessage: null, onerror: null, onmessageerror: null, posted: [], queue: [], terminated: false,
    postMessage(msg) { w.posted.push(msg); w.queue.push(handleSearchMessage(msg)); },
    flushLast() { w.onmessage?.({ data: w.queue[w.queue.length - 1] }); },
    terminate() { w.terminated = true; },
  };
  return w;
}
function recordingFactory() {
  const workers = [];
  const factory = () => { const w = controllableWorker(); workers.push(w); return w; };
  factory.workers = workers;
  return factory;
}

const docsOf = (seq, topology = 'linear') => [{ ref: { kind: 'entry', id: 'a' }, sequence: { seq, topology } }];

/** Run (query, docs, ctx) through the inline seam → {map} on success, {code} on a verdict. */
async function inlinePath(query, docs, ctx) {
  const client = createSearchWorkerClient(null);
  try { return { map: Object.fromEntries(await client.searchSequences(query, docs, ctx)) }; }
  catch (e) { return { code: e.code }; }
}
/** Run through the raw worker client (no coordinator) → {map} | {code}. */
async function workerPath(query, docs, ctx) {
  const factory = recordingFactory();
  const client = createSearchWorkerClient(factory);
  try {
    const p = client.searchSequences(query, docs, ctx);
    factory.workers[factory.workers.length - 1].flushLast(); // the pass ran synchronously on postMessage
    return { map: Object.fromEntries(await p) };
  } catch (e) {
    return { code: e.code };
  } finally {
    client.terminate();
  }
}
/** Run through a coordinator channel (real client + fake worker) → {map} | {code}. */
async function channelPath(owner, query, docs, ctx) {
  const factory = recordingFactory();
  const coord = createSequenceSearchCoordinator({ workerFactory: factory });
  try {
    const p = coord.channel(owner).search(query, docs, ctx);
    factory.workers[factory.workers.length - 1].flushLast(); // the pass ran synchronously on postMessage
    return { map: Object.fromEntries(await p) };
  } catch (e) {
    return { code: e.code };
  } finally {
    coord.dispose();
  }
}

const CTX = { bothStrands: true, identityThreshold: 0.8 };

const SUCCESS = [
  { name: 'exact', query: 'GAATTCACGTAC', seq: 'AAAAGAATTCACGTACAAAA', topology: 'linear' },
  { name: 'approximate (1 mismatch)', query: 'GAATTCACGTAC', seq: 'AAAAGAATTCACGTGCAAAA', topology: 'linear' },
  { name: 'minus strand', query: 'GAATTCACGTAC', seq: 'AAAAGTACGTGAATTCAAAA', topology: 'linear' },
  { name: 'palindrome / both strands', query: 'GGAATTCC', seq: 'AAAAGGAATTCCAAAA', topology: 'linear' },
  { name: 'circular wrap', query: 'ATTGCGGATC', seq: 'GGATCCACGTTTGCAATTGC', topology: 'circular' },
];

const VERDICT = [
  { name: 'REQUIRES_ALIGNMENT', query: 'ACGT'.repeat(103), seq: 'AAAAGGAATTCCAAAA', topology: 'linear', ctx: CTX, code: 'REQUIRES_ALIGNMENT' },
  { name: 'INVALID_DNA', query: 'ACGTNACGTACGT', seq: 'AAAAGGAATTCCAAAA', topology: 'linear', ctx: CTX, code: 'INVALID_DNA' },
  { name: 'RESOURCE_LIMIT', query: 'ACGTACGTACGTACGTGG', seq: `AAAA${'ACGTACGTACGTACGTACGT'.repeat(4)}TTTT`, topology: 'linear', ctx: { bothStrands: true, identityThreshold: 0.6, stateBudget: 1 }, code: 'RESOURCE_LIMIT' },
];

describe('Gate U4 · cross-path transport parity — the locus envelope', () => {
  it.each(SUCCESS)('$name: the envelope is bit-exact across worker / inline / global / popover', async (c) => {
    const docs = docsOf(c.seq, c.topology);
    // BASELINE — the pure engine, unwrapped. Every transport must return exactly this.
    const baseline = searchAllSequences(c.query, [{ id: 'entry:a', seq: c.seq, topology: c.topology }], CTX)['entry:a'];
    // sanity: the fixture actually hits, so the comparison is not vacuous. Read through
    // `.occurrences` — the map value is an envelope, and `.length` on it is `undefined`, which
    // silently turns every assertion below into a comparison of two nothings.
    expect(baseline).toBeDefined();
    expect(baseline.occurrences.length).toBeGreaterThan(0);

    const paths = {
      worker: await workerPath(c.query, docs, CTX),
      inline: await inlinePath(c.query, docs, CTX),
      global: await channelPath('global', c.query, docs, CTX),
      popover: await channelPath('popover', c.query, docs, CTX),
    };
    for (const [name, got] of Object.entries(paths)) {
      expect(Object.keys(got.map), name).toEqual(['entry:a']);
      const env = got.map['entry:a'];
      expect(env, name).toEqual(baseline); //                            the WHOLE envelope
      // …and the two facts no downstream stage can recompute, named explicitly so a future change
      // that drops them cannot hide inside a passing deep-equal on the occurrences alone.
      expect(env.locationCount, `${name}.locationCount`).toBe(baseline.locationCount);
      expect(env.bestIndex, `${name}.bestIndex`).toBe(baseline.bestIndex);
      expect(env.occurrences[env.bestIndex], `${name}.winner`).toEqual(baseline.occurrences[baseline.bestIndex]);
    }
  });
});

describe('Gate U4 · cross-path transport parity — verdicts', () => {
  it.each(VERDICT)('$name: the same typed code on worker / inline / global / popover', async (c) => {
    const docs = docsOf(c.seq, c.topology);
    // Parity is on the canonical `.code` ONLY. The worker path rejects a `SearchAbortError` that
    // also carries `.reason`; the inline path rejects the engine's own Error, which does not. That
    // difference is a known shape gap, and pinning its ABSENCE here would make a future
    // normalisation of the inline path break this test — the verdict is the contract, not the box.
    expect((await workerPath(c.query, docs, c.ctx)).code).toBe(c.code);
    expect((await inlinePath(c.query, docs, c.ctx)).code).toBe(c.code);
    expect((await channelPath('global', c.query, docs, c.ctx)).code).toBe(c.code);
    expect((await channelPath('popover', c.query, docs, c.ctx)).code).toBe(c.code);
  });
});
