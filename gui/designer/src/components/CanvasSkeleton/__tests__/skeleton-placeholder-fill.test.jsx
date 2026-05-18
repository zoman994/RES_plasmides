/**
 * Placeholder fill flow (V2 paradigma, 12.05.2026).
 *
 * Coverage:
 *  - FILL_PLACEHOLDER reducer: fills in-place (id + position preserved),
 *    sets origin.kind='tree_pick', highlights, toast.
 *  - Click placeholder → PlaceholderTreePicker opens.
 *  - Picker shows entries scoped to current project, with fallback to
 *    loose when project is empty.
 *  - Click entry in picker → fillPlaceholder + picker closes.
 *  - Drop entry on placeholder block → fillPlaceholder (in-place), NOT
 *    ADD_CONTAINER (no new container created).
 *  - ESC closes picker.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import CanvasSkeleton from '../index';
import {
  skeletonReducer,
  buildInitialState,
} from '../store/skeleton-state';
import { useStore, bootstrapStore } from '../../../store';

const sampleEntry = (id = 'lib-1', name = 'pUC19', seq = 'ATGCATGC') => ({
  id,
  kind: 'container',
  name,
  payload: {
    sequence: seq,
    length: seq.length,
    topology: 'circular',
    annotations: [{ id: 'a-1', name: 'ori', type: 'rep_origin', start: 0, end: 4, strand: 1 }],
    ends: null,
  },
});

afterEach(() => {
  cleanup();
  try {
    useStore.setState({
      libraryEntries: {},
      projects: {},
      currentProjectId: null,
    });
  } catch { /* */ }
});

beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

describe('FILL_PLACEHOLDER reducer', () => {
  it('V62 — fills placeholder: id preserved, filled moves to cascade slot, fresh ghost in top-left', () => {
    const s0 = buildInitialState();
    const ph = s0.containers.find((c) => c.id === 'c-placeholder-1');
    const beforePos = s0.positions['c-placeholder-1'];
    expect(ph.sequence).toBe('');
    expect(beforePos).toBeDefined();
    // V62: starting ghost at top-left (40, 40).
    expect(beforePos).toEqual({ x: 40, y: 40 });

    const entry = sampleEntry('lib-X', 'imported', 'GATCGATC');
    const s1 = skeletonReducer(s0, {
      type: 'FILL_PLACEHOLDER',
      containerId: 'c-placeholder-1',
      entry,
    });
    const filled = s1.containers.find((c) => c.id === 'c-placeholder-1');
    expect(filled.id).toBe('c-placeholder-1'); // id same
    expect(filled.sequence).toBe('GATCGATC');
    expect(filled.length).toBe(8);
    expect(filled.topology).toEqual({ circular: true });
    expect(filled.annotations).toHaveLength(1);
    expect(filled.name).toBe('imported');
    expect(filled.origin.kind).toBe('tree_pick');
    expect(filled.origin.sourceEntryId).toBe('lib-X');
    // V62: position MOVED to cascade slot (filled больше не там же где
    // был ghost — иначе они бы overlap'ились).
    expect(s1.positions['c-placeholder-1']).not.toEqual(beforePos);
    expect(s1.positions['c-placeholder-1'].x).toBeGreaterThan(beforePos.x);
    // Highlighted.
    expect(s1.highlightedContainerId).toBe('c-placeholder-1');
    // Toast.
    expect(s1.toast?.kind).toBe('success');
    // New ghost spawned at top-left.
    const newGhost = s1.containers.find((c) => c.id !== 'c-placeholder-1' && (!c.sequence || c.sequence.length === 0));
    expect(newGhost).toBeTruthy();
    expect(s1.positions[newGhost.id]).toEqual({ x: 40, y: 40 });
  });

  it('FILL_PLACEHOLDER on unknown containerId — state unchanged', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'FILL_PLACEHOLDER',
      containerId: 'c-nope',
      entry: sampleEntry(),
    });
    expect(s1).toBe(s0);
  });

  it('FILL_PLACEHOLDER with null entry — state unchanged', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, {
      type: 'FILL_PLACEHOLDER',
      containerId: 'c-placeholder-1',
      entry: null,
    });
    expect(s1).toBe(s0);
  });

  it('V63 — после 2 fills подряд ghost всё ещё в верхнем-левом (40, 40)', () => {
    let s = buildInitialState();
    // 1st fill — c-placeholder-1.
    s = skeletonReducer(s, {
      type: 'FILL_PLACEHOLDER',
      containerId: 'c-placeholder-1',
      entry: sampleEntry('lib-1', 'first', 'ATGC'),
    });
    let ghost = s.containers.find((c) => !c.sequence || c.sequence.length === 0);
    expect(ghost).toBeTruthy();
    expect(s.positions[ghost.id]).toEqual({ x: 40, y: 40 });
    const ghost1Id = ghost.id;
    // 1st filled должен быть в cascade slot 0.
    expect(s.positions['c-placeholder-1']).toEqual({ x: 340, y: 80 });

    // 2nd fill — нажимаем на новый ghost.
    s = skeletonReducer(s, {
      type: 'FILL_PLACEHOLDER',
      containerId: ghost1Id,
      entry: sampleEntry('lib-2', 'second', 'GCTA'),
    });
    // 2nd ghost должен спавнится опять в (40, 40), не возле второго filled.
    const ghost2 = s.containers.find((c) => !c.sequence || c.sequence.length === 0);
    expect(ghost2).toBeTruthy();
    expect(ghost2.id).not.toBe(ghost1Id); // новый
    expect(s.positions[ghost2.id]).toEqual({ x: 40, y: 40 });
    // 2nd filled в cascade slot 1.
    expect(s.positions[ghost1Id]).toEqual({ x: 600, y: 80 });
  });

  it('FILL_PLACEHOLDER on already-filled container — overwrite happens (no special guard)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, {
      type: 'FILL_PLACEHOLDER',
      containerId: 'c-placeholder-1',
      entry: sampleEntry('lib-A', 'first', 'AAAA'),
    });
    s = skeletonReducer(s, {
      type: 'FILL_PLACEHOLDER',
      containerId: 'c-placeholder-1',
      entry: sampleEntry('lib-B', 'second', 'TTTT'),
    });
    const filled = s.containers.find((c) => c.id === 'c-placeholder-1');
    expect(filled.sequence).toBe('TTTT');
    expect(filled.name).toBe('second');
    expect(filled.origin.sourceEntryId).toBe('lib-B');
  });
});

describe('Placeholder click → TreePicker', () => {
  it('click placeholder block opens PlaceholderTreePicker', () => {
    render(<CanvasSkeleton />);
    const block = screen.getByTestId('skeleton-block-c-placeholder-1');
    fireEvent.click(block);
    expect(screen.getByTestId('skeleton-placeholder-picker')).toBeTruthy();
  });

  it('picker shows current-project entries when project active', () => {
    const entry = sampleEntry('lib-proj-1', 'in-project-A');
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: { [entry.id]: { ...entry, projectId: 'p-A' } },
        projects: { 'p-A': { id: 'p-A', name: 'Project A', containerIds: [entry.id] } },
        currentProjectId: 'p-A',
      }));
    });
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-block-c-placeholder-1'));
    expect(screen.getByTestId(`skeleton-placeholder-picker-item-${entry.id}`)).toBeTruthy();
    // Scope label мatches.
    expect(screen.getByTestId('skeleton-placeholder-picker-scope').textContent).toMatch(/Project A/);
  });

  it('V61 — picker empty state when project has no entries (4-section UI)', () => {
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: {},
        projects: { 'p-empty': { id: 'p-empty', name: 'Empty', containerIds: [] } },
        currentProjectId: 'p-empty',
      }));
    });
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-block-c-placeholder-1'));
    // Picker открыт + project section header виден.
    expect(screen.getByTestId('skeleton-placeholder-picker')).toBeTruthy();
    expect(screen.getByTestId('skeleton-picker-section-project')).toBeTruthy();
    expect(screen.getByTestId('skeleton-picker-section-loose')).toBeTruthy();
    // Нет entries в проекте — section project пустой (нет items).
    expect(screen.queryByTestId(/^skeleton-placeholder-picker-item-/)).toBeNull();
  });

  it('V61 — loose entries shown в секции «Коллекция» (не fallback)', () => {
    const looseEntry = sampleEntry('lib-loose', 'loose-1');
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: { [looseEntry.id]: looseEntry }, // no projectId
        projects: { 'p-empty': { id: 'p-empty', name: 'Empty', containerIds: [] } },
        currentProjectId: 'p-empty',
      }));
    });
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-block-c-placeholder-1'));
    expect(screen.getByTestId(`skeleton-placeholder-picker-item-${looseEntry.id}`)).toBeTruthy();
    // V61: loose entry виден в section «loose», даже когда project пустой.
    expect(screen.getByTestId('skeleton-picker-section-loose')).toBeTruthy();
  });

  it('click entry in picker → fill placeholder + picker closes', () => {
    const entry = sampleEntry('lib-pick-1', 'picked', 'TGACGTAC');
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: { [entry.id]: { ...entry, projectId: 'p-A' } },
        projects: { 'p-A': { id: 'p-A', name: 'A', containerIds: [entry.id] } },
        currentProjectId: 'p-A',
      }));
    });
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-block-c-placeholder-1'));
    fireEvent.click(screen.getByTestId(`skeleton-placeholder-picker-item-${entry.id}`));
    // Picker closed.
    expect(screen.queryByTestId('skeleton-placeholder-picker')).toBeNull();
    // Block no longer placeholder — становится filled (data-kind='circular').
    const block = screen.getByTestId('skeleton-block-c-placeholder-1');
    expect(block.getAttribute('data-kind')).toBe('circular');
  });

  it('Esc closes picker without filling', () => {
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-block-c-placeholder-1'));
    expect(screen.getByTestId('skeleton-placeholder-picker')).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByTestId('skeleton-placeholder-picker')).toBeNull();
    // Placeholder still placeholder.
    const block = screen.getByTestId('skeleton-block-c-placeholder-1');
    expect(block.getAttribute('data-kind')).toBe('placeholder');
  });

  it('× кнопка закрывает picker', () => {
    render(<CanvasSkeleton />);
    fireEvent.click(screen.getByTestId('skeleton-block-c-placeholder-1'));
    fireEvent.click(screen.getByTestId('skeleton-placeholder-picker-close'));
    expect(screen.queryByTestId('skeleton-placeholder-picker')).toBeNull();
  });
});

describe('Drop on placeholder → in-place fill (NOT new container)', () => {
  function makeDataTransfer(entryId) {
    return {
      types: ['application/x-bodge-entry-id'],
      getData: (t) => (t === 'application/x-bodge-entry-id' ? entryId : ''),
      dropEffect: '',
      effectAllowed: '',
    };
  }

  it('V61 — drop entry on ghost → in-place fill + новый ghost auto-respawn', () => {
    const entry = sampleEntry('lib-drop-ph', 'dropped-ph', 'CATGCATG');
    act(() => {
      useStore.setState((s) => ({
        ...s,
        libraryEntries: { [entry.id]: entry },
      }));
    });
    render(<CanvasSkeleton />);
    const placeholder = screen.getByTestId('skeleton-block-c-placeholder-1');
    expect(placeholder.getAttribute('data-kind')).toBe('placeholder');

    const blocksBefore = Array.from(document.querySelectorAll('[data-kind="placeholder"], [data-kind="linear"], [data-kind="circular"]')).length;
    expect(blocksBefore).toBe(1); // initial ghost only

    fireEvent.dragEnter(placeholder.parentElement, { dataTransfer: makeDataTransfer(entry.id) });
    fireEvent.drop(placeholder.parentElement, { dataTransfer: makeDataTransfer(entry.id) });

    const blocksAfter = Array.from(document.querySelectorAll('[data-kind="placeholder"], [data-kind="linear"], [data-kind="circular"]'));
    // V61: ghost заполнен in-place (тот же id), но автоматически
    // появляется НОВЫЙ ghost → count = 2.
    expect(blocksAfter.length).toBe(2);
    // Старый c-placeholder-1 теперь circular (заполнен).
    expect(screen.getByTestId('skeleton-block-c-placeholder-1').getAttribute('data-kind')).toBe('circular');
    // Один из 2 блоков — placeholder (новый ghost).
    const placeholders = document.querySelectorAll('[data-kind="placeholder"]');
    expect(placeholders.length).toBe(1);
  });
});
