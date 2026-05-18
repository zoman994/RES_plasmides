/**
 * sequence-search-recent — Sprint M-X.9 K4.
 *
 * LocalStorage-backed recent-search list for the search popover.
 * Cap = 10, MRU. Stores plain query strings.
 */

const KEY = 'bodgegene-search-recent';
const CAP = 10;

function readRaw() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!v) return [];
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRaw(arr) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(arr.slice(0, CAP)));
    }
  } catch { /* private mode / quota */ }
}

export function getRecentSearches() {
  return readRaw();
}

export function pushRecentSearch(query) {
  if (typeof query !== 'string') return;
  const trimmed = query.trim();
  if (!trimmed) return;
  const existing = readRaw().filter((q) => q !== trimmed);
  writeRaw([trimmed, ...existing]);
}

export function clearRecentSearches() {
  writeRaw([]);
}

export const SEARCH_RECENT_CAP = CAP;
