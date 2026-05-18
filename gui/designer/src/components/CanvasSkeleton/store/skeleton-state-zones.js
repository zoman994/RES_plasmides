/**
 * skeleton-state-zones — sub-reducer for state.zones (T3,
 * DEC-CANVAS-4T-07). Miro-style frame grouping nodes by node.zoneId.
 * Pure data layer — no visual (T4). Follows the piece/assembly
 * sub-reducer pattern: buildInitialX + xReducer + isXAction Set guard;
 * hard errors → state unchanged + localized error toast (router stamps).
 *
 * Cross-slice: REMOVE_ZONE / MOVE_NODE_TO_ZONE / WRAP / MERGE rewrite
 * node.zoneId on containers / pieces / operations (zonesReducer runs
 * last in the chain, parallels piecesReducer's REMOVE_PIECE→ops).
 */
import { createZone, nodeListInZone, computeZoneBoundingBox } from '../lib/zone-model';
import { applyZoneLayout } from '../lib/zone-layout';
import { validateZoneCreate, validateZoneUpdate } from '../lib/zone-invariants';
import { mergeBoundingBoxes, computeBoundingBox } from '../lib/zone-bounds';
import { STRINGS } from '../../../lib/strings';

const Z = STRINGS.canvasSkeleton.zones;
const DEFAULT_WRAP_BOUNDS = { x: 40, y: 40, width: 600, height: 400 };

export function buildInitialZonesState() {
  // T7 DEC-T7-10 — focusedZoneId scopes the G/S hotkeys. Lives here
  // (no dedicated ui slice in CanvasSkeleton); null = no focus.
  return { zones: [], focusedZoneId: null };
}

const ZONE_ACTIONS = new Set([
  'CREATE_ZONE', 'REMOVE_ZONE', 'UPDATE_ZONE_NAME', 'UPDATE_ZONE_BOUNDS',
  'UPDATE_ZONE_NOTES', 'SET_ZONE_COLLAPSED', 'SET_ZONE_VIEW_MODE',
  'MOVE_NODE_TO_ZONE', 'WRAP_LOOSE_NODES_IN_ZONE', 'MERGE_ZONES', 'SPLIT_ZONE',
  'DRAG_ZONE', 'RECOMPUTE_ZONE_BOUNDS', 'SET_FOCUSED_ZONE',
  'HIGHLIGHT_ZONE', // T8 DEC-T8-09
  'SET_ZONE_LANE_LAYOUT', 'RECOMPUTE_ZONE_LAYOUT', // T4.5 DEC-T4.5-05
  'SET_NODE_PINNED', // T4.5 DEC-T4.5-04
]);

export function isZoneAction(type) {
  return ZONE_ACTIONS.has(type);
}

function localizeError(code) {
  switch (code) {
    case 'TOO_MANY': return Z.errorTooMany.replace('{limit}', '50');
    case 'NAME_TOO_LONG': return Z.errorNameTooLong;
    case 'NOTES_TOO_LONG': return Z.errorNotesTooLong;
    case 'TOO_SMALL': return Z.errorTooSmall;
    default: return Z.errorTooSmall;
  }
}
const errToast = (state, code) => ({ ...state, toast: { kind: 'error', message: localizeError(code) } });
const infoToast = (state, message) => ({ ...state, toast: { kind: 'info', message } });
const warnToast = (state, message) => ({ ...state, toast: { kind: 'warning', message } });

/** Rewrite zoneId on nodes matching idSet (pieces also bump updatedAt). */
function reassignNodes(state, predicate, newZoneId) {
  const remap = (n) => (predicate(n) ? { ...n, zoneId: newZoneId } : n);
  const remapPiece = (p) => (predicate(p) ? { ...p, zoneId: newZoneId, updatedAt: Date.now() } : p);
  return {
    containers: (state.containers || []).map(remap),
    pieces: (state.pieces || []).map(remapPiece),
    operations: (state.operations || []).map(remap),
  };
}

const SLICE_BY_TYPE = { container: 'containers', piece: 'pieces', operation: 'operations' };

function patchZone(state, zoneId, patch) {
  const zones = state.zones || [];
  const idx = zones.findIndex((z) => z.id === zoneId);
  if (idx < 0) return state;
  const next = zones.slice();
  next[idx] = { ...zones[idx], ...patch, updatedAt: Date.now() };
  return { ...state, zones: next };
}

export function zonesReducer(state, action) {
  if (!isZoneAction(action.type)) return state;
  const zones = state.zones || [];

  switch (action.type) {
    case 'CREATE_ZONE': {
      const v = validateZoneCreate(state, action.zone);
      if (!v.ok) return errToast(state, v.code);
      return { ...state, zones: [...zones, createZone(action.zone)] };
    }

    case 'SET_FOCUSED_ZONE':
      if (state.focusedZoneId === action.zoneId) return state;
      return { ...state, focusedZoneId: action.zoneId ?? null };

    // T8 DEC-T8-09 — transient post-navigation highlight. durationMs>0
    // sets highlightedUntil = now+durationMs; ≤0 clears it (cleanup
    // dispatch). ZoneFrame applies a CSS accent while now < that ts.
    case 'HIGHLIGHT_ZONE': {
      const zone = zones.find((z) => z.id === action.zoneId);
      if (!zone) return state;
      const ms = Number(action.durationMs) || 0;
      const until = ms > 0 ? Date.now() + ms : null;
      return patchZone(state, action.zoneId, { highlightedUntil: until });
    }

    case 'REMOVE_ZONE': {
      if (!zones.some((z) => z.id === action.zoneId)) return state;
      const cleared = reassignNodes(state, (n) => n.zoneId === action.zoneId, null);
      return {
        ...state,
        ...cleared,
        zones: zones.filter((z) => z.id !== action.zoneId),
        // R-T7-7 — drop stale focus on the removed zone.
        focusedZoneId: state.focusedZoneId === action.zoneId ? null : state.focusedZoneId,
        toast: { kind: 'info', message: Z.removeWarning },
      };
    }

    case 'UPDATE_ZONE_NAME':
    case 'UPDATE_ZONE_BOUNDS':
    case 'UPDATE_ZONE_NOTES':
    case 'SET_ZONE_COLLAPSED':
    case 'SET_ZONE_VIEW_MODE': {
      const zone = zones.find((z) => z.id === action.zoneId);
      if (!zone) return state;
      const patch = action.type === 'UPDATE_ZONE_NAME' ? { name: action.name }
        : action.type === 'UPDATE_ZONE_BOUNDS' ? { bounds: action.bounds }
          : action.type === 'UPDATE_ZONE_NOTES' ? { notes: action.notes }
            : action.type === 'SET_ZONE_COLLAPSED' ? { collapsed: !!action.collapsed }
              : { viewMode: action.viewMode };
      const v = validateZoneUpdate(state, zone, patch);
      if (!v.ok) return errToast(state, v.code);
      return patchZone(state, action.zoneId, patch);
    }

    case 'MOVE_NODE_TO_ZONE': {
      const sliceKey = SLICE_BY_TYPE[action.nodeType];
      if (!sliceKey) return state;
      if (action.targetZoneId != null && !zones.some((z) => z.id === action.targetZoneId)) {
        return state;
      }
      const arr = state[sliceKey] || [];
      const idx = arr.findIndex((n) => n.id === action.nodeId);
      if (idx < 0) return state;
      const next = arr.slice();
      const node = arr[idx];
      next[idx] = action.nodeType === 'piece'
        ? { ...node, zoneId: action.targetZoneId, updatedAt: Date.now() }
        : { ...node, zoneId: action.targetZoneId };
      const zone = zones.find((z) => z.id === action.targetZoneId);
      const msg = action.targetZoneId == null
        ? Z.moveToLoose.replace('{node}', node.name || action.nodeId)
        : Z.moveSuccess.replace('{node}', node.name || action.nodeId).replace('{zone}', zone ? zone.name : '');
      return { ...state, [sliceKey]: next, toast: { kind: 'info', message: msg } };
    }

    case 'WRAP_LOOSE_NODES_IN_ZONE': {
      const isLoose = (n) => n.zoneId == null;
      const loose = [
        ...(state.containers || []).filter(isLoose),
        ...(state.pieces || []).filter(isLoose),
        ...(state.operations || []).filter(isLoose),
      ];
      if (loose.length === 0) return infoToast(state, Z.wrapLooseEmpty);
      const positions = state.positions || {};
      const points = loose
        .map((n) => n.position || positions[n.id])
        .filter(Boolean)
        .map((p) => ({ x: p.x, y: p.y }));
      const bounds = computeBoundingBox(points) || DEFAULT_WRAP_BOUNDS;
      const zone = createZone({ name: action.zoneName || 'Без названия', bounds });
      const reassigned = reassignNodes(state, isLoose, zone.id);
      return {
        ...state,
        ...reassigned,
        zones: [...zones, zone],
        toast: { kind: 'info', message: Z.wrapLooseSuccess.replace('{name}', zone.name) },
      };
    }

    case 'MERGE_ZONES': {
      const ids = Array.isArray(action.zoneIds) ? action.zoneIds : [];
      const merged = ids.map((id) => zones.find((z) => z.id === id)).filter(Boolean);
      if (merged.length < 2) return state;
      const bounds = mergeBoundingBoxes(merged.map((z) => z.bounds)) || DEFAULT_WRAP_BOUNDS;
      const notes = merged.map((z) => z.notes).filter(Boolean).join(' / ') || null;
      const zone = createZone({ name: action.mergedName || 'Без названия', bounds, notes });
      const idSet = new Set(ids);
      const reassigned = reassignNodes(state, (n) => idSet.has(n.zoneId), zone.id);
      return {
        ...state,
        ...reassigned,
        zones: [...zones.filter((z) => !idSet.has(z.id)), zone],
        toast: { kind: 'info', message: Z.mergeSuccess.replace('{name}', zone.name) },
      };
    }

    case 'DRAG_ZONE': {
      // DEC-T4-07 — atomic: zone.bounds + every member node position
      // shift by the same delta in one reducer call.
      const zone = zones.find((z) => z.id === action.zoneId);
      if (!zone) return state;
      const dx = (action.delta && action.delta.dx) || 0;
      const dy = (action.delta && action.delta.dy) || 0;
      if (dx === 0 && dy === 0) return state;
      const { containers, pieces, operations } = nodeListInZone(state, action.zoneId);
      const movedPosIds = new Set([...containers, ...pieces].map((n) => n.id));
      const opIds = new Set(operations.map((o) => o.id));
      const positions = { ...(state.positions || {}) };
      for (const id of movedPosIds) {
        const p = positions[id];
        if (p) positions[id] = { x: p.x + dx, y: p.y + dy };
      }
      const nextOps = opIds.size > 0
        ? (state.operations || []).map((op) => (
          opIds.has(op.id) && op.position
            ? { ...op, position: { x: op.position.x + dx, y: op.position.y + dy } }
            : op
        ))
        : state.operations;
      const nextZones = zones.map((z) => (
        z.id === action.zoneId
          ? { ...z, bounds: { ...z.bounds, x: z.bounds.x + dx, y: z.bounds.y + dy }, updatedAt: Date.now() }
          : z
      ));
      return { ...state, zones: nextZones, positions, operations: nextOps };
    }

    case 'RECOMPUTE_ZONE_BOUNDS': {
      const zone = zones.find((z) => z.id === action.zoneId);
      if (!zone || zone.autoResize === false) return state;
      const nb = computeZoneBoundingBox(state, action.zoneId, 40);
      if (!nb) return state;
      const b = zone.bounds;
      if (nb.x === b.x && nb.y === b.y && nb.width === b.width && nb.height === b.height) {
        return state;
      }
      return patchZone(state, action.zoneId, { bounds: nb });
    }

    // T4.5 DEC-T4.5-05 — per-zone auto-layout opt-out.
    case 'SET_ZONE_LANE_LAYOUT': {
      const zone = zones.find((z) => z.id === action.zoneId);
      if (!zone) return state;
      const layout = action.layout === 'manual' ? 'manual' : 'auto';
      if (zone.laneLayout === layout) return state;
      return patchZone(state, action.zoneId, { laneLayout: layout });
    }

    // T4.5 — force one-shot tidy (context-menu «Перестроить»), works
    // even on a manual zone via the force flag.
    case 'RECOMPUTE_ZONE_LAYOUT':
      return applyZoneLayout(state, action.zoneId, { force: true });

    // T4.5 DEC-T4.5-04 — pin/unpin a node (drag-override). pinned=true
    // keeps the node's current position; the K7 finalizer simply skips
    // it. pinned=false → next finalizer pass re-lays it.
    case 'SET_NODE_PINNED': {
      const sliceKey = SLICE_BY_TYPE[action.nodeType];
      if (!sliceKey) return state;
      const arr = state[sliceKey] || [];
      const idx = arr.findIndex((n) => n.id === action.nodeId);
      if (idx < 0) return state;
      const want = !!action.pinned;
      if (arr[idx].pinned === want) return state;
      const next = arr.slice();
      next[idx] = action.nodeType === 'piece'
        ? { ...arr[idx], pinned: want, updatedAt: Date.now() }
        : { ...arr[idx], pinned: want };
      return { ...state, [sliceKey]: next };
    }

    case 'SPLIT_ZONE':
      return warnToast(state, Z.splitNotImplemented);

    default:
      return state;
  }
}
