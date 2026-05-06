/**
 * Sprint M-B.2 K2 — CatalogColumn integration tests.
 *
 * Mounts CatalogColumn standalone (without the full Importer orchestrator)
 * and verifies the four sources, inline-collapsible nested groups (no
 * drill-down / back navigation as of M-B.2 polish), flat search mode, paste
 * textarea Ctrl+Enter shortcut, and the «+ Новая папка» stub.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import CatalogColumn from '../LibraryTree';
import { __resetCachesForTest } from '../../catalog/catalog-cache';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: ({ name }) => <div data-testid={`mini-map-${name}`} />,
}));

const MOCK_INDEX = {
  total: 5,
  categories: [
    { slug: 'basic_cloning_vectors', name: 'Basic cloning', count: 12 },
    { slug: 'fluorescent_protein_genes_and_plasmids', name: 'FP', count: 5 },
  ],
};
const MOCK_BASIC = {
  plasmids: [
    { id: 'demo_pUC19', name: 'pUC19', length: 2686, topology: 'circular', annotations: [] },
    { id: 'demo_pET28a', name: 'pET28a', length: 5369, topology: 'circular', annotations: [] },
  ],
};
const MOCK_FP = {
  plasmids: [
    { id: 'demo_sfGFP', name: 'sfGFP', length: 720, topology: 'linear', annotations: [], description: 'green' },
  ],
};

async function reset() {
  __resetCachesForTest();
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete(); await db.open();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s._libraryHydrated = true;
    s.projects = {};
    s.currentProjectId = null;
  });
  vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    if (url.includes('plasmids-index')) return { ok: true, json: async () => MOCK_INDEX };
    if (url.includes('basic_cloning_vectors')) return { ok: true, json: async () => MOCK_BASIC };
    if (url.includes('fluorescent_protein')) return { ok: true, json: async () => MOCK_FP };
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

beforeEach(reset);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('M-B.2 K2 — CatalogColumn integration', () => {
  it('1) tree renders 4 group headers; "Моя библиотека" empty path', async () => {
    const onSelect = vi.fn();
    const onSrc = vi.fn();
    render(
      <CatalogColumn
        query="" onQueryChange={() => {}}
        activeSource={null} onActiveSourceChange={onSrc}
        onSelectItem={onSelect}
        onFiles={() => {}} onPasteText={() => {}}
      />,
    );
    expect(screen.getByTestId('importer-catalog-group-canvas')).toBeTruthy();
    expect(screen.getByTestId('importer-catalog-group-demo')).toBeTruthy();
    expect(screen.getByTestId('importer-catalog-group-mine')).toBeTruthy();
    expect(screen.getByTestId('importer-catalog-group-snapgene')).toBeTruthy();
    expect(screen.getByTestId('catalog-mine-empty')).toBeTruthy();
  });

  it('2) Library entries with folderPath surface as nested folder rows; tags do NOT create folders', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        // Two entries pinned to the «vector» folder (different tags
        // should NOT split them — folder placement is the only
        // grouping dimension).
        e1: { id: 'e1', kind: 'container', name: 'pUC-A', tags: ['cloning'], folderPath: 'vector', addedAt: '2026-05-01', payload: { length: 2700, sequence: 'A'.repeat(2700), topology: 'circular', annotations: [] } },
        e2: { id: 'e2', kind: 'container', name: 'pET-B', tags: ['expression', 'lab'], folderPath: 'vector', addedAt: '2026-05-01', payload: { length: 5300, sequence: 'A'.repeat(5300), topology: 'circular', annotations: [] } },
        // Tagged but unfoldered → top of Mine, not in any folder.
        e3: { id: 'e3', kind: 'container', name: 'sfGFP-cds', tags: ['fluorescent'], folderPath: '', addedAt: '2026-05-01', payload: { length: 720, sequence: 'A'.repeat(720), topology: 'linear', annotations: [] } },
      };
    });
    render(
      <CatalogColumn
        query="" onQueryChange={() => {}}
        activeSource={null} onActiveSourceChange={() => {}}
        onSelectItem={() => {}}
        onFiles={() => {}} onPasteText={() => {}}
      />,
    );
    // Only the «vector» folder bucket exists — tags don't spawn
    // folders any more.
    await waitFor(() => {
      expect(screen.getByTestId('importer-catalog-mine-folder-vector')).toBeTruthy();
    });
    expect(screen.queryByTestId('importer-catalog-mine-folder-expression')).toBeNull();
    expect(screen.queryByTestId('importer-catalog-mine-folder-cloning')).toBeNull();
    expect(screen.queryByTestId('importer-catalog-mine-folder-fluorescent')).toBeNull();

    // Items inside «vector» are hidden until the row is expanded.
    expect(screen.queryByTestId('importer-catalog-item-e1')).toBeNull();
    fireEvent.click(screen.getByTestId('importer-catalog-mine-folder-vector'));
    expect(screen.getByTestId('importer-catalog-item-e1')).toBeTruthy();
    expect(screen.getByTestId('importer-catalog-item-e2')).toBeTruthy();
  });

  it('3) flat search activates banner + filters across loaded items', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', kind: 'container', name: 'pUC19-mine', tags: [], addedAt: '2026-05-01', payload: { length: 2700, sequence: 'A'.repeat(2700), topology: 'circular', annotations: [] } },
      };
    });
    let query = '';
    const onChange = vi.fn((q) => { query = q; });
    const { rerender } = render(
      <CatalogColumn
        query={query} onQueryChange={onChange}
        activeSource={null} onActiveSourceChange={() => {}}
        onSelectItem={() => {}}
        onFiles={() => {}} onPasteText={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('importer-catalog-search'), { target: { value: 'pUC' } });
    expect(onChange).toHaveBeenCalledWith('pUC');

    rerender(
      <CatalogColumn
        query="pUC" onQueryChange={onChange}
        activeSource={null} onActiveSourceChange={() => {}}
        onSelectItem={() => {}}
        onFiles={() => {}} onPasteText={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('importer-catalog-flat-banner')).toBeTruthy();
    });
    // pUC19-mine matches; results pane visible.
    await waitFor(() => {
      expect(screen.getByTestId('importer-catalog-flat-results')).toBeTruthy();
    });
  });

  it('4) paste textarea Ctrl+Enter calls onPasteText with the trimmed value', () => {
    const onPasteText = vi.fn();
    render(
      <CatalogColumn
        query="" onQueryChange={() => {}}
        activeSource={null} onActiveSourceChange={() => {}}
        onSelectItem={() => {}}
        onFiles={() => {}} onPasteText={onPasteText}
      />,
    );
    const ta = screen.getByTestId('importer-catalog-paste');
    fireEvent.change(ta, { target: { value: '  ATGCATGC  ' } });
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    expect(onPasteText).toHaveBeenCalledWith('ATGCATGC');
  });

  it('5) folder/file creation is Mine-only: «＋»/«⤓» on Mine header, none on Canvas/Demo/SnapGene', () => {
    render(
      <CatalogColumn
        query="" onQueryChange={() => {}}
        activeSource={null} onActiveSourceChange={() => {}}
        onSelectItem={() => {}}
        onFiles={() => {}} onPasteText={() => {}}
      />,
    );
    // Mine — «＋» (new folder) and «⤓» (import file) live on the header.
    expect(screen.getByTestId('importer-catalog-add-child-mine-root')).toBeTruthy();
    expect(screen.getByTestId('importer-catalog-add-file-mine-root')).toBeTruthy();
    // Canvas / Demo / SnapGene are read-only or driven by other flows —
    // biolog: «запрети создавать папки и файлы внутри снапген демо и
    // прочих кроме библиотеки».
    expect(screen.queryByTestId('importer-catalog-add-child-canvas-root')).toBeNull();
    expect(screen.queryByTestId('importer-catalog-add-child-demo-root')).toBeNull();
    expect(screen.queryByTestId('importer-catalog-add-child-snapgene-root')).toBeNull();

    // Folder creation flow on Mine: ＋ → inline input → Enter creates folder.
    fireEvent.click(screen.getByTestId('importer-catalog-add-child-mine-root'));
    const input = screen.getByTestId('importer-catalog-new-folder-input-mine');
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Vectors-2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('importer-catalog-mine-folder-Vectors-2026')).toBeTruthy();
    // The new folder gets its own «＋» + «⤓» — Mine sub-folders stay
    // creation-enabled too, up to MAX_INDENT_DEPTH.
    expect(screen.getByTestId('importer-catalog-add-child-mine-Vectors-2026')).toBeTruthy();
    expect(screen.getByTestId('importer-catalog-add-file-mine-Vectors-2026')).toBeTruthy();
  });

  it('6) drop file fires onFiles with the dropped File', async () => {
    const onFiles = vi.fn();
    render(
      <CatalogColumn
        query="" onQueryChange={() => {}}
        activeSource={null} onActiveSourceChange={() => {}}
        onSelectItem={() => {}}
        onFiles={onFiles} onPasteText={() => {}}
      />,
    );
    const dz = screen.getByTestId('importer-catalog-dropzone');
    const file = new File(['>x\nATG'], 'x.fasta', { type: 'text/plain' });
    await act(async () => {
      fireEvent.drop(dz, { dataTransfer: { files: [file], types: ['Files'] } });
    });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});
