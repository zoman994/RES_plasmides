/**
 * Sprint IS-Final K3 — CatalogPanel (left column rebuild).
 *
 * Replaces CatalogTree as the always-visible left column with three
 * collapsible groups + cross-category search + drop-zone footer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import CatalogPanel, { __resetCachesForTest, parseLengthPattern, applyCatalogFilter } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0',
  total: 3,
  categories: [
    { slug: 'basic_cloning_vectors', name: 'Basic Cloning Vectors', count: 2 },
    { slug: 'crispr_plasmids', name: 'CRISPR Plasmids', count: 1 },
  ],
};

const FAKE_BASIC = {
  plasmids: [
    {
      id: 'sg_pUC19', name: 'pUC19', sequence: 'A'.repeat(2686), length: 2686,
      topology: 'circular', annotations: [], description: 'small cloning vector',
    },
    {
      id: 'sg_pBR322', name: 'pBR322', sequence: 'A'.repeat(4361), length: 4361,
      topology: 'circular', annotations: [], description: 'classic backbone',
    },
  ],
};
const FAKE_CRISPR = {
  plasmids: [
    {
      id: 'sg_pAC94', name: 'pAC94-pmax-dCas9VP160', sequence: 'A'.repeat(8500), length: 8500,
      topology: 'circular', annotations: [], description: 'CRISPRa activator',
    },
  ],
};

function makeFetchMock() {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('plasmids-index.json')) return { ok: true, json: async () => FAKE_INDEX };
    if (u.endsWith('basic_cloning_vectors.json')) return { ok: true, json: async () => FAKE_BASIC };
    if (u.endsWith('crispr_plasmids.json')) return { ok: true, json: async () => FAKE_CRISPR };
    return { ok: false, status: 404 };
  });
}

describe('CatalogPanel — length-pattern parser', () => {
  it('parses >5000 / >5kb → { min: 5000 }', () => {
    expect(parseLengthPattern('>5000')).toEqual({ min: 5000 });
    expect(parseLengthPattern('>5kb')).toEqual({ min: 5000 });
    expect(parseLengthPattern('>5k')).toEqual({ min: 5000 });
  });
  it('parses <2000 / <2kb → { max: 2000 }', () => {
    expect(parseLengthPattern('<2000')).toEqual({ max: 2000 });
    expect(parseLengthPattern('<2kb')).toEqual({ max: 2000 });
  });
  it('parses range 2k-3k / 2000-3000 → { min, max }', () => {
    expect(parseLengthPattern('2k-3k')).toEqual({ min: 2000, max: 3000 });
    expect(parseLengthPattern('2000-3000')).toEqual({ min: 2000, max: 3000 });
  });
  it('returns null for non-length queries', () => {
    expect(parseLengthPattern('pUC19')).toBeNull();
    expect(parseLengthPattern('CRISPR')).toBeNull();
  });
});

describe('CatalogPanel — applyCatalogFilter', () => {
  const items = [
    { name: 'pUC19', description: 'small', length: 2686 },
    { name: 'pBR322', description: 'classic', length: 4361 },
    { name: 'pAC94', description: 'CRISPRa activator', length: 8500 },
  ];
  it('filters by length-pattern >5000', () => {
    const out = applyCatalogFilter(items, '>5000');
    expect(out.map((i) => i.name)).toEqual(['pAC94']);
  });
  it('filters by name substring', () => {
    const out = applyCatalogFilter(items, 'pUC');
    expect(out.map((i) => i.name)).toEqual(['pUC19']);
  });
  it('filters by description', () => {
    const out = applyCatalogFilter(items, 'CRISPR');
    expect(out.map((i) => i.name)).toEqual(['pAC94']);
  });
  it('empty query returns all', () => {
    expect(applyCatalogFilter(items, '')).toHaveLength(3);
  });
});

describe('CatalogPanel — render + interactions', () => {
  let origFetch;
  beforeEach(() => {
    __resetCachesForTest();
    origFetch = globalThis.fetch;
    globalThis.fetch = makeFetchMock();
    useStore.setState({ parts: [] });
    try { localStorage.clear(); } catch { /* jsdom */ }
  });
  afterEach(() => { globalThis.fetch = origFetch; });

  it('renders search input + 3 group headers with default collapsed state for snapgene', async () => {
    const { findByTestId } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} />
    );
    expect(await findByTestId('catalog-search-input')).toBeTruthy();
    expect(await findByTestId('catalog-group-learn-toggle')).toBeTruthy();
    expect(await findByTestId('catalog-group-mine-toggle')).toBeTruthy();
    const snap = await findByTestId('catalog-group-snapgene-toggle');
    // Default closed → caret is ▸
    expect(snap.textContent).toMatch(/▸/);
  });

  it('typing in search prefetches all categories + filters across them', async () => {
    const { findByTestId, findByText } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} />
    );
    const input = await findByTestId('catalog-search-input');
    fireEvent.change(input, { target: { value: 'pAC94' } });
    expect(await findByText('pAC94-pmax-dCas9VP160', {}, { timeout: 1500 })).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('basic_cloning_vectors.json'));
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('crispr_plasmids.json'));
  });

  it('cross-category search results carry _badge from category name', async () => {
    const { findByTestId, findByText, findAllByText } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} />
    );
    const input = await findByTestId('catalog-search-input');
    fireEvent.change(input, { target: { value: 'p' } });
    await findByText('pUC19', {}, { timeout: 1500 });
    // Badge appears on each result card from Basic Cloning Vectors category.
    const badges = await findAllByText(/Basic Cloning Vectors/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('length-pattern >5000 finds only large plasmids', async () => {
    const { findByTestId, findByText, queryByText } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} />
    );
    const input = await findByTestId('catalog-search-input');
    fireEvent.change(input, { target: { value: '>5kb' } });
    await findByText('pAC94-pmax-dCas9VP160', {}, { timeout: 1500 });
    await waitFor(() => {
      expect(queryByText('pUC19')).toBeNull();
      expect(queryByText('pBR322')).toBeNull();
    });
  });

  it('collapsible group state persists in localStorage', async () => {
    const { findByTestId } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} />
    );
    const snapHeader = await findByTestId('catalog-group-snapgene-toggle');
    fireEvent.click(snapHeader); // toggle from collapsed (default) → expanded
    expect(localStorage.getItem('pvcs-catalog-group-snapgene')).toBe('open');
    fireEvent.click(snapHeader);
    expect(localStorage.getItem('pvcs-catalog-group-snapgene')).toBe('closed');
  });

  it('drop-zone accepts files via drop + invokes onFiles', async () => {
    const onFiles = vi.fn();
    const { findByTestId } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={onFiles} />
    );
    const dz = await findByTestId('catalog-dropzone');
    const file = new File(['LOCUS x'], 'pUC19.gb', { type: 'text/plain' });
    fireEvent.drop(dz, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('pUC19.gb');
  });

  it('drop-zone click opens hidden file picker', async () => {
    const onFiles = vi.fn();
    const { findByTestId } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={onFiles} />
    );
    const picker = await findByTestId('catalog-file-picker');
    expect(picker.tagName).toBe('INPUT');
    expect(picker.type).toBe('file');
    expect(picker.multiple).toBe(true);
    const file = new File(['x'], 'pBR322.gb', { type: 'text/plain' });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('drop-zone Ctrl+V paste >50 chars invokes onPasteText', async () => {
    const onPasteText = vi.fn();
    const { findByTestId } = render(
      <CatalogPanel onSelectItem={vi.fn()} onFiles={vi.fn()} onPasteText={onPasteText} />
    );
    const dz = await findByTestId('catalog-dropzone');
    const long = 'A'.repeat(60);
    fireEvent.paste(dz, { clipboardData: { getData: () => long } });
    expect(onPasteText).toHaveBeenCalledWith(long);
  });

  it('progress overlay shows when progress.total > 1', async () => {
    const { findByTestId } = render(
      <CatalogPanel
        onSelectItem={vi.fn()}
        onFiles={vi.fn()}
        progress={{ current: 3, total: 5 }}
      />
    );
    const bar = await findByTestId('catalog-import-progress');
    expect(bar.textContent).toMatch(/3 из 5/);
  });

  it('clicking SnapGene category loads items + clicking card invokes onSelectItem', async () => {
    const onSelect = vi.fn();
    const { findByText, findByTestId } = render(
      <CatalogPanel onSelectItem={onSelect} onFiles={vi.fn()} />
    );
    // expand SnapGene group
    const snapToggle = await findByTestId('catalog-group-snapgene-toggle');
    fireEvent.click(snapToggle);
    const catBtn = await findByText('Basic Cloning Vectors');
    fireEvent.click(catBtn);
    const card = await findByTestId('catalog-card-pUC19');
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].name).toBe('pUC19');
  });
});
