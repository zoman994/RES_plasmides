/**
 * dag-layout — Sprint M-C.1 K1 (DEC-MC1-04 supporting helper).
 *
 * Thin wrapper around `@dagrejs/dagre` that assigns positions to a list
 * of PlasmidNode-style cards. The DAG canvas (DagCanvas.jsx) calls this
 * for the «auto-layout» button and on first-mount when the project's
 * `dag.positions` map is empty but `containerIds` is non-empty.
 *
 * Defaults — node 280×220 (PlasmidNode card dimensions, DEC-MC1-01),
 * direction LR (spec §9 Q1: temporal flow LR; TB knob open for visual
 * приёмка). 60 px rank separation, 40 px node separation — matches the
 * v0.5 ProjectFlowCanvas layout muscle memory without copying its code.
 *
 * Returns a `{ [nodeId]: { x, y } }` map of TOP-LEFT coordinates (dagre
 * gives centres; we convert by subtracting half the node dimensions so
 * ReactFlow's `position` prop lands the card where biolog expects).
 */
import dagre from '@dagrejs/dagre';

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 220;
const DEFAULT_RANKSEP = 60;
const DEFAULT_NODESEP = 40;

export function computeAutoLayout(nodes = [], edges = [], direction = 'LR', opts = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return {};
  const nodeWidth = opts.nodeWidth || DEFAULT_NODE_WIDTH;
  const nodeHeight = opts.nodeHeight || DEFAULT_NODE_HEIGHT;
  const ranksep = opts.ranksep != null ? opts.ranksep : DEFAULT_RANKSEP;
  const nodesep = opts.nodesep != null ? opts.nodesep : DEFAULT_NODESEP;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, ranksep, nodesep, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeIds = new Set();
  for (const n of nodes) {
    if (!n || !n.id) continue;
    nodeIds.add(n.id);
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const e of edges || []) {
    if (!e || !e.from || !e.to) continue;
    // Defensive: skip edges that point to nodes we weren't told about.
    // The slice's `removeContainerFromProject` already cleans these on
    // delete, but a stale persisted DAG could carry one across reloads.
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  const out = {};
  for (const id of nodeIds) {
    const node = g.node(id);
    if (!node) continue;
    // dagre returns centres; ReactFlow expects top-left.
    out[id] = {
      x: node.x - nodeWidth / 2,
      y: node.y - nodeHeight / 2,
    };
  }
  return out;
}
