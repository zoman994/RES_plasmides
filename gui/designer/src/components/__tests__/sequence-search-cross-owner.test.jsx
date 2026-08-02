/**
 * Cross-owner supersede must never become a false negative (U4, P1).
 *
 * The facade used to treat a CANCELLED sequence pass as a routine drop, on the reasoning that the
 * service would stale-drop the whole session anyway. That held while only a NEW QUERY from the same
 * surface could cancel: the requestId moved, so the session was stale and nobody saw it.
 *
 * A second owner breaks that reasoning. When the popover supersedes a running global pass, the
 * global query has not changed — its requestId is still the latest — so the session is NOT stale
 * and IS delivered. Built without the sequence provider, it announces «nothing found» for a
 * molecule that was never searched. For a biologist that is the worst possible answer: a confident,
 * clean, wrong absence.
 */
import 'fake-indexeddb/auto';
import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useStore } from '../../store';
import { t } from '../../i18n';
import SequenceSearchProvider from '../SequenceSearchProvider';
import { useSequenceSearchChannel } from '../sequence-search-context';
import { Harness } from '../Library/__tests__/_topbar-harness';

const TARGET = 'AAAGAATTGCCC';

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

let popoverChannel = null;
const publish = (channel) => { popoverChannel = channel; };
function PopoverDriver({ onReady }) {
  const channel = useSequenceSearchChannel('popover');
  useEffect(() => { onReady(channel); }, [channel, onReady]);
  return null;
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

let factory;
beforeEach(() => {
  factory = makeFactory();
  popoverChannel = null;
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {
      a: {
        id: 'a', name: 'plasmid-A', projectId: null, kind: 'container', tags: [],
        payload: { sequence: TARGET, length: TARGET.length, topology: 'linear', annotations: [] },
      },
    };
    s.projects = {};
    s.primersById = {};
    s.currentProjectId = null;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('cross-owner supersede — the global surface is told, not lied to', () => {
  it('a popover search stops the global pass; the bar says STOPPED and never «nothing found»', async () => {
    vi.useFakeTimers();
    render(
      <SequenceSearchProvider workerFactory={factory}>
        <PopoverDriver onReady={publish} />
        <Harness query="seq:GAATTG" />
      </SequenceSearchProvider>,
    );
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    const globalWorker = factory.workers[0];
    expect(globalWorker, 'the global pass must be running before it can be superseded').toBeTruthy();
    expect(globalWorker.posted).toHaveLength(1);

    // The in-molecule search starts. One heavy job at a time: the global sweep is STOPPED — since
    // U4-CANCEL C2 by asking the healthy thread to unwind, not by killing it.
    act(() => { popoverChannel.search('GAATTG', [{ id: 'a', seq: TARGET, topology: 'linear' }], {}); });
    await flush();

    expect(globalWorker.terminated).toBe(false);
    expect(globalWorker.posted.some((m) => m && m.type === 'cancel')).toBe(true);
    // The three lies that must not appear. «Nothing found» is the dangerous one: the sequence
    // dimension never ran, so an absence was never established.
    expect(screen.queryByText(t('search.results.empty'))).toBeNull();
    expect(screen.queryByTestId('search-provider-incomplete-warning'), 'nothing FAILED — it was stopped').toBeNull();
    expect(screen.queryByTestId('smart-result-a'), 'no row may be presented as confirmed').toBeNull();
    // …and the honest one that must.
    expect(screen.getByTestId('search-cancelled-notice')).toBeTruthy();
  });

  it('a stale cancellation from an abandoned run says nothing at all', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <SequenceSearchProvider workerFactory={factory}>
        <PopoverDriver onReady={publish} />
        <Harness query="seq:GAATTG" />
      </SequenceSearchProvider>,
    );
    act(() => { vi.advanceTimersByTime(200); });
    await flush();

    // The user retypes: the first global run is abandoned by its OWN surface. Its cancellation
    // belongs to a generation nobody is waiting for, so it must not paint a verdict over the
    // search that replaced it.
    rerender(
      <SequenceSearchProvider workerFactory={factory}>
        <PopoverDriver onReady={publish} />
        <Harness query="seq:GAATTC" />
      </SequenceSearchProvider>,
    );
    act(() => { vi.advanceTimersByTime(200); });
    await flush();

    expect(screen.queryByTestId('search-cancelled-notice'), 'a stale cancel is silent').toBeNull();
  });
});
