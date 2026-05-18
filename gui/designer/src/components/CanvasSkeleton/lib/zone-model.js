/**
 * zone-model — pure helpers for the Zone entity (T3, DEC-CANVAS-4T-07).
 * Miro-style frame: a named rect grouping containers / pieces /
 * operations by node.zoneId. No visual rendering (T4). Parallels
 * piece-model / assembly-model — every function pure.
 */
import { v7 as uuidv7 } from 'uuid';
import { BLOCK_LINEAR_W, BLOCK_LINEAR_H } from '../canvas/canvas-layout';

/**
 * @typedef {Object} Zone
 * @property {string} id  'zn-<uuidv7>'
 * @property {string} name
 * @property {{x:number,y:number,width:number,height:number}} bounds
 * @property {boolean} collapsed   T4 visual; T3 shape only
 * @property {'graph'|'sequence'} viewMode  T7 active
 * @property {boolean} autoResize  DEC-T3-06
 * @property {string|null} notes
 * @property {number} createdAt
 * @property {number} updatedAt
 */

export function createZone({ name, bounds, notes = null } = {}) {
  const now = Date.now();
  return {
    id: `zn-${uuidv7()}`,
    name: name || 'Без названия',
    bounds: { ...(bounds || {}) },
    collapsed: false,
    viewMode: 'graph',
    autoResize: true,
    // T4.5 DEC-T4.5-05 — 3-lane auto-layout opt-out ('auto' | 'manual').
    laneLayout: 'auto',
    notes,
    createdAt: now,
    updatedAt: now,
  };
}

/** Nodes whose zoneId === zoneId, partitioned by kind. */
export function nodeListInZone(state, zoneId) {
  return {
    containers: ((state && state.containers) || []).filter((c) => c.zoneId === zoneId),
    pieces: ((state && state.pieces) || []).filter((p) => p.zoneId === zoneId),
    operations: ((state && state.operations) || []).filter((op) => op.zoneId === zoneId),
  };
}

/**
 * Padded bounding box around member node positions (auto-resize source).
 * Far edge extends by a block footprint so the last node fits. → rect|null.
 */
export function computeZoneBoundingBox(state, zoneId, padding = 40) {
  const { containers, pieces, operations } = nodeListInZone(state, zoneId);
  const positions = (state && state.positions) || {};
  const points = [];
  for (const c of containers) {
    const pos = positions[c.id];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  for (const p of pieces) {
    const pos = positions[p.id];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  for (const op of operations) {
    const pos = op.position || positions[op.id];
    if (pos) points.push({ x: pos.x, y: pos.y });
  }
  if (points.length === 0) return null;
  const minX = Math.min(...points.map((p) => p.x)) - padding;
  const minY = Math.min(...points.map((p) => p.y)) - padding;
  const maxX = Math.max(...points.map((p) => p.x)) + BLOCK_LINEAR_W + padding;
  const maxY = Math.max(...points.map((p) => p.y)) + BLOCK_LINEAR_H + padding;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function isPointInZone(point, zone) {
  const b = zone && zone.bounds;
  if (!b || !point) return false;
  return point.x >= b.x
    && point.x <= b.x + b.width
    && point.y >= b.y
    && point.y <= b.y + b.height;
}
