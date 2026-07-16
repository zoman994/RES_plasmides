/**
 * REV #2 Stage 2 — entity scope THROUGH THE REAL LibraryTopBar (§2 / §3.3 / §13.1).
 * Doc: docs/SMART_SEARCH_SCOPES_PREFIXES_REV2.md, task #164.
 *
 * The default scope searches ONLY user data (entry+project+primer); the restriction
 * catalog is excluded — a plain query NEVER surfaces enzyme cards. The catalog is reached
 * ONLY through the `enz:` prefix. This is the INVERSION of the Stage 0 class-A
 * characterization (was: plain queries leak enzyme cards).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';
import { collectEnzymeDocuments } from '../../../lib/search-enzyme-adapters';

const ENZYME_IDS = collectEnzymeDocuments().map((d) => d.ref.id);
const BSA_IDS = ENZYME_IDS.filter((n) => n.toLowerCase().includes('bsa'));

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
  });
  // One molecule whose NAME contains every probe token, so each query has a deterministic
  // molecule row to wait on — any enzyme card in the dropdown would then be a scope LEAK.
  useStore.setState((s) => {
    s.libraryEntries.mol1 = {
      id: 'mol1', name: 'Bsa EcoRI GAATTC probe', projectId: null, kind: 'container', tags: [],
      payload: { sequence: 'CCCCCCCCCCCCCCCC', length: 16, topology: 'circular', annotations: [] },
    };
  });
});
afterEach(cleanup);

describe('REV#2 Stage 2 · default scope excludes the enzyme catalog (inverts Stage 0)', () => {
  it('the catalog actually contains the enzymes these assertions rely on', () => {
    expect(ENZYME_IDS).toContain('EcoRI');
    expect(BSA_IDS.length).toBeGreaterThan(0);
  });

  it('plain `Bsa` shows the matching molecule but NO restriction-enzyme cards', async () => {
    renderTopBar({ query: 'Bsa' });
    await waitFor(() => expect(screen.queryByTestId('smart-result-mol1')).toBeTruthy());
    expect(BSA_IDS.some((id) => screen.queryByTestId(`smart-result-${id}`))).toBe(false);
  });

  it('plain `EcoRI` shows the molecule but NOT the EcoRI enzyme card', async () => {
    renderTopBar({ query: 'EcoRI' });
    await waitFor(() => expect(screen.queryByTestId('smart-result-mol1')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-EcoRI')).toBeNull();
  });

  it('`GAATTC` (6-mer < minQueryLen 8 → text) matches the molecule name, not the enzyme card', async () => {
    renderTopBar({ query: 'GAATTC' });
    await waitFor(() => expect(screen.queryByTestId('smart-result-mol1')).toBeTruthy());
    expect(screen.queryByTestId('smart-result-EcoRI')).toBeNull();
  });

  it('`enz:Bsa` DOES reach the catalog — enzyme cards appear under the enz: prefix', async () => {
    renderTopBar({ query: 'enz:Bsa' });
    await waitFor(() => {
      expect(BSA_IDS.some((id) => screen.queryByTestId(`smart-result-${id}`))).toBe(true);
    });
    // …and the plain user molecule is NOT in an enzyme-catalog search
    expect(screen.queryByTestId('smart-result-mol1')).toBeNull();
  });
});
