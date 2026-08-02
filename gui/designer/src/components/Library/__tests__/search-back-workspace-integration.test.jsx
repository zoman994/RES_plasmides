/**
 * U5-B — Back to results through the REAL workspace. Nothing between the click and the inspector is
 * a test double.
 *
 * Every earlier proof of the «0 new worker jobs» half handed the bar a `onPickSearchResult` that
 * returned `true`, which is a statement about the bar, not about the app: the production sink runs a
 * dirty guard, activates a project, switches the view, seeds per-entry state and parks a nav request —
 * and any one of those, by touching the library, could age the search corpus and turn the verbatim
 * restore into a full re-search without a single test noticing. That is precisely the defect this
 * file exists to catch, so it mounts `LibraryWorkspace` and drives it the way a biologist does:
 * search, click the row, land in the inspector, press «Назад к результатам».
 *
 * The only injected thing is the worker THREAD (via the provider, where production injects it too),
 * and it answers through the real engine core.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { handleSearchMessage } from '../../../lib/search-worker-core';
import LibraryWorkspace from '../LibraryWorkspace';

/**
 * The workspace mounts its OWN `SequenceSearchProvider` — one owner for the bar and the Ctrl+F host —
 * so an outer provider would be shadowed. The thread is therefore injected at the production seam:
 * the module the provider constructs its worker from. Everything above that seam is the real thing.
 */
vi.mock('../../../lib/search.worker.js?worker', () => ({
  default: class { constructor() { return currentFactory(); } },
}));

const QUERY = 'GAATTCACGTAC';
const SEQ_A = `AAA${QUERY}TTT`;
const SEQ_B = `CCC${QUERY}GGG`;
/** A motif absent from both fixtures, so a search for it can only be answered by a NEW molecule. */
const NEW_MOTIF = 'TTGCAGGTCCAA';

/**
 * @param {boolean} [slow] — hold each heavy answer until `drain()` is called.
 *
 * The default thread answers in a microtask, which is convenient and, for one contract here,
 * misleading: a pass that is already finished by the time the next render lands can never be
 * cancelled-and-restarted, so a duplicate run costs nothing and an exact job count cannot see it.
 * A megabase sweep is not finished by the next render. `slow` models that — the job stays in flight,
 * which is precisely the condition under which a redundant pass is expensive.
 */
function makeFactory(slow = false) {
  const workers = [];
  const factory = () => {
    const pending = [];
    const w = {
      onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: false,
      postMessage(m) {
        w.posted.push(m);
        if (m && m.type === 'cancel') {
          queueMicrotask(() => { if (!w.terminated) w.onmessage?.({ data: { id: m.id, cancelled: true } }); });
          return;
        }
        const answer = () => {
          if (w.terminated) return;
          try { w.onmessage?.({ data: handleSearchMessage(m) }); } catch { w.onerror?.({ message: 'core threw' }); }
        };
        if (slow) pending.push(answer);
        else queueMicrotask(answer);
      },
      drain() { const q = pending.splice(0); q.forEach((fn) => fn()); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  factory.drain = () => workers.forEach((w) => w.drain());
  return factory;
}
/** Heavy passes actually asked for — control frames are not jobs. */
const jobsPosted = (factory) => factory.workers
  .reduce((n, w) => n + w.posted.filter((m) => m && m.type !== 'cancel').length, 0);

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

/**
 * Run timers and microtasks until the corpus generation stops moving BY ITSELF.
 *
 * The primer pool hydrates lazily, and `primersById` is a corpus map — so its arrival is a genuine
 * corpus change that lands a few ticks after mount. Left unsettled it drifts into the middle of an
 * exact job count and makes the measurement depend on scheduling rather than on the policy.
 */
async function settleCorpus() {
  let last = -1;
  for (let i = 0; i < 8 && last !== useStore.getState().searchCorpusGeneration; i += 1) {
    last = useStore.getState().searchCorpusGeneration;
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush();
  }
}

/**
 * Advance until the worker stream stops growing.
 *
 * A fixed number of ticks is not enough: a redundant pass requested during the LAST tick sits in the
 * 180 ms debounce, unposted, and a count taken there reports the honest number for the wrong reason.
 * This drains to quiescence, so «one job» means one job and not «one so far».
 */
async function settleJobs() {
  let last = -1;
  for (let i = 0; i < 8 && last !== jobsPosted(factory); i += 1) {
    last = jobsPosted(factory);
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush();
  }
}

function seed(id, name, sequence, tags = []) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags, version: 1, zone: 'loose',
      payload: { sequence, length: sequence.length, topology: 'linear', annotations: [] },
    };
  });
}

const input = () => screen.getByTestId('library-topbar-search-input');
const backButton = () => screen.queryByTestId('library-search-back');

/**
 * Type into the REAL combobox and let the debounce + the fake thread settle. The trailing space is
 * what COMMITS the token — the same rule a biologist types under: an uncommitted tail is a draft, and
 * a draft is deliberately not runnable.
 */
async function typeQuery(text) {
  act(() => { fireEvent.change(input(), { target: { value: `${text} ` } }); });
  act(() => { vi.advanceTimersByTime(300); });
  await flush();
  await flush();
}

let factory;
const currentFactory = () => factory();
beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  factory = makeFactory();
  useStore.setState((s) => {
    s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null;
    s.searchReturnFrame = null; s.navRequest = null;
    s.searchCorpusGeneration = 0; s.entryGenerations = {};
    // The primer pool and the library hydrate LAZILY, and both maps are part of the corpus — so their
    // arrival is a genuine corpus change that lands a few ticks after mount, at a moment nothing in
    // the test controls. Exact job counts cannot survive that. Marking them hydrated makes the corpus
    // move only when THIS test moves it; it is fixture setup, not a behaviour under test.
    s._primersHydrated = true; s._libraryHydrated = true;
  });
  // Distinct tags, so an executable `tag:` filter genuinely narrows the answer rather than decorating it.
  seed('a', 'alpha-ws', SEQ_A, ['kanamycin']);
  seed('b', 'beta-ws', SEQ_B, ['ampicillin']);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const mount = () => render(<LibraryWorkspace />);

/** search → click the first row → the REAL sink opens the molecule. Returns what it opened. */
async function searchAndOpen(query = `seq:${QUERY}`) {
  await typeQuery(query);
  const options = screen.getAllByRole('option');
  expect(options.length, 'the real search must produce rows to click').toBeGreaterThan(0);
  const labels = options.map((o) => o.getAttribute('id'));
  act(() => { fireEvent.click(options[0]); });
  await flush();
  return { labels, count: options.length };
}

describe('U5-B — Back through the real Workspace', () => {
  it('unchanged corpus: the same query, rows, active row and focus come back with ZERO new jobs', async () => {
    vi.useFakeTimers();
    mount();
    const { count, labels } = await searchAndOpen();

    // The REAL sink ran: a molecule is selected and the frame was captured for it.
    const frame = useStore.getState().searchReturnFrame;
    expect(frame, 'the production sink confirmed an open').toBeTruthy();
    expect(frame.entryId, 'the frame names the molecule that opened').toBeTruthy();
    // …and opening it did NOT age the corpus. This is the assertion the stubbed sink could not make:
    // the inspector's own writes are inside this window.
    expect(useStore.getState().searchCorpusGeneration).toBe(frame.generation);

    // While in the inspector the biologist types something else into the bar — the ordinary thing to
    // do, and the ONLY way the verbatim path is actually load-bearing. If the query still read the
    // same when Back is pressed, nothing in the search effect's dependencies would move and «0 jobs»
    // would be true by accident rather than by contract. Here the query really does change back, the
    // effect really does re-run, and the suppression is what has to stop the pass.
    await typeQuery('alpha');
    expect(jobsPosted(factory), 'the interposed query really did run').toBeGreaterThan(0);

    const jobsBefore = jobsPosted(factory);
    expect(backButton(), 'Back is offered for the molecule we came from').toBeTruthy();

    act(() => { fireEvent.click(backButton()); });
    await flush();
    act(() => { vi.advanceTimersByTime(300); });
    await flush();

    expect(jobsPosted(factory), 'an unchanged library is not searched again').toBe(jobsBefore);
    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(count);
    // The structured query survived: the same rows, in the same order, for the same molecules.
    // Compared by option id — the same molecules in the same order. Not by text: the restored row is
    // the ACTIVE one, so it legitimately renders its expanded locus card and the other does not.
    expect(rows.map((r) => r.getAttribute('id'))).toEqual(labels);
    // Focus and the active descendant are usable immediately — the button that had focus is gone.
    expect(document.activeElement).toBe(input());
    const active = input().getAttribute('aria-activedescendant');
    expect(active, 'the restored row is the active option').toBeTruthy();
    expect(document.getElementById(active), 'and it points at a row that exists').toBeTruthy();
    expect(backButton(), 'the frame is spent').toBeNull();
  });

  it('changed corpus costs exactly ONE pass in total — the hidden one is gone', async () => {
    vi.useFakeTimers();
    mount();
    await searchAndOpen();

    // Counting starts BEFORE the library changes and does not stop until Back has fully settled.
    // The earlier version of this test started counting after the change, which quietly forgave a
    // whole extra sweep: the search effect was keyed on the corpus generation, so a rename or an
    // import while the biologist sat in the inspector re-ran the entire pass behind a dropdown nobody
    // could see — and then Back ran another. Two megabase sweeps to look at one result once.
    const jobsBefore = jobsPosted(factory);

    // A molecule arrives while the biologist is in the inspector. Through the real store, so the real
    // watcher ages the real corpus.
    await act(async () => { seed('c', 'gamma-ws', `TTT${QUERY}AAA`); });
    expect(useStore.getState().searchCorpusGeneration)
      .toBeGreaterThan(useStore.getState().searchReturnFrame.generation);
    // Give a hidden pass every chance to start. Nothing must.
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush();
    expect(jobsPosted(factory) - jobsBefore, 'a parked frame goes stale; it does not buy a sweep').toBe(0);

    act(() => { fireEvent.click(backButton()); });
    await flush();
    act(() => { vi.advanceTimersByTime(300); });
    // The re-search is two-phase: metadata first, then the DNA provider confirms on the thread.
    await flush(); await flush(); await flush();
    act(() => { vi.advanceTimersByTime(300); });
    await flush(); await flush();

    expect(jobsPosted(factory) - jobsBefore, 'ONE pass for the whole episode').toBe(1);
    // The query survived as the STRUCTURED state: the `seq:` mode is consumed by the mode selector
    // and the motif stays in the field, which is exactly what the biologist left behind.
    expect(input().value).toBe(QUERY);
    // The re-search sees the new molecule, which is the whole reason it had to run.
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names.join(' ')).toContain('gamma-ws');
  });

  it('a NEW query over a STALE corpus costs exactly one pass — not two', async () => {
    vi.useFakeTimers();
    // A thread that does NOT answer until told to: the pass stays in flight across the renders that
    // follow, which is the only state in which a redundant run is actually paid for.
    factory = makeFactory(true);
    mount();

    await typeQuery(`seq:${QUERY}`);
    factory.drain(); await flush(); await flush();
    const rows = screen.getAllByRole('option');
    expect(rows.length, 'the first search answered').toBeGreaterThan(0);
    act(() => { fireEvent.click(rows[0]); });
    await flush();
    await settleCorpus();               // the lazy primer-pool hydration must not land mid-count
    const jobsBefore = jobsPosted(factory);

    // Parked, and the library moves underneath. Suppressed — nobody is looking.
    await act(async () => { seed('c', 'gamma-ws', `TTT${NEW_MOTIF}AAA`); });
    await settleJobs();
    expect(jobsPosted(factory) - jobsBefore, 'parked: no sweep').toBe(0);
    const genAfterSeed = useStore.getState().searchCorpusGeneration;

    // Now a DIFFERENT question, asked the way it arrives when the panel is SHUT: the tree's «Полный
    // поиск» seeds the bar directly. Typing into the bar would set `resultsOpen` in the same batch, so
    // the policy would consume the stale generation before any run and the race could not form. Here
    // the pass genuinely starts behind a closed dropdown and `onStart` opens it only afterwards — at
    // which point the policy wakes with `resultsOpen` true and a generation still marked unhandled.
    // Without `markCorpusCovered` it schedules one more run there; that run is superseded before it
    // reaches the thread, so what this exact count pins is «one worker job», and the guard's value is
    // that the pointless run is never scheduled in the first place.
    act(() => { fireEvent.change(screen.getByTestId('tree-search'), { target: { value: NEW_MOTIF } }); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('tree-full-search')); });
    await flush();
    await settleJobs();

    // Exact, and settled: a `> 0` here would have been satisfied by the very defect it must catch, and
    // a count taken before the debounce drained would have missed a duplicate that was already queued.
    // The premise is stated as an assertion, not assumed: the corpus moved exactly once (the seed) and
    // has not moved since. Without this a stray background write would turn a legitimate second pass
    // into a mysterious count failure.
    expect(useStore.getState().searchCorpusGeneration, 'the corpus moved exactly once, by this test')
      .toBe(genAfterSeed);
    expect(jobsPosted(factory) - jobsBefore, 'one new question, one pass').toBe(1);

    // …and the answer belongs to the NEW query AND the CURRENT corpus: the molecule that arrived while
    // the panel was shut is in it, and it is there because this motif matched it.
    factory.drain(); await flush(); await flush();
    const names = screen.getAllByRole('option').map((o) => o.textContent).join(' ');
    expect(names, 'the molecule added during the parked window is searched').toContain('gamma-ws');
    expect(input().value, 'the rows describe the query on screen').toBe(NEW_MOTIF);
    expect(useStore.getState().searchReturnFrame, 'Back was never pressed; the frame is untouched').toBeTruthy();
  });

  it('with the list actually OPEN, a library change still refreshes it', async () => {
    vi.useFakeTimers();
    mount();
    await typeQuery(`seq:${QUERY}`);           // results visible, nothing opened, no frame
    const before = screen.getAllByRole('option').length;
    const jobsBefore = jobsPosted(factory);

    await act(async () => { seed('c', 'gamma-ws', `TTT${QUERY}AAA`); });
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush(); await flush();

    expect(jobsPosted(factory), 'a visible list must not describe a library that changed').toBeGreaterThan(jobsBefore);
    const names = screen.getAllByRole('option').map((o) => o.textContent).join(' ');
    expect(names).toContain('gamma-ws');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(before);
  });

  it('a panel dismissed WITHOUT a pick is just as parked — no sweep, and no pop-open', async () => {
    vi.useFakeTimers();
    mount();
    await typeQuery(`seq:${QUERY}`);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    // The biologist walks away from the dropdown WITHOUT clicking a row — Escape, or a click on the
    // tree. No frame is captured, and the query stays in the bar. Gating the policy on «is there a
    // frame for this query» instead of «is anyone looking» made this the worst case of all: every
    // later save ran a full corpus pass behind a closed panel AND `onStart` re-opened that panel over
    // the molecule being read, on the biologist's own autosave.
    act(() => { fireEvent.keyDown(input(), { key: 'Escape' }); });
    await flush();
    expect(screen.queryAllByRole('option'), 'the list really is dismissed').toHaveLength(0);
    expect(useStore.getState().searchReturnFrame, 'and nothing was captured').toBeNull();
    const jobsBefore = jobsPosted(factory);

    await act(async () => { seed('c', 'gamma-ws', `TTT${QUERY}AAA`); });
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush();

    expect(jobsPosted(factory) - jobsBefore, 'nobody is looking: no sweep').toBe(0);
    expect(screen.queryAllByRole('option'), 'and the panel does not re-open by itself').toHaveLength(0);
  });

  it('reopening the list by KEYBOARD — not Back — still refreshes it exactly once', async () => {
    vi.useFakeTimers();
    mount();
    await searchAndOpen();
    const jobsBefore = jobsPosted(factory);

    // Parked behind a navigation, the library changes. Suppressed, correctly.
    await act(async () => { seed('c', 'gamma-ws', `TTT${QUERY}AAA`); });
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush();
    expect(jobsPosted(factory) - jobsBefore).toBe(0);

    // …and now they reopen the list the OTHER way: ArrowDown in the field. Back is not the only route
    // home, and it is the only one that compares the frame's generation. If the suppressed transition
    // had been consumed, this list would render rows describing a library that no longer exists — as
    // confirmed, selectable results — and nothing would ever refresh them.
    act(() => { fireEvent.keyDown(input(), { key: 'ArrowDown' }); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush(); await flush();

    expect(jobsPosted(factory) - jobsBefore, 'exactly one pass, paid when someone is looking').toBe(1);
    const names = screen.getAllByRole('option').map((o) => o.textContent).join(' ');
    expect(names, 'the refreshed list knows about the new molecule').toContain('gamma-ws');
  });

  it('a row that DISAPPEARED leaves no dangling active descendant', async () => {
    vi.useFakeTimers();
    mount();
    await searchAndOpen();
    const frame = useStore.getState().searchReturnFrame;

    // The molecule they opened is deleted while they are looking at it.
    await act(async () => {
      useStore.setState((s) => { const next = { ...s.libraryEntries }; delete next[frame.entryId]; s.libraryEntries = next; });
    });
    act(() => { fireEvent.click(backButton()); });
    await flush();
    act(() => { vi.advanceTimersByTime(300); });
    await flush();
    await flush();

    const rows = screen.queryAllByRole('option');
    expect(rows.every((r) => !r.textContent.includes(frame.rows[0].title || 'alpha-ws'))
      || rows.length < frame.rows.length, 'the deleted molecule is not among the rows').toBe(true);
    const active = input().getAttribute('aria-activedescendant');
    // Either nothing is active, or what is active really exists. Never a stale id.
    if (active) expect(document.getElementById(active)).toBeTruthy();
    if (rows.length) {
      act(() => { fireEvent.keyDown(input(), { key: 'ArrowDown' }); });
      const afterArrow = input().getAttribute('aria-activedescendant');
      expect(document.getElementById(afterArrow), 'ArrowDown lands on a real row').toBeTruthy();
    }
  });
});

describe('U5-B — a restored search really is the one that was left', () => {
  /**
   * The frame test below asserts SHAPE — that a `queryState` object with a `filters` array travelled.
   * Shape is not restoration. This drives a real provider mode AND a real executable filter through
   * the workspace, checks the filter actually changes the answer, and then proves the mode, the chip,
   * its value and the rows all come back — with no new work.
   *
   * `tag:` is used deliberately: `in:` is still parse-only in the prefix registry, so a query carrying
   * it is blocked, produces no rows, and could never capture a frame in the first place.
   */
  const modeLabel = () => screen.getByTestId('search-mode-trigger').textContent.trim();
  /**
   * The chips are rendered as plain leaf spans inside the field (no testid of their own), so they are
   * read the way the biologist reads them — by the VALUE they carry. That is the part that has to
   * survive: a chip restored without its value would filter nothing and still look right.
   */
  const chips = () => [...document.querySelectorAll('[data-testid="library-topbar-search-wrap"] span')]
    .filter((e) => e.children.length === 0 && /kanamycin|ampicillin|linear|circular/.test(e.textContent))
    .map((e) => e.textContent.trim());

  it('the mode, the chip and its value come back — and the chip still filters', async () => {
    vi.useFakeTimers();
    mount();

    // Same motif in both molecules, so ONLY the tag can be doing the narrowing.
    await typeQuery(`seq:${QUERY}`);
    const unfiltered = screen.getAllByRole('option').map((o) => o.textContent);
    expect(unfiltered.length, 'both molecules carry the motif').toBe(2);

    // TWO executable filters, added in this order. The canonical string re-serialises them in
    // registry order (`tag` before `type`), so a restore that goes through text alone comes back with
    // the biologist's chips swapped — which is why the order is asserted below and not just the set.
    await typeQuery(`${QUERY} type:linear tag:kanamycin`); // bare motif under the mode already selected
    const filtered = screen.getAllByRole('option').map((o) => o.textContent);
    expect(filtered.length, 'the executable filter really narrows the set').toBe(1);
    expect(filtered.join(' ')).toContain('alpha-ws');
    expect(filtered.join(' ')).not.toContain('beta-ws');

    const modeBefore = modeLabel();
    const chipsBefore = chips();
    expect(chipsBefore.join(' '), 'the chip carries its VALUE, not just its name').toContain('kanamycin');
    expect(chipsBefore.length, 'both filters are on screen').toBe(2);
    const rowsBefore = screen.getAllByRole('option').map((o) => o.getAttribute('id'));

    // Open the molecule, then change the question entirely while inside it.
    act(() => { fireEvent.click(screen.getAllByRole('option')[0]); });
    await flush();
    expect(useStore.getState().searchReturnFrame, 'a real frame was captured').toBeTruthy();
    // Wipe the question entirely — the field's own «clear» resets the mode AND the filters. Typing a
    // different motif would not do: committed chips are sticky, so the chip would still be on screen
    // afterwards and its «restoration» would prove nothing.
    act(() => { fireEvent.click(screen.getByTestId('library-topbar-search-clear')); });
    await flush();
    expect(chips(), 'the chip is really gone before Back').toEqual([]);
    expect(input().value).toBe('');
    const jobsBefore = jobsPosted(factory);

    act(() => { fireEvent.click(backButton()); });
    await flush();
    act(() => { vi.advanceTimersByTime(400); });
    await flush(); await flush();

    // Everything the biologist left: the provider mode, the chip with its value, the rows, the active
    // row — and not one new pass, because the library never moved.
    expect(modeLabel(), 'the provider MODE is restored').toBe(modeBefore);
    // ORDER included: the chips come back as the biologist arranged them. Re-parsing the canonical
    // text would return the same two chips the other way round.
    expect(chips(), 'the chips, their values AND their order are restored').toEqual(chipsBefore);
    expect(input().value, 'the canonical query is restored').toBe(QUERY);
    const rowsAfter = screen.getAllByRole('option');
    expect(rowsAfter.map((r) => r.getAttribute('id'))).toEqual(rowsBefore);
    expect(rowsAfter.map((r) => r.textContent).join(' ')).not.toContain('beta-ws');
    const active = input().getAttribute('aria-activedescendant');
    expect(document.getElementById(active), 'the active row exists').toBeTruthy();
    expect(jobsPosted(factory) - jobsBefore, 'an unchanged library is not searched again').toBe(0);
  });
});

describe('U5-B — the restored frame carries the whole search, not just its text', () => {
  it('the session verdict travels with the rows', async () => {
    vi.useFakeTimers();
    mount();
    await searchAndOpen();
    const frame = useStore.getState().searchReturnFrame;
    expect(frame.session, 'a frame without a verdict would restore a silent «all confirmed»').toBeTruthy();
    expect(frame.session).toMatchObject({ incomplete: false, blocked: false });
    expect(frame.queryState, 'the STRUCTURED query — mode and filters, not a string to re-parse').toBeTruthy();
    expect(Array.isArray(frame.queryState.filters)).toBe(true);
  });

  it('the store keeps the frame SERIALISABLE — no worker, promise, DOM node or function', async () => {
    vi.useFakeTimers();
    mount();
    await searchAndOpen();
    const frame = useStore.getState().searchReturnFrame;
    const offenders = [];
    const walk = (v, path, depth) => {
      if (depth > 6 || v == null) return;
      if (typeof v === 'function') { offenders.push(`${path}: function`); return; }
      if (typeof v !== 'object') return;
      if (v instanceof Promise) { offenders.push(`${path}: Promise`); return; }
      if (typeof Node !== 'undefined' && v instanceof Node) { offenders.push(`${path}: DOM`); return; }
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, depth + 1);
    };
    walk(frame, 'frame', 0);
    expect(offenders).toEqual([]);
  });
});
