/**
 * Sprint Catalog Polish K3 (V48) — `Открыть холст →` closes modal.
 *
 * Bug pre-fix: SingleInspector wired SessionSummary's onOpenCanvas to
 * `onCloseSession` (= resetSession), which only cleared inputs but kept
 * the modal open. Fix: SingleInspector's `onOpenCanvas` (= handleClose)
 * now closes the modal on click. The legacy ↻ замена файла button (for
 * `onReplaceFile`) was dropped in a follow-up — biolog flagged it as a
 * duplicate of clicking another catalog plasmid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ImportStartScreen from '../components/ImportStartScreen';
import { __resetCachesForTest } from '../components/ImportStartScreen/CatalogPanel';
import { useStore } from '../store';

const FAKE_INDEX = {
  version: '1.0', total: 1,
  categories: [{ slug: 'basic_cloning_vectors', name: 'Basic Cloning Vectors', count: 1 }],
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

describe('V48 — Открыть холст closes modal', () => {
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

  async function loadSinglePlasmidAndAddToCanvas() {
    const onClose = vi.fn();
    const r = render(<ImportStartScreen open onClose={onClose} />);
    fireEvent.click(await r.findByTestId('catalog-group-snapgene-toggle'));
    fireEvent.click(await r.findByText('Basic Cloning Vectors'));
    fireEvent.click(await r.findByTestId('catalog-card-pUC19'));
    await r.findByTestId('single-inspector');
    fireEvent.click(await r.findByTestId('action-canvas'));
    await r.findByTestId('session-summary-open-canvas');
    return { ...r, onClose };
  }

  it('clicking «Открыть холст →» fires the modal onClose callback', async () => {
    const r = await loadSinglePlasmidAndAddToCanvas();
    fireEvent.click(r.getByTestId('session-summary-open-canvas'));
    await waitFor(() => expect(r.onClose).toHaveBeenCalledTimes(1));
  });

  it('replace-file-link button is gone (duplicated catalog click — Игорь 28.04.2026)', async () => {
    const r = await loadSinglePlasmidAndAddToCanvas();
    expect(r.queryByTestId('replace-file-link')).toBeNull();
  });
});
