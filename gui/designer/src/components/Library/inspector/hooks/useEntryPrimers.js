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
import {
  ENTRY_PRIMER_ORIGIN,
  buildEntryPrimerPayload,
  selectEntryPrimers,
  selectLabStockPrimers,
} from "../lib/entry-primers";

export function useEntryPrimers(item, opts = {}) {
  // Durable library id when present (re-associates after reload);
  // Importer staging items fall back to a transient name/file key.
  const entryId = item
    ? (item._libraryEntryId || item.id || item._fileName || item.name || null)
    : null;

  const primersById = useStore((s) => s.primersById);
  const addPrimerToPool = useStore((s) => s.addPrimerToPool);
  const removePrimerFromPool = useStore((s) => s.removePrimerFromPool);
  const editPrimerInPlace = useStore((s) => s.editPrimerInPlace);
  const ensureLabStockPrimer = useStore((s) => s.ensureLabStockPrimer);
  const hydratePrimers = useStore((s) => s.hydratePrimers);

  useEffect(() => {
    if (typeof hydratePrimers !== "function") return;
    // No IndexedDB (locked-down / private-mode browser, SSR, test env)
    // → skip; a pool-hydrate failure must never crash the inspector or
    // surface as an unhandled rejection.
    if (typeof indexedDB === "undefined") return;
    Promise.resolve(hydratePrimers()).catch(() => {});
  }, [hydratePrimers]);

  const primers = useMemo(() => {
    const selected = selectEntryPrimers(primersById, entryId);
    if (!selected.length) return selected;
    return selected.map((primer) => ({
      ...primer,
      bindingModel: primersById?.[primer.id]?.bindingModel || null,
    }));
  }, [primersById, entryId]);

  // PRIMER-LIVE-1 — the freezer. Not entry-scoped: a tube exists whichever
  // molecule happens to be open.
  const labPrimers = useMemo(() => selectLabStockPrimers(primersById), [primersById]);

  // PRIMER-LIVE-1 — WHICH project this primer belongs to.
  //
  // A library entry knows its own project. A CONTAINER does not: the editor
  // opens a container, not a library row, so the old lookup returned null and
  // every primer written with Ctrl+R in the container editor landed
  // project-less - invisible to Save, and gone on the next Open. The host that
  // knows which project is open passes it explicitly.
  const projectId = useMemo(() => {
    if (opts.projectId !== undefined) return opts.projectId ?? null;
    const libId = item && item._libraryEntryId;
    const entry = libId ? useStore.getState().libraryEntries?.[libId] : null;
    return entry?.projectId ?? null;
  }, [opts.projectId, item]);

  const onWritePrimer = useCallback(async ({
    primerId, name, sequence, direction, tail, binding, sites, schemaVersion,
    sequenceSource, modifications, bindingModel, tm,
  }) => {
    if (!entryId) return null;
    // An EDIT names the record it edits. Minting a fresh id here is what turned
    // "rename this primer" into "make a second, emptier copy of it".
    if (primerId && typeof editPrimerInPlace === "function") {
      return editPrimerInPlace(primerId, {
        name,
        sequence,
        bindingSequence: binding,
        bindingModel,
        tail,
        direction,
        modifications,
        tm,
        // Only a caller that really re-anchored the primer supplies sites; an
        // ordinary edit leaves the existing anchor exactly where it was.
        sites,
      });
    }
    if (typeof addPrimerToPool !== "function") return null;
    // PRIMER-7 (V173) - forward tail/binding so a tailed primer persists its
    // overhang + binding and renders correctly on the sequence.
    const payload = buildEntryPrimerPayload({
      id: uuidv7(), name, sequence, direction, entryId, projectId, tail, binding,
      // PRIMER-LIVE-1 - carry the anchor so the record remembers which
      // molecule and which version of it the landing was declared against.
      sites, schemaVersion, sequenceSource, modifications,
    });
    if (payload && bindingModel === 'aligned-v1') {
      payload.primer.bindingModel = 'aligned-v1';
    }
    return payload ? addPrimerToPool(payload) : null;
  }, [entryId, projectId, addPrimerToPool, editPrimerInPlace]);

  /**
   * "I have this one" - turn a design into a record of a physical tube.
   *
   * The project usage stays exactly where it is; the tube is a separate global
   * record, because a tube is not owned by whichever assembly was open.
   */
  const onMarkReceived = useCallback(
    (primerId) => (typeof ensureLabStockPrimer === "function"
      ? ensureLabStockPrimer(primerId)
      : Promise.resolve(null)),
    [ensureLabStockPrimer],
  );

  /**
   * Reuse the tube that already exists.
   *
   * This creates a project USAGE anchored to the molecule on screen and points
   * it at the freezer record. It deliberately does NOT copy the tube into the
   * project: there is one physical oligo, and duplicating its record is how a
   * biolog ends up ordering something they already own.
   */
  const onReuseLabPrimer = useCallback(async (record, ctx = {}) => {
    if (!record || !entryId || typeof addPrimerToPool !== "function") return null;
    const sel = ctx.selection;
    const reverse = ctx.orientation === "reverse";
    const binding = record.bindingSequence || record.sequence;
    const payload = buildEntryPrimerPayload({
      id: uuidv7(),
      name: record.name,
      sequence: record.sequence,
      binding,
      tail: typeof record.tail === "string" ? record.tail : "",
      direction: reverse ? "reverse" : "forward",
      entryId,
      projectId,
      modifications: record.modifications,
      schemaVersion: 2,
      sequenceSource: "reuse",
      sites: (sel && Number.isInteger(sel.start) && Number.isInteger(sel.end))
        ? [{
          id: `${record.id}-use-${sel.start}`,
          target: {
            entryId,
            resourceHash: ctx.documentHash ?? null,
            topology: ctx.topology ?? null,
          },
          location: { kind: "single", segments: [{ start: sel.start, end: sel.end }] },
          strand: reverse ? -1 : 1,
          annealedSequence: binding,
          tail: typeof record.tail === "string" ? record.tail : "",
          sourceVisibility: "shown",
          sourceForms: ["reuse"],
        }]
        : undefined,
    });
    if (!payload) return null;
    if (record.bindingModel === 'aligned-v1') payload.primer.bindingModel = 'aligned-v1';
    // The link back to the physical oligo. Without it the usage is just another
    // lookalike and the "already in the lab" answer is lost on the next open.
    payload.primer.origin = {
      kind: ENTRY_PRIMER_ORIGIN,
      entryId,
      reusesPrimerId: record.id,
    };
    return addPrimerToPool(payload);
  }, [entryId, projectId, addPrimerToPool]);

  // Delete a selected primer (SequenceView's Del/Backspace on a selected
  // primer calls onDeletePrimer(hit)). Without this the key was swallowed
  // read-only — create worked, delete was dead in the Library viewers.
  // Mirrors the assembly editor's onDeletePrimer (hit → remove by id).
  const onDeletePrimer = useCallback((hit) => {
    const id = hit && (hit.id || hit.primerId);
    if (id && typeof removePrimerFromPool === "function") removePrimerFromPool(id);
  }, [removePrimerFromPool]);

  return {
    primers, labPrimers, onWritePrimer, onDeletePrimer, onMarkReceived, onReuseLabPrimer,
  };
}
