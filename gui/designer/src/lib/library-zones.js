/**
 * library-zones — Sprint M-X.7c K3 (DEC-UIRREV-ZONES-MERGE-01).
 *
 * Canonical zone classification for LibraryEntries. Two zones only:
 *   • `loose`  — entry not bound to any .bodge project (free desk).
 *   • `bodge`  — entry belongs to a .bodge project (any).
 *
 * The active/readonly distinction is **NOT** a zone — it is a UI
 * comparison done at render time:
 *   `entry.projectId === currentProjectId  →  active vs read-only`.
 *
 * The previous four-value enum (`loose | active_bodge | readonly_bodge
 * | lab_pool`) is migrated lazily: callers receive the canonical
 * 2-value zone, the legacy `entry.zone` field on disk stays as-is so
 * older sessions don't churn IndexedDB on read. Lab pool also stops
 * being a Zone — it returns later as a global View (architecture
 * 09.05.2026).
 */

const VALID_ZONES = new Set(['loose', 'bodge']);
// Legacy values still found on entries imported before 10.05.2026.
const LEGACY_ZONES = new Set(['active_bodge', 'readonly_bodge', 'lab_pool']);

function deriveZone(entry) {
  if (!entry || typeof entry !== 'object') return 'loose';
  return entry.projectId ? 'bodge' : 'loose';
}

/**
 * @param {object|null|undefined} entry — LibraryEntry-shaped object.
 * @param {object} [_ctx] — accepted for backwards compatibility with
 *   old callsites that passed `{ activeProjectId }`. Ignored — the
 *   active distinction lives in UI, not in the classifier.
 * @returns {'loose' | 'bodge'}
 */
export function classifyEntryZone(entry, _ctx) {
  if (!entry || typeof entry !== 'object') return 'loose';
  // Trust an explicit canonical zone if present.
  if (typeof entry.zone === 'string' && VALID_ZONES.has(entry.zone)) {
    return entry.zone;
  }
  // Legacy values are normalised to the canonical pair via projectId.
  if (typeof entry.zone === 'string' && LEGACY_ZONES.has(entry.zone)) {
    return deriveZone(entry);
  }
  // No zone field — derive.
  return deriveZone(entry);
}

export const LIBRARY_ZONES = ['loose', 'bodge'];
