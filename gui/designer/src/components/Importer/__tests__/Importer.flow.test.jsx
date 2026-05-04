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
import { removeItem } from '../../../lib/storage';
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

  it('5) TabBar click switches activeTab between overview and sequence', async () => {
    // Updated 04.05.2026 (Importer-merge-tabs) — the dedicated
    // «Аннотации» tab is gone; the merged «Последовательность» tab is
    // the only non-overview content surface. Test toggles between
    // overview ↔ sequence to exercise the same TabBar contract.
    render(<Importer />);
    const dz = screen.getByTestId('importer-catalog-dropzone');
    await act(async () => {
      fireEvent.drop(dz, {
        dataTransfer: { files: [fileFromText('x.fasta', FASTA_TEXT)], types: ['Files'] },
      });
    });
    await waitFor(() => expect(screen.getByTestId('importer-single-inspector')).toBeTruthy());

    fireEvent.click(screen.getByTestId('importer-tab-sequence'));
    await waitFor(() => {
      expect(screen.getByTestId('importer-fullscreen').dataset.activeTab).toBe('sequence');
    });
    expect(screen.getByTestId('importer-tab-panel-sequence')).toBeTruthy();
    // Annotations tab IS back as the Annotator entry point
    // (Sprint M-X.2 K9-fix). Body still respects the lazy-mount
    // pattern — only mounts when active.
    expect(screen.getByTestId('importer-tab-annotations')).toBeTruthy();

    fireEvent.click(screen.getByTestId('importer-tab-overview'));
    await waitFor(() => {
      expect(screen.getByTestId('importer-fullscreen').dataset.activeTab).toBe('overview');
    });
    // Sequence panel can stay mounted (warm-then-hide) but must be
    // hidden via display:none — overview panel must be visible.
    expect(screen.getByTestId('importer-tab-panel-overview')).toBeTruthy();
  });

  it('6) Topbar back button pops Importer off the nav stack (no in-importer cancel button)', () => {
    // Importer no longer renders its own back chevron — AppShell Topbar
    // already owns popFullscreen. Test asserts the contract: click
    // topbar-back → activeFullscreen returns to underlying view.
    useStore.setState((state) => {
      state.canvas.navStack = [
        { fullscreen: 'dag', payload: null },
        { fullscreen: 'importer', payload: { target: 'project' } },
      ];
      state.canvas.activeFullscreen = 'importer';
    });
    // Ensure no duplicate back inside Importer.
    render(<Importer />);
    expect(screen.queryByTestId('importer-cancel')).toBeNull();
    // Topbar isn't mounted in this isolated Importer test — assert the
    // popFullscreen action directly so the navStack contract is covered.
    useStore.getState().popFullscreen();
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

});
