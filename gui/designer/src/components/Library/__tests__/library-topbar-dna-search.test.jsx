/**
 * LibraryTopBar — universal smart search (P2, was DNA-only M-X.9 K3).
 *
 * One box over the whole library: name / tag / type / feature AND sequence
 * (IUPAC + circular). Metadata is instant; the sequence dim runs via the worker
 * facade (inline fallback under vitest). Results are debounced + async → the tests
 * await the rows. Click → caller handles selection + activation.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

const TARGET = `AAATTT${'GCATGCATGCATGCATGCATGC'}AAATTT`;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

function seedEntry(id, name, projectId, sequence, extra = {}) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId,
      kind: extra.kind || 'container',
      tags: extra.tags || [],
      payload: { sequence, length: sequence.length, topology: 'circular', annotations: extra.anns || [] },
    };
  });
}

describe('LibraryTopBar — universal search', () => {
  it('empty query → no results dropdown', () => {
    renderTopBar({ query: '' });
    expect(screen.queryByTestId('library-topbar-search-results')).toBeNull();
  });

  it('metadata: a name query surfaces the matching entry as a smart-result row', async () => {
    seedEntry('e1', 'plasmid-alpha', null, TARGET);
    renderTopBar({ query: 'alpha' });
    await waitFor(() => expect(screen.getByTestId('smart-result-e1')).toBeTruthy());
    expect(screen.getByTestId('smart-result-e1-title').querySelector('mark').textContent).toBe('alpha');
  });

  it('metadata: a TAG query surfaces an entry whose name does not match', async () => {
    seedEntry('e2', 'pUC19', null, TARGET, { tags: ['kanamycin'] });
    renderTopBar({ query: 'kanamycin' });
    await waitFor(() => expect(screen.getByTestId('smart-result-e2')).toBeTruthy());
    expect(screen.getByTestId('smart-result-e2-reason').textContent).toBe('тег');
  });

  it('DNA: a sequence query surfaces the hit with metrics; click → onPickSearchResult(entityRef, occurrence)', async () => {
    seedEntry('a', 'plasmid-A', null, TARGET);
    seedEntry('b', 'plasmid-B', null, 'CCCCCCCCCCCCCCCCCCCCCCCC');
    const onPick = vi.fn();
    renderTopBar({ query: 'GCATGCATGCATGC', onPickSearchResult: onPick });
    await waitFor(() => expect(screen.getByTestId('smart-result-a')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-b')).toBeNull(); // no motif in b
    // Identity, not «or compatibility»: an ACGT-only engine always knows the exact ratio, so the
    // alternation would let a compatibility-worded regression pass unnoticed. Read from the CANONICAL
    // cell at basis-point precision — the legacy sentence («100% идентичность», a float rounded to a
    // whole percent over a different denominator) no longer renders beside it (U5-A).
    expect(screen.getByTestId('smart-result-a-identity').textContent).toMatch(/^\d+\.\d{2}%$/);
    expect(screen.queryByTestId('smart-result-a-metrics')).toBeNull();
    fireEvent.click(screen.getByTestId('smart-result-a'));
    // kind-aware pick (§10.4): the RAW entityRef (kind+id, may carry revision); occurrence for the jump
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'entry', id: 'a' }),
      expect.objectContaining({ location: expect.anything() }),
    );
  });

  it('a degenerate motif is BLOCKED, not searched as a compatibility match (K3.0 §2.5)', async () => {
    // Superseded contract: `seq:GAANTC` used to return GAATTC as a «100% совместимость» hit.
    // DNA search is ACGT-only now — `N` is not «any base» — so the query is refused up front
    // rather than answered with a match the biologist cannot verify base-for-base.
    seedEntry('e1', 'plasmid', null, `AAAA${'GAATTC'}AAAA`);
    renderTopBar({ query: 'seq:GAANTC' });
    await waitFor(() => expect(screen.getByTestId('search-blocked-notice')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-e1')).toBeNull();
  });

  it('…and the concrete form of the same motif still searches normally', async () => {
    seedEntry('e1', 'plasmid', null, `AAAA${'GAATTC'}AAAA`);
    renderTopBar({ query: 'seq:GAATTC' });
    await waitFor(() => expect(screen.getByTestId('smart-result-e1')).toBeTruthy());
    expect(screen.getByTestId('smart-result-e1-identity').textContent).toBe('100.00%');
  });

  it('a contradictory query (two provider intents) shows the BLOCKED notice, never results (K7 gate)', async () => {
    seedEntry('e1', 'plasmid-alpha', null, TARGET);
    renderTopBar({ query: 'enz:Bsa seq:GAATTC' });
    await waitFor(() => expect(screen.getByTestId('search-blocked-notice')).toBeTruthy());
    // no search ran → no result rows, and the notice replaces «Ничего не найдено»
    expect(screen.queryByTestId('smart-result-e1')).toBeNull();
    expect(screen.getByTestId('library-topbar-search-results').textContent).not.toMatch(/Ничего не найдено/);
    expect(screen.queryByTestId('library-topbar-search-count')).toBeNull();
  });

  it('A(seq) → B(blocked): the blocked notice shows, A’s stale results do not linger (K7-P1-4)', async () => {
    seedEntry('a', 'plasmid-A', null, TARGET);
    const { rerender } = renderTopBar({ query: 'GCATGCATGCATGC' }); // A: a real DNA hit
    await waitFor(() => expect(screen.getByTestId('smart-result-a')).toBeTruthy());
    rerender({ query: 'enz:Bsa seq:GAATTC' });                      // B: blocked
    await waitFor(() => expect(screen.getByTestId('search-blocked-notice')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-a')).toBeNull();      // A’s hit must not overwrite B
  });

  it('the SnapGene catalog (kind === "catalog") is excluded', async () => {
    seedEntry('a', 'plasmid', null, TARGET);
    seedEntry('snap1', 'snapgene-X', null, TARGET, { kind: 'catalog' });
    renderTopBar({ query: 'GCATGCATGCATGC' });
    await waitFor(() => expect(screen.getByTestId('smart-result-a')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-snap1')).toBeNull();
  });

  it('the prefs summary + «изменить» entry render in the results header', async () => {
    seedEntry('e1', 'plasmid-alpha', null, TARGET);
    renderTopBar({ query: 'alpha' });
    await waitFor(() => expect(screen.getByTestId('smart-result-e1')).toBeTruthy());
    expect(screen.getByTestId('search-prefs-summary').textContent).toMatch(/порог 80%/);
    expect(screen.getByTestId('search-prefs-open')).toBeTruthy();
  });

  it('bumping autoFocusSearchTick («полный поиск» escalation) focuses the input + opens the dropdown', async () => {
    seedEntry('e1', 'plasmid-alpha', null, TARGET);
    // The tree escalation SEEDS the global bar and bumps the tick; tick 0 (mount) must not
    // auto-focus, tick 1 focuses the field and opens the dropdown.
    const { rerender } = renderTopBar({ query: 'alpha', autoFocusSearchTick: 0 });
    const input = screen.getByTestId('library-topbar-search-input');
    expect(document.activeElement).not.toBe(input);
    rerender({ query: 'alpha', autoFocusSearchTick: 1 });
    expect(document.activeElement).toBe(input);
    await waitFor(() => expect(screen.getByTestId('library-topbar-search-results')).toBeTruthy());
  });

  it('Undo / Redo buttons dispatch synthetic Ctrl+Z / Ctrl+Y', () => {
    renderTopBar({});
    const captured = [];
    const onKey = (e) => { captured.push({ key: e.key, ctrl: e.ctrlKey }); };
    window.addEventListener('keydown', onKey, true);
    fireEvent.click(screen.getByTestId('library-topbar-undo'));
    fireEvent.click(screen.getByTestId('library-topbar-redo'));
    window.removeEventListener('keydown', onKey, true);
    expect(captured.some((c) => c.key === 'z' && c.ctrl)).toBe(true);
    expect(captured.some((c) => c.key === 'y' && c.ctrl)).toBe(true);
  });
});

// REV #2 — S3-CLOSE / K1: a mixed metadata+biological query, through the LIVE facade pipeline.
// A name-only candidate may flash during loading but must NOT survive the strict final search.
describe('LibraryTopBar — S3-CLOSE K1 strict AND (name must not mask a missing sequence)', () => {
  it('mol:pUC seq:GAATTC — a name match with NO GAATTC in the sequence disappears from the final', async () => {
    seedEntry('puc', 'pUC19', null, 'AAAACCCCGGGGTTTTAAAACCCCGGGG'); // name matches «pUC», no GAATTC
    renderTopBar({ query: 'mol:pUC seq:GAATTC' });
    // Wait for the FINAL search to complete with an empty (nothing-found) result: the name
    // candidate may flash during the partial/loading phase but must not survive the final.
    await waitFor(() => expect(screen.getByTestId('library-topbar-search-results').textContent).toMatch(/Ничего не найдено/));
    expect(screen.queryByTestId('smart-result-puc')).toBeNull();
  });

  it('mol:pUC seq:GAATTC — the object STAYS when the motif IS present', async () => {
    seedEntry('puc', 'pUC19', null, 'AAAAGAATTCCCCCAAAAGAATTCCCCC'); // name AND sequence both match
    renderTopBar({ query: 'mol:pUC seq:GAATTC' });
    await waitFor(() => expect(screen.getByTestId('smart-result-puc')).toBeTruthy());
  });

  it('plain metadata search is unchanged (a name query still surfaces its entry)', async () => {
    seedEntry('puc', 'pUC19', null, 'ACGTACGTACGT');
    renderTopBar({ query: 'pUC' });
    await waitFor(() => expect(screen.getByTestId('smart-result-puc')).toBeTruthy());
  });
});
