/**
 * skeleton-picker-prefs-b8.test.jsx — Recent + Favorites prefs.
 *
 * B8 (14.05.2026 — TIER-B).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecent, recordRecent,
  getFavorites, toggleFavorite, isFavorite,
  _clearAllPrefs,
} from '../canvas/picker-prefs';

beforeEach(() => _clearAllPrefs());

describe('B8 — recent prefs', () => {
  it('recordRecent добавляет id в front', () => {
    recordRecent('a');
    recordRecent('b');
    recordRecent('c');
    expect(getRecent()).toEqual(['c', 'b', 'a']);
  });

  it('повторный pick перемещает в front (no duplicate)', () => {
    recordRecent('a');
    recordRecent('b');
    recordRecent('a');
    expect(getRecent()).toEqual(['a', 'b']);
  });

  it('cap = 5', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) recordRecent(id);
    expect(getRecent().length).toBe(5);
    expect(getRecent()[0]).toBe('g');
    expect(getRecent()[4]).toBe('c');
  });
});

describe('B8 — favorites prefs', () => {
  it('toggleFavorite добавляет и убирает', () => {
    expect(isFavorite('x')).toBe(false);
    toggleFavorite('x');
    expect(isFavorite('x')).toBe(true);
    expect(getFavorites()).toEqual(['x']);
    toggleFavorite('x');
    expect(isFavorite('x')).toBe(false);
    expect(getFavorites()).toEqual([]);
  });

  it('multiple favorites', () => {
    toggleFavorite('a');
    toggleFavorite('b');
    toggleFavorite('c');
    expect(getFavorites()).toEqual(['a', 'b', 'c']);
  });
});
