/**
 * REV #2 — S3-CLOSE / K2.4: the search bar tells the truth about a FAILED biological check.
 *
 * The invariant a biologist depends on: «Ничего не найдено» may appear ONLY after a check that
 * actually completed. When the DNA/protein/cut engine did not run, the bar must say so, name
 * WHICH check failed, and never present the surviving metadata candidates as confirmed results.
 *
 * Sequence failures are driven through a controllable worker (real transport). Protein and cut
 * run inline with no async seam, so their engines are mocked — what is under test here is the
 * bar's state machine, not the biology.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';
import { recordingFactory } from '../../../lib/__tests__/helpers/search-worker-fakes';
import { setLang } from '../../../i18n';

const stub = vi.hoisted(() => ({ protein: 'hit', cut: 'hit' }));
vi.mock('../../../lib/protein-match', () => ({
  makeProteinMatch: () => {
    if (stub.protein === 'factory-throw') throw new Error('cannot build the translator');
    return () => {
      if (stub.protein === 'matcher-throw') throw new Error('protein engine boom');
      if (stub.protein === 'miss') return [];
      return [{ location: { segments: [{ start: 0, end: 12 }], strand: '+', wrapsOrigin: false } }];
    };
  },
}));
vi.mock('../../../lib/re-match', () => ({
  makeReMatch: () => {
    if (stub.cut === 'factory-throw') throw new Error('cannot build the enzyme registry');
    return () => {
      if (stub.cut === 'matcher-throw') throw new Error('cut scan boom');
      if (stub.cut === 'miss') return [];
      return [{ location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false } }];
    };
  },
}));

const NO_MOTIF = 'AAAACCCCGGGGTTTT';
const WITH_MOTIF = 'AAAGAATTCCCC';

const makeFactory = recordingFactory;
const lastWorker = (f) => f.workers[f.workers.length - 1];
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

function seed(id, name, sequence) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [],
      payload: { sequence, length: sequence.length, topology: 'circular', annotations: [] },
    };
  });
}
const warning = () => screen.queryByTestId('search-provider-incomplete-warning');
const headerText = () => screen.getByTestId('library-topbar-search-header').textContent;

beforeEach(() => {
  stub.protein = 'hit'; stub.cut = 'hit';
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); setLang('ru'); });

describe('K2.4 — a failed check names ITS OWN dimension (never DNA-for-everything)', () => {
  it('a DNA worker crash names «ДНК»', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(warning().textContent).toContain('ДНК');
    expect(warning().textContent).toContain('Проверка не выполнена');
  });

  it('a PROTEIN engine failure names «белок» — not the DNA text', async () => {
    vi.useFakeTimers();
    stub.protein = 'matcher-throw';
    seed('puc', 'pUC19', NO_MOTIF);
    renderTopBar({ query: 'aa:HXHH pUC', workerFactory: makeFactory() });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(warning().textContent).toContain('белок');
    expect(warning().textContent).not.toContain('последовательности не выполнен');
  });

  it('a CUT-SITE scan failure names «сайты рестрикции»', async () => {
    vi.useFakeTimers();
    stub.cut = 'factory-throw';
    seed('puc', 'pUC19', NO_MOTIF);
    renderTopBar({ query: 'cut:EcoRI pUC', workerFactory: makeFactory() });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(warning().textContent).toContain('сайты рестрикции');
  });

  it('the dimension comes from the SESSION, not from re-parsing the query', async () => {
    vi.useFakeTimers();
    stub.protein = 'hit'; // the protein engine is healthy…
    seed('puc', 'pUC19', NO_MOTIF);
    renderTopBar({ query: 'aa:HXHH pUC', workerFactory: makeFactory() });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(warning()).toBeNull(); // …so an `aa:` query alone must NOT warn
  });
});

describe('K2.4 — «nothing found» only after a COMPLETED check', () => {
  it('a completed miss shows «Ничего не найдено» and no warning', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).flushLast(); }); // engine ran; motif genuinely absent
    await flush();
    expect(warning()).toBeNull();
    expect(screen.getByText('Ничего не найдено.')).toBeTruthy();
  });

  it('an INCOMPLETE final with no rows never says «Ничего не найдено» and never shows «· 0»', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTC', workerFactory: factory }); // pure provider → no metadata rows
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(screen.queryByText('Ничего не найдено.')).toBeNull();
    expect(warning().textContent).toContain('Отсутствие совпадений не подтверждено');
    expect(headerText()).not.toContain('· 0');
  });

  it('a malformed worker reply is a FAILURE, not a proven absence', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const w = lastWorker(factory);
    act(() => { w.replyToJob(w.lastJobId(), { byId: null }); }); // malformed, aimed at the real job
    await flush();
    expect(screen.queryByText('Ничего не найдено.')).toBeNull();
    expect(warning()).toBeTruthy();
  });
});

describe('K2.4 — an unconfirmed candidate is labelled and unopenable', () => {
  it('during the partial phase the row is badged «Проверяется»', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(screen.getByTestId('smart-result-puc-status').textContent).toBe('Проверяется');
  });

  it('after a FAILED final the row is badged «Не подтверждено» and cannot be opened', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    const onPick = vi.fn();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory, onPickSearchResult: onPick });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();

    const row = screen.getByTestId('smart-result-puc');
    expect(screen.getByTestId('smart-result-puc-status').textContent).toBe('Не подтверждено');
    expect(row.closest('[role="option"]').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    const input = screen.getByTestId('library-topbar-search-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
    expect(warning().textContent).toContain('открыть их нельзя');
  });

  it('a CONFIRMED row carries no status badge and is selectable', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    const onPick = vi.fn();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory, onPickSearchResult: onPick });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).flushLast(); });
    await flush();
    expect(screen.queryByTestId('smart-result-puc-status')).toBeNull();
    fireEvent.click(screen.getByTestId('smart-result-puc'));
    expect(onPick).toHaveBeenCalled();
  });

  it('a plain metadata result is never badged or blocked', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const onPick = vi.fn();
    renderTopBar({ query: 'pUC', workerFactory: makeFactory(), onPickSearchResult: onPick });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(screen.queryByTestId('smart-result-puc-status')).toBeNull();
    fireEvent.click(screen.getByTestId('smart-result-puc'));
    expect(onPick).toHaveBeenCalled();
  });
});

describe('K2.4 — transitions', () => {
  it('failed A → healthy retry A: the warning disappears and the row confirms', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(warning()).toBeTruthy();

    // the user retypes the same query → a fresh worker answers normally
    rerender({ query: 'mol:pUC seq:GAATTG', workerFactory: factory });
    rerender({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).flushLast(); });
    await flush();
    expect(warning()).toBeNull();
    expect(screen.getByTestId('smart-result-puc')).toBeTruthy();
    expect(screen.queryByTestId('smart-result-puc-status')).toBeNull();
  });

  it('failed A → a DIFFERENT provider B: no stale dimension leaks into B', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(warning().textContent).toContain('ДНК');

    stub.protein = 'matcher-throw'; // B fails on a different dimension
    rerender({ query: 'aa:HXHH pUC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(warning().textContent).toContain('белок');
    expect(warning().textContent).not.toContain('ДНК');
  });

  it('failed A → clear: the warning vanishes with the query', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(warning()).toBeTruthy();
    rerender({ query: '', workerFactory: factory });
    expect(warning()).toBeNull();
  });

  it('a cancelled search never warns (superseded ≠ failed)', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    const { rerender } = renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    const worker = lastWorker(factory);
    rerender({ query: 'mol:pUC seq:GAATTG', workerFactory: factory }); // asks A to stop
    act(() => { vi.advanceTimersByTime(200); });

    // C2.2: B is HELD until A acknowledges — so the ack has to happen for B to run at all. The
    // point of the test is unchanged: a superseded search is dropped, never reported as a failure.
    expect(worker.cancels.length).toBe(1);
    expect(worker.terminated, 'a supersede is not a fault').toBe(false);
    act(() => { worker.ackCancel(); });
    await flush();
    act(() => { worker.flushLast(); });
    await flush();
    expect(warning()).toBeNull(); // A was dropped, not failed
    expect(factory.workers.length, 'the same healthy thread served both queries').toBe(1);
  });
});

// ── K2 corrective P1-2 ────────────────────────────────────────────────────────────────────
// A number beside the search box is a CLAIM. «3» means «three molecules carry this motif», and a
// screen-reader user hears nothing but that claim. So the count must follow the state of the
// CHECK, not the length of an array: results only after a completed check, candidates while it is
// pending or failed, and no number at all when there is nothing honest to count.
describe('K2 corrective (P1-2) — the count follows the state of the check', () => {
  const liveRegion = () => screen.queryByTestId('library-topbar-search-count-live');

  it('a pure seq: query shows NO count while the worker is still checking', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush(); // metadata partial landed; the worker has NOT answered
    expect(headerText()).not.toContain('· 0');
    expect(liveRegion()).toBeNull(); // nothing announced either
  });

  it('a BLOCKED query shows no count at all', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    renderTopBar({ query: 'enz:Bsa seq:GAATTC', workerFactory: makeFactory() });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(screen.getByTestId('search-blocked-notice')).toBeTruthy();
    expect(headerText()).not.toMatch(/·\s*\d/);
    expect(liveRegion()).toBeNull();
  });

  it('an INCOMPLETE final with a candidate announces CANDIDATES, not results', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(screen.getByTestId('smart-result-puc')).toBeTruthy();
    expect(liveRegion().textContent).toMatch(/кандидат/i);
    expect(liveRegion().textContent).not.toMatch(/результат/i);
    expect(headerText()).toContain('· 1'); // the number itself is honest — its LABEL carries the caveat
  });

  it('a COMPLETE miss still shows the honest zero (both visually and to a screen reader)', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).flushLast(); }); // the check COMPLETED and found nothing
    await flush();
    expect(headerText()).toContain('· 0');
    expect(liveRegion().textContent).toMatch(/Результатов: 0/);
  });

  it('a COMPLETE hit announces RESULTS', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).flushLast(); });
    await flush();
    expect(liveRegion().textContent).toMatch(/Результатов: 1/);
    expect(headerText()).not.toMatch(/кандидат/i);
  });

  it('an INCOMPLETE final with NO rows announces nothing at all', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTC', workerFactory: factory }); // pure provider → no metadata rows
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expect(warning()).toBeTruthy();
    expect(headerText()).not.toContain('· 0');
    expect(liveRegion()).toBeNull();
  });
});

// ── K3.2 §7.4 — one owner of the announcement ─────────────────────────────────────────────
// A screen-reader user gets ONE spoken account of the search. Before K3 the incomplete warning
// was a role="alert" nested inside the listbox's role="status" aria-live region: two announcers
// in one subtree, so the same failure could be read twice or out of order — and the listbox could
// independently render «nothing found» while the bar had already concluded «not verified».
describe('K3.2 (§7.4) — the result area has exactly one status owner', () => {
  const area = () => screen.getByTestId('library-topbar-search-listbox-results');
  const status = () => screen.getByTestId('library-topbar-search-listbox-status');

  const expectSingleAnnouncer = () => {
    const live = area().querySelectorAll('[aria-live]');
    expect(live.length).toBe(1);
    expect(live[0].getAttribute('role')).toBe('status');
    expect(live[0].getAttribute('aria-live')).toBe('polite');
    expect(area().querySelectorAll('[role="alert"]').length).toBe(0);
    // no live region nested inside another
    expect(area().querySelectorAll('[aria-live] [aria-live]').length).toBe(0);
  };

  it('a FAILED check: one status region, no alert, no nesting', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', WITH_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expectSingleAnnouncer();
    expect(status().textContent).toMatch(/Проверка не выполнена/);
    // …and the states are mutually exclusive: no «nothing found» beside it
    expect(status().textContent).not.toMatch(/Ничего не найдено/);
  });

  it('a BLOCKED query: one status region, and it is the blocked notice alone', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    renderTopBar({ query: 'enz:Bsa seq:GAATTC', workerFactory: makeFactory() });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expectSingleAnnouncer();
    expect(status().textContent).not.toMatch(/Ничего не найдено|Проверка не выполнена/);
  });

  it('a COMPLETE miss: empty in the status, honest 0 in the SIBLING count region (not nested)', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).flushLast(); });
    await flush();
    expectSingleAnnouncer();
    expect(status().textContent).toMatch(/Ничего не найдено/);
    // the count lives in SearchField — a sibling live region, never inside the result status
    const count = screen.getByTestId('library-topbar-search-count-live');
    expect(count.textContent).toMatch(/Результатов: 0/);
    expect(area().contains(count)).toBe(false);
  });

  it('an INCOMPLETE final with zero rows gives NEITHER a result count NOR «nothing found»', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    expectSingleAnnouncer();
    expect(status().textContent).not.toMatch(/Ничего не найдено/);
    expect(screen.queryByTestId('library-topbar-search-count-live')).toBeNull();
  });

  it('while CHECKING: aria-busy is set and the status says so — never «nothing found»', async () => {
    vi.useFakeTimers();
    seed('puc', 'pUC19', NO_MOTIF);
    renderTopBar({ query: 'seq:GAATTC', workerFactory: makeFactory() });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    expect(area().getAttribute('aria-busy')).toBe('true');
    expectSingleAnnouncer();
    expect(status().textContent).toMatch(/Проверяем биологическое совпадение/);
    expect(status().textContent).not.toMatch(/Ничего не найдено/);
  });
});

describe('K2.4 — the warning is localized', () => {
  it('EN renders the English provider name, not a raw i18n key', async () => {
    vi.useFakeTimers();
    setLang('en');
    seed('puc', 'pUC19', NO_MOTIF);
    const factory = makeFactory();
    renderTopBar({ query: 'mol:pUC seq:GAATTC', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { lastWorker(factory).crash(); });
    await flush();
    const text = warning().textContent;
    expect(text).toContain('DNA');
    expect(text).not.toContain('search.provider'); // a missing key would echo verbatim
    expect(text).not.toContain('{providers}');
  });
});
