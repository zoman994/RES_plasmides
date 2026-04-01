/**
 * ProjectFlowCanvas — project-level DAG canvas using @xyflow/react.
 *
 * Shows plasmids, PCR reactions, assemblies, oligos, checkpoints as nodes.
 * Edges: template (dashed gray), product (solid blue), fragment (solid green).
 * Supports: drag from PartsPalette, snap-to-grid, minimap, auto-layout, export.
 */
import { useState, useRef, useCallback } from 'react';
import { ReactFlow, MiniMap, Controls, Background, Panel, useReactFlow } from '@xyflow/react';
import { useDrop } from 'react-dnd';
import { useStore } from '../../store';
import PlasmidNode from './PlasmidNode';
import PCRNode from './PCRNode';
import AssemblyNode from './AssemblyNode';
import OligoNode from './OligoNode';
import CheckpointNode from './CheckpointNode';
import { TemplateEdge, ProductEdge, FragmentEdge } from './FlowEdges';
import PCRPlanningPanel from './PCRPlanningPanel';

// Stable references at module scope — required by ReactFlow
const nodeTypes = {
  plasmidNode: PlasmidNode,
  pcrNode: PCRNode,
  assemblyNode: AssemblyNode,
  oligoNode: OligoNode,
  checkpointNode: CheckpointNode,
};

const edgeTypes = {
  template: TemplateEdge,
  product: ProductEdge,
  fragment: FragmentEdge,
};

export default function ProjectFlowCanvas() {
  const flowNodes = useStore(s => s.flowNodes);
  const flowEdges = useStore(s => s.flowEdges);
  const flowStages = useStore(s => s.flowStages);
  const onNodesChange = useStore(s => s.onFlowNodesChange);
  const onEdgesChange = useStore(s => s.onFlowEdgesChange);
  const onConnect = useStore(s => s.onFlowConnect);
  const addFlowPlasmid = useStore(s => s.addFlowPlasmid);
  const addFlowOligo = useStore(s => s.addFlowOligo);
  const addFlowCheckpoint = useStore(s => s.addFlowCheckpoint);
  const autoLayoutFlow = useStore(s => s.autoLayoutFlow);
  const removeFlowNode = useStore(s => s.removeFlowNode);
  const clearFlow = useStore(s => s.clearFlow);

  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [showPCRPanel, setShowPCRPanel] = useState(false);
  const containerRef = useRef(null);

  // react-dnd drop zone for PART items from PartsPalette
  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item, monitor) => {
      if (monitor.didDrop()) return; // already handled by child
      if (!reactFlowInstance) return;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const position = reactFlowInstance.screenToFlowPosition({
        x: clientOffset.x,
        y: clientOffset.y,
      });
      addFlowPlasmid(item.part.id, position);
    },
    collect: m => ({ isOver: m.isOver() }),
  });

  // Merge refs
  const setRefs = useCallback((el) => {
    drop(el);
    containerRef.current = el;
  }, [drop]);

  // Delete selected nodes on Backspace/Delete
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const selected = flowNodes.filter(n => n.selected);
      for (const n of selected) removeFlowNode(n.id);
    }
  }, [flowNodes, removeFlowNode]);

  // Export JSON
  const handleExportJSON = () => {
    const data = { nodes: flowNodes, edges: flowEdges, version: '1.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-flow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PNG
  const handleExportPNG = async () => {
    try {
      const { toPng } = await import('html-to-image');
      const el = document.querySelector('.react-flow');
      if (!el) return;
      const dataUrl = await toPng(el, { quality: 1.0 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'project-flow.png';
      a.click();
    } catch {
      // html-to-image not installed — fall back to alert
      alert('PNG export requires html-to-image package. Run: npm install html-to-image');
    }
  };

  const hasPCRNodes = flowNodes.some(n => n.type === 'pcrNode');

  // Toolbar button style
  const btnClass = `px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg shadow-sm
    text-xs font-medium text-gray-700 hover:bg-gray-50 transition`;

  return (
    <div className="flex flex-col h-full flex-1">
      <div ref={setRefs}
        className="flex-1 relative"
        style={{
          outline: isOver ? '2px dashed #3b82f6' : 'none',
          outlineOffset: -2,
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}>

        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          snapToGrid
          snapGrid={[20, 20]}
          fitView
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          {/* Stage column indicators */}
          {flowStages.length > 1 && (
            <Panel position="top-left" className="pointer-events-none">
              <div className="flex items-start gap-0" style={{ position: 'relative' }}>
                {flowStages.map((stage, i) => {
                  const colors = ['bg-blue-50', 'bg-teal-50', 'bg-amber-50', 'bg-purple-50', 'bg-green-50', 'bg-rose-50'];
                  const textColors = ['text-blue-500', 'text-teal-500', 'text-amber-500', 'text-purple-500', 'text-green-500', 'text-rose-500'];
                  return (
                    <div key={stage.rank}
                      className="flex flex-col items-center px-4 py-1.5">
                      <div className={`text-[10px] font-bold ${textColors[i % textColors.length]} tracking-wide uppercase`}>
                        Этап {stage.rank + 1}
                      </div>
                      <div className={`text-[9px] ${textColors[i % textColors.length]} opacity-70`}>
                        {stage.label}
                      </div>
                      <div className={`text-[8px] text-gray-400 mt-0.5`}>
                        {stage.nodeCount} {stage.nodeCount === 1 ? 'нода' : 'нод'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
          <Background gap={20} size={1} color="#e5e7eb" />
          <MiniMap
            nodeStrokeColor="#3b82f6"
            nodeColor="#dbeafe"
            maskColor="rgba(255,255,255,0.7)"
          />
          <Controls showInteractive={false} />
        </ReactFlow>

        {/* Toolbar */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 flex-nowrap">
          {flowNodes.length > 0 && (
            <button onClick={() => {
              if (confirm('Очистить canvas? Все ноды и связи будут удалены.')) clearFlow();
            }}
              className="px-2 py-1 bg-white border border-red-300 rounded-lg shadow-sm text-[10px] font-medium text-red-600 hover:bg-red-50 transition"
              title="Clear all nodes and edges">
              ✕ Clear
            </button>
          )}
          {flowNodes.length > 1 && (
            <button onClick={autoLayoutFlow} className={btnClass} title="Auto-layout (dagre LR)">
              Auto-layout
            </button>
          )}
          <button onClick={() => {
            const count = flowNodes.filter(n => n.type === 'oligoNode').length;
            addFlowOligo({ x: 100 + count * 30, y: 300 + count * 30 });
          }} className={btnClass} title="Add oligo/gRNA node">
            + Oligo
          </button>
          <button onClick={() => {
            const count = flowNodes.filter(n => n.type === 'checkpointNode').length;
            addFlowCheckpoint('sequencing', { x: 400 + count * 30, y: 200 + count * 30 });
          }} className={btnClass}
            title="Add checkpoint (sequencing)">
            + Checkpoint
          </button>
          {hasPCRNodes && (
            <button onClick={() => setShowPCRPanel(v => !v)}
              className={`${btnClass} ${showPCRPanel ? '!bg-teal-50 !border-teal-300' : ''}`}
              title="Toggle PCR planning panel">
              {showPCRPanel ? 'Hide' : 'Show'} PCR Plan
            </button>
          )}
          <button onClick={handleExportJSON} className={btnClass} title="Export flow as JSON">
            JSON
          </button>
          <button onClick={handleExportPNG} className={btnClass} title="Export flow as PNG">
            PNG
          </button>
          <span className="text-[10px] text-gray-400 ml-1">
            {flowNodes.length} {flowNodes.length === 1 ? 'нода' : 'нод'}
            {flowStages.length > 0 && ` · ${flowStages.length} ${flowStages.length === 1 ? 'этап' : 'этапов'}`}
          </span>
        </div>

        {/* Empty state */}
        {flowNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-400">
              <div className="text-4xl mb-2 opacity-30">&#x1F9EC;</div>
              <div className="text-sm font-medium">Project Flow</div>
              <div className="text-xs mt-1">
                Drag plasmids from the palette to start
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PCR Planning Panel (below canvas) */}
      {showPCRPanel && <PCRPlanningPanel />}
    </div>
  );
}
