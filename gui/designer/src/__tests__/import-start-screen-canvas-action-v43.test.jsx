/**
 * Sprint Catalog Polish K1 (V43) — `На канвас` always-append regression.
 *
 * Contract: handleAction('canvas') in ImportStartScreen never invokes
 * window.confirm. Multiple clicks append multiple fragments unconditionally.
 * Catalog click confirm on single mode is unrelated and must continue to fire.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ImportStartScreen from '../components/ImportStartScreen';
import { __resetCachesForTest } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0', total: 1,
  categories: [
    { slug: 'basic_cloning_vectors', name: 'Basic Cloning Vectors', count: 1 },
  ],
};
const FAKE_BASIC = {
  plasmids: [
    { id: 'sg_pUC19', name: 'pUC19', sequence: 'A'.repeat(2686), length: 2686, topology: 'circular', annotations: [], description: 'small' },
  ],
};

function makeFetchMock() {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('plasmids-index.json')) return { ok: true, json: async () => FAKE_INDEX };
    if (u.endsWith('basic_cloning_vectors.json')) return { ok: true, json: async () => FAKE_BASIC };
    return { ok: false, status: 404 };
  });
}

describe('V43 — На канвас always-append (no confirm)', () => {
  let origFetch;
  let origConfirm;
  beforeEach(() => {
    __resetCachesForTest();
    origFetch = globalThis.fetch;
    origConfirm = window.confirm;
    globalThis.fetch = makeFetchMock();
    // Reset store to empty active assembly + empty parts
    useStore.setState((s) => ({
      ...s,
      parts: [],
      autoAnnotateOnImport: false,
      assemblies: [
        { id: 'asm_test', name: 'Сборка 1', fragments: [], junctions: [], primers: [] },
      ],
      activeId: 'asm_test',
    }));
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    window.confirm = origConfirm;
  });

  async function loadSinglePlasmid() {
    const r = render(<ImportStartScreen open onClose={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Basic Cloning Vectors'));
    fireEvent.click(await r.findByTestId('catalog-card-pUC19'));
    await r.findByTestId('single-inspector');
    return r;
  }

  it('clicking «На канвас» 3 times appends 3 fragments without invoking window.confirm', async () => {
    window.confirm = vi.fn(() => false); // would block if called
    const r = await loadSinglePlasmid();

    const canvasBtn = await r.findByTestId('action-canvas');
    fireEvent.click(canvasBtn);
    await waitFor(() => expect(useStore.getState().assemblies[0].fragments.length).toBe(1));
    fireEvent.click(canvasBtn);
    await waitFor(() => expect(useStore.getState().assemblies[0].fragments.length).toBe(2));
    fireEvent.click(canvasBtn);
    await waitFor(() => expect(useStore.getState().assemblies[0].fragments.length).toBe(3));

    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('addedItems session log grows from 0 → 1 → 2 → 3 across 3 «На канвас» clicks', async () => {
    window.confirm = vi.fn(() => false);
    const r = await loadSinglePlasmid();

    const canvasBtn = await r.findByTestId('action-canvas');
    fireEvent.click(canvasBtn);
    await waitFor(() => expect(r.queryAllByText(/✓ УЖЕ ДОБАВЛЕНО/i).length).toBeGreaterThan(0));
    // each click adds a new entry — the session log lists pUC19 once per click.
    fireEvent.click(canvasBtn);
    fireEvent.click(canvasBtn);

    await waitFor(() => {
      expect(useStore.getState().assemblies[0].fragments.length).toBe(3);
    });
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('catalog click on single mode still triggers window.confirm («Заменить текущий файл?») — V43 fix is scoped to canvas-action only', async () => {
    window.confirm = vi.fn(() => false);
    const r = await loadSinglePlasmid();
    // Click another (same) catalog card → confirm fires.
    fireEvent.click(await r.findByTestId('catalog-card-pUC19'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Заменить текущий файл/));
  });
});
