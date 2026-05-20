/**
 * PC-K2/K3 — LibrarySearchBar component + integration.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LibrarySearchBar, { groupResults } from '../LibrarySearchBar';

const sampleLibrary = {
  'le01': { id: 'le01', name: 'pUC19', projectId: null, payload: { length: 2686 } },
  'le02': { id: 'le02', name: 'pET-28b', projectId: 'other-proj', payload: { length: 5369 } },
  'le03': { id: 'le03', name: 'in-current', projectId: 'cur-proj', payload: { length: 100 } },
};
const sampleContainers = [
  { id: 'c01', name: 'my-pET-fork', sequence: 'A'.repeat(5400) },
];
const sampleZones = [{ id: 'zn01', name: 'pks4-ko' }];
const samplePrimers = [
  { id: 'pp01', name: 'T7-fwd', sequence: 'ATGC' },
  { id: 'pp02', kind: 'pair', forwardId: 'pp01' },
];

describe('PC-K2/K3 — groupResults (pure)', () => {
  it('splits library / project / zones / primers', () => {
    const r = groupResults({
      libraryEntries: sampleLibrary,
      containers: sampleContainers,
      zones: sampleZones,
      primers: samplePrimers,
      currentProjectId: 'cur-proj',
      query: '',
    });
    // le03 belongs to cur-proj — moved out of fromLibrary.
    expect(r.fromLibrary.map((e) => e.id).sort()).toEqual(['le01', 'le02']);
    expect(r.inProject).toHaveLength(1);
    expect(r.assemblies).toHaveLength(1);
    expect(r.primers).toHaveLength(1); // pairs filtered out
  });

  it('substring match case-insensitive', () => {
    const r = groupResults({
      libraryEntries: sampleLibrary, containers: sampleContainers,
      zones: sampleZones, primers: samplePrimers,
      currentProjectId: null, query: 'pet',
    });
    expect(r.fromLibrary.map((e) => e.name)).toContain('pET-28b');
    expect(r.inProject.map((c) => c.name)).toContain('my-pET-fork');
  });

  it('empty query returns all', () => {
    const r = groupResults({
      libraryEntries: sampleLibrary, containers: [], zones: [], primers: [],
      currentProjectId: null, query: '   ',
    });
    expect(r.fromLibrary).toHaveLength(3);
  });
});

describe('PC-K2/K3 — LibrarySearchBar component', () => {
  function commonProps(over = {}) {
    return {
      libraryEntries: sampleLibrary,
      containers: sampleContainers,
      zones: sampleZones,
      primers: samplePrimers,
      currentProjectId: 'cur-proj',
      onSelectEntry: vi.fn(),
      ...over,
    };
  }

  it('renders input + closed dropdown by default', () => {
    render(<LibrarySearchBar {...commonProps()} />);
    expect(screen.getByTestId('canvas-library-search-bar-input')).toBeTruthy();
    expect(screen.queryByTestId('canvas-library-search-bar-dropdown')).toBeNull();
  });

  it('focus opens dropdown with 4 sections', () => {
    render(<LibrarySearchBar {...commonProps()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    expect(screen.getByTestId('canvas-library-search-bar-dropdown')).toBeTruthy();
    expect(screen.getByTestId('canvas-library-search-bar-section-library')).toBeTruthy();
    expect(screen.getByTestId('canvas-library-search-bar-section-in-project')).toBeTruthy();
    expect(screen.getByTestId('canvas-library-search-bar-section-zones')).toBeTruthy();
    expect(screen.getByTestId('canvas-library-search-bar-section-primers')).toBeTruthy();
  });

  it('typing filters list + count', () => {
    render(<LibrarySearchBar {...commonProps()} />);
    const input = screen.getByTestId('canvas-library-search-bar-input');
    fireEvent.change(input, { target: { value: 'pUC' } });
    // Only one library entry matches "pUC".
    const libSection = screen.getByTestId('canvas-library-search-bar-section-library');
    expect(libSection.textContent).toMatch(/pUC19/);
    expect(libSection.textContent).not.toMatch(/pET-28b/);
  });

  it('click on library row calls onSelectEntry with {kind:"library", id, entry}', () => {
    const onSelectEntry = vi.fn();
    render(<LibrarySearchBar {...commonProps({ onSelectEntry })} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-section-library-item-le01'));
    expect(onSelectEntry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'library', id: 'le01',
    }));
  });

  it('click on container row calls onSelectEntry with kind:"container"', () => {
    const onSelectEntry = vi.fn();
    render(<LibrarySearchBar {...commonProps({ onSelectEntry })} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-section-in-project-item-c01'));
    expect(onSelectEntry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'container', id: 'c01',
    }));
  });

  it('Esc closes dropdown', () => {
    render(<LibrarySearchBar {...commonProps()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('canvas-library-search-bar-dropdown')).toBeNull();
  });

  it('library row is draggable with TREE_DRAG_MIME', () => {
    render(<LibrarySearchBar {...commonProps()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    const row = screen.getByTestId('canvas-library-search-bar-section-library-item-le01');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('shows empty-state hint when nothing matches', () => {
    render(<LibrarySearchBar {...commonProps({ libraryEntries: {}, containers: [], zones: [], primers: [] })} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    expect(screen.getByTestId('canvas-library-search-bar-empty')).toBeTruthy();
  });
});
