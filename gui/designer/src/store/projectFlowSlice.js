/**
 * projectFlowSlice — Zustand slice for Project Flow Canvas.
 *
 * Manages ReactFlow nodes/edges for the project-level DAG view.
 * Nodes = plasmids, PCR reactions, assemblies, oligos, checkpoints.
 * Edges = template (dashed gray), product (solid blue), fragment (solid green).
 *
 * IMPORTANT: onFlowNodesChange / onFlowEdgesChange read from get() (plain objects)
 * then write via immer set(). Do NOT pass immer Proxies to applyNodeChanges.
 */
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import Dagre from '@dagrejs/dagre';

/** Node sizes for dagre auto-layout */
const NODE_SIZES = {
  plasmidNode:    { width: 180, height: 80 },
  pcrNode:        { width: 200, height: 90 },
  assemblyNode:   { width: 200, height: 100 },
  oligoNode:      { width: 140, height: 60 },
  checkpointNode: { width: 180, height: 70 },
};

export const createProjectFlowSlice = (set, get) => ({
  flowNodes: [],       // [{ id, type, position, data }]
  flowEdges: [],       // [{ id, source, target, type, data }]
  projectView: 'construct',  // 'construct' | 'flow'

  setProjectView: (view) => set({ projectView: view }, false, 'setProjectView'),

  // ═══ ReactFlow change handlers ═══
  // Pattern: get() returns plain objects → @xyflow functions work → write result via immer
  onFlowNodesChange: (changes) => {
    const updated = applyNodeChanges(changes, get().flowNodes);
    set(state => { state.flowNodes = updated; }, false, 'onFlowNodesChange');
  },

  onFlowEdgesChange: (changes) => {
    const updated = applyEdgeChanges(changes, get().flowEdges);
    set(state => { state.flowEdges = updated; }, false, 'onFlowEdgesChange');
  },

  onFlowConnect: (connection) => {
    // Auto-type edge based on target node type
    const targetNode = get().flowNodes.find(n => n.id === connection.target);

    let edgeType = 'product';
    if (targetNode?.type === 'pcrNode') edgeType = 'template';
    if (targetNode?.type === 'assemblyNode') edgeType = 'fragment';

    const newEdge = {
      ...connection,
      type: edgeType,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
    };
    const updated = addEdge(newEdge, get().flowEdges);
    set(state => { state.flowEdges = updated; }, false, 'onFlowConnect');
  },

  // ═══ Node CRUD ═══
  addFlowPlasmid: (partId, position) => set(state => {
    const part = state.parts.find(p => p.id === partId);
    if (!part) return;
    const nodeId = `plasmid-${partId}-${Date.now()}`;
    state.flowNodes.push({
      id: nodeId,
      type: 'plasmidNode',
      position: position || { x: 100 + state.flowNodes.length * 220, y: 100 },
      data: { partId, label: part.name },
    });
  }, false, 'addFlowPlasmid'),

  addFlowPCR: (sourceNodeId) => set(state => {
    const sourceNode = state.flowNodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    const pcrId = `pcr-${Date.now()}`;
    const pcrNum = state.flowNodes.filter(n => n.type === 'pcrNode').length + 1;

    state.flowNodes.push({
      id: pcrId,
      type: 'pcrNode',
      position: { x: sourceNode.position.x + 250, y: sourceNode.position.y },
      data: {
        label: `PCR ${pcrNum}`,
        templatePartId: sourceNode.data.partId || null,
        productName: '',
        productLength: null,
        polymerase: 'Q5',
      },
    });

    // Auto-create template edge
    state.flowEdges.push({
      id: `e-${sourceNodeId}-${pcrId}`,
      source: sourceNodeId,
      target: pcrId,
      type: 'template',
    });
  }, false, 'addFlowPCR'),

  addFlowAssembly: (sourceNodeId, method) => set(state => {
    const sourceNode = state.flowNodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    const asmId = `asm-${Date.now()}`;
    const methodLabel = method === 'golden_gate' ? 'GG' : method === 'kld' ? 'KLD' : 'Gibson';

    state.flowNodes.push({
      id: asmId,
      type: 'assemblyNode',
      position: { x: sourceNode.position.x + 250, y: sourceNode.position.y },
      data: {
        label: `${methodLabel} Assembly`,
        method: method || 'gibson',
        fragmentCount: 1,
        assemblyId: null,
      },
    });

    // Auto-create fragment edge
    state.flowEdges.push({
      id: `e-${sourceNodeId}-${asmId}`,
      source: sourceNodeId,
      target: asmId,
      type: 'fragment',
    });
  }, false, 'addFlowAssembly'),

  addFlowOligo: (position) => set(state => {
    const oligoId = `oligo-${Date.now()}`;
    state.flowNodes.push({
      id: oligoId,
      type: 'oligoNode',
      position: position || { x: 100, y: 300 },
      data: { label: 'gRNA', sequence: '', length: 0, type: 'gRNA' },
    });
  }, false, 'addFlowOligo'),

  addFlowCheckpoint: (checkType, position) => set(state => {
    const cpId = `checkpoint-${Date.now()}`;
    const labels = {
      sequencing: 'Секвенирование',
      colony_pcr: 'Colony PCR',
      restriction_digest: 'Рестрикция',
      custom: 'Проверка',
    };
    state.flowNodes.push({
      id: cpId,
      type: 'checkpointNode',
      position: position || { x: 400, y: 200 },
      data: {
        label: labels[checkType] || 'Проверка',
        checkType: checkType || 'custom',
        status: 'pending',
        notes: '',
      },
    });
  }, false, 'addFlowCheckpoint'),

  updateFlowNodeData: (nodeId, newData) => set(state => {
    const node = state.flowNodes.find(n => n.id === nodeId);
    if (node) Object.assign(node.data, newData);
  }, false, 'updateFlowNodeData'),

  removeFlowNode: (nodeId) => set(state => {
    state.flowNodes = state.flowNodes.filter(n => n.id !== nodeId);
    state.flowEdges = state.flowEdges.filter(e => e.source !== nodeId && e.target !== nodeId);
  }, false, 'removeFlowNode'),

  setFlowNodes: (nodes) => set({ flowNodes: nodes }, false, 'setFlowNodes'),
  setFlowEdges: (edges) => set({ flowEdges: edges }, false, 'setFlowEdges'),

  clearFlow: () => set(state => {
    state.flowNodes = [];
    state.flowEdges = [];
  }, false, 'clearFlow'),

  // ═══ Auto-layout via dagre (LR) ═══
  autoLayoutFlow: () => {
    const { flowNodes, flowEdges } = get();
    if (flowNodes.length === 0) return;

    const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 60 });

    for (const n of flowNodes) {
      const size = NODE_SIZES[n.type] || { width: 180, height: 80 };
      g.setNode(n.id, size);
    }
    for (const e of flowEdges) {
      g.setEdge(e.source, e.target);
    }
    Dagre.layout(g);

    set(state => {
      for (const n of state.flowNodes) {
        const pos = g.node(n.id);
        const size = NODE_SIZES[n.type] || { width: 180, height: 80 };
        if (pos) {
          n.position = { x: pos.x - size.width / 2, y: pos.y - size.height / 2 };
        }
      }
    }, false, 'autoLayoutFlow');
  },
});
