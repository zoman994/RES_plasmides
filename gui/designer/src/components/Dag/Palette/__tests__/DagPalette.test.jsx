/**
 * DagPalette — Sprint M-C.1 K3 component tests.
 *
 * Read-only browse subset of LibraryTree (DEC-MC1-03). Reuses
 * `useCatalogSources` for the four groups. No folder tree, no folder
 * creation, no dropzone, no paste textarea — only sticky search,
 * group headers, drag-source rows, and click→preview.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useStore } from '../../../../store';
import { __resetCachesForTest } from '../../../Library/lib/catalog-cache';
import DagPalette from '../DagPalette';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: ({ name }) => <div data-testid={`mini-map-${name || 'mm'}`}>map</div>,
}));

const MOCK_INDEX = { total: 1, categories: [{ slug: 'demo_cat', name: 'Demo cat', count: 2 }] };
const MOCK_BASIC = {
  plasmids: [
    { id: 'demo_pUC19', name: 'pUC19', length: 2686, topology: 'circular', annotations: [] },
    { id: 'demo_pET28a', name: 'pET28a', length: 5369, topology: 'circular', annotations: [] },
  ],
};

async function reset() {
  __resetCachesForTest();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s._libraryHydrated = true;
    s.projects = {};
    s.currentProjectId = null;
  });
  vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    if (url.includes('plasmids-index')) return { ok: true, json: async () => MOCK_INDEX };
    if (url.includes('basic_cloning_vectors')) return { ok: true, json: async () => MOCK_BASIC };
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

beforeEach(reset);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('M-C.1 K3 — DagPalette', () => {
  it('renders 4 group headers in canonical order: thisProject → demo → mine → snapgene', async () => {
    render(<DagPalette onPreview={() => {}} />);
    const headers = await waitFor(() => {
      const h = screen.queryAllByTestId(/^dag-palette-group-/);
      if (h.length < 4) throw new Error('not yet');
      return h;
    });
    const keys = headers.map(h => h.dataset.groupKey || h.getAttribute('data-group-key'));
    expect(keys).toEqual(['thisProject', 'demo', 'mine', 'snapgene']);
  });

  it('search filter narrows visible items by name match', async () => {
    useStore.setState((s) => {
      s.libraryEntries['lib-aa'] = {
        id: 'lib-aa', kind: 'container', name: 'pBR322', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'A'.repeat(4361), length: 4361, topology: 'circular', annotations: [] },
        ext: {},
      };
      s.libraryEntries['lib-bb'] = {
        id: 'lib-bb', kind: 'container', name: 'pUC18', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'A'.repeat(2686), length: 2686, topology: 'circular', annotations: [] },
        ext: {},
      };
    });
    render(<DagPalette onPreview={() => {}} />);
    const search = screen.getByTestId('dag-palette-search');
    fireEvent.change(search, { target: { value: 'pBR' } });
    // Only pBR322 should be visible.
    await waitFor(() => {
      expect(screen.queryByTestId('dag-palette-row-lib-aa')).toBeTruthy();
      expect(screen.queryByTestId('dag-palette-row-lib-bb')).toBeNull();
    });
  });

  it('search filter supports length pattern «>5kb» (matches anything longer than 5000 bp)', async () => {
    useStore.setState((s) => {
      s.libraryEntries['lib-small'] = {
        id: 'lib-small', kind: 'container', name: 'pUC18', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'A'.repeat(2686), length: 2686, topology: 'circular', annotations: [] },
        ext: {},
      };
      s.libraryEntries['lib-big'] = {
        id: 'lib-big', kind: 'container', name: 'pET28', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'A'.repeat(7400), length: 7400, topology: 'circular', annotations: [] },
        ext: {},
      };
    });
    render(<DagPalette onPreview={() => {}} />);
    const search = screen.getByTestId('dag-palette-search');
    fireEvent.change(search, { target: { value: '>5kb' } });
    await waitFor(() => {
      expect(screen.queryByTestId('dag-palette-row-lib-small')).toBeNull();
      expect(screen.queryByTestId('dag-palette-row-lib-big')).toBeTruthy();
    });
  });

  it('search filter supports length pattern «<2k» (matches shorter than 2000 bp)', async () => {
    useStore.setState((s) => {
      s.libraryEntries['lib-tiny'] = {
        id: 'lib-tiny', kind: 'container', name: 'tiny', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'A'.repeat(800), length: 800, topology: 'linear', annotations: [] },
        ext: {},
      };
      s.libraryEntries['lib-mid'] = {
        id: 'lib-mid', kind: 'container', name: 'mid', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'A'.repeat(3000), length: 3000, topology: 'linear', annotations: [] },
        ext: {},
      };
    });
    render(<DagPalette onPreview={() => {}} />);
    fireEvent.change(screen.getByTestId('dag-palette-search'), { target: { value: '<2k' } });
    await waitFor(() => {
      expect(screen.queryByTestId('dag-palette-row-lib-tiny')).toBeTruthy();
      expect(screen.queryByTestId('dag-palette-row-lib-mid')).toBeNull();
    });
  });

  it('drag handle ⋮⋮ initiates a native HTML5 drag with the DAG MIME and the libraryEntryId payload', async () => {
    useStore.setState((s) => {
      s.libraryEntries['lib-drag'] = {
        id: 'lib-drag', kind: 'container', name: 'drag-me', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'AAA', length: 3, topology: 'linear', annotations: [] },
        ext: {},
      };
    });
    render(<DagPalette onPreview={() => {}} />);
    const handle = await waitFor(() => screen.getByTestId('dag-palette-drag-handle-lib-drag'));
    const setData = vi.fn();
    fireEvent.dragStart(handle, {
      dataTransfer: {
        setData,
        types: [],
        effectAllowed: '',
      },
    });
    expect(setData).toHaveBeenCalledWith('application/x-bodgegene-dag-add', 'lib-drag');
  });

  it('clicking a row calls onPreview with the entry', async () => {
    const onPreview = vi.fn();
    useStore.setState((s) => {
      s.libraryEntries['lib-click'] = {
        id: 'lib-click', kind: 'container', name: 'click-me', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'AAA', length: 3, topology: 'linear', annotations: [] },
        ext: {},
      };
    });
    render(<DagPalette onPreview={onPreview} />);
    const row = await waitFor(() => screen.getByTestId('dag-palette-row-lib-click'));
    fireEvent.click(row);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0][0]).toMatchObject({ id: 'lib-click', name: 'click-me' });
  });

  it('group toggle collapses and expands the items', async () => {
    useStore.setState((s) => {
      s.libraryEntries['lib-toggle'] = {
        id: 'lib-toggle', kind: 'container', name: 'toggle-me', tags: [], addedAt: '2026-05-07T00:00:00.000Z',
        payload: { sequence: 'AAA', length: 3, topology: 'linear', annotations: [] },
        ext: {},
      };
    });
    render(<DagPalette onPreview={() => {}} />);
    const row = await waitFor(() => screen.getByTestId('dag-palette-row-lib-toggle'));
    expect(row).toBeTruthy();
    const header = screen.getByTestId('dag-palette-group-mine');
    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.queryByTestId('dag-palette-row-lib-toggle')).toBeNull();
    });
    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.queryByTestId('dag-palette-row-lib-toggle')).toBeTruthy();
    });
  });
});
