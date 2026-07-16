/**
 * useSearchPickRouter — the kind-aware sink for a picked global-search result (REV #2
 * §10.4/§10.5). Extracted from LibraryWorkspace (size budget) and unit-testable on its own.
 *
 * Routing is by entityRef.kind (via the pure resolveSearchPick):
 *   entry   → openEntry(id, occurrence)  — the STANDARD guarded selection (dirty guard +
 *             common→entry view + perEntryState) with the nav parked AFTER a successful select.
 *   project → activateProject.
 *   primer  → the canonical pool (selectedPrimerId); a legacy-only primer that is NOT in the
 *             pool but exists as a library entry opens THERE instead of an empty pool.
 *   enzyme  → a minimal card; the cut-site scan is a SEPARATE action (canonical `cut:` query).
 *   none/unknown → no-op (fail-closed; a lost kind is never routed as an entry).
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../../store';
import { resolveSearchPick } from '../../../lib/search-pick-route';
import { cutQueryFor } from '../../../lib/query-classify';
import { legacyPrimerToCanonical } from '../../../lib/legacy-primer-migrate';

export function useSearchPickRouter({ openEntry, setQuery } = {}) {
  const [enzymeCardId, setEnzymeCardId] = useState(null);

  const handlePickSearchResult = useCallback((entityRef, occurrence) => {
    const action = resolveSearchPick(entityRef, occurrence);
    const store = useStore.getState();
    switch (action.type) {
      case 'openMolecule':
        openEntry?.(action.id, action.occurrence);
        break;
      case 'activateProject':
        store.activateProject?.(action.id);
        break;
      case 'openPrimer': {
        if (store.primersById?.[action.id]) {
          store.setActiveWorkspace?.('primer-pool', { selectedPrimerId: action.id });
          break;
        }
        // A primer result MUST land in the canonical pool (§10.2/§10.4), never a molecule
        // inspector. A legacy-only primer (bridged into search but not yet in primersById) is
        // CANONICALIZED into the pool (§3.4) via the LOSSLESS transform (carries tm/direction/
        // status/origin/… — the round-2 migration dropped them) — addPrimerToPool's state-set
        // is synchronous, so the row exists before we navigate — then the pool opens at it. The
        // `kind === 'primer'` guard also closes the collision where `primer:x` shares an id
        // with a real molecule `entry:x` (kind !== 'primer') → that must NOT open the molecule.
        const legacy = store.libraryEntries?.[action.id];
        if (legacy && legacy.kind === 'primer' && typeof store.addPrimerToPool === 'function') {
          const args = legacyPrimerToCanonical(legacy);
          if (args) {
            Promise.resolve(store.addPrimerToPool(args)).catch(() => {});
            store.setActiveWorkspace?.('primer-pool', { selectedPrimerId: legacy.id });
          }
        }
        // else: not a primer (id collision with a molecule / unknown) → no-op, never a molecule.
        break;
      }
      case 'openEnzymeCard':
        setEnzymeCardId(action.id);
        break;
      default:
        break; // 'none' / 'unknown' → fail-closed no-op
    }
  }, [openEntry]);

  const scanEnzymeSites = useCallback((enzymeId) => {
    setQuery?.(cutQueryFor(enzymeId)); // canonical + quoted: `My Enzyme` → cut:"My Enzyme"
    setEnzymeCardId(null);
  }, [setQuery]);

  const closeEnzymeCard = useCallback(() => setEnzymeCardId(null), []);

  return { handlePickSearchResult, enzymeCardId, scanEnzymeSites, closeEnzymeCard };
}
