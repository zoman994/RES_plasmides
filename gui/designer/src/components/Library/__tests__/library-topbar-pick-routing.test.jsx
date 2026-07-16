/**
 * REV #2 Stage 2 K6 — kind-aware pick routing THROUGH the real dropdown (§10.4/§10.5).
 * The row never assumes an entry and NEVER rewrites the query (the old enzyme→re: is gone);
 * it forwards (entityRef, occurrence). The result option carries no nested button (a11y).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
});
afterEach(cleanup);

describe('K6 · enzyme pick opens a card — never a re: query rewrite', () => {
  it('clicking an enzyme result forwards {kind:enzyme} and does NOT change the query to re:', async () => {
    const onPick = vi.fn();
    const onQueryChange = vi.fn();
    renderTopBar({ query: 'enz:EcoRI', onPickSearchResult: onPick, onQueryChange });
    await waitFor(() => expect(screen.getByTestId('smart-result-EcoRI')).toBeTruthy());
    fireEvent.click(screen.getByTestId('smart-result-EcoRI'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'enzyme', id: 'EcoRI' }), null);
    // the removed behaviour: the click must NOT rewrite the query to a re: scan
    expect(onQueryChange).not.toHaveBeenCalledWith(expect.stringContaining('re:'));
  });

  it('a result option has NO nested button inside it (valid interactive option)', async () => {
    useStore.setState((s) => {
      s.libraryEntries = { m1: { id: 'm1', name: 'pUC19', kind: 'container', tags: [], payload: { sequence: 'ACGT', topology: 'circular', annotations: [] } } };
    });
    renderTopBar({ query: 'pUC19', onPickSearchResult: vi.fn() });
    const option = await screen.findByTestId('smart-result-m1');
    expect(option.querySelectorAll('button').length).toBe(0); // the option itself is the button
  });
});
