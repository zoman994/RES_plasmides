/**
 * U5-B — «Back to results»: the search you came from is still there.
 *
 * Opening a molecule from the dropdown used to be a one-way door. The bar keeps its state (it is
 * never unmounted), but nothing captured WHICH search the biologist arrived from, so there was no
 * action that could put them back on it — they retyped the query and waited for the worker again.
 *
 * The contract has two halves, and the corpus generation decides which one runs:
 *   • the library has not changed → the confirmed rows still describe it, so they come back
 *     verbatim and NO new worker job is started;
 *   • the library has changed → the old rows would be a picture of a library that no longer exists,
 *     so the query survives, the rows do not, and exactly ONE honest search runs.
 *
 * A frame is only ever captured for a navigation that HAPPENED: a cancelled unsaved-changes guard
 * leaves no promise of a return to a place the user never left.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

const QUERY = 'GAATTCACGTAC';
const SEQ_A = `AAA${QUERY}TTT`;
const SEQ_B = `CCC${QUERY}GGG`;

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

function seed(id, name, sequence) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [], version: 1,
      payload: { sequence, length: sequence.length, topology: 'linear', annotations: [] },
    };
  });
}

/** How many heavy passes the fake worker was actually asked to run. */
const jobsPosted = (factory) => factory.workers
  .reduce((n, w) => n + w.posted.filter((m) => m && m.type !== 'cancel').length, 0);

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null;
    s.searchReturnFrame = null; s.navRequest = null;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function searchAndPick({ onPickSearchResult } = {}) {
  const utils = renderTopBar({ query: `seq:${QUERY}`, onPickSearchResult, selectedEntryId: null });
  act(() => { vi.advanceTimersByTime(200); });
  await flush();
  await flush();
  const options = screen.getAllByRole('option');
  act(() => { fireEvent.click(options[0]); });
  return utils;
}

describe('U5-B — the frame is captured only for a navigation that happened', () => {
  it('a confirmed pick captures the query, the rows and the corpus it was computed against', async () => {
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    seed('b', 'beta', SEQ_B);
    // The sink says «opened» — that is what production's dirty-guarded openEntry returns.
    await searchAndPick({ onPickSearchResult: () => true });

    const frame = useStore.getState().searchReturnFrame;
    expect(frame).toBeTruthy();
    expect(frame.query).toBe(`seq:${QUERY}`);
    // The frame stores what the user typed; the restore re-canonicalises it. Those two forms differ
    // for a bare DNA query (`seq:GAATTC` → `GAATTC`), which is exactly what broke the first live
    // Back: rows stamped with the raw text were owned by a query that no longer existed.
    expect(frame.query).not.toBe(QUERY);
    expect(frame.rows.length).toBeGreaterThan(0);
    expect(frame.entryId).toBe(frame.rows[0].id);
    expect(frame.generation).toBe(useStore.getState().searchCorpusGeneration);
  });

  it('a CANCELLED dirty guard captures nothing — no false promise of a return', async () => {
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    // The guard refused: production's openEntry returns false and changes nothing.
    await searchAndPick({ onPickSearchResult: () => false });
    expect(useStore.getState().searchReturnFrame).toBeNull();
  });
});

describe('U5-B — Back with an UNCHANGED library', () => {
  it('restores query, rows and the active row, and starts ZERO new worker jobs', async () => {
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    seed('b', 'beta', SEQ_B);
    const { workerFactory, rerender } = await searchAndPick({ onPickSearchResult: () => true });

    const frame = useStore.getState().searchReturnFrame;
    const jobsBefore = jobsPosted(workerFactory);
    expect(jobsBefore).toBeGreaterThan(0); // the original search really ran

    // The molecule is open: the control is offered for THAT entry.
    act(() => { rerender({ query: '', selectedEntryId: frame.entryId }); });
    await flush();
    const back = screen.getByTestId('library-search-back');

    act(() => { fireEvent.click(back); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); }); // past the debounce a new pass would have used
    await flush();

    // The same confirmed rows are on screen…
    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(frame.rows.length);
    // …and nothing was asked of the worker to put them there.
    expect(jobsPosted(workerFactory)).toBe(jobsBefore);
    // The frame is spent: it described one return, and that return happened.
    expect(useStore.getState().searchReturnFrame).toBeNull();
  });
});

describe('U5-B — Back after the library CHANGED', () => {
  it('keeps the query, drops the stale rows, and runs exactly one new search', async () => {
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    const { workerFactory, rerender } = await searchAndPick({ onPickSearchResult: () => true });
    const frame = useStore.getState().searchReturnFrame;
    const jobsBefore = jobsPosted(workerFactory);

    // A molecule is renamed — no sequence changed, no version bumped. The old confirmed rows
    // describe a library that no longer exists, and the generation is what notices.
    const genBefore = useStore.getState().searchCorpusGeneration;
    act(() => {
      useStore.setState((s) => { s.libraryEntries.a = { ...s.libraryEntries.a, name: 'alpha-renamed' }; });
    });
    expect(useStore.getState().searchCorpusGeneration).toBeGreaterThan(genBefore);

    act(() => { rerender({ query: '', selectedEntryId: frame.entryId }); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('library-search-back')); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); });
    await flush();
    await flush();

    // Exactly one honest re-run, not zero (stale rows) and not several.
    expect(jobsPosted(workerFactory)).toBe(jobsBefore + 1);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});

describe('U5-B — the control is scoped to the entry it came from', () => {
  it('a different, manually selected molecule is offered no return', async () => {
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    seed('b', 'beta', SEQ_B);
    const { rerender } = await searchAndPick({ onPickSearchResult: () => true });
    const frame = useStore.getState().searchReturnFrame;

    const other = frame.entryId === 'a' ? 'b' : 'a';
    act(() => { rerender({ query: '', selectedEntryId: other }); });
    await flush();
    expect(screen.queryByTestId('library-search-back')).toBeNull();

    act(() => { rerender({ query: '', selectedEntryId: frame.entryId }); });
    await flush();
    expect(screen.getByTestId('library-search-back')).toBeTruthy();
  });
});

describe('U5-B — Back when the bar still holds the very same query', () => {
  // HONEST LIMIT: this case is NOT mutation-proved. Removing the forced re-run leaves it green,
  // because the harness's own re-seed happens to restart the pass in jsdom. It is kept as a
  // regression lock on the observable outcome, and the guard itself was verified in the browser,
  // where the empty panel it prevents is exactly what appeared.
  it('a changed corpus still re-runs, even though the query text does not move', async () => {
    // The bar is never unmounted, so after a jump it is usually still showing the query that found
    // the molecule. Restoring it changes no text, so nothing in the search effect's dependencies
    // moves — and a Back that relied on that would leave the panel empty forever. The live browser
    // found this; the first version of the test above hid it by clearing the query first.
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    const { workerFactory, rerender } = await searchAndPick({ onPickSearchResult: () => true });
    const frame = useStore.getState().searchReturnFrame;
    const jobsBefore = jobsPosted(workerFactory);

    act(() => {
      useStore.setState((s) => { s.libraryEntries.a = { ...s.libraryEntries.a, tags: ['fresh'] }; });
    });

    // NOTE: the query prop is NOT cleared — the bar keeps `seq:...` exactly as the user left it.
    act(() => { rerender({ query: `seq:${QUERY}`, selectedEntryId: frame.entryId }); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('library-search-back')); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); });
    await flush();
    await flush();

    expect(jobsPosted(workerFactory)).toBe(jobsBefore + 1);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });
});

describe('U5-B — after Back the keyboard is usable again', () => {
  it('focus returns to the combobox and the restored row is the active descendant', async () => {
    // The control the user pressed disappears with the frame it spent. Without an explicit hand-off
    // focus lands on the body, and the arrow keys — the whole point of a combobox — do nothing.
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    seed('b', 'beta', SEQ_B);
    const { rerender } = await searchAndPick({ onPickSearchResult: () => true });
    const frame = useStore.getState().searchReturnFrame;

    act(() => { rerender({ query: '', selectedEntryId: frame.entryId }); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('library-search-back')); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); });
    await flush();

    const input = screen.getByTestId('library-topbar-search-input');
    expect(document.activeElement).toBe(input);

    const active = screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true');
    expect(active).toBeTruthy();
    // The descendant the input points at must EXIST — a dangling id is worse than none, because a
    // screen reader announces a row that is not there.
    expect(input.getAttribute('aria-activedescendant')).toBe(active.id);

    // …and the arrows keep working from that row rather than starting over.
    act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }); });
    expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(true);
  });

  it('a restored search that ends EMPTY does not hand its scroll/active offer to the next query', async () => {
    vi.useFakeTimers();
    seed('a', 'alpha', SEQ_A);
    const { rerender } = await searchAndPick({ onPickSearchResult: () => true });
    const frame = useStore.getState().searchReturnFrame;

    // The molecule that matched is gone: the restored search is an honest zero.
    act(() => {
      useStore.setState((s) => { const next = { ...s.libraryEntries }; delete next.a; s.libraryEntries = next; });
    });
    act(() => { rerender({ query: '', selectedEntryId: frame.entryId }); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('library-search-back')); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); });
    await flush();
    await flush();
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    // A brand-new, unrelated search must start clean — no leftover active row from the frame.
    // `seed` writes to the store, and the corpus watcher turns that into state updates inside the
    // mounted bar — so it belongs inside `act` like any other event. Left outside, React reported two
    // «not wrapped in act(...)» warnings, which are not cosmetic: they mean assertions can run against
    // a render that has not settled.
    act(() => { seed('c', 'gamma', SEQ_B); });
    act(() => { rerender({ query: `seq:${QUERY}`, selectedEntryId: null }); });
    act(() => { vi.advanceTimersByTime(400); });
    await flush();
    await flush();
    const rows = screen.getAllByRole('option');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
  });
});
