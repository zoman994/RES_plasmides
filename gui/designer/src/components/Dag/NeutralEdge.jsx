/**
 * NeutralEdge — single edge type for the DAG canvas (DEC-MC1-02).
 *
 * Solid neutral line, no markers, no dasharray. M-C.1 ships exactly
 * one edge type — typed edges (template/product/fragment from v0.5)
 * belong to reactions and are M-G's territory.
 */
import { BaseEdge, getSmoothStepPath } from '@xyflow/react';

export default function NeutralEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: selected ? 'var(--accent-500, #d97706)' : 'var(--text-secondary, #57534e)',
        strokeWidth: selected ? 2.5 : 1.5,
        fill: 'none',
      }}
    />
  );
}
