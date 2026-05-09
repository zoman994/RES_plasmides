/**
 * library-zones — Sprint M-X.7a v2 K1.
 *
 * Canonical zone classification for LibraryEntries. Zones drive:
 *   • Tree placement (LooseZone / ProjectZone / LabPoolZone — K2)
 *   • Action-row variant via `getActionsFor(entry, zone)` (K3 §5.4)
 *   • `useEditableModeToggle(item)` initial state (only readonly_bodge
 *     starts read-only; others editable per FIX-3.4 reformulation
 *     of DEC-MX7A-08)
 *
 * The classifier is **defensive** — it never throws and never returns
 * an invalid zone. Post-K1-wipe entries always carry an explicit
 * `zone` field on creation, so the derivation paths only fire for
 * legacy entries (none today, dev wipe assumed) or for entry-shape
 * sanity checks at runtime.
 */

const VALID_ZONES = new Set(['loose', 'active_bodge', 'readonly_bodge', 'lab_pool']);

/**
 * @param {object|null|undefined} entry — LibraryEntry-shaped object.
 * @param {object} [ctx]
 * @param {string|null} [ctx.activeProjectId] — current project id from
 *   projectSlice. When entry.projectId matches, zone is `active_bodge`;
 *   when entry.projectId is set but doesn't match (or no ctx), zone
 *   is `readonly_bodge` (entry came from a foreign .bodge).
 * @returns {'loose' | 'active_bodge' | 'readonly_bodge' | 'lab_pool'}
 */
export function classifyEntryZone(entry, ctx = {}) {
  if (!entry || typeof entry !== 'object') return 'loose';
  if (typeof entry.zone === 'string' && VALID_ZONES.has(entry.zone)) {
    return entry.zone;
  }
  // Derivation path — used for legacy entries / sanity check.
  if (entry.kind === 'primer' && entry.inLabStock === true) {
    return 'lab_pool';
  }
  if (entry.projectId) {
    if (ctx.activeProjectId && entry.projectId === ctx.activeProjectId) {
      return 'active_bodge';
    }
    return 'readonly_bodge';
  }
  return 'loose';
}

export const LIBRARY_ZONES = ['loose', 'active_bodge', 'readonly_bodge', 'lab_pool'];
