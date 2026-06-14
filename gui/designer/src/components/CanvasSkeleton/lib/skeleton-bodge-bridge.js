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

/**
 * Skeleton snapshot + projectSlice meta → canonical .bodge v2 `state` for
 * writeBodgeV2. The assembly draft primers ride the lossless extension (the v2
 * primer pool model drops their tail/binding/draftId fields), NOT state.primers.
 */
export function skeletonToCanonical(snap, projectMeta = {}) {
  const s = snap || {};
  return {
    projectMeta,
    containers: Array.isArray(s.containers) ? s.containers : [],
    zones: Array.isArray(s.zones) ? s.zones : [],
    pieces: Array.isArray(s.pieces) ? s.pieces : [],
    operations: Array.isArray(s.operations) ? s.operations : [],
    junctions: Array.isArray(s.junctions) ? s.junctions : [],
    positions: nestPositionsByZone(s),
    primers: [],
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
    containers: Array.isArray(state.containers) ? state.containers : [],
    zones: Array.isArray(state.zones) ? state.zones : [],
    pieces: Array.isArray(state.pieces) ? state.pieces : [],
    operations: Array.isArray(state.operations) ? state.operations : [],
    junctions: Array.isArray(state.junctions) ? state.junctions : [],
    positions: flatPositions,
    assemblyDraftPrimers: {},
  };
}
