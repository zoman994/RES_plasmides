/**
 * The worker message boundary is a TRUST boundary (review, 21.07.2026).
 *
 * Serialising a typed outcome made the §4.2.0 route reachable off-thread, but the first cut
 * serialised ANY throw as `UNKNOWN` and the client believed any `error` field it was handed. Two
 * consequences: a genuine fault stopped looking like a fault (the worker was kept and reused), and
 * a corrupted reply could FORGE a route — telling the biologist «this needs alignment» about a
 * search that actually broke.
 *
 * So the boundary is now an allow-list in both directions:
 *   • three EXPECTED codes are answers → the worker is healthy and stays;
 *   • anything else is a fault → it must reach `onerror`, kill the worker, and respawn;
 *   • a malformed envelope is treated as a fault, never taken at its word.
 * Raw `message` text never crosses; only codes and validated numbers do.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSearchMessage } from '../search-worker-core';
import { createSearchWorkerClient, SEARCH_ABORT } from '../search-worker-client';
import { normalizeFailureReason, PROVIDER_FAILURE } from '../search-provider-failures';

const DOC = { id: 'a', seq: 'AAAGAATTGCCC' };
const LONG = 'ACGT'.repeat(103); // 412 nt — over the approximate limit, so the route fires

function makeFactory(reply) {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      postMessage(msg) { w.posted.push(msg); setTimeout(() => reply(w, msg), 0); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
const tick = () => new Promise((r) => { setTimeout(r, 1); });

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('worker core — only expected outcomes are serialised', () => {
  it('the §4.2.0 route crosses as data: code + validated lengths, and no byId', () => {
    const out = handleSearchMessage({ id: 1, seqQuery: LONG, docs: [DOC], ctx: {} });
    expect(out.error.code).toBe('REQUIRES_ALIGNMENT');
    expect(Number.isInteger(out.error.maxApproxLength)).toBe(true);
    expect(out.error.queryLength).toBe(LONG.length);
    expect(out.byId).toBeUndefined(); // a verdict and a partial answer must never travel together
  });

  it('never leaks raw Error text across the boundary', () => {
    const out = handleSearchMessage({ id: 1, seqQuery: LONG, docs: [DOC], ctx: {} });
    expect(out.error.message).toBeUndefined();
    expect(Object.keys(out.error).sort()).toEqual(['code', 'maxApproxLength', 'queryLength']);
  });

  it('an UNEXPECTED throw is re-thrown, so it becomes a real worker fault', () => {
    // A non-ACGT query is a programming error at this layer (the UI gates it), and the engine
    // throws INVALID_DNA — expected. A malformed `docs` is not anticipated at all.
    expect(() => handleSearchMessage({ id: 1, seqQuery: 'ACGT', docs: [{ id: 'a', get seq() { throw new TypeError('boom'); } }] }))
      .toThrow(TypeError);
  });
});

describe('worker client — the envelope is validated, not trusted', () => {
  const routeReply = (w, msg) => w.onmessage?.({
    data: { id: msg.id, error: { code: 'REQUIRES_ALIGNMENT', maxApproxLength: 100, queryLength: 412 } },
  });

  it('1 — a route does NOT end the worker: the next search reuses the same instance', async () => {
    let mode = 'route';
    const factory = makeFactory((w, msg) => {
      if (mode === 'route') return routeReply(w, msg);
      return w.onmessage?.({ data: { id: msg.id, byId: {} } });
    });
    const client = createSearchWorkerClient(factory);

    await expect(client.searchSequences(LONG, [DOC])).rejects.toMatchObject({ code: 'REQUIRES_ALIGNMENT' });
    expect(factory.workers[0].terminated).toBe(false);

    mode = 'ok';
    await client.searchSequences('GAATTG', [DOC]);
    expect(factory.workers).toHaveLength(1); // same instance — no respawn was needed
  });

  it('2 — an unknown code is refused as a FAULT: worker torn down, next search respawns', async () => {
    let mode = 'bogus';
    const factory = makeFactory((w, msg) => {
      if (mode === 'bogus') return w.onmessage?.({ data: { id: msg.id, error: { code: 'TOTALLY_MADE_UP' } } });
      return w.onmessage?.({ data: { id: msg.id, byId: {} } });
    });
    const client = createSearchWorkerClient(factory);

    await expect(client.searchSequences('GAATTG', [DOC]))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);

    mode = 'ok';
    await client.searchSequences('GAATTG', [DOC]);
    expect(factory.workers).toHaveLength(2); // a fresh thread, as after any crash
  });

  it('2b — a FORGED route (right code, impossible numbers) is refused too', async () => {
    const bad = [
      { code: 'REQUIRES_ALIGNMENT' },                                        // no numbers at all
      { code: 'REQUIRES_ALIGNMENT', maxApproxLength: 100, queryLength: 50 }, // query SHORTER than the limit
      { code: 'REQUIRES_ALIGNMENT', maxApproxLength: 100.5, queryLength: 412 }, // not an integer
    ];
    for (const error of bad) {
      const factory = makeFactory((w, msg) => w.onmessage?.({ data: { id: msg.id, error } }));
      const client = createSearchWorkerClient(factory);
      await expect(client.searchSequences(LONG, [DOC]))
        .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
      expect(factory.workers[0].terminated).toBe(true);
    }
  });

  // The envelope used to be checked only against ITSELF. Every number below is individually
  // plausible — 100 is the real limit, 412 really is over it — so self-consistency passed, and a
  // 6-mer got sent to the alignment workspace as if it were a 412-nt insert. A verdict is a claim
  // ABOUT A REQUEST, so it has to be checked against the request that was actually made.
  it('2d — a route envelope describing a DIFFERENT query is refused → fault', async () => {
    let mode = 'forged';
    const factory = makeFactory((w, msg) => {
      if (mode === 'forged') return routeReply(w, msg); // claims queryLength 412…
      return w.onmessage?.({ data: { id: msg.id, byId: {} } });
    });
    const client = createSearchWorkerClient(factory);

    // …but THIS request asked about a 6-mer.
    await expect(client.searchSequences('GAATTG', [DOC]))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);

    mode = 'ok';
    await client.searchSequences('GAATTG', [DOC]);
    expect(factory.workers).toHaveLength(2); // respawned, like after any fault
  });

  it('2e — the limit is the NORMATIVE one, not any number the worker names', async () => {
    const factory = makeFactory((w, msg) => w.onmessage?.({
      // Internally consistent (412 > 8) and the length matches the real query — but 8 is not the
      // product's limit. Accepting it would let the reply move the boundary of §4.2.0.
      data: { id: msg.id, error: { code: 'REQUIRES_ALIGNMENT', maxApproxLength: 8, queryLength: LONG.length } },
    }));
    const client = createSearchWorkerClient(factory);
    await expect(client.searchSequences(LONG, [DOC]))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);
  });

  it('2c — a reply carrying BOTH an answer and a verdict is incoherent → fault', async () => {
    const factory = makeFactory((w, msg) => w.onmessage?.({
      data: { id: msg.id, byId: {}, error: { code: 'RESOURCE_LIMIT' } },
    }));
    const client = createSearchWorkerClient(factory);
    await expect(client.searchSequences('GAATTG', [DOC]))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);
  });

  it('3 — RESOURCE_LIMIT keeps its identity all the way to the provider failure', async () => {
    const factory = makeFactory((w, msg) => w.onmessage?.({
      data: { id: msg.id, error: { code: 'RESOURCE_LIMIT' } },
    }));
    const client = createSearchWorkerClient(factory);
    const err = await client.searchSequences('GAATTG', [DOC]).catch((e) => e);

    // SPEC §«Resource-limit» steps 3–4: client rejects as SEARCH_ABORT.RESOURCE_LIMIT, and the
    // tracker preserves that cause instead of flattening it into a generic provider error.
    expect(err.reason).toBe(SEARCH_ABORT.RESOURCE_LIMIT);
    expect(normalizeFailureReason(err)).toBe(PROVIDER_FAILURE.RESOURCE_LIMIT);
    expect(factory.workers[0].terminated).toBe(false); // a budget verdict is not a crash
    await tick();
  });
});
