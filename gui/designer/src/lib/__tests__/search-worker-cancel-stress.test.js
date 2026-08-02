/**
 * Gate U4 · Proof 2 (Layer A — vitest) — cancel/stale INVARIANTS over 100 cycles.
 *
 * happy-dom has no `Worker`, and this repo ships no vitest-browser / jsdom / Worker polyfill, so a
 * REAL worker cannot run here (see vite.config test.environment='happy-dom'). This layer therefore
 * proves the deterministic STATE-MACHINE invariants with the fake factory; the wall-clock numbers —
 * cancel p95 < 100 ms and no linear memory growth — are inherently a real-thread measurement and are
 * proven in the built-preview (Layer B), because a fake worker replies in one microtask and has no
 * synchronous megabase sweep to interrupt.
 *
 * What IS proven here, over 100 search+cancel cycles:
 *   • at most ONE live (non-terminated) worker at any moment;
 *   • ZERO late publishes — a reply from a cancelled worker never resolves its promise;
 *   • every cycle settles EXACTLY once, with reason CANCELLED;
 *   • the client stays healthy — a final search respawns and resolves.
 */
import { describe, it, expect } from 'vitest';
import { createSearchWorkerClient, SEARCH_ABORT } from '../search-worker-client';
import { handleSearchMessage } from '../search-worker-core';

// Fake worker that runs the real core on postMessage but only DELIVERS on flushLast — so a cycle can
// be cancelled before its reply, and a late reply can be injected to prove it is dropped.
function controllableWorker() {
  const w = {
    onmessage: null, onerror: null, onmessageerror: null, posted: [], queue: [], cancels: [], terminated: false,
    postMessage(msg) {
      w.posted.push(msg);
      // U4-CANCEL C2 — a cancel is a control frame; the worker survives it and acknowledges once
      // the old job has unwound.
      if (msg && msg.type === 'cancel') { w.cancels.push(msg.id); return; }
      w.queue.push(handleSearchMessage(msg));
    },
    ackCancel() { const id = w.cancels.shift(); w.onmessage?.({ data: { id, cancelled: true } }); },
    get jobs() { return w.posted.filter((m) => !m || m.type !== 'cancel'); },
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
const mkDoc = (id, seq, topology = 'linear') => ({ ref: { kind: 'entry', id }, sequence: { seq, topology } });
const liveCount = (factory) => factory.workers.filter((w) => !w.terminated).length;
const microflush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('Gate U4 · cancel/stale invariants (100 cycles, fake worker)', () => {
  it('holds max-1-live, zero late publishes, and settles every cycle as CANCELLED', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 0 });
    const docs = [mkDoc('a', 'AAAGAATTGCCC')];
    const settled = [];
    const lateResolves = [];
    let maxLive = 0;

    const CYCLES = 100;
    for (let i = 0; i < CYCLES; i += 1) {
      const p = client.searchSequences('GAATTG', docs);
      p.then(() => lateResolves.push(i), (e) => settled.push({ i, reason: e.reason }));
      maxLive = Math.max(maxLive, liveCount(factory)); // exactly the one just spawned
      client.cancel(); // C2: supersede-by-cancel → CANCELLED at once; the worker SURVIVES
      // Every so often, inject the cancelled job's late reply — it must be dropped, never resolved.
      if (i % 7 === 0) factory.workers[factory.workers.length - 1].flushLast();
      factory.workers[factory.workers.length - 1].ackCancel(); // …then it finishes unwinding
    }
    await microflush();

    // ── INVERTED BY U4-CANCEL C2 ───────────────────────────────────────────────────────────────
    // Before C2 the assertions here were «every worker is terminated» and «a fresh worker per
    // cycle» — which is precisely the ~2 s-per-supersede teardown the U4 runtime gate measured.
    // The invariants that MATTER are unchanged: one heavy job at a time, no late publish, every
    // cycle settles exactly once as CANCELLED. What changed is the cost of achieving them.
    expect(maxLive, 'never two live workers at once').toBe(1);
    expect(liveCount(factory), 'the healthy worker is REUSED, not torn down').toBe(1);
    expect(factory.workers.length, 'ONE worker for all 100 cancels — no respawn storm').toBe(1);
    expect(lateResolves, 'a cancelled job reply must never resolve its promise').toEqual([]);
    expect(settled.length, 'every cycle settles exactly once').toBe(CYCLES);
    expect(settled.every((s) => s.reason === SEARCH_ABORT.CANCELLED)).toBe(true);
    // …and never two heavy jobs outstanding: each cycle posts exactly one.
    expect(factory.workers[0].jobs.length).toBe(CYCLES);

    // The client is still healthy: a final search runs on the SAME worker and resolves.
    const p = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    factory.workers[factory.workers.length - 1].flushLast();
    expect((await p).has('entry:a')).toBe(true);
    expect(factory.workers.length).toBe(1);
    expect(maxLive).toBeLessThanOrEqual(1);
  });

  it('a burst of supersedes settles every abandoned search and posts exactly ONE new job', async () => {
    // INVERTED BY C2. There are no longer «many generations» to leak: one healthy worker serves the
    // whole burst. The invariant that matters survives verbatim — every abandoned search settles as
    // CANCELLED, no late reply resolves anything, and the worker is never asked to run two heavy
    // jobs at once (only the LATEST waiting search is released by the ack).
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 0 });
    const docs = [mkDoc('a', 'AAAGAATTGCCC')];
    const rejected = [];
    const resolved = [];

    for (let i = 0; i < 25; i += 1) {
      const p = client.searchSequences('GAATTG', docs);
      p.then(() => resolved.push(i), (e) => rejected.push(e.reason));
    }
    await microflush();
    const w = factory.workers[0];
    expect(factory.workers.length).toBe(1);
    expect(w.jobs.length).toBe(1);        // 25 searches, ONE heavy job in flight
    expect(rejected.length).toBe(24);     // …and 24 already settled as abandoned
    expect(rejected.every((r) => r === SEARCH_ABORT.CANCELLED)).toBe(true);

    w.flushLast();                        // the cancelled job's late reply → must be dropped
    await microflush();
    expect(resolved).toEqual([]);

    w.ackCancel();                        // the old job finished unwinding → the survivor is posted
    expect(w.jobs.length).toBe(2);
    w.flushLast();
    await microflush();
    expect(resolved.length).toBe(1);      // exactly one search survived the burst
    expect(liveCount(factory)).toBe(1);
    expect(w.terminated).toBe(false);
  });
});
