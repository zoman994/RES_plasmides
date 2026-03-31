/**
 * FlowEdges — Custom edge types for Project Flow Canvas.
 *
 * Three visual styles for different relationship types:
 * - TemplateEdge: dashed gray — template DNA for PCR
 * - ProductEdge: solid blue — reaction product
 * - FragmentEdge: solid green — fragment for assembly
 */
import { BaseEdge, getSmoothStepPath } from '@xyflow/react';

export function TemplateEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd }) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <BaseEdge
      id={id}
      path={path}
      label={label}
      labelX={labelX}
      labelY={labelY}
      markerEnd={markerEnd}
      style={{ stroke: '#94a3b8', strokeDasharray: '6 3', strokeWidth: 1.5 }}
    />
  );
}

export function ProductEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd }) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <BaseEdge
      id={id}
      path={path}
      label={label}
      labelX={labelX}
      labelY={labelY}
      markerEnd={markerEnd}
      style={{ stroke: '#3b82f6', strokeWidth: 2 }}
    />
  );
}

export function FragmentEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd }) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <BaseEdge
      id={id}
      path={path}
      label={label}
      labelX={labelX}
      labelY={labelY}
      markerEnd={markerEnd}
      style={{ stroke: '#22c55e', strokeWidth: 2 }}
    />
  );
}
