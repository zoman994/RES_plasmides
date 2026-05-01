import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useStore } from '../../store';
import { resetDBForTests } from '../../db/dexie-schema';
import Library from '../Library';

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  useStore.setState((state) => {
    state.libraryEntries = {};
    state.filterKind = 'container';
    state.filterTopology = 'all';
    state.editingTagsEntryId = null;
    state._libraryHydrated = true; // Skip auto-hydrate in tests; we seed directly.
    state.toasts = [];
  });
}

function seedEntry(overrides = {}) {
  const entry = {
    id: overrides.id || `e-${Math.random().toString(36).slice(2)}`,
    kind: overrides.kind || 'container',
    name: overrides.name || 'Entry',
    tags: overrides.tags || [],
    addedAt: overrides.addedAt || new Date().toISOString(),
    payload: overrides.payload || {},
    ext: overrides.ext || {},
    ...overrides,
  };
  useStore.setState((state) => {
    state.libraryEntries[entry.id] = entry;
  });
  return entry;
}

describe('M-A.3 K3 — Library fullscreen', () => {
  beforeEach(async () => {
    await reset();
    cleanup();
  });

  it('1) empty state renders when no visible entries', () => {
    render(<Library />);
    expect(screen.getByTestId('library-empty')).toBeTruthy();
  });

  it('2) tab switcher updates filterKind in store', () => {
    render(<Library />);
    fireEvent.click(screen.getByTestId('library-tab-primers'));
    expect(useStore.getState().filterKind).toBe('primer');
    fireEvent.click(screen.getByTestId('library-tab-containers'));
    expect(useStore.getState().filterKind).toBe('container');
  });

  it('3) topology dropdown is hidden when filterKind === "primer"', () => {
    render(<Library />);
    expect(screen.queryByTestId('library-topology-filter')).toBeTruthy();
    fireEvent.click(screen.getByTestId('library-tab-primers'));
    expect(screen.queryByTestId('library-topology-filter')).toBeNull();
  });

  it('4) list rows render correct count for current filter', () => {
    seedEntry({ id: 'c1', kind: 'container', name: 'A', payload: { topology: 'circular' } });
    seedEntry({ id: 'c2', kind: 'container', name: 'B', payload: { topology: 'linear' } });
    seedEntry({ id: 'p1', kind: 'primer', name: 'P' });
    render(<Library />);
    expect(screen.getByTestId('library-row-c1')).toBeTruthy();
    expect(screen.getByTestId('library-row-c2')).toBeTruthy();
    expect(screen.queryByTestId('library-row-p1')).toBeNull();
    fireEvent.click(screen.getByTestId('library-tab-primers'));
    expect(screen.queryByTestId('library-row-c1')).toBeNull();
    expect(screen.getByTestId('library-row-p1')).toBeTruthy();
  });

  it('5) hover on row reveals × delete button', () => {
    seedEntry({ id: 'c1', name: 'pUC19' });
    render(<Library />);
    expect(screen.queryByTestId('library-row-delete-c1')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('library-row-c1'));
    expect(screen.getByTestId('library-row-delete-c1')).toBeTruthy();
  });

  it('6) clicking × marks pending delete and pushes a toast with undo callback', () => {
    seedEntry({ id: 'c1', name: 'pUC19' });
    render(<Library />);
    fireEvent.mouseEnter(screen.getByTestId('library-row-c1'));
    fireEvent.click(screen.getByTestId('library-row-delete-c1'));
    expect(useStore.getState().libraryEntries.c1._pendingDelete).toBe(true);
    const toasts = useStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(typeof toasts[0].onUndo).toBe('function');
    expect(typeof toasts[0].onAutoDismiss).toBe('function');
  });

  it('7) toast undo callback re-marks entry visible via unmarkLibraryEntryPendingDelete', () => {
    seedEntry({ id: 'c1', name: 'pUC19' });
    render(<Library />);
    fireEvent.mouseEnter(screen.getByTestId('library-row-c1'));
    fireEvent.click(screen.getByTestId('library-row-delete-c1'));
    const toast = useStore.getState().toasts[0];
    act(() => { toast.onUndo(); });
    expect(useStore.getState().libraryEntries.c1._pendingDelete).toBe(false);
  });

  it('8) toast auto-dismiss callback commits the soft-delete', async () => {
    seedEntry({ id: 'c1', name: 'pUC19' });
    render(<Library />);
    fireEvent.mouseEnter(screen.getByTestId('library-row-c1'));
    fireEvent.click(screen.getByTestId('library-row-delete-c1'));
    const toast = useStore.getState().toasts[0];
    await act(async () => { await toast.onAutoDismiss(); });
    expect(useStore.getState().libraryEntries.c1).toBeUndefined();
  });

  it('9) clicking tags chip activates inline editor for that row', () => {
    seedEntry({ id: 'c1', name: 'pUC19', tags: ['bacterial'] });
    render(<Library />);
    fireEvent.click(screen.getByTestId('library-row-tags-c1'));
    expect(useStore.getState().editingTagsEntryId).toBe('c1');
    expect(screen.getByTestId('library-tags-editor-c1')).toBeTruthy();
  });

  it('10) + Import button opens Importer fullscreen with library target (M-B.1 K2)', () => {
    render(<Library />);
    const btn = screen.getByTestId('library-import-button');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    const s = useStore.getState();
    expect(s.canvas.activeFullscreen).toBe('importer');
    const top = s.canvas.navStack[s.canvas.navStack.length - 1];
    expect(top.payload?.target).toBe('library');
  });
});
