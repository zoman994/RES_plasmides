/**
 * sequence-search-recent — Sprint M-X.9 K4.
 *
 * LocalStorage MRU helper: cap 10, dedupe, ordered by recency.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecentSearches, pushRecentSearch, clearRecentSearches, SEARCH_RECENT_CAP,
} from '../sequence-search-recent';

beforeEach(() => {
  try { clearRecentSearches(); } catch { /* */ }
});

describe('M-X.9 K4 — sequence-search-recent', () => {
  it('starts empty after clear', () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it('push adds to the front (MRU)', () => {
    pushRecentSearch('AAAA');
    pushRecentSearch('TTTT');
    expect(getRecentSearches()).toEqual(['TTTT', 'AAAA']);
  });

  it('repeating an existing query bumps it to the front (no duplicate)', () => {
    pushRecentSearch('A');
    pushRecentSearch('B');
    pushRecentSearch('A');
    expect(getRecentSearches()).toEqual(['A', 'B']);
  });

  it('caps at SEARCH_RECENT_CAP entries (oldest dropped)', () => {
    for (let i = 0; i < SEARCH_RECENT_CAP + 5; i++) {
      pushRecentSearch(`Q${i}`);
    }
    const list = getRecentSearches();
    expect(list.length).toBe(SEARCH_RECENT_CAP);
    expect(list[0]).toBe(`Q${SEARCH_RECENT_CAP + 4}`); // most recent
  });

  it('ignores empty / whitespace / non-string', () => {
    pushRecentSearch('');
    pushRecentSearch('   ');
    pushRecentSearch(null);
    expect(getRecentSearches()).toEqual([]);
  });
});
