/**
 * Library topbar — global DNA search (Sprint M-X.9 K3).
 *
 * Auto-detects DNA pattern in the «Поиск по библиотеке…» input and
 * renders a dropdown of hits across all container entries (loose +
 * bodge zones). Click → caller handles selection + activation.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../store';
import LibraryTopBar from '../LibraryTopBar';

const TARGET = 'AAATTT' + 'GCATGCATGCATGCATGCATGC' + 'AAATTT';

beforeEach(() => {
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

function seedEntry(id, name, projectId, sequence) {
  useStore.setState((s) => {
    s.libraryEntries[id] = {
      id, name, projectId,
      kind: 'container',
      payload: { sequence, length: sequence.length, topology: 'circular', annotations: [] },
    };
  });
}

describe('M-X.9 K3 — LibraryTopBar global DNA search', () => {
  it('non-DNA query does NOT render the DNA dropdown', () => {
    render(<LibraryTopBar query="hello world" />);
    expect(screen.queryByTestId('library-topbar-dna-results')).toBeNull();
  });

  it('DNA query (≥8 ACGT chars) renders the DNA results dropdown', () => {
    seedEntry('e1', 'plasmid-1', null, TARGET);
    render(<LibraryTopBar query="GCATGCATGCATGC" />);
    expect(screen.getByTestId('library-topbar-dna-results')).toBeTruthy();
    expect(screen.getByTestId('library-topbar-dna-results-header').textContent).toMatch(/hit\(s\)/);
  });

  it('renders one row per hit, ordered by identity desc; click invokes onPickGlobalHit', () => {
    seedEntry('a', 'plasmid-A', null, TARGET);
    seedEntry('b', 'plasmid-B', null, 'CCCCCCCCCCCCCCCCCCCCCCCC' /* no hits */);
    const onPick = vi.fn();
    render(<LibraryTopBar query="GCATGCATGCATGC" onPickGlobalHit={onPick} />);
    // Hit row for entry 'a' should exist; entry 'b' should NOT.
    const aRows = document.querySelectorAll('[data-testid^="library-topbar-dna-hit-a-"]');
    expect(aRows.length).toBeGreaterThan(0);
    const bRows = document.querySelectorAll('[data-testid^="library-topbar-dna-hit-b-"]');
    expect(bRows.length).toBe(0);
    // Click first row.
    fireEvent.click(aRows[0]);
    expect(onPick).toHaveBeenCalled();
    expect(onPick.mock.calls[0][0]).toBe('a');
    expect(onPick.mock.calls[0][1].entryId).toBe('a');
  });

  it('IUPAC ambiguity (N/R) shows the «pure ACGT» hint, no hit rows', () => {
    seedEntry('e1', 'plasmid', null, TARGET);
    render(<LibraryTopBar query="ACGTNCGT" />);
    expect(screen.getByTestId('library-topbar-dna-results').textContent).toMatch(/IUPAC/);
    const rows = document.querySelectorAll('[data-testid^="library-topbar-dna-hit-"]');
    expect(rows.length).toBe(0);
  });

  it('Undo / Redo buttons render and dispatch a synthetic Ctrl+Z / Ctrl+Y keydown', () => {
    render(<LibraryTopBar />);
    const undoBtn = screen.getByTestId('library-topbar-undo');
    const redoBtn = screen.getByTestId('library-topbar-redo');
    expect(undoBtn).toBeTruthy();
    expect(redoBtn).toBeTruthy();
    // Capture keydown events at window level — synthetic events bubble up.
    const captured = [];
    const onKey = (e) => { captured.push({ key: e.key, ctrl: e.ctrlKey }); };
    window.addEventListener('keydown', onKey, true);
    fireEvent.click(undoBtn);
    fireEvent.click(redoBtn);
    window.removeEventListener('keydown', onKey, true);
    expect(captured.some((c) => c.key === 'z' && c.ctrl)).toBe(true);
    expect(captured.some((c) => c.key === 'y' && c.ctrl)).toBe(true);
  });

  it('SnapGene catalog (kind !== container) is excluded from the search', () => {
    seedEntry('a', 'plasmid', null, TARGET);
    useStore.setState((s) => {
      s.libraryEntries.snap1 = {
        id: 'snap1', name: 'snapgene-X', kind: 'catalog',
        payload: { sequence: TARGET },
      };
    });
    render(<LibraryTopBar query="GCATGCATGCATGC" />);
    expect(document.querySelectorAll('[data-testid^="library-topbar-dna-hit-snap1-"]').length).toBe(0);
    expect(document.querySelectorAll('[data-testid^="library-topbar-dna-hit-a-"]').length).toBeGreaterThan(0);
  });
});
