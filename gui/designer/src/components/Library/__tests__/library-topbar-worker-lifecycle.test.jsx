/**
 * LibraryTopBar — sequence-worker lifecycle + result-race acceptance (task #168).
 *
 * The worker runs a synchronous full pass, so an obsolete search must be cancelled
 * IMMEDIATELY (terminating its worker), a late reply must never render under the new
 * query, and a genuine provider failure must warn — not silently show «nothing found».
 * A controllable worker factory is injected so these are deterministic.
 */
import 'fake-indexeddb/auto';
import React, { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar, Harness } from './_topbar-harness';
import { handleSearchMessage } from '../../../lib/search-worker-core';

const TARGET = 'AAAGAATTGCCC'; // contains GAATTG for doc 'a'

// A factory that hands out drivable workers and records their lifecycle.
function makeFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      postMessage(msg) { w.posted.push(msg); },
      replyLast() { const m = w.posted[w.posted.length - 1]; if (m) w.onmessage?.({ data: handleSearchMessage(m) }); },
      crash() { w.onerror?.({ message: 'boom' }); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {
      a: { id: 'a', name: 'plasmid-A', projectId: null, kind: 'container', tags: [],
        payload: { sequence: TARGET, length: TARGET.length, topology: 'circular', annotations: [] } },
    };
    s.projects = {};
    s.currentProjectId = null;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('LibraryTopBar — result-race + worker lifecycle (task #168)', () => {
  it('changing the query cancels the in-flight worker IMMEDIATELY (not after the debounce)', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); }); // debounce → search fires → worker in-flight
    const workerA = factory.workers[factory.workers.length - 1];
    expect(workerA.posted.length).toBe(1);
    expect(workerA.terminated).toBe(false);
    rerender({ query: 'seq:GAATTC', workerFactory: factory });
    expect(workerA.terminated).toBe(true); // ← cancelled NOW, not in 180 ms
  });

  it('clearing the field cancels the in-flight worker and empties the results', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    rerender({ query: '', workerFactory: factory });
    expect(workerA.terminated).toBe(true);
    expect(screen.queryByTestId('smart-result-a')).toBeNull();
  });

  it('a DISPLAYED result for query A is hidden the instant the query changes to B (before B runs)', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    act(() => { workerA.replyLast(); }); // A COMPLETES → its result is shown
    await flush();
    expect(screen.getByTestId('smart-result-a')).toBeTruthy();
    // Type B — A's row must vanish on the very render where the query becomes B, not
    // 180 ms later once B resolves (results are owned by their query).
    rerender({ query: 'seq:CCCC', workerFactory: factory });
    expect(screen.queryByTestId('smart-result-a')).toBeNull();
  });

  it('a failure warning for query A is hidden the instant the query changes', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    act(() => { workerA.crash(); }); // A fails → warning shown for query A
    await flush();
    expect(screen.getByTestId('search-provider-incomplete-warning')).toBeTruthy();
    rerender({ query: 'seq:CCCC', workerFactory: factory });
    expect(screen.queryByTestId('search-provider-incomplete-warning')).toBeNull(); // old warning gone
  });

  it('a late reply from a cancelled worker never renders under the new query', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    rerender({ query: 'seq:CCCC', workerFactory: factory }); // cancels A
    act(() => { workerA.replyLast(); }); // A replies LATE — must be ignored
    await flush();
    expect(screen.queryByTestId('smart-result-a')).toBeNull();
  });

  it('a sequence-worker crash warns «поиск не выполнен» instead of a silent «nothing found»', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    act(() => { workerA.crash(); });
    await flush();
    expect(screen.getByTestId('search-provider-incomplete-warning')).toBeTruthy();
    expect(screen.queryByText('Ничего не найдено.')).toBeNull();
  });

  it('a pending sequence final shows loading and never announces an early empty result', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush(); // metadata partial has arrived; the worker final is still pending

    // K3.2 — «checking» is no longer a separate span: it is the ONE status message, and the
    // results area is aria-busy. «Ничего не найдено» is a different status entirely, so the two
    // can no longer be shown at once by construction.
    const status = () => screen.getByTestId('library-topbar-search-listbox-status');
    expect(screen.getByTestId('library-topbar-search-listbox-results').getAttribute('aria-busy')).toBe('true');
    expect(status().textContent).toMatch(/Проверяем биологическое совпадение/);
    expect(screen.queryByText('Ничего не найдено.')).toBeNull();

    const live = factory.workers[factory.workers.length - 1];
    act(() => { live.replyLast(); });
    await flush();
    expect(screen.getByTestId('library-topbar-search-listbox-results').getAttribute('aria-busy')).toBeNull();
    expect(status().textContent).toBe(''); // a confirmed result announces nothing extra
    expect(screen.getByTestId('smart-result-a')).toBeTruthy();
  });

  it('under StrictMode (mount → cleanup → remount) a search still works on the live worker', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    render(
      <StrictMode>
        <Harness query="seq:GAATTG" workerFactory={factory} />
      </StrictMode>,
    );
    act(() => { vi.advanceTimersByTime(200); });
    // StrictMode double-invoked the facade effect: the first lifecycle was torn down,
    // the search runs on the live one. Its worker replies → results land (no V199 hang).
    const live = factory.workers[factory.workers.length - 1];
    act(() => { live.replyLast(); });
    await flush();
    expect(screen.getByTestId('smart-result-a')).toBeTruthy();
  });
});
