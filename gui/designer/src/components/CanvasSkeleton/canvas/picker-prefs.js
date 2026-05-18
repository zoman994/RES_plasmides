/**
 * picker-prefs — recent + favorites для PlaceholderTreePicker.
 *
 * B8 (14.05.2026 — TIER-B). Хранится в localStorage:
 *   - recent: array of last-picked entry IDs (max 5).
 *   - favorites: array of pinned entry IDs (unlimited, sorted alpha).
 *
 * Не зависит от React — pure helpers.
 */

const STORAGE_KEY = 'bodge-skeleton-picker-prefs-v1';
const RECENT_LIMIT = 5;

function loadPrefs() {
  try {
    if (typeof localStorage === 'undefined') return { recent: [], favorites: [] };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { recent: [], favorites: [] };
    const parsed = JSON.parse(raw);
    return {
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch {
    return { recent: [], favorites: [] };
  }
}

function savePrefs(prefs) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore quota / privacy mode */ }
}

export function getRecent() {
  return loadPrefs().recent;
}

export function getFavorites() {
  return loadPrefs().favorites;
}

export function recordRecent(entryId) {
  if (!entryId) return;
  const prefs = loadPrefs();
  const filtered = prefs.recent.filter((id) => id !== entryId);
  prefs.recent = [entryId, ...filtered].slice(0, RECENT_LIMIT);
  savePrefs(prefs);
}

export function toggleFavorite(entryId) {
  if (!entryId) return;
  const prefs = loadPrefs();
  if (prefs.favorites.includes(entryId)) {
    prefs.favorites = prefs.favorites.filter((id) => id !== entryId);
  } else {
    prefs.favorites = [...prefs.favorites, entryId];
  }
  savePrefs(prefs);
}

export function isFavorite(entryId) {
  return loadPrefs().favorites.includes(entryId);
}

// For testing.
export function _clearAllPrefs() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
