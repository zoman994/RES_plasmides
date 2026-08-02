/**
 * Ctrl+F in a molecule must be the SAME search as the global one, on the SAME worker (U4).
 *
 * Until now the popover called the legacy `searchSequence` synchronously inside a `useMemo`: it ran
 * during render, on the UI thread, on a different engine from every other surface. The second half
 * is what matters biologically — the same query on the same molecule could answer differently here
 * than in the global bar, and a biologist has no way to tell which answer is right.
 *
 * Parity is asserted against the WORKER CORE itself, never against remembered numbers: a golden
 * constant would freeze today's engine, whereas comparing to the engine keeps the two surfaces
 * welded as it evolves.
 *
 * The canonical unit is the OCCURRENCE — `location.segments`, `location.strand`, `metrics`. Three
 * live defects come from flattening it early, and each has a contract below:
 *   • the host turns a circular hit into ONE range, losing the second segment;
 *   • the row renders any strand that is not `-1` as `+`, so a palindrome reads as plus-only;
 *   • `target.slice(start, end)` shows the wrong bases for an origin-crossing hit.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../store';
import { handleSearchMessage, searchAllSequences } from '../../lib/search-worker-core';
import SequenceSearchPopover from '../SequenceSearchPopover';
import SequenceSearchHost from '../Library/SequenceSearchHost';
import SequenceSearchProvider from '../SequenceSearchProvider';
import { useSequenceSearchChannel } from '../sequence-search-context';

const QUERY = 'GAATTGCCC';
const PLUS = 'AAAGAATTGCCCTTTAAACCCGGGTTTAAACCCGGGTTTAAACCCGGG';
/** `GAATTGCCC` straddles the join: the tail holds `AAAGAA`, the head continues `TTGCCC`. */
const WRAP = `TTGCCC${'ACGTACGTAC'.repeat(4)}AAAGAA`;
/** Palindromic: its own reverse complement, so one locus is a hit on BOTH strands. */
const PALINDROME = 'GGAATTCC';
const PAL_TARGET = `TTTAAACCC${PALINDROME}TTTAAACCCGGGTTTAAA`;

function makeFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      // U4-CANCEL C2 — `cancel` is a control frame; a cooperative worker acks after unwinding.
      postMessage(msg) {
        w.posted.push(msg);
        if (msg && msg.type === 'cancel') {
          Promise.resolve().then(() => w.onmessage?.({ data: { id: msg.id, cancelled: true } }));
        }
      },
      get jobs() { return w.posted.filter((m) => !m || m.type !== 'cancel'); },
      /** Answer for real, through the same core the production worker runs. */
      replyLast() {
        const m = w.jobs[w.jobs.length - 1];
        if (m) w.onmessage?.({ data: handleSearchMessage(m) });
      },
      replyWith(error) {
        const m = w.posted[w.posted.length - 1];
        w.onmessage?.({ data: { id: m?.id, error } });
      },
      crash() { w.onerror?.({ message: 'boom' }); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
const last = (f) => f.workers[f.workers.length - 1];
/** Mirrors the popover's row key: segments (both wrap segments) AND strand, so a + and a − hit at the
 * same locus are two distinct keys. */
const occurrenceKey = (occ) => `${(occ.location.segments || []).map((s) => `${s.start}_${s.end}`).join('-')}@${occ.location.strand}`;

/** A canonical 9-mer occurrence at [0,9) on a given strand — used to craft a same-locus +/− reply. */
const occAt = (strand) => ({
  location: { segments: [{ start: 0, end: 9 }], strand, wrapsOrigin: false },
  metrics: {
    length: 9, queryLength: 9, alignmentLength: 9, targetSpan: 9, identity: 1, coverage: 1,
    exactMatches: 9, substitutions: 0, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, identityBps: 10000,
  },
});
/** A factory that answers with a HAND-CRAFTED byId (bypasses the core), for shapes the real engine
 * won't produce on demand — e.g. two occurrences sharing a locus on opposite strands. */
function makeReplyFactory(byId) {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: false,
      postMessage(m) {
        w.posted.push(m);
        if (m && m.type === 'cancel') {
          Promise.resolve().then(() => w.onmessage?.({ data: { id: m.id, cancelled: true } }));
        }
      },
      get jobs() { return w.posted.filter((x) => !x || x.type !== 'cancel'); },
      replyLast() { const m = w.jobs[w.jobs.length - 1]; if (m) w.onmessage?.({ data: { id: m.id, byId } }); },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}
/**
 * The worker currently doing the work — asserted, not assumed. Reaching straight into
 * `liveWorker().posted` turns «no pass was ever started» into a TypeError, which reads like a
 * broken test rather than the missing behaviour it actually is.
 */
const liveWorker = () => {
  expect(factory.workers.length, 'a search pass must have been started').toBeGreaterThan(0);
  return last(factory);
};
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const settle = () => { act(() => { vi.advanceTimersByTime(300); }); };

let factory;
/**
 * Stands in for the global bar: it holds the `global` channel exactly as the facade will in
 * production. Deliberately NOT a mock of ownership — it exercises the real channel, so a test that
 * passes here says something about how the two owners actually share the worker.
 *
 * (A separate contract still has to prove the REAL facade is handed this channel; proving the API
 * is not the same as proving the wiring.)
 */
let globalChannel = null;
function GlobalDriver() {
  const ch = useSequenceSearchChannel('global');
  // Exposed via an effect, not reassigned during render (the channel is stable, so this runs once).
  React.useEffect(() => { globalChannel = ch; }, [ch]);
  return null;
}

const popoverProps = (over = {}) => ({
  open: true,
  entryId: 'e1',
  targetName: 'pTest',
  targetSequence: PLUS,
  targetTopology: 'linear',
  ...over,
});
/**
 * Always through the real Provider. Injecting a factory into the component would test a seam that
 * does not exist in production — and ownership is exactly what these contracts are about.
 */
const wrap = (ui) => <SequenceSearchProvider workerFactory={factory}>{ui}</SequenceSearchProvider>;
const show = (over) => render(wrap(<SequenceSearchPopover {...popoverProps(over)} />));
const type = (value) => act(() => {
  fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value } });
});
/** The ctx the popover posts at its default 80% slider — parity is «same query, same params». */
const CTX = { identityThreshold: 0.8, bothStrands: true };
/** What the engine says about the exact document the popover is looking at, at the popover's ctx. */
// The sweep answers with a LOCUS ENVELOPE per document (P1-2/P1-3) — the retained window plus the
// true locus count and the canonical winner. Parity is about the occurrences, so unwrap them here.
const engineHits = (query, seq, topology) => (
  searchAllSequences(query, [{ id: 'e1', seq, topology }], CTX).e1 || { occurrences: [] }
).occurrences;

beforeEach(() => {
  factory = makeFactory();
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.searchHits = { entryId: null, query: '', hits: [] }; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('SequenceSearchPopover — the search leaves the UI thread', () => {
  it('the query reaches the worker, carrying the molecule’s TOPOLOGY and not just its bases', async () => {
    vi.useFakeTimers();
    show({ targetSequence: WRAP, targetTopology: 'circular' });
    type(QUERY);
    settle();
    await flush();

    const [doc] = liveWorker().posted[0].docs;
    expect(liveWorker().posted[0].seqQuery).toBe(QUERY);
    expect(doc.seq).toBe(WRAP);
    expect(doc.topology, 'a circular molecule must be searched as one').toBe('circular');
  });

  it('while the check runs it claims NOTHING — least of all «nothing found»', async () => {
    vi.useFakeTimers();
    show();
    type(QUERY);
    settle();
    await flush();

    expect(screen.queryByTestId('sequence-search-hit-count')).toBeNull();
    // The distinction the whole projection exists for: a pending check is not a proven absence.
    expect(screen.queryByTestId('sequence-search-empty')).toBeNull();
    expect(screen.getByTestId('sequence-search-checking')).toBeTruthy();
  });
});

describe('SequenceSearchPopover — parity with the global engine', () => {
  it('plus strand: the FULL occurrence the engine produced — location AND every metric', async () => {
    vi.useFakeTimers();
    const onJumpTo = vi.fn();
    show({ onJumpTo });
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    const expected = engineHits(QUERY, PLUS, 'linear');
    expect(expected.length).toBeGreaterThan(0);
    const rows = screen.getAllByTestId(/^search-hit-/);
    expect(rows).toHaveLength(expected.length);

    // FULL comparison via the real click path — not a decorative `undefined === undefined`. The
    // occurrence handed to the jump is the engine's own: whole `location`, whole `metrics`.
    const [occ] = expected;
    act(() => { fireEvent.click(screen.getByTestId(`search-hit-${occurrenceKey(occ)}`)); });
    const jumped = onJumpTo.mock.calls[0][0];
    expect(jumped.location).toEqual(occ.location);
    expect(jumped.metrics).toEqual(occ.metrics);

    // …and the row DISPLAYS the numbers, locked to the engine: identityBps % at basis-point
    // precision (TWO decimals), M/L, X·I·D, gap-events, explicit half-open coordinates.
    const row = screen.getByTestId(`search-hit-${occurrenceKey(occ)}`);
    expect(row.textContent).toContain(`${(occ.metrics.identityBps / 100).toFixed(2)}%`);
    expect(row.textContent).toContain(`${occ.metrics.exactMatches}/${occ.metrics.alignmentLength}`);
    // Labelled, not a bare «0·0·0»: the words are in the DOM (U5-A), so a keyboard user and a screen
    // reader get the meaning too. Still locked to the engine's own three numbers.
    expect(row.querySelector('[data-testid="hitcell-xid"]').textContent).toBe(
      `замен: ${occ.metrics.substitutions} · вставок: ${occ.metrics.insertions} · делеций: ${occ.metrics.deletions}`,
    );
    expect(row.querySelector('[data-testid="hitcell-gaps"]').textContent).toContain(String(occ.metrics.indelEvents));
    expect(row.querySelector('[data-testid="hitcell-coords"]').textContent)
      .toBe(occ.location.segments.map((s) => `[${s.start}, ${s.end})`).join(' + ')); // explicit 0-based half-open

    // The searchHits slice now carries the CANONICAL occurrences themselves (the Overlay reads
    // `location.segments`/`location.strand`/`metrics.identityBps` directly) — no flat projection.
    const { hits } = useStore.getState().searchHits;
    expect(hits).toEqual(expected);
    expect(hits.every((h) => h.location && h.metrics)).toBe(true);

    // No alignment internals leak into a result — no fragment, no edit script, no mismatch overlay.
    expect(jumped.metrics.editRuns).toBeUndefined();
    expect(jumped.metrics.script).toBeUndefined();
    expect(jumped.metrics.mismatchPositions).toBeUndefined();
    expect(screen.getByTestId('sequence-search-results').textContent).not.toContain(PLUS.slice(3, 12));
  });

  it('a palindrome is reported on BOTH strands, and the SPECIFIC both-strand row stays ±', async () => {
    vi.useFakeTimers();
    const onJumpTo = vi.fn();
    show({ targetSequence: PAL_TARGET, onJumpTo });
    type(PALINDROME);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    const expected = engineHits(PALINDROME, PAL_TARGET, 'linear');
    const both = expected.find((o) => o.location.strand === 'both');
    expect(both, 'fixture must be palindromic').toBeTruthy();

    // Target the both-strand hit by its stable segment key — its OWN row must read «±», not «+».
    const row = screen.getByTestId(`search-hit-${occurrenceKey(both)}`);
    expect(row.querySelector('[data-testid="hitcell-strand"]').textContent).toBe('±');
    // …and clicking it hands the both-strand occurrence to the jump, unflattened.
    act(() => { fireEvent.click(row); });
    expect(onJumpTo.mock.calls[0][0].location.strand).toBe('both');
  });

  it('the identity slider reaches the worker as identityThreshold (95% → 0.95)', async () => {
    vi.useFakeTimers();
    show();
    fireEvent.change(screen.getByTestId('sequence-search-threshold'), { target: { value: '95' } });
    type(QUERY);
    settle();
    await flush();
    expect(liveWorker().posted[0].ctx.identityThreshold).toBeCloseTo(0.95, 10);
  });

  it('a genuine miss is an HONEST empty — distinct from pending and from incomplete', async () => {
    vi.useFakeTimers();
    show({ targetSequence: 'TTTTTTTTTTTTTTTTTTTTTTTT' }); // holds no GAATTGCCC
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    expect(screen.getByTestId('sequence-search-empty')).toBeTruthy();
    expect(screen.queryByTestId('sequence-search-checking')).toBeNull();
    expect(screen.queryByTestId('sequence-search-incomplete')).toBeNull();
    expect(screen.queryAllByTestId(/^search-hit-/)).toHaveLength(0);
  });
});

describe('SequenceSearchHost — a circular hit keeps every segment', () => {
  it('clicking an origin-crossing hit navigates to BOTH segments, not one merged range', async () => {
    vi.useFakeTimers();
    const nav = vi.fn();
    useStore.setState((s) => { s.requestSequenceNav = nav; });
    const item = { id: 'e1', name: 'pRing', sequence: WRAP, topology: 'circular' };
    useStore.setState((s) => { s.modals = { ...(s.modals || {}), sequenceSearch: true }; });

    render(wrap(<SequenceSearchHost item={item} />));
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    const expected = engineHits(QUERY, WRAP, 'circular');
    const wrapped = expected.find((o) => o.location.wrapsOrigin);
    expect(wrapped, 'the fixture must actually straddle the origin').toBeTruthy();
    expect(wrapped.location.segments.length).toBe(2);

    // Click the SPECIFIC wrapped hit by its stable segment key — not row [0], which could be a
    // different, non-wrapping hit that happens to sort first.
    act(() => { fireEvent.click(screen.getByTestId(`search-hit-${occurrenceKey(wrapped)}`)); });
    expect(nav).toHaveBeenCalled();
    const [entryIdArg, payload] = nav.mock.calls[0];
    expect(entryIdArg).toBe('e1');
    expect(payload.segments).toEqual(wrapped.location.segments);   // BOTH segments, not one merged range
    expect(payload.strand).toBe(1);                                 // '+' → 1
    // U5-B — the LIVE fields: the engine's own basis points (the former `metricPct` float was
    // dropped by the store on arrival and never reached a pixel), and the identity of the document
    // these coordinates were measured on. Ctrl+F searches what the viewer shows, so its epoch is
    // the displayed one — that is what lets the consumer tell a saved hit from a buffer hit.
    expect(payload.identityBps).toBe(wrapped.metrics.identityBps);
    // ONE builder names a saved document `v<revision>#g<entryGeneration>`; the fixture has neither,
    // so it reads `v?#g0`. Producer and consumer must agree on THIS string, not on two spellings.
    expect(payload.docEpoch).toBe('v?#g0'); // the fixture entry carries no version
    expect(payload.metricPct).toBeUndefined();
  });
});

describe('SequenceSearchPopover — stale, routed and failed runs', () => {
  it('a reply for a superseded query is not published', async () => {
    vi.useFakeTimers();
    show();
    type(QUERY);
    settle();
    const stale = liveWorker();

    type('CCCGGGTTT');
    settle();
    act(() => { stale.replyLast(); });
    await flush();

    expect(useStore.getState().searchHits.query).not.toBe(QUERY);
  });

  it('changing the query makes the previous hits non-clickable AT ONCE, not when the new answer lands', async () => {
    vi.useFakeTimers();
    show();
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();
    expect(screen.getAllByTestId(/^search-hit-/).length).toBeGreaterThan(0);

    type('CCCGGGTTT'); // no settle, no reply — the old rows must already be gone
    expect(screen.queryAllByTestId(/^search-hit-/)).toHaveLength(0);
    expect(useStore.getState().searchHits.hits).toEqual([]);
  });

  it('closing an ACTIVE popover pass STOPS it cooperatively — the healthy thread is kept', async () => {
    vi.useFakeTimers();
    const { rerender } = show();
    type(QUERY);
    settle();
    const live = liveWorker();
    expect(live.posted).toHaveLength(1); // the pass is really running

    rerender(wrap(<SequenceSearchPopover {...popoverProps({ open: false })} />));
    await flush();

    expect(useStore.getState().searchHits.hits).toEqual([]);
    // INVERTED BY U4-CANCEL C2. The premise this test was named for — «a busy thread cannot be
    // asked politely» — is exactly what C1 removed: the sweep now suspends at bounded interior
    // points, so a cancel MESSAGE is delivered and the pass stops itself. Killing a healthy thread
    // is no longer how work is stopped; it is reserved for faults.
    expect(live.terminated).toBe(false);
    expect(live.posted.some((m) => m && m.type === 'cancel')).toBe(true);
  });

  it('CROSS-OWNER: a global search stops the popover’s pass first, then reuses the same worker', async () => {
    vi.useFakeTimers();
    render(wrap(
      <>
        <GlobalDriver />
        <SequenceSearchPopover {...popoverProps()} />
      </>,
    ));
    type(QUERY);
    settle();
    const popoverWorker = liveWorker();
    expect(popoverWorker.posted).toHaveLength(1);

    // The global bar starts searching while the popover's sweep is still running. One heavy job at
    // a time is still the product rule; since C2 it is enforced by asking the older pass to stop and
    // waiting for its acknowledgement, on the SAME thread.
    act(() => { globalChannel.search(QUERY, [{ id: 'e1', seq: PLUS, topology: 'linear' }], {}); });
    await flush();

    expect(popoverWorker.terminated, 'a healthy thread is not killed to stop a pass').toBe(false);
    expect(popoverWorker.posted.some((m) => m && m.type === 'cancel'), 'it was ASKED to stop').toBe(true);
    expect(factory.workers, 'no respawn for an ordinary supersede').toHaveLength(1);
    expect(popoverWorker.jobs, 'the global request runs after the ack — never alongside').toHaveLength(2);
  });

  it('a popover cancel does NOT touch a pass that belongs to `global`', async () => {
    vi.useFakeTimers();
    const { rerender } = render(wrap(
      <>
        <GlobalDriver />
        <SequenceSearchPopover {...popoverProps()} />
      </>,
    ));
    act(() => { globalChannel.search(QUERY, [{ id: 'e1', seq: PLUS, topology: 'linear' }], {}); });
    const globalWorker = liveWorker();
    expect(globalWorker.posted).toHaveLength(1);

    // The popover closes without ever having started a pass of its own.
    rerender(wrap(
      <>
        <GlobalDriver />
        <SequenceSearchPopover {...popoverProps({ open: false })} />
      </>,
    ));
    await flush();

    expect(globalWorker.terminated, 'cancelling one owner must not abort another’s work').toBe(false);
    expect(factory.workers).toHaveLength(1);
  });

  it('a >100 nt query is ROUTED, not reported as a failure', async () => {
    vi.useFakeTimers();
    show();
    type('ACGT'.repeat(103)); // 412 nt
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    expect(screen.getByTestId('sequence-search-requires-alignment')).toBeTruthy();
    expect(screen.queryByTestId('sequence-search-incomplete')).toBeNull();
    expect(screen.queryByTestId('sequence-search-empty')).toBeNull();
  });

  it.each([
    ['a resource limit', (w) => w.replyWith({ code: 'RESOURCE_LIMIT' })],
    ['a worker crash', (w) => w.crash()],
  ])('%s says the check did not complete — no rows, no «nothing found»', async (_label, fail) => {
    vi.useFakeTimers();
    show();
    type(QUERY);
    settle();
    act(() => { fail(liveWorker()); });
    await flush();

    expect(screen.getByTestId('sequence-search-incomplete')).toBeTruthy();
    expect(screen.queryAllByTestId(/^search-hit-/)).toHaveLength(0);
    expect(screen.queryByTestId('sequence-search-empty')).toBeNull();
    expect(useStore.getState().searchHits.hits).toEqual([]);
  });
});

// Five defects the green-but-shallow version hid. Each is a real dev/runtime failure, not a shape.
describe('SequenceSearchPopover — lifecycle correctness (corrective)', () => {
  it('under StrictMode a worker reply STILL lands (the mounted-guard is restored on the 2nd setup)', async () => {
    vi.useFakeTimers();
    // The real app is wrapped in StrictMode; its double-invoke runs setup→cleanup→setup. A guard
    // that only clears on cleanup stays false forever, and every reply is silently dropped → stuck.
    render(<React.StrictMode>{wrap(<SequenceSearchPopover {...popoverProps()} />)}</React.StrictMode>);
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    expect(screen.queryByTestId('sequence-search-checking'), 'must not be stuck pending in dev').toBeNull();
    expect(screen.getAllByTestId(/^search-hit-/).length).toBeGreaterThan(0);
  });

  it('the SAME query on a changed document (revision) drops the old rows AT ONCE', async () => {
    vi.useFakeTimers();
    const { rerender } = render(wrap(<SequenceSearchPopover {...popoverProps({ revision: 'r1' })} />));
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();
    expect(screen.getAllByTestId(/^search-hit-/).length).toBeGreaterThan(0);

    // Same query TEXT, but the molecule's revision advanced. Leaving the old rows clickable lets the
    // Host stamp stale coordinates onto the NEW revision — straight past the stale-guard.
    rerender(wrap(<SequenceSearchPopover {...popoverProps({ revision: 'r2' })} />));
    expect(screen.queryAllByTestId(/^search-hit-/), 'a facts change re-pends immediately').toHaveLength(0);
    expect(screen.getByTestId('sequence-search-checking')).toBeTruthy();
  });

  it('emptying the query STOPS the running pass; a late reply repaints nothing', async () => {
    vi.useFakeTimers();
    show();
    type(QUERY);
    settle();
    const busy = liveWorker();
    expect(busy.posted).toHaveLength(1); // a pass is really running

    type(''); // → invalid; the pass must be cancelled, not left grinding
    await flush();
    expect(busy.terminated, 'a healthy thread is kept — the pass is asked to stop').toBe(false);
    expect(busy.posted.some((m) => m && m.type === 'cancel'), 'an invalidated query must stop the pass').toBe(true);

    act(() => { busy.replyLast(); }); // a late answer from the retired pass
    await flush();
    expect(useStore.getState().searchHits.hits).toEqual([]);
    expect(screen.queryAllByTestId(/^search-hit-/)).toHaveLength(0);
  });

  it('a cross-owner steal shows a distinct CANCELLED that Find can retry — never stuck pending', async () => {
    vi.useFakeTimers();
    render(wrap(
      <>
        <GlobalDriver />
        <SequenceSearchPopover {...popoverProps()} />
      </>,
    ));
    type(QUERY);
    settle();
    const popoverWorker = liveWorker();

    // The global bar steals the single worker while the popover's pass is mid-flight.
    act(() => { globalChannel.search(QUERY, [{ id: 'e1', seq: PLUS, topology: 'linear' }], {}); });
    await flush();
    expect(popoverWorker.terminated).toBe(false); // C2: stopped by asking, not by killing
    expect(popoverWorker.posted.some((m) => m && m.type === 'cancel')).toBe(true);
    expect(screen.queryByTestId('sequence-search-checking'), 'CANCELLED is not «still checking»').toBeNull();
    expect(screen.getByTestId('sequence-search-cancelled')).toBeTruthy();

    // Find (the submit button) re-runs the SAME query as a NEW pass. Since C2 that pass runs on the
    // same healthy thread — what matters is that a retry is possible and answers, not that a thread
    // was replaced.
    act(() => { fireEvent.click(screen.getByTestId('sequence-search-submit')); });
    settle();
    await flush(); // C2: the retry is posted only after the superseded pass acknowledges
    const retryWorker = liveWorker();
    expect(retryWorker.terminated).toBe(false);
    act(() => { retryWorker.replyLast(); });
    await flush();
    expect(screen.getAllByTestId(/^search-hit-/).length).toBeGreaterThan(0);
  });

  it('a + and a − hit at the SAME locus are two DISTINCT rows (strand in the key)', async () => {
    vi.useFakeTimers();
    // A hand-crafted reply must speak the real protocol: the sequence boundary now takes an
    // ENVELOPE, and a bare array is refused (it carries neither the true locus count nor the rule-7
    // winner). Both hits are metrically identical, so naming either is a legitimate tie.
    factory = makeReplyFactory({
      'entry:e1': { occurrences: [occAt('+'), occAt('-')], locationCount: 2, bestIndex: 0 },
    });
    show();
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    const rows = screen.getAllByTestId(/^search-hit-/);
    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.getAttribute('data-testid'));
    expect(new Set(ids).size, 'segments alone collide — strand must be in the key').toBe(2);
  });

  it('the header count is the LOCUS COUNT, not the number of rows the payload cap left', async () => {
    vi.useFakeTimers();
    // The engine caps its payload: on a repeat-rich molecule it retains a window and reports how
    // many loci actually exist. Rendering `occurrences.length` would tell the biologist there are 2
    // sites when the same reply just said 90 — the retained rows are what can be listed and
    // clicked, the count is what is there.
    // 90, not 501: PLUS is 48 nt, so the boundary's own `2n` ceiling (96) refuses anything larger —
    // a claim of 501 loci on a 48-mer is a reply about a different molecule.
    factory = makeReplyFactory({
      'entry:e1': { occurrences: [occAt('+'), occAt('-')], locationCount: 90, bestIndex: 0 },
    });
    show();
    type(QUERY);
    settle();
    act(() => { liveWorker().replyLast(); });
    await flush();

    expect(screen.getAllByTestId(/^search-hit-/)).toHaveLength(2); // the window, listed in full
    expect(screen.getByTestId('sequence-search-hit-count').textContent).toMatch(/\b90\b/);
  });

  it('a valid query with an EMPTY target fails closed to INCOMPLETE, never a permanent pending', async () => {
    vi.useFakeTimers();
    // A temporary item=null / a document switch / an empty molecule: there is nothing to search, so
    // no worker is created. The derived phase must NOT sit forever on «checking».
    show({ targetSequence: '' });
    type(QUERY);
    settle();
    await flush();

    expect(screen.getByTestId('sequence-search-incomplete')).toBeTruthy();
    expect(screen.queryByTestId('sequence-search-checking'), 'never a permanent pending').toBeNull();
    expect(screen.queryByTestId('sequence-search-empty'), 'a missing molecule is not an honest miss').toBeNull();
    expect(screen.queryAllByTestId(/^search-hit-/)).toHaveLength(0);
    expect(factory.workers, 'nothing to search → no worker spawned').toHaveLength(0);
  });
});
