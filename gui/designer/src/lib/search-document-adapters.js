/**
 * search-document-adapters — turn raw store entities into normalized SearchDocuments
 * (P1). The orchestrator (`library-search`) consumes ONLY SearchDocuments, so it never
 * touches store shapes; new entity types (projects/primers/enzymes, P5) get their own
 * `collect*Documents` here without changing the search core. Pure.
 *
 * See search-types.js for the SearchDocument shape.
 *
 * NOTE: enzyme-as-entity documents (collectEnzymeDocuments, P5) live in the
 * SEPARATE search-enzyme-adapters.js — importing the ~459-enzyme restriction DB
 * here would drag it into every consumer of entryToDocument (library-search, the
 * tree filter, the assembly picker via makeEntryMatcher, the align lazy chunk…).
 * Only the library topbar needs enzyme entities.
 */
function normalizeTopology(entry) {
  const t = entry?.payload?.topology ?? entry?.topology;
  if (t && typeof t === 'object') return t.circular ? 'circular' : 'linear';
  if (typeof t === 'string') return t === 'circular' ? 'circular' : 'linear';
  return undefined;
}

/** The revision token used to detect a stale sequence-nav jump (P3). Same source
 * entryToDocument stamps on ref.revision — one derivation, so producer + consumer
 * of a navRequest compare the same value. */
export function entryRevision(entry) {
  const e = entry || {};
  return e.origin?.revision ?? e.rev ?? e.updatedAt ?? null;
}

function mapFeatures(annotations) {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .filter((a) => a && (a.name || a.type))
    .map((a) => ({
      id: a.id,
      name: a.name || '',
      type: a.type || '',
      start: a.start,
      end: a.end,
      strand: a.strand === -1 ? -1 : 1,
      // The intron→CDS link (regionId / parentId). Protein search (P4) reuses
      // getIntronsForRegion, which treats a linked intron as authoritative — so
      // an intron sitting inside an overlapping opposite-strand CDS isn't wrongly
      // spliced out. Only carried when present (region/detail annotations set it).
      ...(a.regionId != null ? { regionId: a.regionId } : (a.parentId != null ? { regionId: a.parentId } : {})),
      // Preserved INSDC qualifiers (import-annotations QUALIFIER_WHITELIST) — the
      // feature dimension searches these (locus_tag / EC_number / product / gene …).
      // codon_start / transl_table also ride here for protein-search frame + code.
      qualifiers: a.qualifiers && typeof a.qualifiers === 'object' ? a.qualifiers : null,
    }));
}

/**
 * @param {Object} entry — a LibraryEntry (payload.* canonical, top-level fallbacks)
 * @returns {import('./search-types').SearchDocument & { kind?:string, projectId?:string, features:Array }}
 */
export function entryToDocument(entry) {
  const e = entry || {};
  const seq = e.payload?.sequence ?? e.sequence ?? '';
  const topology = normalizeTopology(e);
  const revision = entryRevision(e) ?? undefined;
  return {
    ref: { kind: 'entry', id: e.id, revision },
    title: e.name || e.id || '',
    subtitle: e.payload?.organism || e.organism || '',
    topology,   // top-level so type derivation works without a loaded sequence
    textFields: {
      name: e.name || '',
      tags: Array.isArray(e.tags) ? e.tags : [],
      status: e.origin?.status || null,
      description: e.payload?.description || e.description || '',
      organism: e.payload?.organism || e.organism || '',
    },
    sequence: seq
      ? { seq, topology, fingerprint: e.origin?.fingerprint || revision }
      : undefined,
    features: mapFeatures(e.payload?.annotations || e.annotations),
    kind: e.kind,
    projectId: e.projectId,
  };
}

/**
 * @param {Object|Array} entries — byId map or array of LibraryEntries
 * @returns {Array} SearchDocuments (drops _pendingDelete + id-less)
 */
export function collectEntryDocuments(entries) {
  const list = Array.isArray(entries)
    ? entries
    : (entries && typeof entries === 'object' ? Object.values(entries) : []);
  return list
    .filter((e) => e && e.id && !e._pendingDelete)
    .map(entryToDocument);
}

const toList = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));

/**
 * A project card as a SearchDocument (REV #2 §2). ref.kind='project'; name/description/tags
 * are searchable; NO sequence (a project is not a molecule). Pure.
 * @param {Object} project — a store project body (id/name/description/tags)
 */
export function projectToDocument(project) {
  const p = project || {};
  return {
    ref: { kind: 'project', id: p.id },
    title: p.name || p.id || '',
    subtitle: '',
    textFields: {
      name: p.name || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      status: null,
      description: p.description || '',
      organism: '',
    },
    features: [],
  };
}

/** @param {Object|Array} projects — byId map or array. Drops _pendingDelete + id-less. */
export function collectProjectDocuments(projects) {
  return toList(projects).filter((p) => p && p.id && !p._pendingDelete).map(projectToDocument);
}

/**
 * A primer as a SearchDocument (REV #2 §3.4). ref.kind='primer'; topology is always linear.
 * Tolerant of both the canonical pool shape (flat primer.sequence) and a legacy
 * kind='primer' LibraryEntry (payload.sequence / origin.status). Pure.
 */
export function primerToDocument(primer) {
  const p = primer || {};
  const seq = p.sequence ?? p.payload?.sequence ?? '';
  const status = p.status ?? p.origin?.status ?? null;
  return {
    ref: { kind: 'primer', id: p.id },
    title: p.name || p.id || '',
    subtitle: p.direction || '',
    textFields: {
      name: p.name || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      status,
      description: p.description || p.payload?.description || '',
      organism: '',
    },
    sequence: seq ? { seq, topology: 'linear' } : undefined,
    features: [],
    projectId: p.projectId,
  };
}

/**
 * Collect primer documents from the CANONICAL pool (state.primersById), then bridge any
 * legacy kind='primer' LibraryEntries that the pool does NOT already cover (REV #2 §3.4):
 * dedup first by resourceHash (when both carry one), else by stable id — so each physical
 * primer surfaces as exactly ONE ref.kind='primer'. resourceHash is best-effort/nullable,
 * so the id fallback is load-bearing, not optional.
 * @param {Object|Array} primersById — canonical pool
 * @param {{ legacyEntries?: Array }} [opts]
 */
// resourceHash lives at the top level on a canonical pool primer, but a legacy kind='primer'
// LibraryEntry stores it under payload.resourceHash (some under origin) — read all three.
const hashOf = (p) => p?.resourceHash ?? p?.payload?.resourceHash ?? p?.origin?.resourceHash ?? null;

export function collectPrimerDocuments(primersById, { legacyEntries } = {}) {
  const live = toList(primersById).filter((p) => p && p.id && !p._pendingDelete);
  const docs = live.map(primerToDocument);

  const seenHashes = new Set(live.map(hashOf).filter(Boolean));
  const seenIds = new Set(live.map((p) => p.id));
  for (const e of (Array.isArray(legacyEntries) ? legacyEntries : [])) {
    if (!e || !e.id || e._pendingDelete) continue;
    const hash = hashOf(e);
    if (hash && seenHashes.has(hash)) continue; // already seen (pool OR an earlier bridge)
    if (seenIds.has(e.id)) continue;            // already seen (by stable id)
    docs.push(primerToDocument(e));
    // Grow the seen-sets so a SECOND legacy dupe (same hash / id) is also caught.
    if (hash) seenHashes.add(hash);
    seenIds.add(e.id);
  }
  return docs;
}
