/**
 * STAGE 1 — Ctrl+F searches the document on SCREEN, and stamps the epoch that names it.
 *
 * `SequenceSearchHost` resolves its target from the transient edit buffer (`edits.editedSequence` /
 * `edits.editedTopology`) and falls back to the saved molecule. Nothing proved that the buffer ever
 * reached the worker: the existing coverage stops at the rendered rows, which look identical whether
 * the saved molecule or the buffer was searched. These contracts read the POSTED JOB, so «the
 * biologist searched what they are looking at» is measured where it is decided.
 *
 * The second half is what stage 1 adds: the epoch travelling with those coordinates must name the
 * SAME string they were measured on. A buffer that changes only the topology used to be stamped with
 * the SAVED epoch, so the consumer would happily replay an origin-crossing locus onto a linear
 * reading where that locus does not exist.
 *
 * Parity is asserted against the worker core itself (`searchAllSequences`), never against remembered
 * numbers — a golden constant would freeze today's engine.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { handleSearchMessage, searchAllSequences } from '../../../lib/search-worker-core';
import { displayedDocEpoch } from '../../../lib/search-document-adapters';
import { useSequenceNavConsumer } from '../inspector/hooks/useSequenceNavConsumer';
import SequenceSearchHost from '../SequenceSearchHost';
import SequenceSearchProvider from '../../SequenceSearchProvider';

const QUERY = 'GAATTGCCC';
/** `GAATTGCCC` straddles the join: the tail holds `AAAGAA`, the head continues `TTGCCC`. */
const WRAP = `TTGCCC${'ACGTACGTAC'.repeat(4)}AAAGAA`;
const SAVED = 'ACGTACGTAC'.repeat(3);
const EDITED = `ACGTACGTAC${QUERY}ACGTACGTAC`;

/** A fake thread that answers for real, through the same core the production worker runs. */
function makeFactory() {
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
      replyLast() {
        const m = w.jobs[w.jobs.length - 1];
        if (m) w.onmessage?.({ data: handleSearchMessage(m) });
      },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}

let factory;
const liveWorker = () => {
  expect(factory.workers.length, 'a search pass must have been started').toBeGreaterThan(0);
  return factory.workers[factory.workers.length - 1];
};
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const settle = () => { act(() => { vi.advanceTimersByTime(300); }); };
const type = (value) => act(() => {
  fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value } });
});
/** Mirrors the popover's row key: both wrap segments AND the strand. */
const occurrenceKey = (occ) => `${(occ.location.segments || []).map((s) => `${s.start}_${s.end}`).join('-')}@${occ.location.strand}`;
/** What the ENGINE says about the exact document, at the popover's default 80% ctx. */
const engineHits = (query, seq, topology) => (
  searchAllSequences(query, [{ id: 'e1', seq, topology }], { identityThreshold: 0.8, bothStrands: true }).e1
  || { occurrences: [] }
).occurrences;

const openHost = (item, edits) => {
  useStore.setState((s) => { s.modals = { ...(s.modals || {}), sequenceSearch: true }; });
  return render(
    <SequenceSearchProvider workerFactory={factory}>
      <SequenceSearchHost item={item} edits={edits} />
    </SequenceSearchProvider>,
  );
};

/** Captured before any test stubs it — the nav spy below takes its place per test. */
const REAL_REQUEST_NAV = useStore.getState().requestSequenceNav;

beforeEach(() => {
  factory = makeFactory();
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.searchHits = { entryId: null, query: '', hits: [] };
    s.bufferGenerations = {};
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useStore.setState((s) => { s.requestSequenceNav = REAL_REQUEST_NAV; });
});

describe('SequenceSearchHost — Ctrl+F searches the DISPLAYED document, not the saved one', () => {
  it('a motif that exists ONLY in the edit buffer is what reaches the worker', async () => {
    vi.useFakeTimers();
    // Self-checking fixture: the saved molecule genuinely does not contain the motif, so a Host that
    // searched it would report an honest — and wrong — «nothing found».
    expect(engineHits(QUERY, SAVED, 'linear'), 'fixture: not in the saved molecule').toHaveLength(0);
    expect(engineHits(QUERY, EDITED, 'linear').length, 'fixture: present in the buffer').toBeGreaterThan(0);

    openHost(
      { id: 'e1', name: 'pBuf', sequence: SAVED, topology: 'linear', version: 1 },
      { editedSequence: EDITED, editLog: [{ op: 'insert' }] },
    );
    type(QUERY);
    settle();
    await flush();

    const [doc] = liveWorker().posted[0].docs;
    expect(doc.seq, 'the buffer on screen is the search target').toBe(EDITED);
    expect(doc.seq).not.toBe(SAVED);

    act(() => { liveWorker().replyLast(); });
    await flush();
    expect(screen.getAllByTestId(/^search-hit-/))
      .toHaveLength(engineHits(QUERY, EDITED, 'linear').length);
  });

  it('the DISPLAYED topology drives the wrap search, and the epoch names that reading', async () => {
    vi.useFakeTimers();
    const nav = vi.fn();
    useStore.setState((s) => { s.requestSequenceNav = nav; });
    // Saved as LINEAR; the viewer is showing it circularised. The origin-crossing locus exists only
    // on the ring, so the two readings are genuinely different documents.
    const item = { id: 'e1', name: 'pRing', sequence: WRAP, topology: 'linear', version: 1 };
    const edits = { editedTopology: 'circular' };
    act(() => { useStore.getState().bumpBufferGeneration('e1'); });
    openHost(item, edits);
    type(QUERY);
    settle();
    await flush();

    expect(liveWorker().posted[0].docs[0].topology).toBe('circular');
    act(() => { liveWorker().replyLast(); });
    await flush();

    const wrapped = engineHits(QUERY, WRAP, 'circular').find((o) => o.location.wrapsOrigin);
    expect(wrapped, 'the fixture must straddle the origin on the ring').toBeTruthy();
    expect(
      engineHits(QUERY, WRAP, 'linear').some((o) => o.location.wrapsOrigin),
      'read as linear, the same molecule has no such locus at all',
    ).toBe(false);

    act(() => { fireEvent.click(screen.getByTestId(`search-hit-${occurrenceKey(wrapped)}`)); });
    const [, payload] = nav.mock.calls[0];
    expect(payload.segments).toEqual(wrapped.location.segments);
    // The coordinates describe the circularised buffer, so the epoch must NOT be the saved one.
    expect(payload.docEpoch).not.toBe('v1');
    expect(payload.docEpoch).toBe(displayedDocEpoch(item, edits, {
      entry: useStore.getState().entryGenerations?.e1,
      buffer: useStore.getState().bufferGenerations.e1,
    }));
  });

  it('with no buffer the saved reading is searched — no wrap row on a linear molecule', async () => {
    vi.useFakeTimers();
    openHost({ id: 'e1', name: 'pRing', sequence: WRAP, topology: 'linear', version: 1 }, undefined);
    type(QUERY);
    settle();
    expect(liveWorker().posted[0].docs[0].topology).toBe('linear');
    act(() => { liveWorker().replyLast(); });
    await flush();

    const wrapped = engineHits(QUERY, WRAP, 'circular').find((o) => o.location.wrapsOrigin);
    expect(screen.queryAllByTestId(/^search-hit-/).map((r) => r.getAttribute('data-testid')))
      .not.toContain(`search-hit-${occurrenceKey(wrapped)}`);
  });
});

/**
 * The whole channel, end to end, with NOTHING stubbed between the two halves: the real Host stamps the
 * epoch, the real store carries the request, the real consumer decides whether to apply it.
 *
 * This is the shape of the defect it exists for. Both halves were individually correct and individually
 * tested — the Host stamped a well-formed token, the consumer checked one — but the two functions that
 * built them disagreed on the saved case, `v1` against `v1#g0`. Ctrl+F on an ordinary unedited molecule
 * therefore fail-closed 100% of the time, and no test that stopped at either side could see it. An
 * equality is only ever testable across the join.
 */
function NavSink({ item, edits, onSelectRangeFromView, scrollToPos, onActiveTabChange }) {
  useSequenceNavConsumer({
    item, edits, activeTab: 'sequence', onActiveTabChange, onSelectRangeFromView, scrollToPos,
  });
  return null;
}

describe('Ctrl+F end to end — Host → store → consumer', () => {
  const linearHits = () => engineHits(QUERY, EDITED, 'linear');

  /** Renders the Host and a real consumer over the SAME item/edits, as the inspector does. */
  function openBoth(item, edits) {
    const sel = vi.fn();
    const scroll = vi.fn();
    useStore.setState((s) => { s.modals = { ...(s.modals || {}), sequenceSearch: true }; });
    render(
      <SequenceSearchProvider workerFactory={factory}>
        <SequenceSearchHost item={item} edits={edits} />
        <NavSink item={item} edits={edits} onSelectRangeFromView={sel} scrollToPos={scroll} />
      </SequenceSearchProvider>,
    );
    return { sel, scroll };
  }

  it('a hit on a SAVED molecule moves the caret — the ordinary case, which used to be dropped', async () => {
    vi.useFakeTimers();
    // A saved molecule with a real per-entry age: the generation is NOT 0, so a producer that omitted
    // it and a consumer that required it cannot accidentally agree.
    const item = { id: 'e1', name: 'pSaved', sequence: EDITED, topology: 'linear', version: 3 };
    act(() => {
      useStore.setState((s) => { s.entryGenerations = { ...(s.entryGenerations || {}), e1: 5 }; });
    });
    const { sel, scroll } = openBoth(item, undefined); // no edit buffer — the saved reading
    type(QUERY);
    settle();
    await flush();
    act(() => { liveWorker().replyLast(); });
    await flush();

    const hit = linearHits()[0];
    expect(hit, 'fixture: the saved molecule contains the motif').toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId(`search-hit-${occurrenceKey(hit)}`)); });
    await flush();

    // The caret really moved, to the coordinates the engine reported.
    const { start, end } = hit.location.segments[0];
    expect(sel, 'a saved-molecule Ctrl+F jump must reach the viewer').toHaveBeenCalled();
    expect(sel.mock.calls[0].slice(0, 2)).toEqual([start, end]);
    expect(scroll).toHaveBeenCalled();
    // …and the request was consumed rather than left parked for the next molecule to inherit.
    expect(useStore.getState().navRequest).toBeNull();
  });

  it('a hit inside the EDIT BUFFER moves the caret too — the fork keeps its own identity', async () => {
    vi.useFakeTimers();
    // Saved molecule without the motif, buffer with it: the two documents are genuinely different, and
    // the buffer's token is the saved identity plus its own age. Both halves must still agree.
    const item = { id: 'e1', name: 'pBuf', sequence: SAVED, topology: 'linear', version: 3 };
    const edits = { editedSequence: EDITED, editLog: [{ op: 'insert' }] };
    act(() => {
      useStore.setState((s) => { s.entryGenerations = { ...(s.entryGenerations || {}), e1: 5 }; });
      useStore.getState().bumpBufferGeneration('e1');
    });
    const { sel } = openBoth(item, edits);
    type(QUERY);
    settle();
    await flush();
    act(() => { liveWorker().replyLast(); });
    await flush();

    const hit = linearHits()[0];
    act(() => { fireEvent.click(screen.getByTestId(`search-hit-${occurrenceKey(hit)}`)); });
    await flush();
    expect(sel).toHaveBeenCalled();
    const seg = hit.location.segments[0];
    expect(sel.mock.calls[0].slice(0, 2)).toEqual([seg.start, seg.end]);
  });

  it('a request measured on the OTHER document is still refused at the sink', async () => {
    vi.useFakeTimers();
    // Same molecule on screen, but the parked request names a document that is not it. Nothing about
    // the fix above loosens the guard: this is the buffer's token arriving at the saved reading.
    const item = { id: 'e1', name: 'pSaved', sequence: EDITED, topology: 'linear', version: 3 };
    act(() => {
      useStore.setState((s) => { s.entryGenerations = { ...(s.entryGenerations || {}), e1: 5 }; });
    });
    const sel = vi.fn();
    render(<NavSink item={item} edits={undefined} onSelectRangeFromView={sel} scrollToPos={vi.fn()} />);
    act(() => {
      useStore.getState().requestSequenceNav('e1', {
        segments: [{ start: 0, end: 9 }], caret: 0, scrollPos: 0, strand: 1, strandRaw: '+',
        revision: 3,
        docEpoch: displayedDocEpoch(item, { editedSequence: 'ACGT' }, { entry: 5, buffer: 2 }),
      });
    });
    await flush();
    expect(sel, 'a buffer locus is not applied to the saved reading').not.toHaveBeenCalled();
    expect(useStore.getState().navRequest).toBeNull();
  });
});
