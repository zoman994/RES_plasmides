/**
 * Sprint Catalog Polish FIX F5' — catalog SnapGene ≤20 kb filter + skip empty
 * categories.
 *
 * Игорь 28.04.2026: «Давай пока ограничимся плазмидами до 20кб» (universal
 * threshold) + «удалить просто» (категории с post-filter count=0 не рендерятся).
 *
 * Catalog data audit: 2822 → 2799 plasmids (-23), 1 empty category
 * (coronavirus_resources: 4 → 0).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import CatalogPanel, { __resetCachesForTest } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0', total: 5,
  categories: [
    { slug: 'small_vectors', name: 'Small Vectors', count: 2 },
    { slug: 'mixed_vectors', name: 'Mixed Vectors', count: 2 },
    { slug: 'coronavirus_resources', name: 'Coronavirus Resources', count: 1 },
  ],
};
// All ≤ 20kb → both kept.
const FAKE_SMALL = {
  plasmids: [
    { id: 'sm_a', name: 'pSmallA', sequence: 'A'.repeat(2000), length: 2000, topology: 'circular', annotations: [], description: 'small' },
    { id: 'sm_b', name: 'pSmallB', sequence: 'A'.repeat(3500), length: 3500, topology: 'circular', annotations: [], description: 'small' },
  ],
};
// One ≤ 20kb, one > 20kb → 1 kept.
const FAKE_MIXED = {
  plasmids: [
    { id: 'mx_in',  name: 'pMixedIn',  sequence: 'A'.repeat(8000),  length: 8000,  topology: 'circular', annotations: [], description: 'in' },
    { id: 'mx_out', name: 'pMixedOut', sequence: 'A'.repeat(25000), length: 25000, topology: 'circular', annotations: [], description: 'out' },
  ],
};
// All > 20kb → 0 kept, category should be hidden.
const FAKE_CORONA = {
  plasmids: [
    { id: 'cv_genome', name: 'SARS-CoV-2 Genome', sequence: 'A'.repeat(29900), length: 29900, topology: 'linear', annotations: [], description: 'big' },
  ],
};

function makeFetchMock() {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('plasmids-index.json')) return { ok: true, json: async () => FAKE_INDEX };
    if (u.endsWith('small_vectors.json')) return { ok: true, json: async () => FAKE_SMALL };
    if (u.endsWith('mixed_vectors.json')) return { ok: true, json: async () => FAKE_MIXED };
    if (u.endsWith('coronavirus_resources.json')) return { ok: true, json: async () => FAKE_CORONA };
    return { ok: false, status: 404 };
  });
}

describe('F5ʼ — catalog ≤20 kb filter & empty category skip', () => {
  let origFetch;
  beforeEach(() => {
    __resetCachesForTest();
    origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock();
    useStore.setState({ parts: [] });
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('Coronavirus category is skipped from SnapGene tree (post-filter count=0)', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    // Wait for prefetch to populate filteredCounts (categories then re-render).
    await waitFor(() => expect(r.queryByText('Small Vectors')).toBeTruthy());
    expect(r.queryByText('Coronavirus Resources')).toBeNull();
    // Mixed Vectors stays — has 1 plasmid ≤20kb.
    expect(r.queryByText('Mixed Vectors')).toBeTruthy();
  });

  it('Mixed category click → only ≤20kb plasmids appear in card list', async () => {
    const r = render(<CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    await waitFor(() => expect(r.queryByText('Mixed Vectors')).toBeTruthy());
    fireEvent.click(r.getByText('Mixed Vectors'));
    expect(await r.findByTestId('catalog-card-pMixedIn')).toBeTruthy();
    expect(r.queryByTestId('catalog-card-pMixedOut')).toBeNull();
  });
});
