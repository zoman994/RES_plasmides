/**
 * legacy-primer-migrate — map a legacy kind='primer' LibraryEntry into the canonical shape
 * addPrimerToPool expects, WITHOUT losing data (REV#2 K6-P1-2b, Игорь review-3 14.07).
 *
 * A legacy primer stores its fields in THREE places — mirroring search-document-adapters
 * `primerToDocument` / `hashOf`: top-level, under `payload`, and (for status/resourceHash)
 * under `origin`. The round-2 migration copied only {id,name,sequence,tags,resourceHash} →
 * tm/length/direction/bindingSequence/tail/status/origin/addedAt were all dropped, turning a
 * `Tm=58.2 · reverse · ordered` oligo into `Tm=null · no direction · imported`.
 *
 * Two things make this lossless:
 *  1. Carry EVERY field (top-level → payload → origin fallback chain).
 *  2. Return `status` and `origin` as SEPARATE args. addPrimerToPool's DEFAULT status is
 *     `'imported'` — itself a valid enum — so `normalizePrimer` lets it CLOBBER `input.status`
 *     unless the real status is passed as the explicit arg. Same for origin (default null →
 *     falls back to defaultOrigin() and drops origin.resourceHash).
 *
 * @param {Object} entry — a kind='primer' LibraryEntry.
 * @returns {{primer: Object, projectId: (string|null), status: string, origin: (Object|null)}|null}
 *          ready-to-spread args for addPrimerToPool, or null for a null / id-less entry.
 */
export function legacyPrimerToCanonical(entry) {
  if (!entry || !entry.id) return null;
  const payload = entry.payload || {};
  // top-level wins, then payload — matching primerToDocument's tolerance.
  const pick = (k) => entry[k] ?? payload[k];
  const num = (v) => (typeof v === 'number' ? v : undefined);

  const origin = entry.origin ?? payload.origin ?? null;
  // status / resourceHash also live under origin on some legacy entries (hashOf chain).
  const status = pick('status') ?? origin?.status ?? undefined;
  const resourceHash = pick('resourceHash') ?? origin?.resourceHash ?? null;

  return {
    primer: {
      id: entry.id,
      name: pick('name'),
      sequence: pick('sequence') ?? '',
      bindingSequence: pick('bindingSequence') ?? null,
      // assembly `tail` vs PCR/local-primer-design `tailSequence` — pass both; normalizePrimer
      // canonicalizes to `tail`.
      tail: pick('tail'),
      tailSequence: pick('tailSequence'),
      tm: num(pick('tm')),
      length: num(pick('length')),
      direction: pick('direction') ?? null,
      // description is a searchable dimension (primerToDocument.textFields.description) — carry it.
      description: pick('description') ?? null,
      tags: Array.isArray(pick('tags')) ? pick('tags') : [],
      addedAt: pick('addedAt'),
      resourceHash,
      origin: origin ?? undefined,
      status,
    },
    projectId: pick('projectId') ?? null,
    status: status ?? 'imported',
    origin: origin ?? null,
  };
}
