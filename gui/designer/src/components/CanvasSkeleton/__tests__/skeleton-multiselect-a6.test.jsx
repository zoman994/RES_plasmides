/**
 * skeleton-multiselect-a6.test.jsx — Multi-select tests.
 *
 * A6 (14.05.2026 — TIER-A).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('A6 — multi-selection reducer', () => {
  it('TOGGLE_SELECTION добавляет/убирает id', () => {
    let s = buildInitialState();
    expect(s.selectedContainerIds).toEqual([]);
    s = skeletonReducer(s, { type: 'TOGGLE_SELECTION', containerId: 'c1' });
    expect(s.selectedContainerIds).toEqual(['c1']);
    s = skeletonReducer(s, { type: 'TOGGLE_SELECTION', containerId: 'c2' });
    expect(s.selectedContainerIds).toEqual(['c1', 'c2']);
    s = skeletonReducer(s, { type: 'TOGGLE_SELECTION', containerId: 'c1' });
    expect(s.selectedContainerIds).toEqual(['c2']);
  });

  it('CLEAR_SELECTION возвращает в []', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'TOGGLE_SELECTION', containerId: 'c1' });
    s = skeletonReducer(s, { type: 'TOGGLE_SELECTION', containerId: 'c2' });
    s = skeletonReducer(s, { type: 'CLEAR_SELECTION' });
    expect(s.selectedContainerIds).toEqual([]);
  });

  it('CLEAR_SELECTION на пустой → identity', () => {
    const s = buildInitialState();
    const s2 = skeletonReducer(s, { type: 'CLEAR_SELECTION' });
    expect(s2).toBe(s);
  });

  it('SET_SELECTION_BULK заменяет array', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SET_SELECTION_BULK', ids: ['a', 'b', 'c'] });
    expect(s.selectedContainerIds).toEqual(['a', 'b', 'c']);
  });
});
