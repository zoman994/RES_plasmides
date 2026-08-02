/**
 * Ownership of the sequence-search worker (U4, step 2).
 *
 * These are the rules the coordinator exists to enforce, tested without any surface attached: one
 * heavy pass at a time, cancellation scoped to its owner, and a lifetime that ends exactly once.
 */
import React, { StrictMode, useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import SequenceSearchProvider from '../SequenceSearchProvider';
import { useSequenceSearchChannel } from '../sequence-search-context';
import { SEARCH_ABORT } from '../../lib/search-worker-client';

const DOCS = [{ id: 'e1', seq: 'AAAGAATTGCCC', topology: 'linear' }];
const QUERY = 'GAATTG';

function makeFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      // U4-CANCEL C2 — a `cancel` is a CONTROL frame: a cooperative worker keeps running, unwinds
      // its job and acknowledges. Modelled here as an immediate ack (the real worker acks from its
      // `finally`, after the generator has unwound).
      postMessage(msg) {
        w.posted.push(msg);
        if (msg && msg.type === 'cancel') {
          Promise.resolve().then(() => w.onmessage?.({ data: { id: msg.id, cancelled: true } }));
        }
      },
      /** Heavy jobs only — control frames excluded. */
      get jobs() { return w.posted.filter((m) => !m || m.type !== 'cancel'); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}

/** Grabs both channels from inside the tree, exactly as the two real surfaces will. */
// Handed OUT through a callback rather than written into an outer binding: a component may not
// reassign or mutate anything from the module scope, and the escape hatch is to publish.
let channels = { global: null, popover: null };
function Channels({ onReady }) {
  const global = useSequenceSearchChannel('global');
  const popover = useSequenceSearchChannel('popover');
  useEffect(() => { onReady({ global, popover }); }, [global, popover, onReady]);
  return null;
}
const publish = (next) => { channels = next; };
const mount = (factory, { strict = false } = {}) => {
  const tree = (
    <SequenceSearchProvider workerFactory={factory}>
      <Channels onReady={publish} />
    </SequenceSearchProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

let factory;
beforeEach(() => { factory = makeFactory(); channels = { global: null, popover: null }; });
afterEach(cleanup);

describe('SequenceSearchProvider — one owner, one worker', () => {
  it('mounting costs no thread: the worker is spawned on the FIRST search', () => {
    mount(factory);
    expect(factory.workers).toHaveLength(0);
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    expect(factory.workers).toHaveLength(1);
  });

  it('both channels share one worker — never two heavy passes at once', () => {
    mount(factory);
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    act(() => { channels.popover.search(QUERY, DOCS, {}); });
    // INVERTED BY U4-CANCEL C2: the second start asks the first pass to stop and then runs on the
    // SAME thread once it has acknowledged. The invariant is unchanged — never two heavy passes at
    // once — but achieving it no longer costs a teardown and a respawn per supersede.
    expect(factory.workers).toHaveLength(1);
    expect(factory.workers[0].terminated).toBe(false);
    expect(factory.workers[0].posted.some((m) => m && m.type === 'cancel')).toBe(true);
  });

  it('the superseded owner is told it was CANCELLED — a stopped search is not a failed one', async () => {
    mount(factory);
    let outcome = null;
    act(() => {
      channels.global.search(QUERY, DOCS, {}).catch((e) => { outcome = e; });
    });
    act(() => { channels.popover.search(QUERY, DOCS, {}); });
    await act(async () => { await Promise.resolve(); });

    expect(outcome?.reason).toBe(SEARCH_ABORT.CANCELLED);
  });

  it('an IGNORED supersede does not become an unhandled rejection', async () => {
    mount(factory);
    act(() => { channels.global.search(QUERY, DOCS, {}); }); // nobody catches this one
    act(() => { channels.popover.search(QUERY, DOCS, {}); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // Reaching here without vitest flagging an unhandled rejection IS the assertion; the explicit
    // check keeps the intent visible. C2: one worker serves both passes in sequence.
    expect(factory.workers).toHaveLength(1);
    expect(factory.workers[0].posted.some((m) => m && m.type === 'cancel')).toBe(true);
  });

  it('cancelling a channel that owns nothing is a no-op — never another surface’s pass', () => {
    mount(factory);
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    const globalWorker = factory.workers[0];

    let stopped;
    act(() => { stopped = channels.popover.cancel(); });
    expect(stopped, 'the popover owns no pass here').toBe(false);
    expect(globalWorker.terminated, 'cancelling one owner must not abort another’s work').toBe(false);

    act(() => { stopped = channels.global.cancel(); });
    expect(stopped).toBe(true);
    // C2: the owner's pass is stopped by ASKING, not by killing a healthy thread.
    expect(globalWorker.terminated).toBe(false);
    expect(globalWorker.posted.some((m) => m && m.type === 'cancel')).toBe(true);
  });
});

describe('SequenceSearchProvider — lifetime', () => {
  it('only unmount disposes: the coordinator outlives any single search', () => {
    const { unmount } = mount(factory);
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    act(() => { channels.global.cancel(); });
    // C2: cancelling stops the pass without killing the thread — the next search reuses it.
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    expect(factory.workers).toHaveLength(1);

    unmount(); // …and only UNMOUNT tears the worker down.
    expect(factory.workers[0].terminated).toBe(true);
  });

  it('a new workerFactory replaces the coordinator and tears the old one down', () => {
    const first = makeFactory();
    const second = makeFactory();
    const { rerender } = render(
      <SequenceSearchProvider workerFactory={first}><Channels onReady={publish} /></SequenceSearchProvider>,
    );
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    expect(first.workers).toHaveLength(1);

    rerender(<SequenceSearchProvider workerFactory={second}><Channels onReady={publish} /></SequenceSearchProvider>);
    expect(first.workers[0].terminated, 'the old owner is disposed, not left running').toBe(true);

    act(() => { channels.global.search(QUERY, DOCS, {}); });
    expect(second.workers).toHaveLength(1); // the new factory is the one being used
  });

  // V199 was exactly this: a worker built during render, torn down by StrictMode's simulated
  // unmount, leaving the component holding a dead instance and a search that never returned.
  it('under StrictMode the live coordinator is the one that answers', () => {
    mount(factory, { strict: true });
    act(() => { channels.global.search(QUERY, DOCS, {}); });
    expect(factory.workers.length).toBeGreaterThan(0);
    const live = factory.workers[factory.workers.length - 1];
    expect(live.terminated, 'the search must run on a LIVE worker, not a disposed one').toBe(false);
    expect(live.posted).toHaveLength(1);
  });
});

describe('useSequenceSearchChannel — no hidden fallback', () => {
  it('throws outside the Provider rather than quietly owning a second worker', () => {
    function Orphan() { useSequenceSearchChannel('popover'); return null; }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/SequenceSearchProvider/);
    spy.mockRestore();
  });
});
