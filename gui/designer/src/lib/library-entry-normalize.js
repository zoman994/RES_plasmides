/**
 * Normalisation invariants for a LibraryEntry, extracted out of `librarySlice` (already over its hard
 * budget) so the store keeps the writes and this leaf keeps the rules.
 *
 * Two rules live here, both of them load-bearing for search/navigation identity:
 *   • `withEntryVersion` — every stored molecule carries a saved-revision counter;
 *   • `sameAnnotationSet` — whether an annotation write would change anything at all.
 */

export const FIRST_ENTRY_VERSION = 1;

/**
 * Is this a usable saved revision? A counter, nothing else.
 *
 * The same predicate `entryRevision` (search-document-adapters) applies at the reading end, and it
 * must be the same predicate: a value one side accepts and the other rejects produces an entry that
 * has an identity when it is written and none when it is searched. `Number.isFinite` was not it — it
 * admits 1.5 and 2.0000000001, which are not versions of anything, and a fractional counter silently
 * breaks the ordering every «is this newer?» comparison depends on.
 */
export function isEntryVersion(v) {
  return Number.isSafeInteger(v) && v >= FIRST_ENTRY_VERSION;
}

/**
 * The ONE place a LibraryEntry gets its saved-revision stamp.
 *
 * `version` is the document-identity token the whole search/navigation chain is keyed on:
 * `entryRevision` reads it, `entryToDocument` stamps it onto `ref.revision`, and the stale-jump guard
 * compares producer to consumer with it. An entry without a version is a molecule nobody can name —
 * the guard has nothing to compare, so a locus measured on the pre-edit molecule would be applied to
 * the post-edit one, and the derived-protein cache turns itself off.
 *
 * So it is an INVARIANT of the store, not a field callers are trusted to set: every ingress (single
 * add, bulk add, hydrate) runs through here instead of repeating a default at five call sites.
 *
 * Never overwrites a VALID counter — demoting a saved-twice molecule back to 1 would make two
 * different documents share an identity, which is exactly what this field exists to prevent. An
 * invalid one (a float, a string, a 0) is replaced: it names nothing, and keeping it only preserves
 * the illusion of an identity.
 */
export function withEntryVersion(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (isEntryVersion(entry.version)) return entry;
  return { ...entry, version: FIRST_ENTRY_VERSION };
}

/** Structural equality over plain JSON values. Key ORDER is not data; presence and value are. */
function deepEqual(a, b) {
  if (a === b) return true;
  // NaN never equals itself under ===, and a qualifier can hold one.
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i += 1) {
    const k = ka[i];
    if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Would writing `next` over `prev` change the annotations at all?
 *
 * Used by the inspector's safety-net to skip a write that changes nothing — the open of a molecule
 * hands the same list straight back, and an unconditional write there replaced the entry object,
 * aged the search corpus, and made «open a molecule» look like «the library changed».
 *
 * It compares the WHOLE canonical annotation, and it has to. A field-list version of this once
 * compared id/type/name/span/strand/level/parent and nothing else, which meant every other field an
 * annotation legitimately carries — `qualifiers.product`, `gene`, `EC_number`, `codon_start`,
 * `transl_table`, a colour, a note — could be edited and then silently discarded: not written to the
 * store, not written to Dexie, not aged, no error. A comparison used to CANCEL a write is a data-loss
 * bug the moment it is narrower than the data, so this one is defined by what a record is rather than
 * by which fields we happened to think of.
 *
 * O(n) in the annotation count and their fields — never the sequence.
 */
export function sameAnnotationSet(a, b) {
  const prev = Array.isArray(a) ? a : [];
  const next = Array.isArray(b) ? b : [];
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (!deepEqual(prev[i] || {}, next[i] || {})) return false;
  }
  return true;
}

/**
 * Lazy migration heuristic for entries created before M-X.5 (07.05.2026).
 *
 * Pre-M-X.5 entries lack `origin` / `version` / `parentEntry*` fields.
 * Per the M-X.5 plan we don't I/O during hydrate (would slow startup
 * for biologists with 100+ entries) — we infer the origin kind from
 * what's already on the entry:
 *
 *   • Tag prefix `demo:<slug>` → entry came in via the SnapGene
 *     catalog flow (M-A.3). Origin → `demo_category`.
 *   • Otherwise → `file_import` fallback. Lossy for paste/manual-edit
 *     entries from earlier versions, but not a blocker — biolog can
 *     re-import if provenance matters. The fallback is kept only for
 *     compatibility with entries created before structured origins.
 *
 * Idempotent: re-running on an already-migrated entry returns it
 * unchanged. Pure — no Dexie writes (lazy: each future
 * `putLibraryEntry` will persist whatever the in-memory copy holds).
 *
 * Q2 in the M-X.5 plan: heuristic chosen over full match against
 * `plasmids-index.json` because the index is 867 KB and reading it
 * during hydrate adds I/O cost without proportional value.
 */
export function deriveOriginForExisting(entry) {
  if (!entry) return entry;
  // The version stamp runs BEFORE the origin short-circuit. An entry can carry an
  // origin and still have no version — a project-targeted file import stamps
  // `origin` and nothing else, and a .bodge row arrives with whatever the writing
  // build serialised. Those rows used to leave here untouched, on every reload,
  // forever: the one class of legacy record no backfill could ever reach.
  if (entry.origin) return withEntryVersion(entry);
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const demoTag = tags.find(t => typeof t === 'string' && t.startsWith('demo:'));
  const importedAt = entry.addedAt || new Date().toISOString();
  const origin = demoTag
    ? {
        kind: 'demo_category',
        categorySlug: demoTag.slice(5),
        sourcePlasmidName: entry.name,
        importedAt,
      }
    : {
        kind: 'file_import',
        sourceFileName: entry.name,
        sourceFormat: 'gb',
        importedAt,
      };
  return withEntryVersion({ ...entry, origin });
}
