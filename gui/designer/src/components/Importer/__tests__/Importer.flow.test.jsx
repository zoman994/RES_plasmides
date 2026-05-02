/**
 * Sprint M-B.2 K1 — Importer single-screen flow integration tests.
 *
 * Replaces M-B.1 K2 Step1/Step2 routing tests. Verifies:
 *   - fullscreen mount, target/mode dataset, header copy
 *   - mode toggle persistence (kept as-is from K2)
 *   - dropzone parsing into the new state hook (append semantic)
 *   - Cancel pops the importer fullscreen off the nav stack
 *   - Simple-mode Confirm path still runs handleSimpleImport (the canvas
 *     button on the new ActionsBar reuses that flow when mode === 'simple')
 *   - Initial empty state: CatalogColumn visible + EmptyInspector visible,
 *     no SingleInspector
 *   - Drop file → parsedItems[1], EmptyInspector → SingleInspector,
 *     activeTab === 'overview', tab content placeholder visible
 *   - TabBar click: switching to 'annotations' updates dataset, 'overview'
 *     content disappears (lazy panel render — even with K1 placeholders
 *     the rendering pattern is conditional, fixing V49 by construction).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import { IMPORTER_MODE_STORAGE_KEY } from '../../../store/uiSlice';
import { getItem, removeItem } from '../../../lib/storage';
import Importer from '../index';

// Auto-annotate is heavy and unrelated to layout/routing tests; mock it.
vi.mock('../../../auto-annotate', () => ({
  autoAnnotate: vi.fn(({ annotations = [] }) => annotations),
  enrichWithCommonFeatures: vi.fn(async (_seq, anns) => anns),
}));

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  removeItem(IMPORTER_MODE_STORAGE_KEY);
  useStore.setState((state) => {
    state.canvas.activeFullscreen = 'importer';
    state.canvas.navStack = [{ fullscreen: 'importer', payload: { target: 'project' } }];
    state.importerMode = 'advanced';
    state.toasts = [];
    state.libraryEntries = {};
    state._libraryHydrated = true;
    state.primersById = {};
    state._primersHydrated = true;
  });
}

function fileFromText(name, text) {
  return new File([text], name, { type: 'text/plain' });
}

const FASTA_TEXT = `>my_seq
ATGCATGCATGCATGC
`;

beforeEach(async () => {
  await reset();
  cleanup();
});

describe('M-B.2 K1 — Importer single-screen flow', () => {
  it('1) mounts in advanced mode by default with CatalogColumn + EmptyInspector visible', () => {
    render(<Importer />);
    const root = screen.getByTestId('importer-fullscreen');
    expect(root.dataset.target).toBe('project');
    expect(root.dataset.mode).toBe('advanced');
    expect(root.dataset.activeTab).toBe('overview');
    expect(screen.getByTestId('importer-catalog-column')).toBeTruthy();
    expect(screen.getByTestId('importer-empty-inspector')).toBeTruthy();
    // No single-inspector / footer until a file lands.
    expect(screen.queryByTestId('importer-single-inspector')).toBeNull();
    expect(screen.queryByTestId('importer-footer')).toBeNull();
  });

  it('2) target=library shows the to-library header copy', () => {
    useStore.setState((state) => {
      state.canvas.navStack = [{ fullscreen: 'importer', payload: { target: 'library' } }];
    });
    render(<Importer />);
    expect(screen.getByTestId('importer-fullscreen').dataset.target).toBe('library');
  });

  it('3) toggle to simple mode persists in localStorage', () => {
    render(<Importer />);
    fireEvent.click(screen.getByTestId('importer-mode-simple'));
    expect(screen.getByTestId('importer-fullscreen').dataset.mode).toBe('simple');
    expect(useStore.getState().importerMode).toBe('simple');
    expect(getItem(IMPORTER_MODE_STORAGE_KEY)).toBe('"simple"');
  });

  it('4) drop file into CatalogColumn dropzone parses + appends to parsedItems → SingleInspector mounts', async () => {
    render(<Importer />);
    const dz = screen.getByTestId('importer-catalog-dropzone');
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    await act(async () => {
      fireEvent.drop(dz, { dataTransfer: { files: [file], types: ['Files'] } });
    });
    await waitFor(() => {
      expect(screen.getByTestId('importer-single-inspector')).toBeTruthy();
    });
    expect(screen.queryByTestId('importer-empty-inspector')).toBeNull();
    expect(screen.getByTestId('importer-single-inspector').dataset.currentFile).toBe('thing.fasta');
    expect(screen.getByTestId('importer-fullscreen').dataset.activeTab).toBe('overview');
    expect(screen.getByTestId('importer-tab-panel-overview')).toBeTruthy();
    // Annotations tab not mounted yet — V49 guard pattern, even with K1 placeholders.
    expect(screen.queryByTestId('importer-tab-panel-annotations')).toBeNull();
  });

  it('5) TabBar click switches activeTab, prior tab content unmounts', async () => {
    render(<Importer />);
    const dz = screen.getByTestId('importer-catalog-dropzone');
    await act(async () => {
      fireEvent.drop(dz, {
        dataTransfer: { files: [fileFromText('x.fasta', FASTA_TEXT)], types: ['Files'] },
      });
    });
    await waitFor(() => expect(screen.getByTestId('importer-single-inspector')).toBeTruthy());

    fireEvent.click(screen.getByTestId('importer-tab-annotations'));
    await waitFor(() => {
      expect(screen.getByTestId('importer-fullscreen').dataset.activeTab).toBe('annotations');
    });
    expect(screen.getByTestId('importer-tab-panel-annotations')).toBeTruthy();
    expect(screen.queryByTestId('importer-tab-panel-overview')).toBeNull();
    expect(screen.queryByTestId('importer-tab-panel-sequence')).toBeNull();

    fireEvent.click(screen.getByTestId('importer-tab-overview'));
    await waitFor(() => {
      expect(screen.getByTestId('importer-fullscreen').dataset.activeTab).toBe('overview');
    });
    expect(screen.queryByTestId('importer-tab-panel-annotations')).toBeNull();
  });

  it('6) Cancel pops the importer fullscreen off the nav stack', () => {
    useStore.setState((state) => {
      state.canvas.navStack = [
        { fullscreen: 'dag', payload: null },
        { fullscreen: 'importer', payload: { target: 'project' } },
      ];
      state.canvas.activeFullscreen = 'importer';
    });
    render(<Importer />);
    fireEvent.click(screen.getByTestId('importer-cancel'));
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

  it('7) Simple mode Canvas action runs handleSimpleImport, shows toast + flash, then auto-closes', async () => {
    // target='project' here — simple mode is force-upgraded to advanced
    // when target='library' (M-B.2 follow-up: Library context expects
    // preview, not silent drop). Project target preserves simple mode.
    // Need a currentProject too — Canvas button is now disabled without
    // one (M-B.2 follow-up: «откройте проект сначала» tooltip).
    useStore.setState((state) => {
      state.importerMode = 'simple';
      state.canvas.navStack = [
        { fullscreen: 'dag', payload: null },
        { fullscreen: 'importer', payload: { target: 'project' } },
      ];
      state.canvas.activeFullscreen = 'importer';
      state.projects = { p1: { id: 'p1', name: 'TestProj', containerIds: [], updatedAt: new Date().toISOString() } };
      state.currentProjectId = 'p1';
      state._projectLifecycle = { p1: {} };
    });
    render(<Importer flashMs={20} />);
    const dz = screen.getByTestId('importer-catalog-dropzone');
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    await act(async () => {
      fireEvent.drop(dz, { dataTransfer: { files: [file], types: ['Files'] } });
    });
    await waitFor(() => {
      expect(screen.getByTestId('importer-action-canvas')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('importer-action-canvas'));
    });
    await waitFor(() => {
      expect(useStore.getState().toasts.length).toBeGreaterThan(0);
      expect(useStore.getState().toasts[0].msg).toMatch(/my_seq/);
    });
    expect(Object.keys(useStore.getState().libraryEntries).length).toBe(1);
    await waitFor(() => {
      expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
    });
  });
});
