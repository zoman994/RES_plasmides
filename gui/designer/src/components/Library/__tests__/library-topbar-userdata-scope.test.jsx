/**
 * REV #2 Stage 2 — the default scope now covers ALL user data: molecules + projects +
 * primers (§2 / §3.4). A project card and a canonical pool primer are searchable from the
 * one smart box, keyed by their composite `<kind>:<id>` (§10.4) so ids never collide.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = { m1: { id: 'm1', name: 'pKanamycin host', kind: 'container', tags: [], payload: { sequence: 'ACGT', topology: 'linear', annotations: [] } } };
    s.projects = { p1: { id: 'p1', name: 'Kanamycin project', description: 'kan cassette', tags: ['cassette'] } };
    s.primersById = { pr1: { id: 'pr1', name: 'Kan-fwd', sequence: 'ATGAGCCATATTCAACGG', tags: [], status: 'ordered' } };
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

describe('REV#2 Stage 2 · default scope spans molecules + projects + primers', () => {
  it('a shared token surfaces the molecule, the project card AND the pool primer', async () => {
    renderTopBar({ query: 'Kan' });
    // entity ids stay RAW in the row testId; the project/primer are new kinds in the pool
    await waitFor(() => expect(screen.queryByTestId('smart-result-m1')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-p1')).toBeTruthy();   // project card
    expect(screen.queryByTestId('smart-result-pr1')).toBeTruthy();  // canonical pool primer
  });

  it('a project-only match (via its tag) surfaces the project without a molecule', async () => {
    renderTopBar({ query: 'cassette' }); // matches only the project tag
    await waitFor(() => expect(screen.queryByTestId('smart-result-p1')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-m1')).toBeNull();
  });
});
