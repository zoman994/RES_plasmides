/**
 * REV #2 — S3-CLOSE / K1 corrective (P1-3): a PENDING candidate can never be opened.
 *
 * A mixed query (metadata AND a biological provider) shows the metadata candidate during the
 * partial phase, but it is only a CANDIDATE: until the worker confirms the motif in THAT document
 * it must render as verifiable (aria-disabled) and neither mouse nor Enter may open it. The strict
 * final then removes it (motif absent) or clears the pending flag and makes it selectable.
 *
 * The worker is a controllable stub whose reply runs the REAL search core, so hit/miss is decided
 * by the document's actual sequence — holding the reply lets us observe the partial deterministically.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';
import { handleSearchMessage } from '../../../lib/search-worker-core';

const MOTIF = 'GAATTC';
const WITH_MOTIF = `AAAA${MOTIF}TTTT`;
const NO_MOTIF = 'AAAACCCCGGGGTTTT';

function makeFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      postMessage(msg) { w.posted.push(msg); },
      replyLast() { const m = w.posted[w.posted.length - 1]; if (m) w.onmessage?.({ data: handleSearchMessage(m) }); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const lastWorker = (f) => f.workers[f.workers.length - 1];

function seed(id, name, sequence) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [],
      payload: { sequence, length: sequence.length, topology: 'circular', annotations: [] },
    };
  });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('S3-CLOSE K1 (P1-3) — a pending candidate is verifiable, never selectable', () => {
  it('mixed query: partial candidate is aria-disabled; click + Enter are no-ops until the worker answers', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF); // name matches, motif ABSENT
    const factory = makeFactory();
    const onPick = vi.fn();
    renderTopBar({ query: `mol:pUC seq:${MOTIF}`, workerFactory: factory, onPickSearchResult: onPick });
    act(() => { vi.advanceTimersByTime(200); }); // debounce → partial (metadata) lands, worker in flight
    await flush();

    // 1+2. The metadata candidate is shown while still verifiable.
    const row = screen.getByTestId('smart-result-puc');
    const option = row.closest('[role="option"]');
    expect(option.getAttribute('aria-disabled')).toBe('true');

    // 3. Neither mouse nor keyboard may open it before the biological check answers.
    fireEvent.click(row);
    expect(onPick).not.toHaveBeenCalled();
    const input = screen.getByTestId('library-topbar-search-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a NEGATIVE worker answer removes the candidate from the final', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: `mol:pUC seq:${MOTIF}`, workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(screen.getByTestId('smart-result-puc')).toBeTruthy(); // candidate during partial

    act(() => { lastWorker(factory).replyLast(); }); // motif absent → strict final drops it
    await flush();
    expect(screen.queryByTestId('smart-result-puc')).toBeNull();
  });

  it('a POSITIVE worker answer clears pending, adds the provider dimension and allows selection', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF); // name AND motif
    const factory = makeFactory();
    const onPick = vi.fn();
    renderTopBar({ query: `mol:pUC seq:${MOTIF}`, workerFactory: factory, onPickSearchResult: onPick });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    // pending during the partial — not selectable yet
    fireEvent.click(screen.getByTestId('smart-result-puc'));
    expect(onPick).not.toHaveBeenCalled();

    act(() => { lastWorker(factory).replyLast(); }); // motif found → confirmed
    await flush();

    const row = screen.getByTestId('smart-result-puc');
    expect(row.closest('[role="option"]').getAttribute('aria-disabled')).not.toBe('true');
    // the confirmed row carries the sequence dimension (its metrics render)
    expect(screen.getByTestId('smart-result-puc-metrics').textContent).toMatch(/идентичность|совместимость/);
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'entry', id: 'puc' }), expect.anything());
  });

  it('a late reply from a superseded query is still stale-dropped', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: `mol:pUC seq:${MOTIF}`, workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const stale = lastWorker(factory);
    rerender({ query: 'mol:zzznope', workerFactory: factory }); // supersede
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { stale.replyLast(); }); // the OLD query answers late
    await flush();
    expect(screen.queryByTestId('smart-result-puc')).toBeNull();
  });

  it('plain metadata results are NOT blocked (no provider requested → immediately selectable)', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    const onPick = vi.fn();
    renderTopBar({ query: 'pUC', workerFactory: factory, onPickSearchResult: onPick });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    const row = screen.getByTestId('smart-result-puc');
    expect(row.closest('[role="option"]').getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(row);
    expect(onPick).toHaveBeenCalled();
  });
});
