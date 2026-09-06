/**
 * annotation-identity.js — the single owner of annotation IDENTITY and
 * parent/child linkage (ANN-INTEGRITY seam BG-029 / BG-031).
 *
 * The contract (CURRENT_TASK observable point 4):
 *   - An EXISTING annotation id is opaque and STABLE. Rename / move / type
 *     edits must NOT change it — consumers (React keys, Annotator accept/reject
 *     sets, primer source sites, selection highlight, undo snapshots) key off it
 *     and a silent id shift orphans every one of those references.
 *   - NEW ids are opaque via the shared `makeId` factory (crypto.randomUUID),
 *     never a coordinate-derived string that mutates when the coordinates do.
 *   - Duplicate ids arriving on ingress are repaired collision-safely: the
 *     first occurrence keeps the id, later collisions get fresh opaque ids.
 *     Every original id is reserved before minting so a later original owner
 *     can never be stolen by an earlier replacement.
 *   - `regionId` is the canonical parent link. Legacy `parentId` is read ONLY as
 *     an ingress alias and is never re-emitted as the model link.
 *   - Deleting a parent region cascades to its descendants. Splitting / merging
 *     explicitly reparents or detaches, but never leaves a link pointing at a
 *     region that is no longer present.
 *
 * Pure — no React, no store, no DOM. Every function returns a NEW array and
 * never mutates its input (annotations may be frozen store/Immer objects).
 */

import { makeId } from './ids';

/** Opaque, collision-safe identity for a newly-created annotation. */
export function makeAnnotationId() {
  return makeId();
}

function hasStoredId(ann) {
  return !!(ann && typeof ann.id === 'string' && ann.id.length > 0);
}

function legacyFallbackId(ann) {
  if (!ann) return null;
  const start = Number(ann.start);
  const end = Number(ann.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const type = ann.type || 'unknown';
  const name = ann.name == null ? '' : String(ann.name);
  return `region:${start}:${end}:${type}:${name}`;
}

function mintUnreservedId(reserved, mint = makeAnnotationId) {
  // randomUUID collisions are extraordinarily unlikely, but ingress is a
  // trust boundary: prove uniqueness instead of relying on probability.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const id = mint();
    if (typeof id === 'string' && id.length > 0 && !reserved.has(id)) {
      reserved.add(id);
      return id;
    }
  }
  throw new Error('annotation-identity: unable to mint a unique opaque id');
}

/**
 * Allocate one or more NEW ids against a frozen view of every id already owned
 * by the document (and any explicit ids in a pending batch). The returned
 * closure reserves each successful result for the next call, so split/merge
 * cannot collide with the document or with a sibling minted in the same edit.
 * `mint` is injectable only to bind collision behaviour in deterministic proof.
 */
export function createAnnotationIdAllocator(annotations, mint = makeAnnotationId) {
  const reserved = new Set(
    (Array.isArray(annotations) ? annotations : [])
      .filter(hasStoredId)
      .map((annotation) => annotation.id),
  );
  return () => mintUnreservedId(reserved, mint);
}

/**
 * The effective id of an annotation. An opaque stored `id` is authoritative;
 * only a genuinely id-less legacy annotation has no identity here (callers
 * decide whether to stamp one via `ensureAnnotationIds`).
 */
export function effectiveId(ann) {
  return hasStoredId(ann) ? ann.id : null;
}

/**
 * Stamp an opaque id on every annotation that lacks one. Existing ids are left
 * exactly as they are — this never rewrites a present identity. Returns a new
 * array; entries that already had an id are returned by reference.
 */
export function ensureAnnotationIds(annotations) {
  if (!Array.isArray(annotations)) return [];
  const reserved = new Set(
    annotations.filter(hasStoredId).map((a) => a.id),
  );
  const legacyParentRemap = new Map();
  let changed = false;
  let out = annotations.map((a) => {
    if (!a) return a;
    if (hasStoredId(a)) return a;
    changed = true;
    const id = mintUnreservedId(reserved);
    if (a.level === 'region') {
      const legacyId = legacyFallbackId(a);
      if (legacyId) legacyParentRemap.set(legacyId, id);
    }
    return { ...a, id };
  });
  if (legacyParentRemap.size > 0) {
    out = out.map((a) => {
      if (!a || a.regionId == null || !legacyParentRemap.has(a.regionId)) return a;
      changed = true;
      return { ...a, regionId: legacyParentRemap.get(a.regionId) };
    });
  }
  return changed ? out : annotations;
}

/**
 * Repair duplicate ids arriving on ingress. The FIRST occurrence keeps its
 * original identity. Every later collision receives a fresh opaque id that is
 * checked against ALL original ids (including ones later in the array) and all
 * ids already minted during this pass. id-less entries are left for
 * `ensureAnnotationIds`.
 */
export function repairDuplicateIds(annotations, mintId = makeAnnotationId) {
  if (!Array.isArray(annotations)) return [];
  const reserved = new Set(annotations.filter(hasStoredId).map((a) => a.id));
  const regionCounts = new Map();
  for (const a of annotations) {
    if (a?.level === 'region' && hasStoredId(a)) {
      regionCounts.set(a.id, (regionCounts.get(a.id) || 0) + 1);
    }
  }
  const used = new Set();
  const renamedUniqueRegions = new Map();
  let changed = false;
  let out = annotations.map((a) => {
    if (!hasStoredId(a)) return a;
    if (!used.has(a.id)) { used.add(a.id); return a; } // first occurrence keeps it
    changed = true;
    const previousId = a.id;
    const id = mintUnreservedId(reserved, mintId);
    used.add(id);
    // A duplicate on another level can force the one and only region owner to
    // move. In that case its children still have an unambiguous biological
    // parent, so carry the link to the renamed region instead of detaching it
    // later as if the parent had disappeared.
    if (a.level === 'region' && regionCounts.get(previousId) === 1) {
      renamedUniqueRegions.set(previousId, id);
    }
    return { ...a, id };
  });
  if (renamedUniqueRegions.size > 0) {
    out = out.map((a) => {
      if (!a || a.regionId == null || !renamedUniqueRegions.has(a.regionId)) return a;
      return { ...a, regionId: renamedUniqueRegions.get(a.regionId) };
    });
  }
  return changed ? out : annotations;
}

/**
 * Parent links are meaningful only when they identify exactly one region in
 * the ingress payload. Repairing duplicate region ids first and silently
 * keeping a child on the first occurrence would invent biology, so reject the
 * ambiguous payload before any identity is rewritten.
 */
function assertUnambiguousParentLinks(annotations) {
  const regionCounts = new Map();
  for (const a of annotations) {
    if (!a || a.level !== 'region') continue;
    const key = hasStoredId(a) ? a.id : legacyFallbackId(a);
    if (key) regionCounts.set(key, (regionCounts.get(key) || 0) + 1);
  }
  for (const a of annotations) {
    if (!a || a.regionId == null) continue;
    if ((regionCounts.get(a.regionId) || 0) > 1) {
      throw new Error(
        `annotation-identity: ambiguous duplicate parent id '${a.regionId}'`,
      );
    }
  }
}

/**
 * Drop a stale bare `segments` display-shape when a canonical `location` already
 * owns the geometry. Leaving both risks a single stale `segments[]` disagreeing
 * with the location after an edit (the map/search then read the wrong geometry).
 */
export function stripStaleSegments(annotations) {
  if (!Array.isArray(annotations)) return [];
  let changed = false;
  const out = annotations.map((a) => {
    if (a && a.segments != null && a.location != null) {
      changed = true;
      const { segments, ...rest } = a; // eslint-disable-line no-unused-vars
      return rest;
    }
    return a;
  });
  return changed ? out : annotations;
}

/**
 * THE one canonical identity ingress gate for ALL levels (region / detail /
 * point). Every ingress path — file import, `.bodge` read, auto-annotate,
 * migration — runs its annotations through this so the model is uniform:
 *   1. legacy `parentId` adopted as the canonical `regionId`, then dropped;
 *   2. duplicate ids repaired collision-safely;
 *   3. an opaque, collision-safe id stamped on anything still id-less;
 *   4. a stale bare `segments` display-shape dropped in favour of `location`.
 */
export function ingestAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  let out = adoptLegacyParentId(annotations);
  assertUnambiguousParentLinks(out);
  out = repairDuplicateIds(out);
  out = ensureAnnotationIds(out);
  out = stripStaleSegments(out);
  out = detachDanglingLinks(out);
  return out;
}

/** The set of ids that currently belong to a region-level annotation. */
function regionIdSet(annotations) {
  const set = new Set();
  for (const a of annotations) {
    if (a && a.level === 'region' && a.id != null) set.add(a.id);
  }
  return set;
}

/**
 * Remove a region and every descendant that links to it (directly or
 * transitively) via `regionId`. Returns a new array; returns the input
 * reference unchanged when `id` is absent.
 */
export function cascadeDelete(annotations, id) {
  if (!Array.isArray(annotations) || id == null) return annotations || [];
  if (!annotations.some((a) => a && a.id === id)) return annotations;
  const doomed = new Set([id]);
  // Iterate to a fixpoint so grand-children (detail under detail is not a thing
  // today, but the transitive walk is cheap and future-proof) are collected.
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of annotations) {
      if (!a || doomed.has(a.id)) continue;
      if (a.regionId != null && doomed.has(a.regionId) && a.id != null && !doomed.has(a.id)) {
        doomed.add(a.id);
        grew = true;
      } else if (a.regionId != null && doomed.has(a.regionId)) {
        // id-less child of a doomed parent — mark by object identity below.
        grew = grew || false;
      }
    }
  }
  return annotations.filter(
    (a) => a && !doomed.has(a.id) && !(a.regionId != null && doomed.has(a.regionId)),
  );
}

/**
 * Drop children whose `regionId` points at a region that WAS present before an
 * operation but is gone now (e.g. a region fully removed by an indel delete).
 * Keeps the model orphan-free without touching links to still-present regions.
 */
export function dropChildrenOfRemoved(annotations, removedParentIds) {
  if (!Array.isArray(annotations)) return [];
  if (!removedParentIds || removedParentIds.size === 0) return annotations;
  const next = annotations.filter(
    (a) => !(a && a.regionId != null && removedParentIds.has(a.regionId)),
  );
  return next.length === annotations.length ? annotations : next;
}

/**
 * Repoint every child linked to `fromId` so it links to `toId` instead. Used by
 * split (children follow the surviving/renamed parent) and by a deliberate
 * reparent. No-op when nothing links to `fromId`.
 */
export function reparent(annotations, fromId, toId) {
  if (!Array.isArray(annotations) || fromId == null) return annotations || [];
  let changed = false;
  const out = annotations.map((a) => {
    if (a && a.regionId === fromId) {
      changed = true;
      if (toId != null) return { ...a, regionId: toId };
      const { regionId, ...rest } = a; // eslint-disable-line no-unused-vars
      return rest;
    }
    return a;
  });
  return changed ? out : annotations;
}

/**
 * Detach any `regionId` that points at a region no longer present. The
 * ambiguous link is removed (`regionId` deleted) rather than left dangling —
 * the split/merge contract: "снимает неоднозначную связь, но не оставляет
 * ссылку на отсутствующий region".
 */
export function detachDanglingLinks(annotations) {
  if (!Array.isArray(annotations)) return [];
  const regions = regionIdSet(annotations);
  let changed = false;
  const out = annotations.map((a) => {
    if (a && a.regionId != null && !regions.has(a.regionId)) {
      changed = true;
      const { regionId, ...rest } = a; // eslint-disable-line no-unused-vars
      return rest;
    }
    return a;
  });
  return changed ? out : annotations;
}

/**
 * Ingress normalization: adopt the legacy `parentId` field as the canonical
 * `regionId` link when no `regionId` is present, then strip `parentId` so the
 * model never carries two competing parent fields. `regionId` always wins.
 */
export function adoptLegacyParentId(annotations) {
  if (!Array.isArray(annotations)) return [];
  let changed = false;
  const out = annotations.map((a) => {
    if (!a || a.parentId == null) return a;
    changed = true;
    const { parentId, ...rest } = a;
    if (rest.regionId == null && parentId !== '') rest.regionId = parentId;
    return rest;
  });
  return changed ? out : annotations;
}
