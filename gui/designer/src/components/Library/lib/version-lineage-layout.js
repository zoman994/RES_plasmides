/**
 * version-lineage-layout.js — pure geometry for the VersionTimeline. Maps a
 * timeline model (buildVersionTimeline) → absolute node boxes + edge paths.
 * Horizontal = chronological order; vertical lane = branch. Edges elbow when
 * they cross lanes (git-graph style). Kept pure so layout is unit-tested apart
 * from the SVG/DOM.
 */
export function layoutVersionTimeline(model, opts = {}) {
  const nodeW = opts.nodeW ?? 172;
  const nodeH = opts.nodeH ?? 66;
  const gapX = opts.gapX ?? 40;
  const laneGap = opts.laneGap ?? 22;
  const padX = opts.padX ?? 16;
  const padY = opts.padY ?? 16;

  const nodes = (model?.nodes || []).map((n) => ({
    ...n,
    x: padX + n.order * (nodeW + gapX),
    y: padY + n.lane * (nodeH + laneGap),
    w: nodeW,
    h: nodeH,
  }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const maxOrder = nodes.reduce((m, n) => Math.max(m, n.order), 0);
  const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
  const width = nodes.length ? padX * 2 + maxOrder * (nodeW + gapX) + nodeW : 0;
  const height = nodes.length ? padY * 2 + maxLane * (nodeH + laneGap) + nodeH : 0;

  const edges = (model?.edges || []).map((e) => {
    const a = byId[e.from];
    const b = byId[e.to];
    if (!a || !b) return null;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const sameLane = Math.abs(y1 - y2) < 1;
    const midX = x1 + (x2 - x1) / 2;
    const path = sameLane
      ? `M${x1} ${y1} L${x2} ${y2}`
      : `M${x1} ${y1} L${midX} ${y1} L${midX} ${y2} L${x2} ${y2}`;
    return { from: e.from, to: e.to, x1, y1, x2, y2, path, sameLane };
  }).filter(Boolean);

  return { width, height, nodes, edges };
}
