/**
 * Sprint IS-Final K4 — orchestrator: catalog-first two-column layout.
 *
 * Closes #1 (back navigation: catalog always visible) + #5 (catalog +
 * library + drop-zone in one persistent left column).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ImportStartScreen from '../components/ImportStartScreen';
import { __resetCachesForTest } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0', total: 2,
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

describe('ImportStartScreen IS-Final orchestrator', () => {
  let origFetch;
  let origConfirm;
  beforeEach(() => {
    __resetCachesForTest();
    origFetch = globalThis.fetch;
    origConfirm = window.confirm;
    globalThis.fetch = makeFetchMock();
    useStore.setState({ parts: [], autoAnnotateOnImport: true });
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    window.confirm = origConfirm;
  });

  it('empty state renders EmptyInspector + always-visible CatalogPanel', async () => {
    const { findByTestId } = render(<ImportStartScreen open onClose={vi.fn()} />);
    expect(await findByTestId('catalog-panel')).toBeTruthy();
    expect(await findByTestId('empty-inspector')).toBeTruthy();
  });

  it('catalog click on empty → state transitions to single-inspector', async () => {
    const { findByTestId, findByText, queryByTestId } = render(
      <ImportStartScreen open onClose={vi.fn()} />,
    );
    // expand SnapGene group
    fireEvent.click(await findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await findByText('Basic Cloning Vectors'));
    fireEvent.click(await findByTestId('catalog-card-pUC19'));
    expect(await findByTestId('single-inspector')).toBeTruthy();
    expect(queryByTestId('empty-inspector')).toBeNull();
  });

  it('catalog click on single → switches inspector silently (F2: confirm removed)', async () => {
    // Sprint Catalog Polish FIX F2: Игорь 28.04.2026 — «хочу чтобы просто
    // переключалось». Catalog click on a 2nd item must NOT fire window.confirm.
    window.confirm = vi.fn(() => false);
    const { findByTestId, findByText } = render(
      <ImportStartScreen open onClose={vi.fn()} />,
    );
    fireEvent.click(await findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await findByText('Basic Cloning Vectors'));
    fireEvent.click(await findByTestId('catalog-card-pUC19'));
    await findByTestId('single-inspector');
    fireEvent.click(await findByTestId('catalog-card-pUC19'));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('drag-drop one file → single inspector; drag-drop two files → multi inspector', async () => {
    const { findByTestId, queryByTestId } = render(
      <ImportStartScreen open onClose={vi.fn()} />,
    );
    const dz = await findByTestId('catalog-dropzone');
    const f1 = new File([
      'LOCUS one 100 bp linear\nORIGIN\n   1 atgcatgcat\n//',
    ], 'one.gb', { type: 'text/plain' });
    const f2 = new File([
      'LOCUS two 100 bp linear\nORIGIN\n   1 atgcatgcat\n//',
    ], 'two.gb', { type: 'text/plain' });
    fireEvent.drop(dz, { dataTransfer: { files: [f1, f2], types: ['Files'] } });
    await waitFor(() => expect(queryByTestId('multi-inspector')).toBeTruthy(), { timeout: 2000 });
  });

  it('catalog panel persists across single → if user clears, returns to empty', async () => {
    const { findByTestId, findByText, queryByTestId } = render(
      <ImportStartScreen open onClose={vi.fn()} />,
    );
    fireEvent.click(await findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await findByText('Basic Cloning Vectors'));
    fireEvent.click(await findByTestId('catalog-card-pUC19'));
    await findByTestId('single-inspector');
    // Trigger ↻ замена файла → resetSession → empty.
    fireEvent.click(await findByTestId('replace-file-link'));
    await waitFor(() => expect(queryByTestId('empty-inspector')).toBeTruthy());
    // Catalog panel still rendered.
    expect(await findByTestId('catalog-panel')).toBeTruthy();
  });
});
