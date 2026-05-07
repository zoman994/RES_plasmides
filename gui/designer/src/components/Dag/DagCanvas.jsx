/**
 * DagCanvas — root project DAG fullscreen (M-C.1 K2).
 *
 * ReactFlow + PlasmidNode (DEC-MC1-01) + NeutralEdge (DEC-MC1-02).
 * Reads nodes from `Project.containerIds` × `libraryEntries`, positions
 * from `Project.dag.positions`, edges from `Project.dag.edges`.
 *
 * Drop target — listens for the native HTML5 drag MIME
 * `application/x-bodgegene-dag-add` (DagPalette in K3 sets that on
 * its drag handle). The codebase already uses native HTML5 drag for
 * library palette items (see LibraryItemRow.jsx), so we keep the same
 * pattern instead of standing up a react-dnd provider for one source.
 *
 * Empty state (no containers): centred hint + CTA-link «Открыть
 * библиотеку для импорта» (push fullscreen `library`). K5 wires the
 * STRINGS.dag namespace so the copy lives in lib/strings.js.
 *
 * Auto-layout button: dagre LR, persists positions through
 * setDagPositions. Default direction is LR per spec §9 Q1; biolog can
 * try TB in visual приёмка by editing the constant if needed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../../store';
import PlasmidNode from './PlasmidNode';
import NeutralEdge from './NeutralEdge';
import { computeAutoLayout } from '../../lib/dag-layout';

const nodeTypes = { plasmid: PlasmidNode };
const edgeTypes = { neutral: NeutralEdge };
const DEFAULT_LAYOUT_DIRECTION = 'LR';
const DRAG_MIME = 'application/x-bodgegene-dag-add';
const VIEWPORT_DEBOUNCE_MS = 600;
const POSITION_DEBOUNCE_MS = 400;

function DagCanvasInner() {
  const projectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (projectId ? s.projects[projectId] : null));
  const libraryEntries = useStore(s => s.libraryEntries);
  const addContainerToCurrentProject = useStore(s => s.addContainerToCurrentProject);
  const removeContainerFromProject = useStore(s => s.removeContainerFromProject);
  const setDagPositions = useStore(s => s.setDagPositions);
  const addDagEdge = useStore(s => s.addDagEdge);
  const removeDagEdge = useStore(s => s.removeDagEdge);
  const setDagViewport = useStore(s => s.setDagViewport);
  const showToast = useStore(s => s.showToast);
  const pushFullscreen = useStore(s => s.pushFullscreen);

  const containerIds = useMemo(
    () => (Array.isArray(project?.containerIds) ? project.containerIds : []),
    [project?.containerIds],
  );
  const dagEdges = useMemo(
    () => (Array.isArray(project?.dag?.edges) ? project.dag.edges : []),
    [project?.dag?.edges],
  );
  const dagPositions = project?.dag?.positions || {};

  // ReactFlow nodes derived from containerIds + dag.positions. We keep
  // the source of truth in the store; ReactFlow's onNodesChange path
  // applies position changes locally for snappiness, then commits to
  // the store via setDagPositions debounced (drag end).
  const flowNodes = useMemo(() => containerIds.map((id, idx) => ({
    id,
    type: 'plasmid',
    position: dagPositions[id] || { x: 80 + idx * 320, y: 80 },
    data: { libraryEntryId: id },
  })), [containerIds, dagPositions]);

  const flowEdges = useMemo(() => dagEdges.map(e => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'neutral',
  })), [dagEdges]);

  // Local mirror so ReactFlow can emit changes immediately; store sync
  // happens debounced on drag stop.
  const [nodes, setNodes] = useState(flowNodes);
  const [edges, setEdges] = useState(flowEdges);
  useEffect(() => { setNodes(flowNodes); }, [flowNodes]);
  useEffect(() => { setEdges(flowEdges); }, [flowEdges]);

  const positionPersistTimer = useRef(null);
  const viewportPersistTimer = useRef(null);
  const reactFlow = useReactFlow();

  const onNodesChange = useCallback((changes) => {
    setNodes(curr => applyNodeChanges(changes, curr));
    // Persist drag-stop on a debounce.
    const positionChanged = changes.some(c => c.type === 'position' && c.dragging === false);
    if (positionChanged) {
      clearTimeout(positionPersistTimer.current);
      positionPersistTimer.current = setTimeout(() => {
        const patch = {};
        for (const n of nodes) patch[n.id] = n.position;
        setDagPositions(patch);
      }, POSITION_DEBOUNCE_MS);
    }
    // Backspace/Delete on selected node arrives as a `remove` change.
    const removeIds = changes.filter(c => c.type === 'remove').map(c => c.id);
    for (const id of removeIds) removeContainerFromProject(id);
  }, [nodes, setDagPositions, removeContainerFromProject]);

  const onEdgesChange = useCallback((changes) => {
    setEdges(curr => applyEdgeChanges(changes, curr));
    const removeIds = changes.filter(c => c.type === 'remove').map(c => c.id);
    for (const id of removeIds) removeDagEdge(id);
  }, [removeDagEdge]);

  const onConnect = useCallback((params) => {
    setEdges(curr => addEdge({ ...params, type: 'neutral' }, curr));
    addDagEdge({ from: params.source, to: params.target });
  }, [addDagEdge]);

  const onMove = useCallback((_, viewport) => {
    clearTimeout(viewportPersistTimer.current);
    viewportPersistTimer.current = setTimeout(() => {
      setDagViewport(viewport);
    }, VIEWPORT_DEBOUNCE_MS);
  }, [setDagViewport]);

  // Native HTML5 drop target — the DagPalette (K3) sets DRAG_MIME on
  // its drag handle. We translate the screen coordinates of the drop
  // into ReactFlow flow coordinates so the new node lands exactly
  // under the cursor.
  const [highlightId, setHighlightId] = useState(null);
  const onDragOver = useCallback((e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);
  const onDrop = useCallback((e) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (!types.includes(DRAG_MIME)) return;
    e.preventDefault();
    const libraryEntryId = e.dataTransfer.getData(DRAG_MIME);
    if (!libraryEntryId) return;
    const flowPos = reactFlow.screenToFlowPosition
      ? reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      : { x: e.clientX, y: e.clientY };
    const alreadyOnCanvas = containerIds.includes(libraryEntryId);
    if (alreadyOnCanvas) {
      showToast?.('Уже добавлено', 'info');
      // Lift highlight on the existing node so biolog spots it.
      setHighlightId(libraryEntryId);
      setTimeout(() => setHighlightId(null), 700);
      return;
    }
    addContainerToCurrentProject(libraryEntryId, flowPos);
  }, [reactFlow, containerIds, addContainerToCurrentProject, showToast]);

  const onAutoLayout = useCallback(() => {
    if (containerIds.length === 0) return;
    const positions = computeAutoLayout(
      containerIds.map(id => ({ id })),
      dagEdges.map(e => ({ from: e.from, to: e.to })),
      DEFAULT_LAYOUT_DIRECTION,
    );
    setDagPositions(positions);
  }, [containerIds, dagEdges, setDagPositions]);

  // Apply persisted viewport on first mount.
  const initialViewport = project?.dag?.viewport || { x: 0, y: 0, zoom: 1 };

  if (!project) {
    return (
      <div
        data-testid="dag-canvas-no-project"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary, #57534e)',
          fontSize: 13,
        }}
      >Откройте проект, чтобы увидеть DAG.</div>
    );
  }

  // Highlight glow on the existing node when biolog tries a duplicate
  // drop. We pass `selected` through ReactFlow's node props, but since
  // ReactFlow applies its own selection state, we instead inject a
  // class on the wrapper via a CSS variable.
  const styledNodes = highlightId
    ? nodes.map(n => (n.id === highlightId ? { ...n, className: 'dag-node-highlight' } : n))
    : nodes;

  const isEmpty = containerIds.length === 0;

  return (
    <div
      data-testid="dag-canvas-drop-target"
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface-base, #fafaf9)',
      }}
    >
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMove={onMove}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={initialViewport}
        defaultEdgeOptions={{ type: 'neutral' }}
        fitView={isEmpty ? false : false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="var(--border-subtle, #e7e5e4)" />
        <Controls position="bottom-right" />
        <Panel position="top-right">
          <button
            type="button"
            data-testid="dag-canvas-auto-layout"
            onClick={onAutoLayout}
            disabled={isEmpty}
            title="Auto-layout (dagre LR)"
            style={{
              padding: '6px 10px',
              fontSize: 12,
              border: '0.5px solid var(--border-default, #d6d3d1)',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--surface-1, #ffffff)',
              color: 'var(--text-primary, #1c1917)',
              cursor: isEmpty ? 'not-allowed' : 'pointer',
              opacity: isEmpty ? 0.5 : 1,
            }}
          >Авто-раскладка</button>
        </Panel>
      </ReactFlow>

      {isEmpty && (
        <div
          data-testid="dag-canvas-empty-state"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          <div style={{
            fontSize: 14,
            color: 'var(--text-secondary, #57534e)',
            textAlign: 'center',
            maxWidth: 360,
          }}>
            Перетащите плазмиду из библиотеки
          </div>
          <button
            type="button"
            data-testid="dag-canvas-empty-cta"
            onClick={() => pushFullscreen({ fullscreen: 'library', payload: { target: 'library' } })}
            style={{
              pointerEvents: 'auto',
              padding: '6px 12px',
              fontSize: 12,
              border: '0.5px solid var(--accent-500, #d97706)',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--surface-1, #ffffff)',
              color: 'var(--accent-500, #d97706)',
              cursor: 'pointer',
            }}
          >Открыть библиотеку для импорта</button>
        </div>
      )}
    </div>
  );
}

export default function DagCanvas() {
  return (
    <ReactFlowProvider>
      <DagCanvasInner />
    </ReactFlowProvider>
  );
}
