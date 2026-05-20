/**
 * MS-K4 — StartScreen drop-file handler.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import StartScreen from '../StartScreen';
import { useStore, bootstrapStore } from '../../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(() => {
  cleanup();
  try { useStore.setState({ toasts: [], libraryEntries: {} }); } catch { /* */ }
});

function makeFile(name, content = 'ATGC', type = 'text/plain') {
  return new File([content], name, { type });
}

describe('MS-K4 — StartScreen drop handler', () => {
  it('drag-over with Files sets data-drag-active=true', () => {
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    fireEvent.dragOver(root, { dataTransfer: { types: ['Files'], files: [], dropEffect: '' } });
    expect(root.getAttribute('data-drag-active')).toBe('true');
    expect(screen.getByTestId('ss-drag-overlay')).toBeTruthy();
  });

  it('drag-over without Files is a no-op', () => {
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    fireEvent.dragOver(root, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(root.getAttribute('data-drag-active')).toBe('false');
  });

  it('drop sequence file → library import + toast', async () => {
    const addBulk = vi.fn();
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; });
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    const file = makeFile('pUC19.gb', 'LOCUS pUC19 ...');
    await act(async () => {
      fireEvent.drop(root, { dataTransfer: { files: [file], types: ['Files'] } });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(addBulk).toHaveBeenCalled();
    const arg = addBulk.mock.calls[0][0];
    expect(arg.entries).toHaveLength(1);
    expect(arg.entries[0].name).toBe('pUC19');
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Библиотек/.test(t.msg || ''))).toBe(true);
  });

  it('drop multiple sequence files → bulk import', async () => {
    const addBulk = vi.fn();
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; });
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    await act(async () => {
      fireEvent.drop(root, { dataTransfer: { files: [
        makeFile('a.gb'), makeFile('b.dna'), makeFile('c.fasta'),
      ], types: ['Files'] } });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(addBulk).toHaveBeenCalledTimes(1);
    expect(addBulk.mock.calls[0][0].entries).toHaveLength(3);
  });

  it('drop unknown extension → warning toast, no import', async () => {
    const addBulk = vi.fn();
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; s.toasts = []; });
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    await act(async () => {
      fireEvent.drop(root, { dataTransfer: { files: [makeFile('photo.png')], types: ['Files'] } });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(addBulk).not.toHaveBeenCalled();
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Поддерживаются/.test(t.msg || ''))).toBe(true);
  });

  it('drop mixed sequence + unknown → imports sequences, no warning toast', async () => {
    const addBulk = vi.fn();
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; s.toasts = []; });
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    await act(async () => {
      fireEvent.drop(root, { dataTransfer: { files: [
        makeFile('a.gb'), makeFile('garbage.exe'),
      ], types: ['Files'] } });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(addBulk).toHaveBeenCalled();
    const toasts = useStore.getState().toasts || [];
    // No "Поддерживаются" warning when at least one sequence imported.
    expect(toasts.some((t) => /Поддерживаются/.test(t.msg || ''))).toBe(false);
  });
});
