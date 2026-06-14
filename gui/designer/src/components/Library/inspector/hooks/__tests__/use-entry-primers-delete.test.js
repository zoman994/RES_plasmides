/**
 * use-entry-primers-delete.test.js — primer DELETE wiring (real-case sweep).
 *
 * Sweep 14.06.2026: a biolog could CREATE primers in the LibraryWorkspace
 * viewers (Ctrl+R / right-click) and they persisted, but DELETE was dead —
 * SequenceView.onPrimerDeleteKeyDown calls onDeletePrimer(hit) only when that
 * callback exists, and useEntryPrimers never exposed it, so Del on a selected
 * primer was swallowed. This adds onDeletePrimer → removePrimerFromPool.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { useEntryPrimers } from '../useEntryPrimers';
import { useStore } from '../../../../../store';

beforeEach(() => { try { useStore.setState({ primersById: {} }); } catch { /* */ } });
afterEach(cleanup);

const item = { id: 'entry-1', name: 'pTest' };

describe('useEntryPrimers — delete wiring', () => {
  it('exposes onDeletePrimer that removes a pool primer (Del no longer swallowed)', async () => {
    const { result } = renderHook(() => useEntryPrimers(item));
    expect(typeof result.current.onDeletePrimer).toBe('function');

    // Create a primer scoped to this entry.
    await act(async () => {
      result.current.onWritePrimer({ name: 'P1', sequence: 'ATGCATGCATGCATGC', direction: 'forward' });
    });
    await waitFor(() => expect(result.current.primers.length).toBe(1));
    const hit = result.current.primers[0];
    expect(hit.id).toBeTruthy();

    // Delete it (SequenceView passes the primer hit object).
    await act(async () => { await result.current.onDeletePrimer(hit); });
    await waitFor(() => expect(result.current.primers.length).toBe(0));
    expect(useStore.getState().primersById[hit.id]).toBeUndefined();
  });
});
