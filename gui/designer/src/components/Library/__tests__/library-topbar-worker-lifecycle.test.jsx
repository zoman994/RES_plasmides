/**
 * LibraryTopBar — sequence-worker lifecycle + result-race acceptance (task #168).
 *
 * An obsolete search must be cancelled IMMEDIATELY, a late reply must never render under the new
 * query, and a genuine provider failure must warn — not silently show «nothing found».
 *
 * C2.2 rewrote HOW «cancelled» is observed. The engine is resumable now (U4-CANCEL), so a supersede
 * posts a `{type:'cancel', id}` control frame and the thread stays in service; terminating it is
 * reserved for faults (crash / malformed / timeout), which this file still pins. The shared fake
 * separates heavy jobs from control frames, so «a late reply» can finally be aimed at the job it
 * belongs to instead of at whatever was posted last — which, after a cancel, is the cancel itself.
 */
import 'fake-indexeddb/auto';
import React, { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar, Harness } from './_topbar-harness';
import SequenceSearchProvider from '../../SequenceSearchProvider';
import { recordingFactory } from '../../../lib/__tests__/helpers/search-worker-fakes';

const TARGET = 'AAAGAATTGCCC'; // contains GAATTG for doc 'a'

const makeFactory = recordingFactory;
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
  it('changing the query cancels the in-flight pass IMMEDIATELY (not after the debounce)', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); }); // debounce → search fires → worker in-flight
    const workerA = factory.workers[factory.workers.length - 1];
    expect(workerA.jobs.length).toBe(1);
    expect(workerA.cancels.length).toBe(0);
    rerender({ query: 'seq:GAATTC', workerFactory: factory });

    // Cancelled NOW, not in 180 ms — and cancelled by ASKING (C2.2). The thread survives, and the
    // next heavy job waits for its acknowledgement, so two passes never overlap.
    expect(workerA.cancels).toEqual([workerA.jobs[0].id]);
    expect(workerA.terminated).toBe(false);
    expect(factory.workers.length).toBe(1);
    expect(workerA.jobs.length).toBe(1);
  });

  it('clearing the field cancels the in-flight pass and empties the results', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    rerender({ query: '', workerFactory: factory });
    expect(workerA.cancels.length).toBe(1);
    expect(workerA.terminated).toBe(false);
    expect(screen.queryByTestId('smart-result-a')).toBeNull();
  });

  it('a DISPLAYED result for query A is hidden the instant the query changes to B (before B runs)', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    act(() => { workerA.flushLast(); }); // A COMPLETES → its result is shown
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

  it('a late terminal for the CANCELLED job never renders under the new query', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const workerA = factory.workers[factory.workers.length - 1];
    const cancelledJob = workerA.lastJobId();
    rerender({ query: 'seq:CCCC', workerFactory: factory }); // asks A to stop

    // Aimed at A's job, not at «whatever was posted last» — after the cancel that would have been
    // the control frame, so the old version of this test proved nothing about lateness.
    act(() => { expect(workerA.flushJob(cancelledJob)).toBe(true); });
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
    act(() => { live.flushLast(); });
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
        {/* U4 — the owner is the Provider, so StrictMode double-invokes ITS effect too. */}
        <SequenceSearchProvider workerFactory={factory}>
          <Harness query="seq:GAATTG" />
        </SequenceSearchProvider>
      </StrictMode>,
    );
    act(() => { vi.advanceTimersByTime(200); });
    // StrictMode double-invoked the coordinator effect: the first lifecycle was torn down,
    // the search runs on the live one. Its worker replies → results land (no V199 hang).
    const live = factory.workers[factory.workers.length - 1];
    act(() => { live.flushLast(); });
    await flush();
    expect(screen.getByTestId('smart-result-a')).toBeTruthy();
  });
});
