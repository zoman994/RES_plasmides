/**
 * SPEC_ASSEMBLY_PICKER_UNIFICATION — единый library-picker.
 *
 * Покрытие нового богатого пикера:
 *   - groupLibraryEntries (pure): entry-centric project/loose/other +
 *     ATGC-поиск + type-фильтр.
 *   - Компонент: input + фильтр-пилюли, dropdown на focus, секции,
 *     <mark>-подсветка, ★ favorites toggle, drag-out TREE_DRAG_MIME,
 *     extraSections (canvas-группы), inline-режим (assembly).
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  render, screen, fireEvent, cleanup, within,
} from '@testing-library/react';
import LibrarySearchBar, { groupLibraryEntries, matchesType, matchesQuery } from '../LibrarySearchBar';
import { _clearAllPrefs, toggleFavorite } from '../picker-prefs';

const sampleLibrary = {
  le01: {
    id: 'le01', name: 'pUC19', projectId: null,
    payload: {
      length: 2686, topology: 'circular', sequence: 'ATGCAAAA', annotations: [{ start: 0, end: 200, name: 'ori' }],
    },
  },
  le02: {
    id: 'le02', name: 'pET-28b', projectId: 'other-proj', tags: ['экспрессия'],
    payload: { length: 5369, topology: 'linear' },
  },
  le03: { id: 'le03', name: 'in-current', projectId: 'cur-proj', payload: { length: 100, topology: 'linear' } },
};
const sampleProjects = { 'cur-proj': { name: 'Мой проект' }, 'other-proj': { name: 'Чужой' } };

beforeEach(() => { _clearAllPrefs(); });
afterEach(() => { cleanup(); _clearAllPrefs(); });

describe('groupLibraryEntries (pure)', () => {
  it('splits project / loose / other by projectId', () => {
    const r = groupLibraryEntries({ libraryEntries: sampleLibrary, currentProjectId: 'cur-proj', query: '', typeFilter: 'all' });
    expect(r.project.map((e) => e.id)).toEqual(['le03']);
    expect(r.loose.map((e) => e.id)).toEqual(['le01']);
    expect(r.other.map((e) => e.id)).toEqual(['le02']);
  });

  it('ATGC sequence match (not just name)', () => {
    const r = groupLibraryEntries({ libraryEntries: sampleLibrary, currentProjectId: 'cur-proj', query: 'ATGC', typeFilter: 'all' });
    // only le01 carries the matching sequence
    expect(r.loose.map((e) => e.id)).toEqual(['le01']);
    expect(r.project).toHaveLength(0);
    expect(r.other).toHaveLength(0);
  });

  it('type filter narrows to circular', () => {
    const r = groupLibraryEntries({ libraryEntries: sampleLibrary, currentProjectId: 'cur-proj', query: '', typeFilter: 'circular' });
    expect(r.loose.map((e) => e.id)).toEqual(['le01']);
    expect(r.project).toHaveLength(0); // le03 linear
  });

  it('matchesType / matchesQuery primitives', () => {
    expect(matchesType(sampleLibrary.le01, 'circular')).toBe(true);
    expect(matchesType(sampleLibrary.le03, 'circular')).toBe(false);
    expect(matchesQuery(sampleLibrary.le01, 'puc')).toBe(true);
    expect(matchesQuery(sampleLibrary.le01, 'GGGG')).toBe(false);
  });
});

describe('groupLibraryEntries — injectable matcher (ASM-SEARCH smart search)', () => {
  it('uses the provided matcher instead of the built-in name/ATGC matchesQuery', () => {
    const onlyLe02 = (e) => e.id === 'le02';
    const r = groupLibraryEntries({
      libraryEntries: sampleLibrary, currentProjectId: 'cur-proj',
      query: 'whatever-name-nomatch', typeFilter: 'all', matcher: onlyLe02,
    });
    expect(r.other.map((e) => e.id)).toEqual(['le02']);
    expect(r.loose).toHaveLength(0);
    expect(r.project).toHaveLength(0);
  });

  it('still applies the topology type filter on top of the matcher', () => {
    const all = () => true;
    const r = groupLibraryEntries({
      libraryEntries: sampleLibrary, currentProjectId: 'cur-proj',
      query: '', typeFilter: 'circular', matcher: all,
    });
    expect(r.loose.map((e) => e.id)).toEqual(['le01']); // only le01 circular
    expect(r.project).toHaveLength(0);
  });

  it('falls back to matchesQuery when no matcher is given (align panel back-compat)', () => {
    const r = groupLibraryEntries({
      libraryEntries: sampleLibrary, currentProjectId: 'cur-proj', query: 'ATGC', typeFilter: 'all',
    });
    expect(r.loose.map((e) => e.id)).toEqual(['le01']);
  });
});

describe('LibrarySearchBar — smart metadata search (feature / tag, not just name)', () => {
  it('a FEATURE name surfaces the entry even though its own name does not match', () => {
    render(<LibrarySearchBar {...props()} />);
    // le01 (pUC19) carries an 'ori' annotation; 'ori' is NOT in its name.
    // The old name/ATGC matcher would miss this; the smart matcher finds it by feature.
    fireEvent.change(screen.getByTestId('canvas-library-search-bar-input'), { target: { value: 'ori' } });
    expect(screen.getByTestId('canvas-library-search-bar-section-loose-item-le01')).toBeTruthy();
    // and does not spuriously pull in le03 (no ori, name mismatch)
    expect(screen.queryByTestId('canvas-library-search-bar-section-project-item-le03')).toBeNull();
  });

  it('a TAG surfaces the entry (le02 tagged «экспрессия»)', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.change(screen.getByTestId('canvas-library-search-bar-input'), { target: { value: 'экспресс' } });
    // le02 lives in another project → auto-expanded because it now has a match
    expect(screen.getByTestId('canvas-library-search-bar-section-other-projects-item-le02')).toBeTruthy();
  });

  it('a nucleotide substring still matches by sequence (picker DNA path preserved)', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.change(screen.getByTestId('canvas-library-search-bar-input'), { target: { value: 'ATGC' } });
    expect(screen.getByTestId('canvas-library-search-bar-section-loose-item-le01')).toBeTruthy();
    // le02/le03 have no ATGC sequence → not surfaced
    expect(screen.queryByTestId('canvas-library-search-bar-section-project-item-le03')).toBeNull();
  });
});

function props(over = {}) {
  return {
    libraryEntries: sampleLibrary,
    projectsById: sampleProjects,
    currentProjectId: 'cur-proj',
    onSelectEntry: vi.fn(),
    ...over,
  };
}

describe('LibrarySearchBar — dropdown mode (canvas)', () => {
  it('renders input + filter pills; dropdown closed until focus', () => {
    render(<LibrarySearchBar {...props()} />);
    expect(screen.getByTestId('canvas-library-search-bar-input')).toBeTruthy();
    expect(screen.getByTestId('canvas-library-search-bar-filter-circular')).toBeTruthy();
    expect(screen.queryByTestId('canvas-library-search-bar-dropdown')).toBeNull();
  });

  it('focus opens dropdown; project + loose expanded by default', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    expect(screen.getByTestId('canvas-library-search-bar-dropdown')).toBeTruthy();
    // default-expanded library sections show their items directly
    expect(screen.getByTestId('canvas-library-search-bar-section-loose-item-le01')).toBeTruthy();
    expect(screen.getByTestId('canvas-library-search-bar-section-project-item-le03')).toBeTruthy();
  });

  it('click library row → onSelectEntry({kind:"library"})', () => {
    const onSelectEntry = vi.fn();
    render(<LibrarySearchBar {...props({ onSelectEntry })} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-section-loose-item-le01'));
    expect(onSelectEntry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'library', id: 'le01' }));
  });

  it('filter pill narrows results', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-filter-circular'));
    expect(screen.getByTestId('canvas-library-search-bar-section-loose-item-le01')).toBeTruthy();
    expect(screen.queryByTestId('canvas-library-search-bar-section-project-item-le03')).toBeNull();
  });

  it('typing highlights the match with <mark>', () => {
    render(<LibrarySearchBar {...props()} />);
    const input = screen.getByTestId('canvas-library-search-bar-input');
    fireEvent.change(input, { target: { value: 'pUC' } });
    const row = screen.getByTestId('canvas-library-search-bar-section-loose-item-le01');
    expect(row.querySelector('mark')).toBeTruthy();
  });

  it('★ favorite toggle promotes entry into Избранное', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-section-loose-fav-le01'));
    // favorites section now has the entry
    expect(screen.getByTestId('canvas-library-search-bar-section-favorites-item-le01')).toBeTruthy();
  });

  it('library row draggable with TREE_DRAG_MIME', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    const row = screen.getByTestId('canvas-library-search-bar-section-loose-item-le01');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('extraSections render canvas groups; click → onSelectEntry with that kind', () => {
    const onSelectEntry = vi.fn();
    render(<LibrarySearchBar {...props({
      onSelectEntry,
      extraSections: [{
        id: 'canvas-containers', title: 'На канвасе', kind: 'container', entries: [{ id: 'c01', name: 'my-fork', sequence: 'AAAA' }],
      }],
    })} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    const sec = screen.getByTestId('canvas-library-search-bar-section-canvas-containers');
    // extra sections collapsed by default → expand
    fireEvent.click(within(sec).getByTestId('canvas-library-search-bar-section-canvas-containers-header'));
    fireEvent.click(screen.getByTestId('canvas-library-search-bar-section-canvas-containers-item-c01'));
    expect(onSelectEntry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'container', id: 'c01' }));
  });

  it('Esc closes dropdown', () => {
    render(<LibrarySearchBar {...props()} />);
    fireEvent.focus(screen.getByTestId('canvas-library-search-bar-input'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('canvas-library-search-bar-dropdown')).toBeNull();
  });
});

describe('LibrarySearchBar — paste section (custom-segment SAFE)', () => {
  it('no paste section unless onPasteSequence is provided (canvas)', () => {
    render(<LibrarySearchBar {...props({ inline: true, testId: 'asm' })} />);
    expect(screen.queryByTestId('asm-paste-section')).toBeNull();
  });

  it('renders textarea + counter + confirm when onPasteSequence is wired', () => {
    render(<LibrarySearchBar {...props({ inline: true, testId: 'asm', onPasteSequence: vi.fn() })} />);
    expect(screen.getByTestId('asm-paste-section')).toBeTruthy();
    expect(screen.getByTestId('asm-paste-input')).toBeTruthy();
    expect(screen.getByTestId('asm-paste-confirm')).toBeTruthy();
  });

  it('valid ATGC → counter + confirm calls onPasteSequence with cleaned uppercase', () => {
    const onPasteSequence = vi.fn();
    render(<LibrarySearchBar {...props({ inline: true, testId: 'asm', onPasteSequence })} />);
    fireEvent.change(screen.getByTestId('asm-paste-input'), { target: { value: 'atcg aatt\nGGcc' } });
    expect(screen.getByTestId('asm-paste-counter').textContent).toMatch(/12/); // whitespace stripped
    fireEvent.click(screen.getByTestId('asm-paste-confirm'));
    expect(onPasteSequence).toHaveBeenCalledWith('ATCGAATTGGCC');
  });

  it('invalid (non-ACGT) → warning shown, confirm disabled, no call', () => {
    const onPasteSequence = vi.fn();
    render(<LibrarySearchBar {...props({ inline: true, testId: 'asm', onPasteSequence })} />);
    fireEvent.change(screen.getByTestId('asm-paste-input'), { target: { value: 'ATXZ' } });
    expect(screen.getByTestId('asm-paste-invalid')).toBeTruthy();
    expect(screen.getByTestId('asm-paste-confirm').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('asm-paste-confirm'));
    expect(onPasteSequence).not.toHaveBeenCalled();
  });

  it('empty input → confirm disabled', () => {
    render(<LibrarySearchBar {...props({ inline: true, testId: 'asm', onPasteSequence: vi.fn() })} />);
    expect(screen.getByTestId('asm-paste-confirm').disabled).toBe(true);
  });
});

describe('LibrarySearchBar — inline mode (assembly)', () => {
  it('renders the list without focus; items visible immediately', () => {
    render(<LibrarySearchBar {...props({ inline: true, testId: 'assembly-source-picker' })} />);
    expect(screen.getByTestId('assembly-source-picker-list')).toBeTruthy();
    expect(screen.queryByTestId('assembly-source-picker-dropdown')).toBeNull();
    expect(screen.getByTestId('assembly-source-picker-section-loose-item-le01')).toBeTruthy();
  });

  it('persisted favorite shows in Избранное on mount', () => {
    toggleFavorite('le01');
    render(<LibrarySearchBar {...props({ inline: true, testId: 'assembly-source-picker' })} />);
    expect(screen.getByTestId('assembly-source-picker-section-favorites-item-le01')).toBeTruthy();
  });
});
