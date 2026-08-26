/**
 * skeleton-bodge-bridge — audit A1/A2 (C1). Bridges the CanvasSkeleton snapshot
 * (the per-project IndexedDB state: containers / zones / pieces / operations /
 * junctions / positions / assemblyDraftPrimers) ↔ the canonical .bodge v2 `state`
 * that writeBodgeV2 / readBodge speak.
 *
 * Before this, Ctrl+S serialized only the projectSlice meta (v1 — no .containers,
 * so writeBodge never took the v2 branch) and Open restored only that meta, so
 * the WHOLE assembly was silently dropped despite a «Saved» toast.
 *
 * The structured v2 (containers→GenBank, zones→assembly JSON carrying topology /
 * assemblyMethod / junctions / per-junction enzyme) is written for interop +
 * inspection. For a LOSSLESS restore of our own files — including derived AND
 * manual primers, layout, every transient-stripped field — the full snapshot is
 * ALSO embedded under extensions.bodgegene/skeleton.json (bit-perfect, the v2
 * format's vendor-extension slot). canonicalToSkeleton prefers that; for an
 * externally-authored file it reconstructs from the structured slices (primers
 * then re-derive on first edit via the finalizer).
 */
import { buildInitialState } from '../store/skeleton-state';
import { PRIMER_SCOPE_GLOBAL, primerScopeOf } from '../../../lib/primer-identity';

const VENDOR = 'bodgegene';
const SNAP_REL = 'skeleton.json';

function encodeUtf8(str) { return new TextEncoder().encode(str); }
function decodeUtf8(bytes) {
  if (bytes == null) return null;
  if (typeof bytes === 'string') return bytes;
  return new TextDecoder().decode(bytes);
}

/**
 * Flat skeleton positions {nodeId:{x,y}} → nested by each node's zoneId, the
 * shape writeBodgeV2 reads for the per-assembly JSON. Cosmetic (layout); the
 * lossless extension snapshot carries the authoritative flat map.
 */
function nestPositionsByZone(snap) {
  const flat = snap.positions || {};
  const zoneOf = new Map();
  for (const arr of [snap.pieces, snap.operations, snap.containers]) {
    for (const n of (arr || [])) if (n && n.id && n.zoneId) zoneOf.set(n.id, n.zoneId);
  }
  const out = {};
  for (const [id, pos] of Object.entries(flat)) {
    const z = zoneOf.get(id);
    if (!z) continue;
    if (!out[z]) out[z] = {};
    out[z][id] = pos;
  }
  return out;
}

function containerToCanonical(container) {
  if (!container || typeof container !== 'object') return container;
  const topology = container.topology;
  if (!topology || typeof topology !== 'object'
      || typeof topology.circular !== 'boolean') return container;
  return {
    ...container,
    topology: topology.circular ? 'circular' : 'linear',
  };
}

function containerToSkeleton(container) {
  if (!container || typeof container !== 'object') return container;
  if (container.topology !== 'circular' && container.topology !== 'linear') return container;
  return {
    ...container,
    topology: { circular: container.topology === 'circular' },
  };
}

/**
 * The primer records that belong to one project (ANN-0L C0).
 *
 * Ctrl+S must persist exactly the project's own pool: a library-scoped or
 * foreign-project record is not this file's business, and omitting the
 * project's own records is how a saved project reopened empty.
 *
 * @param {Record<string, object>} primersById  primerSlice map
 * @param {string|null} projectId
 * @returns {object[]} records in stable `addedAt` order
 */
export function primersForProject(primersById, projectId) {
  const target = projectId ?? null;
  return Object.values(primersById || {})
    // PRIMER-LIVE-1 — the personal freezer never leaves this machine. Scope is
    // checked explicitly rather than trusted to follow from `projectId`: the
    // claim being made is "a tube of this exists", and a file that carried it
    // to another lab would be asserting something it cannot know.
    .filter((p) => p && primerScopeOf(p) !== PRIMER_SCOPE_GLOBAL)
    .filter((p) => p && (p.projectId ?? null) === target)
    .sort((a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
}

/**
 * The primer records carried by a canonical `.bodge` v2 state (ANN-0L C0).
 *
 * Kept as its own named seam so Open has one obvious place to read them from;
 * previously `state.primers` was parsed by the reader and then simply dropped
 * on the floor, which is why reopening a project lost its primers.
 */
export function primersFromCanonical(state) {
  const rows = state && Array.isArray(state.primers) ? state.primers : [];
  return rows.filter((p) => p && p.id);
}

/**
 * Skeleton snapshot + projectSlice meta → canonical .bodge v2 `state` for
 * writeBodgeV2. The assembly draft primers ride the lossless extension (the v2
 * primer pool model drops their tail/binding/draftId fields), NOT state.primers.
 *
 * ANN-0L C0 — `primers` is the project's canonical pool. It used to be
 * hardcoded to `[]`, so every Ctrl+S wrote a container with no primers in it
 * and the biologist lost them on the next Open.
 *
 * @param {object} snap                skeleton snapshot
 * @param {object} projectMeta
 * @param {object[]} [primers]         project-scoped canonical primer records
 */
export function skeletonToCanonical(snap, projectMeta = {}, primers = []) {
  const s = snap || {};
  return {
    projectMeta,
    containers: Array.isArray(s.containers) ? s.containers.map(containerToCanonical) : [],
    zones: Array.isArray(s.zones) ? s.zones : [],
    pieces: Array.isArray(s.pieces) ? s.pieces : [],
    operations: Array.isArray(s.operations) ? s.operations : [],
    junctions: Array.isArray(s.junctions) ? s.junctions : [],
    positions: nestPositionsByZone(s),
    primers: Array.isArray(primers) ? primers : [],
    extensions: {
      [VENDOR]: { [SNAP_REL]: encodeUtf8(JSON.stringify(s)) },
    },
  };
}

/**
 * Canonical .bodge v2 `state` (from readBodge) → a skeleton snapshot for
 * saveSnapshot(snapshot, projectId). Prefers the lossless embedded snapshot
 * (our own files); else reconstructs the structured slices onto buildInitialState
 * defaults. Returns null when there is nothing assembly-like to restore.
 */
export function canonicalToSkeleton(state) {
  if (!state || typeof state !== 'object') return null;
  const ext = state.extensions
    && state.extensions[VENDOR]
    && state.extensions[VENDOR][SNAP_REL];
  if (ext != null) {
    try {
      const parsed = JSON.parse(decodeUtf8(ext));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* corrupt extension → fall through to structured reconstruction */ }
  }
  const hasStructured = (Array.isArray(state.zones) && state.zones.length)
    || (Array.isArray(state.pieces) && state.pieces.length)
    || (Array.isArray(state.containers) && state.containers.length);
  if (!hasStructured) return null;

  const base = buildInitialState();
  // readBodgeV2 nests positions by zone; the skeleton store wants a flat map.
  const flatPositions = {};
  const np = state.positions || {};
  for (const zoneId of Object.keys(np)) {
    for (const [id, pos] of Object.entries(np[zoneId] || {})) flatPositions[id] = pos;
  }
  return {
    ...base,
    containers: Array.isArray(state.containers)
      ? state.containers.map(containerToSkeleton)
      : [],
    zones: Array.isArray(state.zones) ? state.zones : [],
    pieces: Array.isArray(state.pieces) ? state.pieces : [],
    operations: Array.isArray(state.operations) ? state.operations : [],
    junctions: Array.isArray(state.junctions) ? state.junctions : [],
    positions: flatPositions,
    assemblyDraftPrimers: {},
  };
}
