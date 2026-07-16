/**
 * V85 — PlaceholderTreePicker entry-row visual parity: каждая строка
 * имеет PlasmidMiniMap thumbnail (или fallback line для primer/empty),
 * project badge встаёт inline перед bp-счётчиком (никакого overlap).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, within, fireEvent } from '@testing-library/react';
import PlaceholderTreePicker from '../PlaceholderTreePicker';
import { bootstrapStore, useStore } from '../../../../store';

afterEach(cleanup);
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  try { localStorage.clear(); } catch { /* no-op */ }
  act(() => {
    useStore.setState((s) => ({
      ...s,
      libraryEntries: {
        'le-circ': {
          id: 'le-circ', kind: 'container', name: 'pUC19',
          projectId: null,
          payload: { topology: 'circular', length: 2686, annotations: [{ start: 0, end: 100, name: 'ori' }] },
        },
        'le-lin': {
          id: 'le-lin', kind: 'container', name: 'lin-frag',
          projectId: null,
          payload: { topology: 'linear', length: 200, annotations: [] },
        },
        'le-other': {
          id: 'le-other', kind: 'container', name: 'pET28',
          projectId: 'proj-other',
          payload: { topology: 'circular', length: 5400, annotations: [] },
        },
      },
      projects: { 'proj-other': { id: 'proj-other', name: 'Other proj' } },
      currentProjectId: null,
    }));
  });
});

describe('V85 — PlaceholderTreePicker entry-row visual parity', () => {
  it('circular library entry renders a PlasmidMiniMap-style thumbnail', () => {
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    const thumb = screen.getByTestId('skeleton-placeholder-picker-thumb-le-circ');
    // Inside should be an <svg> (PlasmidMiniMap renders SVG ring).
    expect(thumb.querySelector('svg')).toBeTruthy();
  });

  it('linear empty entry falls back to single-line SVG (no map)', () => {
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    const thumb = screen.getByTestId('skeleton-placeholder-picker-thumb-le-lin');
    const svg = thumb.querySelector('svg');
    expect(svg).toBeTruthy();
    // Fallback puts <line>, no <path> arcs.
    expect(svg.querySelector('line')).toBeTruthy();
  });

  it('«Другие проекты» row shows project badge INLINE (no overlap)', () => {
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    // Expand the «other-projects» section first.
    const otherSection = screen.getByTestId('skeleton-picker-section-other-projects');
    act(() => {
      within(otherSection).getByTestId('skeleton-picker-section-header-other-projects').click();
    });
    const badge = screen.getByTestId('skeleton-placeholder-picker-extra-badge-le-other');
    expect(badge.textContent).toBe('Other proj');
    // Inline badge must NOT have `position: absolute` (the prior overlap
    // bug came from `position:absolute; right:80px` sitting over bp).
    expect(badge.style.position).not.toBe('absolute');
  });

  it('bp counter remains readable (no overlap with badge)', () => {
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    const otherSection = screen.getByTestId('skeleton-picker-section-other-projects');
    act(() => {
      within(otherSection).getByTestId('skeleton-picker-section-header-other-projects').click();
    });
    const row = screen.getByTestId('skeleton-placeholder-picker-item-le-other');
    expect(row.textContent).toMatch(/5[\s ]?400 bp/);
    expect(row.textContent).toMatch(/circular/);
  });
});

// Dedup: the picker search runs the shared metadata engine (tags/type/feature),
// while KEEPING its by-sequence substring search (the picker's whole point).
describe('PlaceholderTreePicker — shared search engine + sequence preserved', () => {
  const seedOne = (over) => act(() => {
    useStore.setState((s) => ({
      ...s,
      libraryEntries: {
        t1: {
          id: 't1', kind: 'container', name: 'pUC19', projectId: null,
          tags: over.tags || [],
          payload: { topology: 'circular', length: 120, sequence: over.seq || '', annotations: over.anns || [] },
        },
      },
      currentProjectId: null,
    }));
  });
  const type = (v) => fireEvent.change(
    screen.getByTestId('skeleton-placeholder-picker-search'), { target: { value: v } },
  );

  it('a TAG match reveals an entry whose name does not match', () => {
    seedOne({ tags: ['kanamycin'] });
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    type('kanamycin');
    expect(screen.getByTestId('skeleton-placeholder-picker-item-t1')).toBeTruthy();
  });

  it('a FEATURE name reveals its entry', () => {
    seedOne({ anns: [{ id: 'a1', name: 'AmpR', type: 'CDS' }] });
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    type('AmpR');
    expect(screen.getByTestId('skeleton-placeholder-picker-item-t1')).toBeTruthy();
  });

  it('still finds by SEQUENCE substring (regression — picker raison d’être)', () => {
    seedOne({ seq: 'ATGCATGCATGCTTAA' });
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    type('ATGCATGC');
    expect(screen.getByTestId('skeleton-placeholder-picker-item-t1')).toBeTruthy();
  });

  it('a non-matching query hides the entry', () => {
    seedOne({ tags: ['ampicillin'] });
    render(<PlaceholderTreePicker onPick={() => {}} onCancel={() => {}} />);
    type('zzz-nomatch');
    expect(screen.queryByTestId('skeleton-placeholder-picker-item-t1')).toBeNull();
  });
});
