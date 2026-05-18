/**
 * useEntryPrimers — wires the shared SequenceView primer redesign into
 * the Library / Importer inspector (Игорь 18.05.2026 «должно ещё в
 * библиотеке работать… на всех сиквенсвиверах»).
 *
 * Thin store glue; all logic lives in ../lib/entry-primers (pure,
 * unit-tested). Persistence = the unified primer pool (primerSlice,
 * DEC-IMP-11 ⚓). NOTE: `hydratePrimers` has no other production caller,
 * so the pool's in-memory map is empty until something opens it — this
 * guarded (idempotent via `_primersHydrated`) call is what makes
 * previously-saved entry primers reappear after reload.
 */
import { useCallback, useEffect, useMemo } from "react";
import { v7 as uuidv7 } from "uuid";
import { useStore } from "../../../../store";
import { buildEntryPrimerPayload, selectEntryPrimers } from "../lib/entry-primers";

export function useEntryPrimers(item) {
  // Durable library id when present (re-associates after reload);
  // Importer staging items fall back to a transient name/file key.
  const entryId = item
    ? (item._libraryEntryId || item.id || item._fileName || item.name || null)
    : null;

  const primersById = useStore((s) => s.primersById);
  const addPrimerToPool = useStore((s) => s.addPrimerToPool);
  const hydratePrimers = useStore((s) => s.hydratePrimers);

  useEffect(() => {
    if (typeof hydratePrimers !== "function") return;
    // No IndexedDB (locked-down / private-mode browser, SSR, test env)
    // → skip; a pool-hydrate failure must never crash the inspector or
    // surface as an unhandled rejection.
    if (typeof indexedDB === "undefined") return;
    Promise.resolve(hydratePrimers()).catch(() => {});
  }, [hydratePrimers]);

  const primers = useMemo(
    () => selectEntryPrimers(primersById, entryId),
    [primersById, entryId],
  );

  const onWritePrimer = useCallback(({ name, sequence, direction }) => {
    if (!entryId || typeof addPrimerToPool !== "function") return;
    const libId = item && item._libraryEntryId;
    const entry = libId ? useStore.getState().libraryEntries?.[libId] : null;
    const projectId = entry?.projectId ?? null;
    const payload = buildEntryPrimerPayload({
      id: uuidv7(), name, sequence, direction, entryId, projectId,
    });
    if (payload) addPrimerToPool(payload);
  }, [entryId, item, addPrimerToPool]);

  return { primers, onWritePrimer };
}
