/**
 * U4 — the mounted global search must use the shared sequence-search owner.
 *
 * Coordinator-only tests cannot prove this: a perfectly correct Provider is still useless when
 * LibrarySmartSearchBar quietly constructs a private facade/client beside it. This test mounts the
 * REAL global surface under the Provider and gives the worker factory ONLY to that Provider. A
 * sequence query must therefore reach that factory, or production still has two possible owners.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useStore } from '../../../store';
import SequenceSearchProvider from '../../SequenceSearchProvider';
import { Harness } from '../../Library/__tests__/_topbar-harness';

function makeFactory() {
  const workers = [];
  const factory = () => {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      posted: [],
      terminated: false,
      postMessage(message) { worker.posted.push(message); },
      terminate() { worker.terminated = true; },
    };
    workers.push(worker);
    return worker;
  };
  factory.workers = workers;
  return factory;
}

beforeEach(() => {
  useStore.setState((state) => {
    state.libraryEntries = {
      e1: {
        id: 'e1', name: 'target', kind: 'container', projectId: null, tags: [],
        payload: { sequence: 'AAAGAATTGCCC', length: 12, topology: 'linear', annotations: [] },
      },
    };
    state.projects = {};
    state.primersById = {};
    state.currentProjectId = null;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('global sequence search — shared owner wiring', () => {
  it('sends the real LibraryTopBar sequence pass through the Provider global channel', () => {
    vi.useFakeTimers();
    const factory = makeFactory();

    render(
      <SequenceSearchProvider workerFactory={factory}>
        {/* Deliberately no workerFactory prop: only the common owner may create the thread. */}
        <Harness query="seq:GAATTG" />
      </SequenceSearchProvider>,
    );
    act(() => { vi.advanceTimersByTime(200); });

    expect(factory.workers, 'the production global facade must use the Provider-owned worker')
      .toHaveLength(1);
    expect(factory.workers[0].posted).toHaveLength(1);
    expect(factory.workers[0].posted[0].seqQuery).toBe('GAATTG');
  });
});
