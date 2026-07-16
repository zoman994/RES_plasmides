/**
 * REV #2 Stage 2 §8/§10.2 — the enzyme catalog DOCUMENTS are ASSEMBLED lazily: a plain (or
 * cut:) query never calls collectEnzymeDocuments(); only `enz:` does. Proven by call-count.
 *
 * NB this proves lazy DOCUMENT ASSEMBLY, not lazy DB LOAD — search-enzyme-adapters still
 * STATICALLY imports restriction-db, so the ~459-enzyme table is in the base chunk
 * regardless. True bundle-laziness (dynamic import()) is a deferred follow-up.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Spy on the enzyme collector BEFORE LibraryTopBar imports it (vitest hoists vi.mock).
vi.mock('../../../lib/search-enzyme-adapters', () => ({ collectEnzymeDocuments: vi.fn(() => []) }));

import { render, cleanup } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';
import { collectEnzymeDocuments } from '../../../lib/search-enzyme-adapters';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => { s.libraryEntries = {}; s.projects = {}; s.primersById = {}; s.currentProjectId = null; });
  collectEnzymeDocuments.mockClear();
});
afterEach(cleanup);

describe('REV#2 Stage 2 · collectEnzymeDocuments is called ONLY for enz: (lazy §8)', () => {
  it('a plain query does NOT collect the enzyme catalog', () => {
    renderTopBar({ query: 'pUC19' });
    expect(collectEnzymeDocuments).not.toHaveBeenCalled();
  });
  it('a cut: query does NOT collect the enzyme catalog (it scans molecules, not the card DB)', () => {
    renderTopBar({ query: 'cut:EcoRI' });
    expect(collectEnzymeDocuments).not.toHaveBeenCalled();
  });
  it('a re: (legacy cut) query does NOT collect the enzyme catalog', () => {
    renderTopBar({ query: 're:EcoRI' });
    expect(collectEnzymeDocuments).not.toHaveBeenCalled();
  });
  it('an enz: query DOES collect the enzyme catalog (the only path that needs it)', () => {
    renderTopBar({ query: 'enz:EcoRI' });
    expect(collectEnzymeDocuments).toHaveBeenCalled();
  });
  it('a BLOCKED query does NOT collect the catalog even WITH enz: — the error-gate runs before collectors (K7)', () => {
    // enz:Bsa + seq:… = two provider intents → severity:error → blocked. Despite the enz:, the
    // catalog must not be assembled (nor the worker run) for a plan that will not execute.
    renderTopBar({ query: 'enz:Bsa seq:GAATTC' });
    expect(collectEnzymeDocuments).not.toHaveBeenCalled();
  });
});
