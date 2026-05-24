/**
 * ZoneGraphContent — shared graph renderer (Sprint V114 K1).
 *
 * Extracted verbatim from CanvasGraphView's graph core: given already-filtered
 * `containers` + `operations`, builds the bipartite graph via
 * `buildGraphNodesEdges`, lays it out with the local dagre
 * (`computeGraphPositions`, LR from 0,0), and draws the SVG edge layer +
 * `ContainerBlock`/`OperationNode` nodes inside a relative-positioned box
 * sized to the graph bounds.
 *
 * Two consumers:
 *   - `CanvasGraphView` (DAG view) — passes full `state.containers/operations`
 *     + its op-picker / placeholder callbacks. The DAG view's existing tests
 *     guard that this extraction renders identically.
 *   - `ZoneFrame` graph-mode (V114 K2) — passes the zone's nodes filtered by
 *     `nodeListInZone`, so Layout shows the assembly graph inside the frame.
 *
 * Pure: every interaction is an optional callback — with none passed the nodes
 * are decorative (no handler, no crash). Node wrappers are `pointer-events:auto`
 * so they stay clickable even when the host body is `pointer-events:none`
 * (DEC-T4-04 zone body).
 */
import { useMemo, useId } from 'react';
import ContainerBlock from './ContainerBlock';
import OperationNode from './OperationNode';
import {
  buildGraphNodesEdges,
  computeGraphPositions,
  getBlockSize,
  OPERATION_NODE_W,
  OPERATION_NODE_H,
  edgeAnchors,
} from './canvas-layout';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';

const EMPTY = [];

export default function ZoneGraphContent({
  containers = EMPTY,
  operations = EMPTY,
  highlightedId = null,
  onContainerClick,
  onContainerDoubleClick,
  onOperationClick,
  onOperationContextMenu,
  onPlaceholderClick,
}) {
  // commits are legacy V1 and always empty on the V2 canvas (spec §5) → [].
  const { nodes, edges } = useMemo(
    () => buildGraphNodesEdges(containers, [], operations),
    [containers, operations],
  );
  const positions = useMemo(
    () => computeGraphPositions(containers, [], operations),
    [containers, operations],
  );

  // Unique arrow-marker id per instance: multiple zone graphs can mount on the
  // same Layout canvas, and a shared static id ("skeleton-arrow") would be a
  // duplicate DOM id across <svg>s.
  const rawId = useId();
  const arrowId = `zgc-arrow-${rawId.replace(/[:]/g, '')}`;

  // Canvas bounds for the SVG layer — same formula as CanvasGraphView.bounds
  // (max node coordinate + footprint + 80 padding, floored at 800×600).
  const bounds = useMemo(() => {
    let maxX = 800;
    let maxY = 600;
    for (const n of nodes) {
      const pos = positions[n.id] || { x: 0, y: 0 };
      const size = n.data.kind === 'container'
        ? getBlockSize(n.data.container)
        : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
      maxX = Math.max(maxX, pos.x + size.width + 80);
      maxY = Math.max(maxY, pos.y + size.height + 80);
    }
    return { width: maxX, height: maxY };
  }, [nodes, positions]);

  return (
    <div
      data-testid="zone-graph-content"
      style={{ position: 'relative', width: bounds.width, height: bounds.height }}
    >
      {/* Edges SVG layer */}
      <svg
        width={bounds.width}
        height={bounds.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {edges.map((e) => {
          const a = positions[e.from];
          const b = positions[e.to];
          if (!a || !b) return null;
          const fromNode = nodes.find((n) => n.id === e.from);
          const toNode = nodes.find((n) => n.id === e.to);
          if (!fromNode || !toNode) return null;
          const fromSize = fromNode.kind === 'container'
            ? getBlockSize(fromNode.data.container)
            : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
          const toSize = toNode.kind === 'container'
            ? getBlockSize(toNode.data.container)
            : { width: OPERATION_NODE_W, height: OPERATION_NODE_H };
          const ea = edgeAnchors(
            { x: a.x, y: a.y, w: fromSize.width, h: fromSize.height },
            { x: b.x, y: b.y, w: toSize.width, h: toSize.height },
          );
          return (
            <path
              key={e.id}
              d={ea.d}
              stroke="var(--text-tertiary, #a8a29e)"
              strokeWidth={1.5}
              fill="none"
              markerEnd={`url(#${arrowId})`}
            />
          );
        })}
        <defs>
          <marker
            id={arrowId}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="var(--text-tertiary, #a8a29e)" />
          </marker>
        </defs>
      </svg>

      {/* Nodes */}
      {nodes.map((n) => {
        const pos = positions[n.id] || { x: 0, y: 0 };
        if (n.data.kind === 'container') {
          // Placeholder containers ("+ Пусто") are not rendered (AE-K9.6).
          if (isPlaceholderContainer(n.data.container)) return null;
          const highlighted = highlightedId === n.id;
          return (
            <div
              key={n.id}
              style={{
                position: 'absolute', left: pos.x, top: pos.y, zIndex: 2, pointerEvents: 'auto',
              }}
              onClick={onContainerClick ? () => onContainerClick(n.id) : undefined}
              onDoubleClick={onContainerDoubleClick ? () => onContainerDoubleClick(n.id) : undefined}
            >
              <ContainerBlock
                container={n.data.container}
                highlighted={highlighted}
                onPlaceholderClick={onPlaceholderClick ? () => onPlaceholderClick(n.id) : undefined}
              />
            </div>
          );
        }
        // operation node — V2 (operations) or legacy V1 (commits)
        const opData = n.data.operation || null;
        const commitData = n.data.commit || null;
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute', left: pos.x, top: pos.y, zIndex: 2, pointerEvents: 'auto',
            }}
          >
            <OperationNode
              operation={opData}
              commit={commitData}
              onClick={opData && onOperationClick ? onOperationClick : undefined}
              onContextMenu={opData && onOperationContextMenu ? onOperationContextMenu : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
