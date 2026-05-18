/**
 * entry-primers — pure layer behind `useEntryPrimers`.
 *
 * Игорь 18.05.2026: the primer redesign (modal-from-selection +
 * clickable + flank + letters) must also work in the Library / Importer
 * inspector, not only the assembly canvas — «в общем на всех
 * сиквенсвиверах».
 *
 * Persistence reuses the existing unified primer pool (primerSlice,
 * DEC-IMP-11 ⚓ — the single store the «Library Primers» / project Pool
 * views read). A library-entry primer is just a pool primer scoped to
 * its entry via `origin = { kind:'library-selection', entryId }`.
 * Binding position is NOT stored — PrimerTrack re-derives it by
 * indexOf-matching the (RC-aware) sequence against the displayed
 * sequence, the same contract PCR / assembly already use.
 */

export const ENTRY_PRIMER_ORIGIN = "library-selection";

// Shared frozen empty result — referential stability matters: the
// SequenceView primer memos key on the `primers` array identity, so a
// no-match render must return the SAME ref to avoid churn.
const EMPTY = Object.freeze([]);

function cleanPrimerSeq(s) {
  return String(s || "").toUpperCase().replace(/[^ACGT]/g, "");
}

/**
 * Shape a `addPrimerToPool` payload for a primer designed against a
 * library entry. Pure (id is injected by the caller). Returns null when
 * the primer can't be persisted (no id, or no usable bases) so the
 * caller can no-op instead of writing a junk pool row.
 */
export function buildEntryPrimerPayload({
  id, name, sequence, direction, entryId, projectId = null,
}) {
  if (!id) return null;
  const seq = cleanPrimerSeq(sequence);
  if (!seq) return null;
  const dir = direction === "reverse" ? "reverse" : "forward";
  return {
    primer: {
      id,
      name: String(name || "").trim(),
      sequence: seq,
      direction: dir,
      length: seq.length,
    },
    projectId: projectId ?? null,
    status: "designed",
    origin: { kind: ENTRY_PRIMER_ORIGIN, entryId },
  };
}

/**
 * Entry-scoped view of the hydrated pool, mapped to the PrimerTrack
 * viewer shape (`bindingSequence` mirrors `sequence`; PrimerTrack
 * indexOf-places it). Returns the shared EMPTY ref when nothing matches.
 */
export function selectEntryPrimers(primersById, entryId) {
  if (!primersById || !entryId) return EMPTY;
  const rows = Object.values(primersById).filter(
    (p) => p
      && p.origin
      && p.origin.kind === ENTRY_PRIMER_ORIGIN
      && p.origin.entryId === entryId,
  );
  if (rows.length === 0) return EMPTY;
  rows.sort((a, b) => String(a.addedAt || "").localeCompare(String(b.addedAt || "")));
  return rows.map((p) => ({
    name: p.name,
    sequence: p.sequence,
    bindingSequence: p.sequence,
    direction: p.direction,
    tmBinding: typeof p.tm === "number" ? p.tm : undefined,
  }));
}
