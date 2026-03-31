/**
 * Racetrack layout — place fragment blocks on an elliptical track.
 *
 * Arc angles use sqrt scaling to prevent small fragments from bunching up.
 * Example: 400bp vs 5000bp → linear gives 13° vs 173° (bunched!),
 *          sqrt gives 34° vs 125° (balanced, still shows size difference).
 *
 * Returns: { blocks, junctions, center }
 *   blocks[i]:    { x, y, w, h, midAngle, startAngle, endAngle }
 *   junctions[i]: { path, connX, connY }  (SVG Bezier + connector midpoint)
 *   center:       { x, y, rx, ry }
 */

const BLOCK_H = 42;
const MIN_BLOCK_W = 60;
const MAX_BLOCK_W = 110;

function ellipsePoint(cx, cy, rx, ry, angle) {
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function bezierPoint(p0, cp, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
  };
}

function rectEdgePoint(rect, tx, ty) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? (rect.w / 2) / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? (rect.h / 2) / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function computeRacetrackLayout(fragments, { width, height }) {
  if (!fragments.length || !width || !height) {
    return { blocks: [], junctions: [], center: { x: 0, y: 0, rx: 0, ry: 0 } };
  }

  const n = fragments.length;
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.44;
  const ry = height * 0.42;

  // ═══ Step 1: sqrt-scaled arc angles ═══
  // sqrt compresses the range: small fragments get more space, large ones less
  const sqrtLengths = fragments.map(f => Math.sqrt(f.length || 1));
  const sqrtTotal = sqrtLengths.reduce((s, v) => s + v, 0);
  const arcs = sqrtLengths.map(sl => (sl / sqrtTotal) * 2 * Math.PI);

  // Min arc: ensure no fragment gets less than 20° (prevents total collapse)
  const MIN_ARC = (20 / 360) * 2 * Math.PI;
  const needsMin = arcs.some(a => a < MIN_ARC);
  if (needsMin && n > 1) {
    const clamped = arcs.map(a => Math.max(a, MIN_ARC));
    const clampedTotal = clamped.reduce((s, v) => s + v, 0);
    const scale = (2 * Math.PI) / clampedTotal;
    for (let i = 0; i < n; i++) arcs[i] = clamped[i] * scale;
  }

  let cumAngle = -Math.PI / 2; // start at 12 o'clock
  const totalBp = fragments.reduce((s, f) => s + (f.length || 1), 0);

  const blocks = fragments.map((frag, i) => {
    const startAngle = cumAngle;
    const endAngle = cumAngle + arcs[i];
    const midAngle = (startAngle + endAngle) / 2;

    // Block width: sqrt-proportional, clamped
    const sqFrac = sqrtLengths[i] / sqrtTotal;
    const blockW = Math.max(MIN_BLOCK_W, Math.min(MAX_BLOCK_W, sqFrac * width * 0.7));

    const pt = ellipsePoint(cx, cy, rx, ry, midAngle);

    cumAngle = endAngle;

    return {
      x: pt.x - blockW / 2,
      y: pt.y - BLOCK_H / 2,
      w: blockW,
      h: BLOCK_H,
      startAngle,
      midAngle,
      endAngle,
    };
  });

  // ═══ Step 2: Junctions — Bezier curves between adjacent blocks ═══
  const junctions = [];

  for (let i = 0; i < n; i++) {
    const curr = blocks[i];
    const next = blocks[(i + 1) % n];

    const currCx = curr.x + curr.w / 2;
    const currCy = curr.y + curr.h / 2;
    const nextCx = next.x + next.w / 2;
    const nextCy = next.y + next.h / 2;

    // Junction starts/ends at block edges, not on the ellipse
    const jStart = rectEdgePoint(curr, nextCx, nextCy);
    const jEnd = rectEdgePoint(next, currCx, currCy);

    // Control point: midpoint between endpoints, pulled toward oval center
    const midX = (jStart.x + jEnd.x) / 2;
    const midY = (jStart.y + jEnd.y) / 2;
    const cpX = midX - (cx - midX) * 0.25;
    const cpY = midY - (cy - midY) * 0.25;
    const cp = { x: cpX, y: cpY };

    const path = `M ${jStart.x.toFixed(1)} ${jStart.y.toFixed(1)} Q ${cpX.toFixed(1)} ${cpY.toFixed(1)} ${jEnd.x.toFixed(1)} ${jEnd.y.toFixed(1)}`;

    const conn = bezierPoint(jStart, cp, jEnd, 0.5);
    junctions.push({ path, connX: conn.x, connY: conn.y });
  }

  return { blocks, junctions, center: { x: cx, y: cy, rx, ry } };
}
