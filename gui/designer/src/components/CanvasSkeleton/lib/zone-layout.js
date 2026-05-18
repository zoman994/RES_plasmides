/**
 * zone-layout — T4.5 K3 (DEC-T4.5-01/02/06/08/10). computeZoneLayout
 * returns `{ [nodeId]: {x,y} }` (TOP-LEFT, integer-rounded) for the
 * UNPINNED nodes of one zone, arranged in 3 horizontal lanes:
 *
 *   Sources      — zoneTop + 50          (even L→R spread, name-sorted)
 *   Intermediate — zoneTop + 150 + dagre (LR, depth grows →)
 *   Finals       — zoneBottom - 80       (even L→R spread, name-sorted)
 *
 * Pinned nodes keep their manual position (excluded from the result).
 * manual / sequence-mode / unknown zone → null (finalizer skips). The
 * middle lane reuses the proven `@dagrejs/dagre` wrapper
 * (lib/dag-layout.computeAutoLayout) rather than a second integration.
 *
 * Idempotency contract (DEC-T4.5-06): integer coords so the finalizer's
 * equality check is exact and never loops.
 */
import { computeAutoLayout } from '../../../lib/dag-layout';
import { BLOCK_LINEAR_W, BLOCK_LINEAR_H } from '../canvas/canvas-layout';
import { classifyZoneNodes } from './zone-layout-rules';

// Auto-zone frame margins. The zone SIZE is deterministic from the
// lane layout (a node footprint past the furthest laid node + a
// margin); x/y stay user-controlled. This is what stops the T4
// grow-only finalizer chasing the fixed-offset lanes and elongating
// the frame uncontrollably when the user drags it by the top
// (Игорь 17.05.2026).
const ZONE_FRAME_PAD = 48;
const ZONE_MIN_W = 360;
const ZONE_MIN_H = 260;

const LANE_SRC_DY = 50;
const LANE_MID_DY = 150;
// DEVIATION from DEC-T4.5-08 (finals = bottom-80): finals are pinned
// to a FIXED offset from the zone TOP, not from its (auto-growing)
// height. With bottom-anchoring the grow-only T4 bounds finalizer
// would push finalsY down every pass (laid finals grow the box → box
// grows → finalsY drops → re-laid lower …), so positions never settle
// and the K7 idempotency check (R2) could never hold → finalizer loop.
// Top-anchored lanes depend only on bounds.y (stable: sources sit at
// y+50, nothing goes above, so the grow-only union never moves y) →
// computeZoneLayout is a fixed point. Same 3-lane intent, loop-safe.
const LANE_FIN_DY = 380;

// Lane Y offsets from zone TOP (bounds.y), single source of truth —
// the divider UI reads these so labels/lines align with laid nodes.
export const ZONE_LANE_DY = {
  source: LANE_SRC_DY, intermediate: LANE_MID_DY, finals: LANE_FIN_DY,
};
const NODE_SPACING = 200;
const MID_NODE_W = 160;
const MID_NODE_H = 60;
// R1 — dagre is O(V+E); cap the middle lane, fall back to a simple
// row if a zone is pathologically dense (≥ this many mid nodes).
const MID_NODE_CAP = 200;

const isPinned = (n) => !!(n && n.ref && n.ref.pinned === true);
const round = (v) => Math.round(v);

/** Edges among the given id set: junctions + op in/out + op.inputPieces. */
function edgesWithin(idSet, state) {
  const out = [];
  for (const j of (state.junctions || [])) {
    if (j && idSet.has(j.fromContainerId) && idSet.has(j.toContainerId)) {
      out.push({ from: j.fromContainerId, to: j.toContainerId });
    }
  }
  for (const op of (state.operations || [])) {
    if (!op || !idSet.has(op.id)) continue;
    for (const cid of (op.inputs || [])) {
      if (idSet.has(cid)) out.push({ from: cid, to: op.id });
    }
    for (const pid of (op.inputPieces || [])) {
      if (idSet.has(pid)) out.push({ from: pid, to: op.id });
    }
    for (const cid of (op.outputs || [])) {
      if (idSet.has(cid)) out.push({ from: op.id, to: cid });
    }
  }
  return out;
}

function spreadLane(nodes, leftX, laneY, acc) {
  const sorted = nodes.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  sorted.forEach((n, i) => {
    acc[n.id] = { x: round(leftX + i * NODE_SPACING), y: round(laneY) };
  });
}

export function computeZoneLayout(state, zoneId, opts = {}) {
  const zone = ((state && state.zones) || []).find((z) => z.id === zoneId);
  if (!zone) return null;
  // `force` (RECOMPUTE_ZONE_LAYOUT / «Перестроить») bypasses the manual
  // opt-out for a one-shot tidy; sequence-mode is always skipped
  // (nodes hidden, DEC-T4.5-10).
  if (!opts.force && zone.laneLayout === 'manual') return null;
  if (zone.viewMode === 'sequence') return null;

  const { sources, intermediate, finals } = classifyZoneNodes(state, zoneId);
  const total = sources.length + intermediate.length + finals.length;
  if (total === 0) return {};

  const b = zone.bounds || { x: 0, y: 0, width: 1200, height: 600 };
  const leftX = (b.x || 0) + 20;
  const srcY = (b.y || 0) + LANE_SRC_DY;
  const midY = (b.y || 0) + LANE_MID_DY;
  const finY = (b.y || 0) + LANE_FIN_DY;

  const acc = {};

  spreadLane(sources.filter((n) => !isPinned(n)), leftX, srcY, acc);
  spreadLane(finals.filter((n) => !isPinned(n)), leftX, finY, acc);

  const midUnpinned = intermediate.filter((n) => !isPinned(n));
  if (midUnpinned.length > 0) {
    if (midUnpinned.length > MID_NODE_CAP) {
      // R1 fallback — pathological density: plain row, no dagre.
      spreadLane(midUnpinned, leftX, midY, acc);
    } else {
      const idSet = new Set(midUnpinned.map((n) => n.id));
      const laid = computeAutoLayout(
        midUnpinned.map((n) => ({ id: n.id })),
        edgesWithin(idSet, state),
        'LR',
        {
          nodeWidth: MID_NODE_W, nodeHeight: MID_NODE_H, ranksep: 80, nodesep: 30,
        },
      );
      const xs = Object.values(laid).map((p) => p.x);
      const ys = Object.values(laid).map((p) => p.y);
      const minX = xs.length ? Math.min(...xs) : 0;
      const minY = ys.length ? Math.min(...ys) : 0;
      for (const n of midUnpinned) {
        const p = laid[n.id] || { x: 0, y: 0 };
        acc[n.id] = {
          x: round(leftX + (p.x - minX)),
          y: round(midY + (p.y - minY)),
        };
      }
    }
  }

  return acc;
}

/**
 * applyZoneLayout — write one zone's computed layout into state
 * (positions map for containers/pieces, op.position for operations).
 * Idempotent: returns the SAME state ref when nothing moved, so the
 * K7 finalizer never loops (DEC-T4.5-06 / R2).
 */
export function applyZoneLayout(state, zoneId, opts = {}) {
  const layout = computeZoneLayout(state, zoneId, opts);
  if (!layout) return state;
  const ids = Object.keys(layout);
  if (ids.length === 0) return state;
  const ops = state.operations || [];
  const opIndex = new Map(ops.map((o, i) => [o.id, i]));
  let positions = state.positions || {};
  let nextOps = ops;
  let posChanged = false;
  let opsChanged = false;
  for (const id of ids) {
    const p = layout[id];
    if (opIndex.has(id)) {
      const i = opIndex.get(id);
      const cur = nextOps[i].position || {};
      if (cur.x !== p.x || cur.y !== p.y) {
        if (!opsChanged) { nextOps = ops.slice(); opsChanged = true; }
        nextOps[i] = { ...nextOps[i], position: { x: p.x, y: p.y } };
      }
    } else {
      const cur = positions[id];
      if (!cur || cur.x !== p.x || cur.y !== p.y) {
        if (!posChanged) { positions = { ...(state.positions || {}) }; posChanged = true; }
        positions[id] = { x: p.x, y: p.y };
      }
    }
  }
  // Deterministic auto-zone SIZE from the laid extent (x/y stay
  // user-controlled — only DRAG_ZONE/resize move the origin; the
  // finalizer NEVER shifts x/y). width/height are constant for a given
  // member set regardless of where the zone sits, so it's a fixed
  // point: dragging just translates the frame, it never elongates.
  const zone = (state.zones || []).find((z) => z.id === zoneId);
  let nextZones = state.zones;
  let zonesChanged = false;
  // Respect autoResize:false — the user pinned the frame size; lay the
  // nodes but never touch the bounds.
  if (zone && zone.bounds && zone.autoResize !== false) {
    const bx = zone.bounds.x || 0;
    const by = zone.bounds.y || 0;
    let maxX = bx;
    let maxY = by;
    for (const id of ids) {
      const p = layout[id];
      if (p.x + BLOCK_LINEAR_W > maxX) maxX = p.x + BLOCK_LINEAR_W;
      if (p.y + BLOCK_LINEAR_H > maxY) maxY = p.y + BLOCK_LINEAR_H;
    }
    const width = Math.max(ZONE_MIN_W, Math.round(maxX - bx + ZONE_FRAME_PAD));
    const height = Math.max(ZONE_MIN_H, Math.round(maxY - by + ZONE_FRAME_PAD));
    if (zone.bounds.width !== width || zone.bounds.height !== height) {
      nextZones = (state.zones || []).map((z) => (
        z.id === zoneId
          ? { ...z, bounds: { ...z.bounds, width, height }, updatedAt: Date.now() }
          : z
      ));
      zonesChanged = true;
    }
  }
  if (!posChanged && !opsChanged && !zonesChanged) return state;
  const out = { ...state };
  if (posChanged) out.positions = positions;
  if (opsChanged) out.operations = nextOps;
  if (zonesChanged) out.zones = nextZones;
  return out;
}

/**
 * applyZoneLayouts — K7 finalizer entry: lay out every auto zone.
 * Idempotent end-to-end (each applyZoneLayout is); returns the same
 * state ref when the whole canvas is already arranged.
 */
export function applyZoneLayouts(state) {
  if (!state || !Array.isArray(state.zones) || state.zones.length === 0) return state;
  let s = state;
  for (const zone of state.zones) {
    s = applyZoneLayout(s, zone.id);
  }
  return s;
}
