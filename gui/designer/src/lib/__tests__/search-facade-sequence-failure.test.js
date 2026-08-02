/**
 * REV #2 — S3-CLOSE / K2.3: the SEQUENCE provider (`seq:`) — the worker-backed dimension.
 *
 * This is the only provider that leaves the main thread, so it owns the failure modes the other
 * two cannot have: a timeout on a hung worker, an unavailable worker, and a reply that arrives
 * but is malformed. Each must reach the session as a NAMED cause (TIMEOUT / WORKER_FAILURE) —
 * and a superseded search must NOT: it is a normal drop, stale-dropped without any warning.
 *
 * No vi.mock here: the real worker core answers through an injected controllable worker, so a
 * hit or a miss is decided by the document's actual sequence.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createSearchFacade } from '../search-facade';
import { handleSearchMessage } from '../search-worker-core';

// A worker the test drives: `replyReal` runs the genuine engine, `replyRaw` injects an exact payload.
function makeFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      // U4-CANCEL C2 — `cancel` is a control frame; a cooperative worker acks after unwinding.
      postMessage(msg) {
        w.posted.push(msg);
        if (msg && msg.type === 'cancel') {
          Promise.resolve().then(() => w.onmessage?.({ data: { id: msg.id, cancelled: true } }));
        }
      },
      get jobs() { return w.posted.filter((m) => !m || m.type !== 'cancel'); },
      lastId() { return w.jobs[w.jobs.length - 1]?.id; },
      replyReal() { const m = w.jobs[w.jobs.length - 1]; if (m) w.onmessage?.({ data: handleSearchMessage(m) }); },
      replyRaw(over) { w.onmessage?.({ data: { id: w.lastId(), ...over } }); },
      crash() { w.onerror?.({ message: 'boom' }); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
const last = (f) => f.workers[f.workers.length - 1];

const doc = (id, name, seq) => ({
  ref: { kind: 'entry', id },
  title: name,
  topology: 'linear',
  textFields: { name, tags: [], status: 'release' },
  sequence: { seq, topology: 'linear' },
  features: [],
});
const HIT = doc('puc', 'pUC19', 'AAAGAATTCCCC'); // contains GAATTC
const MISS = doc('puc', 'pUC19', 'AAAACCCCGGGG'); // name matches, motif absent
const ids = (session) => session.results.map((r) => r.entityRef.id);

afterEach(() => { vi.useRealTimers(); });

describe('facade — sequence provider: the honest outcomes', () => {
  it('HIT → confirmed and explicitly complete', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    let final = null;
    const p = facade.search('mol:pUC seq:GAATTC', [HIT], { bothStrands: false }, (s, m) => { if (m.phase === 'final') final = s; });
    last(factory).replyReal();
    await p;
    expect(ids(final)).toEqual(['puc']);
    expect(final.results[0].providerPending).toBe(false);
    expect(final.incomplete).toBe(false);
    expect(final.providerFailures).toEqual([]);
  });

  it('an honest MISS → no rows, NOT incomplete («the motif is genuinely absent»)', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    let final = null;
    const p = facade.search('mol:pUC seq:GAATTC', [MISS], { bothStrands: false }, (s, m) => { if (m.phase === 'final') final = s; });
    last(factory).replyReal();
    await p;
    expect(ids(final)).toEqual([]);
    expect(final.incomplete).toBe(false);
    expect(final.incompleteDims).toEqual([]);
    expect(final.providerFailures).toEqual([]);
  });
});

describe('facade — sequence provider: named failure causes', () => {
  it('a worker CRASH → WORKER_FAILURE, candidate stays pending', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    let final = null;
    const p = facade.search('mol:pUC seq:GAATTC', [MISS], {}, (s, m) => { if (m.phase === 'final') final = s; });
    last(factory).crash();
    await p;
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['sequence']);
    expect(final.providerFailures).toEqual([{ dimension: 'sequence', reason: 'WORKER_FAILURE' }]);
    expect(ids(final)).toEqual(['puc']);
    expect(final.results[0].providerPending).toBe(true);
  });

  it('a MALFORMED reply → WORKER_FAILURE, never a fabricated «nothing found»', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    let final = null;
    const p = facade.search('mol:pUC seq:GAATTC', [MISS], {}, (s, m) => { if (m.phase === 'final') final = s; });
    last(factory).replyRaw({ byId: null }); // used to become an empty Map = «no match»
    await p;
    expect(final.incomplete).toBe(true);
    expect(final.providerFailures).toEqual([{ dimension: 'sequence', reason: 'WORKER_FAILURE' }]);
  });

  it('a HUNG worker → TIMEOUT (a distinct cause the UI can name)', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    let final = null;
    const p = facade.search('mol:pUC seq:GAATTC', [MISS], {}, (s, m) => { if (m.phase === 'final') final = s; });
    await vi.advanceTimersByTimeAsync(15001); // never replies
    await p;
    expect(final.incomplete).toBe(true);
    expect(final.providerFailures).toEqual([{ dimension: 'sequence', reason: 'TIMEOUT' }]);
  });

  it('an UNAVAILABLE worker (factory yields null) → WORKER_FAILURE, not a silent inline scan', async () => {
    const facade = createSearchFacade({ workerFactory: () => null });
    let final = null;
    await facade.search('mol:pUC seq:GAATTC', [MISS], {}, (s, m) => { if (m.phase === 'final') final = s; });
    expect(final.incomplete).toBe(true);
    expect(final.providerFailures).toEqual([{ dimension: 'sequence', reason: 'WORKER_FAILURE' }]);
  });

  it('a RETRY after a failure runs on a fresh worker and yields a clean session', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    let final = null;
    const p1 = facade.search('mol:pUC seq:GAATTC', [HIT], {}, (s, m) => { if (m.phase === 'final') final = s; });
    last(factory).crash();
    await p1;
    expect(final.incomplete).toBe(true);

    const p2 = facade.search('mol:pUC seq:GAATTC', [HIT], { bothStrands: false }, (s, m) => { if (m.phase === 'final') final = s; });
    last(factory).replyReal();
    await p2;
    expect(final.incomplete).toBe(false);
    expect(final.incompleteDims).toEqual([]);
    expect(final.providerFailures).toEqual([]);
    expect(ids(final)).toEqual(['puc']);
  });
});

describe('facade — a SUPERSEDED search is a normal drop, not a provider failure', () => {
  it('CANCELLED by a newer query → stale, session null, NO final callback and NO warning', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    const metaA = [];
    const pA = facade.search('mol:pUC seq:GAATTC', [HIT], {}, (_s, m) => metaA.push(m.phase));
    const pB = facade.search('mol:pUC seq:GAATTC', [HIT], { bothStrands: false }); // supersedes A
    // A late reply for the CANCELLED pass — it must be ignored, never published.
    last(factory).replyReal();

    const outA = await pA;
    expect(outA.stale).toBe(true);
    expect(outA.session).toBeNull();
    expect(metaA).toEqual(['partial']); // the final never fires for a superseded search
    // U4-CANCEL C2: B is only posted once the cancelled pass has acknowledged, so it is answered
    // here rather than above — the same worker, one heavy job at a time.
    await Promise.resolve();
    last(factory).replyReal();
    await pB;
  });

  it('TERMINATED (unmount) resolves stale — the promise never hangs and never warns', async () => {
    const factory = makeFactory();
    const facade = createSearchFacade({ workerFactory: factory });
    const metaA = [];
    const p = facade.search('mol:pUC seq:GAATTC', [HIT], {}, (_s, m) => metaA.push(m.phase));
    facade.terminate();
    const out = await p;
    expect(out.stale).toBe(true);
    expect(out.session).toBeNull();
    expect(metaA).toEqual(['partial']);
  });
});
