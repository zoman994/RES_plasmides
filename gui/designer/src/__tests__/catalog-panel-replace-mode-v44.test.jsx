/**
 * Sprint Catalog Polish K5 (V44) — CatalogPanel replace-mode.
 *
 * Pre-fix: clicking a category in the tree expanded items _below_ the entire
 * tree + drop-zone footer. On a 600 px viewport biolog never saw them.
 *
 * Fix: when `activeNode != null && !searchActive` the tree hides, a header
 * `← Назад · {label} ({count})` appears at the top of the scroll area, and
 * items render directly below it. Search-mode (`searchActive`) is unchanged
 * and wins over replace-mode if both happen simultaneously.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import CatalogPanel, { __resetCachesForTest } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0', total: 2,
  categories: [
    { slug: 'basic_cloning_vectors', name: 'Basic Cloning Vectors', count: 1 },
    { slug: 'insect_cell_vectors', name: 'Insect Cell Vectors', count: 1 },
  ],
};
const FAKE_BASIC = {
  plasmids: [
    { id: 'sg_pUC19', name: 'pUC19', sequence: 'A'.repeat(2686), length: 2686, topology: 'circular', annotations: [], description: 'Basic vector' },
  ],
};
const FAKE_INSECT = {
  plasmids: [
    { id: 'sg_pIB', name: 'pIB-V5/His', sequence: 'A'.repeat(3470), length: 3470, topology: 'circular', annotations: [], description: 'Insect cell vector' },
  ],
};

function makeFetchMock() {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('plasmids-index.json')) return { ok: true, json: async () => FAKE_INDEX };
    if (u.endsWith('basic_cloning_vectors.json')) return { ok: true, json: async () => FAKE_BASIC };
    if (u.endsWith('insect_cell_vectors.json')) return { ok: true, json: async () => FAKE_INSECT };
    return { ok: false, status: 404 };
  });
}

const MINE_PROMOTER = {
  id: 'mine_lac',
  name: 'lacP_user',
  type: 'promoter',
  sequence: 'A'.repeat(150),
  length: 150,
  topology: 'linear',
  annotations: [],
  description: 'user-saved promoter',
};

describe('V44 — CatalogPanel replace-mode (snapgene / mine / demo) and search interplay', () => {
  let origFetch;
  beforeEach(() => {
    __resetCachesForTest();
    origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock();
    useStore.setState({ parts: [MINE_PROMOTER] });
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('snapgene category click → tree hidden, replace-mode back-header rendered, items inline', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Insect Cell Vectors'));
    // Tree is hidden — group toggle buttons gone.
    await waitFor(() => expect(r.queryByTestId('catalog-group-learn-toggle')).toBeNull());
    expect(r.queryByTestId('catalog-group-mine-toggle')).toBeNull();
    expect(r.queryByTestId('catalog-group-snapgene-toggle')).toBeNull();
    // Replace-mode header is rendered with label + count.
    const back = await r.findByTestId('catalog-replace-mode-back');
    expect(back.textContent).toMatch(/Назад/);
    expect(back.textContent).toMatch(/Insect Cell Vectors/);
    // Items rendered.
    expect(await r.findByTestId('catalog-card-pIB-V5/His')).toBeTruthy();
  });

  it('clicking ← Back resets activeNode and tree returns', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Insect Cell Vectors'));
    fireEvent.click(await r.findByTestId('catalog-replace-mode-back'));
    // Tree group toggles are back.
    await waitFor(() => expect(r.queryByTestId('catalog-group-snapgene-toggle')).toBeTruthy());
    expect(r.queryByTestId('catalog-replace-mode-back')).toBeNull();
  });

  it('mine group click → same replace-mode behavior (tree hidden, header «Промоторы»)', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    // Mine group is open by default — click the Промоторы row.
    fireEvent.click(await r.findByText('Промоторы'));
    const back = await r.findByTestId('catalog-replace-mode-back');
    expect(back.textContent).toMatch(/Промоторы/);
    expect(r.queryByTestId('catalog-group-snapgene-toggle')).toBeNull();
  });

  it('demo node click → replace-mode with «Базовые плазмиды» header', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    fireEvent.click(await r.findByText('Базовые плазмиды'));
    const back = await r.findByTestId('catalog-replace-mode-back');
    expect(back.textContent).toMatch(/Базовые плазмиды/);
    expect(r.queryByTestId('catalog-group-snapgene-toggle')).toBeNull();
  });

  it('search active + activeNode set → search wins, replace-mode header NOT rendered', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Basic Cloning Vectors'));
    await r.findByTestId('catalog-replace-mode-back');
    // Now type in search box — replace-mode header should disappear.
    fireEvent.change(r.getByTestId('catalog-search-input'), { target: { value: 'puc' } });
    await waitFor(() => expect(r.queryByTestId('catalog-replace-mode-back')).toBeNull());
  });
});
