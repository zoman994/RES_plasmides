/**
 * Sprint Catalog Polish FIX F2 — catalog click on single switches silently;
 * drag-drop file confirm and multi → batch confirm are unchanged.
 *
 * Игорь 28.04.2026: «хочу чтобы просто переключалось». Catalog click is a
 * preview gesture (no commitment), so confirm felt heavy. Drag-drop and
 * multi-batch replacements are explicit batch actions where confirm still
 * helps.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ImportStartScreen from '../components/ImportStartScreen';
import { __resetCachesForTest } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0', total: 2,
  categories: [{ slug: 'basic_cloning_vectors', name: 'Basic Cloning Vectors', count: 2 }],
};
const FAKE_BASIC = {
  plasmids: [
    { id: 'sg_pUC19', name: 'pUC19', sequence: 'A'.repeat(2686), length: 2686, topology: 'circular', annotations: [], description: 'small' },
    { id: 'sg_pBR322', name: 'pBR322', sequence: 'A'.repeat(4361), length: 4361, topology: 'circular', annotations: [], description: 'small2' },
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

describe('F2 — catalog click silent switch + preserved confirms elsewhere', () => {
  let origFetch;
  let origConfirm;
  beforeEach(() => {
    __resetCachesForTest();
    origFetch = globalThis.fetch;
    origConfirm = window.confirm;
    globalThis.fetch = makeFetchMock();
    useStore.setState((s) => ({
      ...s,
      parts: [],
      autoAnnotateOnImport: false,
      assemblies: [{ id: 'asm_test', name: 'Сборка 1', fragments: [], junctions: [], primers: [] }],
      activeId: 'asm_test',
    }));
    try { localStorage.clear(); } catch { /* */ }
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    window.confirm = origConfirm;
  });

  it('catalog click switches to a different plasmid silently — no confirm, inspector reflects new name', async () => {
    window.confirm = vi.fn(() => false); // would block if called
    const r = render(<ImportStartScreen open onClose={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Basic Cloning Vectors'));
    fireEvent.click(await r.findByTestId('catalog-card-pUC19'));
    const inspector = await r.findByTestId('single-inspector');
    expect(inspector.textContent).toMatch(/pUC19/);
    // Switch to a different plasmid — must NOT trigger confirm.
    fireEvent.click(await r.findByTestId('catalog-card-pBR322'));
    await waitFor(() => expect(r.getByTestId('single-inspector').textContent).toMatch(/pBR322/));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('drag-drop a 2nd file onto an active single inspector still triggers confirm («Заменить текущий файл?»)', async () => {
    window.confirm = vi.fn(() => false); // simulate decline → no replace
    const r = render(<ImportStartScreen open onClose={vi.fn()} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Basic Cloning Vectors'));
    fireEvent.click(await r.findByTestId('catalog-card-pUC19'));
    await r.findByTestId('single-inspector');
    // Now drop another file onto the dropzone — single-mode replace path
    // still asks for confirmation.
    const dz = await r.findByTestId('catalog-dropzone');
    const f1 = new File([
      'LOCUS new 100 bp linear\nORIGIN\n   1 atgcatgcat\n//',
    ], 'new.gb', { type: 'text/plain' });
    fireEvent.drop(dz, { dataTransfer: { files: [f1], types: ['Files'] } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Заменить текущий файл/)));
  });
});
