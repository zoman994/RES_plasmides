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

import { isLabStock } from "../../../../lib/primer-identity";

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
  id, name, sequence, direction, entryId, projectId = null, tail, binding,
  // PRIMER-LIVE-1 — an anchored write carries the sites it was made against.
  // Without them the record lands with a coordinate nothing can confirm, and
  // the projection has to fall back to searching the template.
  sites, schemaVersion, sequenceSource, modifications,
}) {
  if (!id) return null;
  // PRIMER-7 (V173) — keep tail (overhang) + binding (anneals) separate. `sequence`
  // is the full oligo (tail+binding); binding falls back to the full sequence for
  // legacy callers that pass no tail, so PrimerTrack still matches on the template.
  const tl = cleanPrimerSeq(tail);
  const bind = cleanPrimerSeq(binding);
  const seq = cleanPrimerSeq(sequence) || bind;
  if (!seq) return null;
  const dir = direction === "reverse" ? "reverse" : "forward";
  return {
    primer: {
      id,
      name: String(name || "").trim(),
      sequence: seq,
      bindingSequence: bind || seq,
      tail: tl,
      direction: dir,
      length: seq.length,
      ...(Array.isArray(sites) && sites.length ? { sites } : {}),
      ...(schemaVersion ? { schemaVersion } : {}),
      ...(sequenceSource ? { sequenceSource } : {}),
      // Part of WHICH TUBE this is - a 5' phosphate makes it a different oligo.
      ...(Array.isArray(modifications) ? { modifications } : {}),
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
  // ANN-0L — an imported primer belongs to the molecule it was imported with
  // just as much as one drawn in the viewer. Keying on `origin.entryId` rather
  // than on `origin.kind` is what makes a `.dna`/GenBank primer visible on the
  // entry it came from; a pool primer bound to no entry (`paste`, project-wide)
  // is still not this entry's business.
  const rows = Object.values(primersById).filter(
    (p) => p && p.origin && p.origin.entryId === entryId,
  );
  if (rows.length === 0) return EMPTY;
  rows.sort((a, b) => String(a.addedAt || "").localeCompare(String(b.addedAt || "")));
  return rows.map((p) => ({
    // Record v2 travels WHOLE: the projection needs `sites` to place a primer
    // by what the file declared instead of re-searching the template.
    schemaVersion: p.schemaVersion,
    sites: p.sites,
    sequenceSource: p.sequenceSource,
    origin: p.origin,
    // `id` kept (Игорь 19.05.2026): identity-needing consumers —
    // PiecePrimersPickModal «Кусок из существующих праймеров» — key
    // their fwd/rev <select> by it. PrimerTrack ignores extra fields,
    // so the viewer shape is unaffected (purely additive).
    id: p.id,
    name: p.name,
    sequence: p.sequence,
    // PRIMER-7 (V173) — PrimerTrack matches on bindingSequence (not tail+binding)
    // and draws `tail` as a 5'-overhang. Fall back to the full sequence when no
    // binding was stored (legacy / tail-less primers) — identical to prior render.
    bindingSequence: p.bindingSequence || p.sequence,
    // A v2 record keeps its tail per site, where unknown (`null`) and proven
    // absent (`''`) are different answers; only a legacy scalar row is coerced.
    tail: typeof p.tail === "string" ? p.tail : (p.schemaVersion === 2 ? null : ""),
    direction: p.direction,
    tmBinding: typeof p.tm === "number" ? p.tm : undefined,
  }));
}

/**
 * The personal-inventory records — the freezer, not this entry's designs.
 *
 * Deliberately NOT scoped to the entry: a tube exists regardless of which
 * molecule is on screen, and that is the whole question «do I already have
 * this oligo?» is asking. `isLabStock` is what keeps a project design or an
 * ordered-but-not-arrived oligo out.
 */
export function selectLabStockPrimers(primersById) {
  if (!primersById) return EMPTY;
  const rows = Object.values(primersById).filter(isLabStock);
  return rows.length ? rows : EMPTY;
}
