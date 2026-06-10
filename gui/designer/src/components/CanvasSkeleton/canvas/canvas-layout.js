/**
 * canvas-layout — helpers for CanvasLayoutView + CanvasGraphView.
 *
 * Layout view: positions live in skeleton-state, updated on drag stop.
 * Graph view: dagre LR auto-layout, recomputed on toggle.
 *
 * 12.05.2026 — Игорь: «не квадратные — прямоугольные.
 * стандартизированные». Все блоки 240×60 (золотое сечение
 * width:height = 4:1, как v0.5 PartBlock compact mode pill).
 * Размер фиксирован — не log(bp) как v0.5, а единый константный.
 *
 * Переиспользование v0.5: ContainerBlock рендерит через те же
 * `getFragColor` / `FEATURE_COLORS` / `SBOLIcon` примитивы что
 * v0.5 PartBlock; junction layer использует `TYPE_STYLES` цветовой
 * палитру JunctionBlock'а (overlap blue / GG green / RE orange /
 * KLD purple / ligation red / blunt grey).
 */
import { computeAutoLayout } from '../../../lib/dag-layout';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';

// R10 (14.05.2026): bumped height 72→110 to fit MiniPlasmidMap visual
// внутри block. Width unchanged для backward-compat drag math.
// V68 (15.05.2026): 110→150 — биолог «блок слишком вытянут, чуть более
// квадратным». Taller block also gives the name its own divider-fenced
// band so V66 leader-labels can never bleed into it (ContainerBlock).
export const BLOCK_LINEAR_W = 240;
export const BLOCK_LINEAR_H = 150;
// Legacy alias kept for any older import that still expects it.
export const BLOCK_CIRCULAR_SIZE = BLOCK_LINEAR_W;
export const OPERATION_NODE_W = 120;
export const OPERATION_NODE_H = 60;
// AssemblyDraftBlock renders 240-wide; its height is content-driven, so
// collision uses a representative bbox height (SPEC_CANVAS_NODE_COLLISION).
export const ASSEMBLY_DRAFT_W = 240;
export const ASSEMBLY_DRAFT_H = 120;

// ── Collision-resolve (SPEC_CANVAS_NODE_COLLISION) ──────────────────
//
// Loose canvas nodes shouldn't pile on each other. View-side: each
// placement point computes a desired position, then runs it through
// `resolveNodeOverlap` against the bboxes of the other loose nodes
// (`gatherObstacleRects`). In-zone nodes are laid out by the zone
// (lane finalizer), so they're neither resolved nor counted as
// obstacles. Pure + React-free → unit-tested in isolation.

/**
 * nodeRect(kind, position) → {x, y, w, h} — bbox by node kind.
 */
export function nodeRect(kind, position) {
  const x = (position && position.x) || 0;
  const y = (position && position.y) || 0;
  if (kind === 'operation') return { x, y, w: OPERATION_NODE_W, h: OPERATION_NODE_H };
  if (kind === 'assembly') return { x, y, w: ASSEMBLY_DRAFT_W, h: ASSEMBLY_DRAFT_H };
  return { x, y, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H };
}

// AABB overlap with a `gap` of breathing room inflated around `a`.
function rectsOverlap(a, b, gap = 0) {
  return !(
    a.x + a.w + gap <= b.x
    || b.x + b.w <= a.x - gap
    || a.y + a.h + gap <= b.y
    || b.y + b.h <= a.y - gap
  );
}

/**
 * gatherObstacleRects(state, excludeId) → [{x,y,w,h}] — bboxes of the
 * loose obstacle nodes: filled containers (placeholders excluded),
 * operations, assembly-draft blocks with a position. Excludes the
 * moving node (`excludeId`) and any in-zone node (`zoneId` set) — zones
 * arrange their own members, and zone FRAMES are not obstacles.
 */
export function gatherObstacleRects(state, excludeId) {
  const s = state || {};
  const positions = s.positions || {};
  const out = [];
  for (const c of (s.containers || [])) {
    if (!c || c.id === excludeId) continue;
    if (isPlaceholderContainer(c)) continue;
    if (c.zoneId) continue;
    const p = positions[c.id];
    if (!p) continue;
    out.push(nodeRect('container', p));
  }
  for (const op of (s.operations || [])) {
    if (!op || op.id === excludeId) continue;
    if (op.zoneId) continue;
    const p = op.position;
    if (!p) continue;
    out.push(nodeRect('operation', p));
  }
  for (const d of (s.assemblyDrafts || [])) {
    if (!d || d.id === excludeId) continue;
    const p = d.position;
    if (!p) continue;
    out.push(nodeRect('assembly', p));
  }
  return out;
}

// Fixed direction order → deterministic resolution for tests.
const RING_DIRS = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

/**
 * resolveNodeOverlap(desired, size, obstacles, opts) → {x, y}.
 *
 * If `desired` (inflated by `gap`) clears every obstacle, return it
 * unchanged. Otherwise expand a ring outward in `step` increments up to
 * `maxRadius`, testing the 8 directions in a fixed order; first clear
 * candidate (clamped ≥ 0) wins. Nothing clear within `maxRadius` →
 * return `desired` unchanged (graceful, never hangs).
 *
 * opts: { gap=16, step=24, maxRadius=1200 }.
 */
export function resolveNodeOverlap(desired, size, obstacles, opts = {}) {
  const gap = opts.gap != null ? opts.gap : 16;
  const step = opts.step != null ? opts.step : 24;
  const maxRadius = opts.maxRadius != null ? opts.maxRadius : 1200;
  const list = Array.isArray(obstacles) ? obstacles : [];
  const dx0 = (desired && desired.x) || 0;
  const dy0 = (desired && desired.y) || 0;
  const w = (size && size.w) || 0;
  const h = (size && size.h) || 0;
  const free = (x, y) => {
    const cand = { x, y, w, h };
    for (const o of list) if (rectsOverlap(cand, o, gap)) return false;
    return true;
  };
  if (free(dx0, dy0)) return { x: dx0, y: dy0 };
  for (let r = step; r <= maxRadius; r += step) {
    for (const [ux, uy] of RING_DIRS) {
      const x = Math.max(0, dx0 + ux * r);
      const y = Math.max(0, dy0 + uy * r);
      if (free(x, y)) return { x, y };
    }
  }
  return { x: dx0, y: dy0 };
}

export function getBlockSize(_container) {
  return { width: BLOCK_LINEAR_W, height: BLOCK_LINEAR_H };
}

// Build graph nodes for the bipartite graph view. Each ProjectCommit
// (legacy V1) AND each V2 Operation becomes an operation node;
// container → operation edges run from inputs to the operation,
// operation → container edges run to outputs.
//
// K5 (DEC-OPS-03): operations is the V2 array (state.operations).
// Containers reference: op.inputs (containerId[]) + op.outputs.
// Legacy commits keep their inputs/outputs.containerIds nested shape.
export function buildGraphNodesEdges(containers, commits, operations = []) {
  const nodes = [];
  const edges = [];

  for (const c of containers) {
    const size = getBlockSize(c);
    nodes.push({
      id: c.id,
      type: 'container',
      width: size.width,
      height: size.height,
      data: { container: c, kind: 'container' },
    });
  }

  for (const op of commits) {
    nodes.push({
      id: op.id,
      type: 'operation',
      width: OPERATION_NODE_W,
      height: OPERATION_NODE_H,
      data: { commit: op, kind: 'operation' },
    });
    for (const inputId of (op.inputs?.containerIds || [])) {
      edges.push({
        id: `e-${inputId}-${op.id}`,
        from: inputId,
        to: op.id,
      });
    }
    for (const outputId of (op.outputs?.containerIds || [])) {
      edges.push({
        id: `e-${op.id}-${outputId}`,
        from: op.id,
        to: outputId,
      });
    }
  }

  for (const op of operations) {
    nodes.push({
      id: op.id,
      type: 'operation',
      width: OPERATION_NODE_W,
      height: OPERATION_NODE_H,
      data: { operation: op, kind: 'operation' },
    });
    for (const inputId of (op.inputs || [])) {
      edges.push({
        id: `e-${inputId}-${op.id}`,
        from: inputId,
        to: op.id,
      });
    }
    for (const outputId of (op.outputs || [])) {
      edges.push({
        id: `e-${op.id}-${outputId}`,
        from: op.id,
        to: outputId,
      });
    }
  }

  return { nodes, edges };
}

// Compute graph view positions via dagre LR.
export function computeGraphPositions(containers, commits, operations = []) {
  const { nodes, edges } = buildGraphNodesEdges(containers, commits, operations);
  if (nodes.length === 0) return {};
  // Use the wider/taller dimension as the dagre node size so layout
  // accounts for circular blocks.
  const dagreNodes = nodes.map((n) => ({ id: n.id }));
  const dagreEdges = edges.map((e) => ({ from: e.from, to: e.to }));
  // Average size — dagre takes a single nodeWidth/Height; pass max so
  // labels don't overlap. The actual node rendering uses its own size.
  return computeAutoLayout(dagreNodes, dagreEdges, 'LR', {
    nodeWidth: BLOCK_LINEAR_W + 30,
    nodeHeight: BLOCK_LINEAR_H + 30,
    ranksep: 80,
    nodesep: 50,
  });
}

// ── Junction proximity detection (12.05.2026, v0.5 paradigma) ───
//
// Когда биолог перетаскивает блок и отпускает рядом с другим блоком,
// автоматически создаётся junction. Без proximity нет связи; при
// разнесении блоков связь убирается.
//
// Правило близости: горизонтальный gap ≤ JUNCTION_GAP_PX и
// вертикальное смещение центров ≤ JUNCTION_Y_TOLERANCE.
// Junction направление — от левого блока к правому.

export const JUNCTION_GAP_PX = 32;
// R10: bumped 40→60 since blocks taller (110 vs 72).
export const JUNCTION_Y_TOLERANCE = 60;

/**
 * computeAutoJunctions — возвращает массив {fromContainerId,
 * toContainerId} пар, у которых блоки достаточно близки.
 *
 * filledOnly=true — placeholder'ы не участвуют (нечего соединять).
 */
export function computeAutoJunctions(containers, positions, opts = {}) {
  const filledOnly = opts.filledOnly !== false;
  const w = BLOCK_LINEAR_W;
  const h = BLOCK_LINEAR_H;
  const list = containers.filter((c) => {
    if (!c) return false;
    if (!filledOnly) return true;
    return !!(c.sequence && c.sequence.length > 0);
  });
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = 0; j < list.length; j += 1) {
      if (i === j) continue;
      const a = list[i];
      const b = list[j];
      const pa = positions[a.id];
      const pb = positions[b.id];
      if (!pa || !pb) continue;
      // A left of B → connect A.right edge to B.left edge.
      if (pa.x >= pb.x) continue;
      const aRight = pa.x + w;
      const gap = pb.x - aRight;
      if (gap > JUNCTION_GAP_PX || gap < -w / 2) continue;
      const yMid = (h / 2);
      const aCenterY = pa.y + yMid;
      const bCenterY = pb.y + yMid;
      if (Math.abs(aCenterY - bCenterY) > JUNCTION_Y_TOLERANCE) continue;
      out.push({ fromContainerId: a.id, toContainerId: b.id });
    }
  }
  return out;
}

// Edge-curvature clamp (px): the bezier handle never collapses (<min →
// kinked arrow) nor balloons (>max → spaghetti on far nodes).
const EDGE_CURVE_MIN = 30;
const EDGE_CURVE_MAX = 160;

const SIDE = {
  right: (r, cx, cy) => ({ x: r.x + r.w, y: cy, nx: 1, ny: 0 }),
  left: (r, cx, cy) => ({ x: r.x, y: cy, nx: -1, ny: 0 }),
  bottom: (r, cx, cy) => ({ x: cx, y: r.y + r.h, nx: 0, ny: 1 }),
  top: (r, cx, cy) => ({ x: cx, y: r.y, nx: 0, ny: -1 }),
};

/**
 * edgeAnchors — 4-side directional connector geometry (Игорь
 * 17.05.2026: «верх и низ тоже должны использоваться как точки
 * коннекта»). Picks the exit/entry side by the dominant axis of the
 * centre-to-centre vector: |dx|≥|dy| → right↔left, else bottom↔top.
 * The bezier control points sit on the chosen side's outward normal so
 * the curve leaves/enters perpendicular regardless of orientation; the
 * arrow marker uses orient="auto" so it rotates to match.
 *
 * @param {{x:number,y:number,w:number,h:number}} from
 * @param {{x:number,y:number,w:number,h:number}} to
 * @returns {{x1,y1,x2,y2,c1x,c1y,c2x,c2y,midX,midY,fromSide,toSide,d}}
 */
export function edgeAnchors(from, to) {
  const aCx = from.x + from.w / 2;
  const aCy = from.y + from.h / 2;
  const bCx = to.x + to.w / 2;
  const bCy = to.y + to.h / 2;
  const dx = bCx - aCx;
  const dy = bCy - aCy;

  let fromSide;
  let toSide;
  if (Math.abs(dx) >= Math.abs(dy)) {
    fromSide = dx >= 0 ? 'right' : 'left';
    toSide = dx >= 0 ? 'left' : 'right';
  } else {
    fromSide = dy >= 0 ? 'bottom' : 'top';
    toSide = dy >= 0 ? 'top' : 'bottom';
  }

  const a = SIDE[fromSide](from, aCx, aCy);
  const b = SIDE[toSide](to, bCx, bCy);
  const horiz = fromSide === 'left' || fromSide === 'right';
  const sep = horiz ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
  const k = Math.max(EDGE_CURVE_MIN, Math.min(sep / 2, EDGE_CURVE_MAX));

  const x1 = a.x;
  const y1 = a.y;
  const x2 = b.x;
  const y2 = b.y;
  const c1x = a.x + a.nx * k;
  const c1y = a.y + a.ny * k;
  const c2x = b.x + b.nx * k;
  const c2y = b.y + b.ny * k;
  return {
    x1,
    y1,
    x2,
    y2,
    c1x,
    c1y,
    c2x,
    c2y,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
    fromSide,
    toSide,
    d: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,
  };
}

/**
 * edgePanVelocity — auto-scroll speed while dragging a block toward a
 * viewport edge ("бесконечный канвас": the block keeps going, the
 * content extent grows with its position, the view follows). Speed
 * ramps linearly from 0 at the inner edge-band boundary to maxSpeed at
 * the edge, and stays maxSpeed past it. Pure; safe on a 0-size rect.
 *
 * @returns {{vx:number,vy:number}} px/frame to add to scrollLeft/Top.
 */
export function edgePanVelocity({
  clientX, clientY, rect, edge = 64, maxSpeed = 20,
}) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { vx: 0, vy: 0 };
  const ramp = (dist) => {
    if (dist >= edge) return 0;
    const d = Math.max(0, dist); // past the edge (dist<0) → full speed
    return maxSpeed * ((edge - d) / edge);
  };
  let vx = 0;
  let vy = 0;
  const dL = clientX - rect.left;
  const dR = rect.right - clientX;
  if (dL < edge) vx = -ramp(dL);
  else if (dR < edge) vx = ramp(dR);
  const dT = clientY - rect.top;
  const dB = rect.bottom - clientY;
  if (dT < edge) vy = -ramp(dT);
  else if (dB < edge) vy = ramp(dB);
  return { vx, vy };
}

/**
 * panScrollTarget — "grab the canvas" hand-pan. Given the press origin
 * (client x/y + container scroll at press time) and the current
 * pointer position, return scroll offsets that move the content WITH
 * the cursor (drag right → content right → scrollLeft decreases).
 * Clamped ≥0; the browser clamps the upper bound.
 */
export function panScrollTarget(start, clientX, clientY) {
  if (!start) return { left: 0, top: 0 };
  return {
    left: Math.max(0, start.scrollLeft - (clientX - start.x)),
    top: Math.max(0, start.scrollTop - (clientY - start.y)),
  };
}

// Minimum world-space canvas extent (px) — an empty / tiny project
// still gets a pannable area so wheel-zoom never clamps oddly.
export const EXTENT_MIN = 2000;

/**
 * canvasContentExtent — world-space bounding box of all canvas content
 * (containers + operation nodes + zone frames) plus `pad`. The view
 * renders a sizing spacer at `extent * zoom`; because CSS
 * `transform: scale()` does NOT enlarge a scroll container's
 * scrollWidth/Height, without this spacer the focal-zoom scroll target
 * is clamped at zoom>1 and the point under the cursor drifts sideways
 * (Игорь 17.05.2026). Pure; defensive against missing slices.
 */
export function canvasContentExtent(state, pad = 400) {
  const s = state || {};
  let maxX = 0;
  let maxY = 0;
  const positions = s.positions || {};
  for (const id of Object.keys(positions)) {
    const p = positions[id];
    if (!p) continue;
    maxX = Math.max(maxX, (p.x || 0) + BLOCK_LINEAR_W);
    maxY = Math.max(maxY, (p.y || 0) + BLOCK_LINEAR_H);
  }
  for (const op of (s.operations || [])) {
    const p = op && op.position;
    if (!p) continue;
    maxX = Math.max(maxX, (p.x || 0) + OPERATION_NODE_W);
    maxY = Math.max(maxY, (p.y || 0) + OPERATION_NODE_H);
  }
  for (const z of (s.zones || [])) {
    const b = z && z.bounds;
    if (!b) continue;
    maxX = Math.max(maxX, (b.x || 0) + (b.width || 0));
    maxY = Math.max(maxY, (b.y || 0) + (b.height || 0));
  }
  return {
    width: Math.max(EXTENT_MIN, maxX + pad),
    height: Math.max(EXTENT_MIN, maxY + pad),
  };
}

// Wheel-zoom rails (kept in sync with the +/− button clamps).
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 1.1;

/**
 * zoomAtPoint — focal-point ("zoom to cursor") math (Игорь 17.05.2026:
 * «зум колёсиком, и чтобы зумился к точке под курсором»).
 *
 * Layout: a node at canvas (X,Y) renders at viewport
 * (X*zoom - scroll). The world point under the cursor at viewport
 * offset s is w = (s + scroll) / zoom. To keep w under the same s
 * after zooming to z2: scroll2 = w*z2 - s.
 *
 * @param {{zoom,dir,sx,sy,scrollLeft,scrollTop,min?,max?,step?}} p
 *   dir = sign of wheel deltaY (<0 → zoom in, >0 → zoom out).
 * @returns {{zoom,scrollLeft,scrollTop,changed}}
 */
export function zoomAtPoint({
  zoom,
  dir,
  sx,
  sy,
  scrollLeft,
  scrollTop,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
  step = ZOOM_STEP,
}) {
  const factor = dir < 0 ? step : 1 / step;
  const z2 = Math.max(min, Math.min(max, +(zoom * factor).toFixed(4)));
  const wx = (sx + scrollLeft) / zoom;
  const wy = (sy + scrollTop) / zoom;
  return {
    zoom: z2,
    scrollLeft: Math.max(0, wx * z2 - sx),
    scrollTop: Math.max(0, wy * z2 - sy),
    changed: z2 !== zoom,
  };
}

/**
 * viewportToWorld — THE single screen→world transform for the canvas
 * (Игорь 18.05.2026, TD-ZONE-ATTACH-CONTAINMENT). Same model as
 * zoomAtPoint: a node at world (X,Y) renders at viewport
 * (X*zoom − scroll), so the world point under a viewport pixel is
 * `(client − rectOrigin + scroll) / zoom`.
 *
 * Both the drag-position math (`applyDragAt`) and the zone drop
 * hit-test MUST use this so they can never diverge again — the bug
 * was the hit-test omitting scroll while applyDragAt included it, so
 * a scrolled canvas mapped a drop to the wrong/no zone («криво
 * прикрепляются / внутри не держатся»).
 *
 * jsdom: rect = {left:0,top:0}, scroll = 0 → returns screen coords
 * unchanged (tests stay deterministic).
 *
 * @param {{clientX,clientY,rect,scrollLeft?,scrollTop?,zoom?}} p
 * @returns {{x:number,y:number}}
 */
export function viewportToWorld({
  clientX,
  clientY,
  rect,
  scrollLeft = 0,
  scrollTop = 0,
  zoom = 1,
}) {
  const z = zoom || 1;
  const left = (rect && rect.left) || 0;
  const top = (rect && rect.top) || 0;
  return {
    x: (clientX - left + (scrollLeft || 0)) / z,
    y: (clientY - top + (scrollTop || 0)) / z,
  };
}

