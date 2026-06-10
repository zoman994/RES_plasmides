/**
 * library-search-find-v106.test.jsx — V106 (walkthrough WT-B-4), variant D.
 *
 * App.jsx already owns Ctrl+F globally (`useHotkey('sequence-search', …)` →
 * `openSequenceSearch()` → `modals.sequenceSearch = true`). On the canvas that
 * flag has no consumer (only LibraryWorkspace renders the sequence-search
 * modal), so Ctrl+F did nothing useful. Re-registering the same hotkey-id from
 * the canvas would override App's handler and delete it on unmount (one
 * handler per id) → regression for LibraryWorkspace's Ctrl+F.
 *
 * Variant D (no id collision, no regression): the canvas LibrarySearchBar
 * (opt-in `bindFindHotkey`) watches `modals.sequenceSearch`; when it flips true
 * it claims it — focuses the search input + resets the flag. Reuses the
 * existing global intercept (browser find already suppressed by App).
 */
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act,
} from '@testing-library/react';
import { useStore } from '../../../../store';
import LibrarySearchBar from '../LibrarySearchBar';

afterEach(cleanup);
beforeEach(() => {
  useStore.setState((s) => { s.modals = { ...(s.modals || {}), sequenceSearch: false }; });
});

const entries = { e1: { id: 'e1', name: 'pUC19', payload: { sequence: 'ACGT', length: 4 } } };

describe('V106 — canvas search claims the global Ctrl+F flag (variant D)', () => {
  it('bindFindHotkey: modals.sequenceSearch→true focuses the input and resets the flag', () => {
    render(<LibrarySearchBar libraryEntries={entries} currentProjectId={null} bindFindHotkey />);
    act(() => { useStore.getState().openSequenceSearch(); });
    const input = screen.getByTestId('canvas-library-search-bar-input');
    expect(document.activeElement).toBe(input);
    expect(useStore.getState().modals.sequenceSearch).toBe(false); // consumed/reset
  });

  it('without bindFindHotkey (assembly inline picker): the flag is left untouched', () => {
    render(<LibrarySearchBar libraryEntries={entries} currentProjectId={null} inline />);
    act(() => { useStore.getState().openSequenceSearch(); });
    const input = screen.getByTestId('canvas-library-search-bar-input');
    expect(document.activeElement).not.toBe(input);
    expect(useStore.getState().modals.sequenceSearch).toBe(true); // not consumed here
  });
});
