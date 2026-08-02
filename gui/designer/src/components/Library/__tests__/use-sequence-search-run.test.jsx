/**
 * useSequenceSearchRun — the run lifecycle, tested away from the bar that used to contain it.
 *
 * Two of these properties are NEW, not merely relocated, and that is why they are pinned here
 * rather than left to the component tests: the generation guard, and the promise that `cancel()`
 * reports whether there was anything to stop instead of inventing a verdict.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSequenceSearchRun } from '../hooks/useSequenceSearchRun';

// A facade stand-in: every search is captured so a run can be settled by hand, late or early.
function makeFacade() {
  const calls = [];
  return {
    calls,
    cancelled: 0,
    throwSync: null, // set to an Error to make the NEXT search throw before returning
    search(query, documents, ctx, onResult) {
      if (this.throwSync) { const e = this.throwSync; this.throwSync = null; throw e; }
      // The real facade returns a Promise; a run can therefore end without ever calling back.
      let rejectIt;
      const promise = new Promise((_res, rej) => { rejectIt = rej; });
      calls.push({ query, onResult, reject: rejectIt });
      return promise;
    },
    cancel() { this.cancelled += 1; },
    terminate() {},
  };
}
let facade;
vi.mock('../../../lib/search-facade', () => ({
  createSearchFacade: () => facade,
}));

// A channel is now MANDATORY (fail-closed): without one the hook must refuse rather than let the
// facade quietly build a private worker. The facade itself is mocked here, so this stub is only
// ever a token of ownership.
const CHANNEL = { owner: 'global', search: () => new Promise(() => {}), cancel: () => false };
const setup = () => renderHook(() => useSequenceSearchRun({ sequenceChannel: CHANNEL, delayMs: 180 }));
const settle = (call, phase = 'final') => act(() => {
  call.onResult({ results: [], status: phase === 'partial' ? 'partial' : 'final' }, { phase });
});

beforeEach(() => { facade = makeFacade(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useSequenceSearchRun — debounce', () => {
  it('does not start any work before the delay elapses', () => {
    const { result } = setup();
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {} }); });
    expect(facade.calls).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(200); });
    expect(facade.calls).toHaveLength(1);
  });

  it('cancelling inside the debounce window means the pass never starts at all', () => {
    const { result } = setup();
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {} }); });
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped).toBe(true); // there WAS something to stop — a scheduled run counts
    act(() => { vi.advanceTimersByTime(500); });
    expect(facade.calls).toHaveLength(0); // the timer cannot fire behind the dismissal
  });

  it('a second run supersedes the first: one pass, for the newest query', () => {
    const { result } = setup();
    act(() => { result.current.run({ query: 'AAA', documents: [], ctx: {} }); });
    act(() => { result.current.run({ query: 'CCC', documents: [], ctx: {} }); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(facade.calls.map((c) => c.query)).toEqual(['CCC']);
  });
});

describe('useSequenceSearchRun — cancel reports, never invents', () => {
  it('with nothing in flight it reports false, so no «stopped» verdict is owed', () => {
    const { result } = setup();
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped).toBe(false);
  });

  it('a settled run is over: cancelling afterwards reports false', () => {
    const { result } = setup();
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {} }); });
    act(() => { vi.advanceTimersByTime(200); });
    settle(facade.calls[0]);
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped).toBe(false);
  });

  it('a PARTIAL does not end the run — the pass is still live and still stoppable', () => {
    const { result } = setup();
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {} }); });
    act(() => { vi.advanceTimersByTime(200); });
    settle(facade.calls[0], 'partial');
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped).toBe(true);
  });
});

/**
 * A run can end WITHOUT ever calling back: the facade returns a Promise, and it may reject (or the
 * call may throw outright). Ignoring that leaves the run marked live for ever — the panel keeps
 * announcing a check nobody is performing, and the rejection surfaces as an unhandled one.
 */
describe('useSequenceSearchRun — a run that ends in failure still ENDS', () => {
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  it('a rejected run reports the failure and is over', async () => {
    const { result } = setup();
    const onError = vi.fn();
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {}, onError }); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { facade.calls[0].reject(new Error('worker died')); });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped, 'a failed run is finished, not still live').toBe(false);
  });

  it('a synchronous throw is handled the same way', async () => {
    const { result } = setup();
    const onError = vi.fn();
    facade.throwSync = new TypeError('boom');
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {}, onError }); });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped).toBe(false);
  });

  it('UNMOUNT is silent: a torn-down run reports neither a cancellation nor a failure', async () => {
    const { result, unmount } = setup();
    const onError = vi.fn();
    const onCancelled = vi.fn();
    act(() => { result.current.run({ query: 'GAATTG', documents: [], ctx: {}, onError, onCancelled }); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(facade.calls).toHaveLength(1); // the pass is really running

    unmount();
    // Tearing down cancels the pass, and that cancellation arrives as a rejection. Nobody is left
    // to hear it: a verdict here would be a state update on an unmounted component.
    act(() => { facade.calls[0].reject(new Error('terminated on unmount')); });
    await flush();

    expect(onCancelled).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('a LATE failure from a superseded run is ignored, and does not end the live one', async () => {
    const { result } = setup();
    const onError = vi.fn();
    act(() => { result.current.run({ query: 'AAA', documents: [], ctx: {}, onError }); });
    act(() => { vi.advanceTimersByTime(200); });
    const first = facade.calls[0];

    act(() => { result.current.run({ query: 'CCC', documents: [], ctx: {}, onError }); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { first.reject(new Error('the abandoned run dies late')); });
    await flush();

    expect(onError, 'a stale failure is not this query’s problem').not.toHaveBeenCalled();
    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped, 'the live pass is untouched by the old one’s death').toBe(true);
  });
});

describe('useSequenceSearchRun — an old run may not speak for a newer one', () => {
  it('a late reply from a superseded run delivers nothing', () => {
    const { result } = setup();
    const seen = [];
    act(() => { result.current.run({ query: 'AAA', documents: [], ctx: {}, onResult: () => seen.push('AAA') }); });
    act(() => { vi.advanceTimersByTime(200); });
    const first = facade.calls[0];

    act(() => { result.current.run({ query: 'CCC', documents: [], ctx: {}, onResult: () => seen.push('CCC') }); });
    act(() => { vi.advanceTimersByTime(200); });
    settle(first);            // the ABANDONED run answers late
    expect(seen).toEqual([]);  // …and is ignored

    settle(facade.calls[1]);
    expect(seen).toEqual(['CCC']);
  });

  // The defect this guard exists for: with a single boolean, the old run's final cleared liveness
  // that by then belonged to the NEW pass — so the next Escape found «nothing running» while a
  // sweep was still grinding, and the user could not stop it.
  it('a late final from an old run does not make the live one look finished', () => {
    const { result } = setup();
    act(() => { result.current.run({ query: 'AAA', documents: [], ctx: {} }); });
    act(() => { vi.advanceTimersByTime(200); });
    const first = facade.calls[0];

    act(() => { result.current.run({ query: 'CCC', documents: [], ctx: {} }); });
    act(() => { vi.advanceTimersByTime(200); });
    settle(first); // stale final lands while the new pass is still running

    let stopped;
    act(() => { stopped = result.current.cancel(); });
    expect(stopped).toBe(true); // the live pass is still stoppable
  });
});
