/**
 * U5-B — the dirty guard, through the REAL workspace. A refused «you have unsaved edits» must leave
 * absolutely nothing behind.
 *
 * This was the last contract still resting on a substitute. `makeOpenEntry` is unit-tested with a
 * guard that returns false, which proves the sink obeys an answer — but not that the workspace ever
 * ASKS, nor that the capture of a return frame is downstream of the real answer. Those are different
 * claims, and the second is the one that can silently rot: `pickRow` captures a frame whenever the
 * sink says «opened», so a sink that reported success while the guard refused would promise the
 * biologist a way back to a molecule they never left, and hand the parked jump to the molecule they
 * are still editing.
 *
 * Nothing here is stubbed between the click and the guard. The inspector is replaced by a seam that
 * calls the REAL `onUpdateEdits` — the same pattern as `buffer-generation-central` — because the
 * transient edit buffer lives in `perEntryState`, and the only production way in is through that prop.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { handleSearchMessage } from '../../../lib/search-worker-core';
import LibraryWorkspace from '../LibraryWorkspace';

let factory;
vi.mock('../../../lib/search.worker.js?worker', () => ({
  default: class { constructor() { return factory(); } },
}));
// The real inspector mounts SequenceView + the Annotator under lazy tabs. What this file needs from
// it is the one prop that writes the transient buffer.
vi.mock('../inspector/LibrarySingleInspector', () => ({
  default: ({ item, edits, onUpdateEdits }) => (
    <div
      data-testid="inspector-seam"
      data-item-id={item?.id || ''}
      data-edited-topology={edits?.editedTopology || ''}
    >
      <button
        type="button"
        data-testid="make-transient-edit"
        onClick={() => onUpdateEdits({ editedSequence: 'AAAACCCCGGGG', editLog: [{ op: 'insert' }] })}
      >
        edit
      </button>
      <button
        type="button"
        data-testid="restore-saved-buffer"
        onClick={() => onUpdateEdits({
          editedSequence: item.sequence,
          editedTopology: item.topology,
          editLog: [],
        })}
      >
        restore
      </button>
      <button
        type="button"
        data-testid="make-topology-edit"
        onClick={() => onUpdateEdits({
          editedTopology: item.topology === 'circular' ? 'linear' : 'circular',
          editLog: [{ kind: 'topology', from: item.topology, to: item.topology === 'circular' ? 'linear' : 'circular' }],
        })}
      >
        topology
      </button>
    </div>
  ),
}));
vi.mock('../onboarding/OnboardingNudge', () => ({ default: () => <div data-testid="onboarding-nudge" /> }));
vi.mock('../CommonFeaturesPanel', () => ({ default: () => <div data-testid="common-features-panel-stub" /> }));

const QUERY = 'GAATTCACGTAC';
const SEQ_A = `AAA${QUERY}TTT`;
const SEQ_B = `CCC${QUERY}GGG`;

function makeFactory() {
  const workers = [];
  const f = () => {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null, posted: [], terminated: false,
      postMessage(m) {
        w.posted.push(m);
        queueMicrotask(() => {
          if (w.terminated) return;
          if (m && m.type === 'cancel') { w.onmessage?.({ data: { id: m.id, cancelled: true } }); return; }
          try { w.onmessage?.({ data: handleSearchMessage(m) }); } catch { w.onerror?.({ message: 'core threw' }); }
        });
      },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  f.workers = workers;
  return f;
}

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};
const input = () => screen.getByTestId('library-topbar-search-input');
const openedEntryId = () => screen.queryByTestId('inspector-seam')?.getAttribute('data-item-id') || null;

function seed(id, name, sequence) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId: null, kind: 'container', tags: [], version: 1, zone: 'loose',
      payload: { sequence, length: sequence.length, topology: 'linear', annotations: [] },
    };
  });
}

async function typeQuery(text) {
  act(() => { fireEvent.change(input(), { target: { value: `${text} ` } }); });
  act(() => { vi.advanceTimersByTime(300); });
  await flush();
  await flush();
}

let confirmSpy;
beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  factory = makeFactory();
  useStore.setState((s) => {
    s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null;
    s.searchReturnFrame = null; s.navRequest = null;
    s.searchCorpusGeneration = 0; s.entryGenerations = {};
  });
  seed('a', 'alpha-dirty', SEQ_A);
  seed('b', 'beta-dirty', SEQ_B);
  // jsdom does not define `window.confirm`, and the workspace treats an absent confirm as «yes» —
  // so it has to be installed, not spied on.
  confirmSpy = vi.fn(() => false);
  window.confirm = confirmSpy;
});
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.confirm; });

/** Open `a` from the tree and put a REAL transient sequence edit into its per-entry state. */
async function openAndDirty() {
  render(<LibraryWorkspace />);
  act(() => { fireEvent.click(screen.getByTestId('tree-item-loose-a')); });
  await flush();
  expect(openedEntryId(), 'the first molecule is open').toBe('a');
  act(() => { fireEvent.click(screen.getByTestId('make-transient-edit')); });
  await flush();
  // Proof the buffer is real, not asserted: the central writer counted it.
  expect(useStore.getState().bufferGenerations?.a, 'a transient buffer exists').toBeGreaterThan(0);
}

describe('U5-B — a refused dirty guard leaves nothing behind', () => {
  it('cancelling keeps the molecule, parks no jump and promises no return', async () => {
    vi.useFakeTimers();
    await openAndDirty();

    // Now find the OTHER molecule through the real global search and pick it.
    await typeQuery(`seq:${QUERY}`);
    const rows = screen.getAllByRole('option');
    const other = rows.find((r) => /beta-dirty/.test(r.textContent));
    expect(other, 'the other molecule is offered').toBeTruthy();

    act(() => { fireEvent.click(other); });
    await flush();

    expect(confirmSpy, 'the workspace really asked').toHaveBeenCalled();
    expect(openedEntryId(), 'the biologist stays on the molecule they were editing').toBe('a');
    expect(useStore.getState().navRequest, 'no jump is parked for a navigation that did not happen').toBeNull();
    expect(useStore.getState().searchReturnFrame, 'and no return is promised').toBeNull();
    expect(screen.queryByTestId('library-search-back'), 'so no Back control appears').toBeNull();
    // The edit itself is untouched — a refused guard must not discard what it was protecting.
    expect(useStore.getState().bufferGenerations?.a).toBeGreaterThan(0);
  });

  it('CONFIRMING the same guard does navigate, and only then is a return promised', async () => {
    vi.useFakeTimers();
    confirmSpy.mockReturnValue(true);
    await openAndDirty();
    await typeQuery(`seq:${QUERY}`);
    const other = screen.getAllByRole('option').find((r) => /beta-dirty/.test(r.textContent));

    act(() => { fireEvent.click(other); });
    await flush();

    expect(confirmSpy).toHaveBeenCalled();
    expect(openedEntryId(), 'the confirmed switch happened').toBe('b');
    const frame = useStore.getState().searchReturnFrame;
    expect(frame, 'a navigation that HAPPENED is worth a frame').toBeTruthy();
    expect(frame.entryId).toBe('b');
    expect(screen.queryByTestId('library-search-back')).toBeTruthy();
  });

  it('with no unsaved edits the guard never asks — it is not a speed bump on every pick', async () => {
    vi.useFakeTimers();
    render(<LibraryWorkspace />);
    act(() => { fireEvent.click(screen.getByTestId('tree-item-loose-a')); });
    await flush();
    await typeQuery(`seq:${QUERY}`);
    const other = screen.getAllByRole('option').find((r) => /beta-dirty/.test(r.textContent));
    act(() => { fireEvent.click(other); });
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(openedEntryId()).toBe('b');
    expect(useStore.getState().searchReturnFrame).toBeTruthy();
  });

  it('does not ask after undo restored saved sequence/topology even if buffer keys remain', async () => {
    vi.useFakeTimers();
    render(<LibraryWorkspace />);
    act(() => { fireEvent.click(screen.getByTestId('tree-item-loose-a')); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('restore-saved-buffer')); });
    await flush();
    expect(useStore.getState().bufferGenerations?.a).toBeGreaterThan(0);

    await typeQuery(`seq:${QUERY}`);
    const other = screen.getAllByRole('option').find((r) => /beta-dirty/.test(r.textContent));
    act(() => { fireEvent.click(other); });
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(openedEntryId()).toBe('b');
  });

  it('treats a topology-only divergence as unsaved and guards navigation', async () => {
    vi.useFakeTimers();
    render(<LibraryWorkspace />);
    act(() => { fireEvent.click(screen.getByTestId('tree-item-loose-a')); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('make-topology-edit')); });
    await flush();

    await typeQuery(`seq:${QUERY}`);
    const other = screen.getAllByRole('option').find((r) => /beta-dirty/.test(r.textContent));
    act(() => { fireEvent.click(other); });
    await flush();

    expect(confirmSpy).toHaveBeenCalled();
    expect(openedEntryId()).toBe('a');
    expect(screen.getByTestId('inspector-seam').getAttribute('data-edited-topology')).toBe('circular');
  });
});
