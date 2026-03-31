/**
 * Tests for projectFlowSlice — store actions for Project Flow Canvas.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createProjectFlowSlice } from '../store/projectFlowSlice';

// Minimal store with flow slice + mock parts for template resolution
function createTestStore(initialParts = []) {
  return create(
    immer((set, get) => ({
      parts: initialParts,
      assemblies: [],
      ...createProjectFlowSlice(set, get),
    }))
  );
}

describe('projectFlowSlice', () => {
  let store;

  const mockParts = [
    { id: 'p1', name: 'pUC19', length: 2686, topology: 'circular' },
    { id: 'p2', name: 'pET28', length: 5369, topology: 'circular' },
  ];

  beforeEach(() => {
    store = createTestStore(mockParts);
  });

  // ═══ addFlowPlasmid ═══
  describe('addFlowPlasmid', () => {
    it('adds a plasmid node with correct data', () => {
      store.getState().addFlowPlasmid('p1', { x: 100, y: 200 });
      const nodes = store.getState().flowNodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('plasmidNode');
      expect(nodes[0].data.partId).toBe('p1');
      expect(nodes[0].data.label).toBe('pUC19');
      expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    });

    it('ignores unknown part id', () => {
      store.getState().addFlowPlasmid('nonexistent');
      expect(store.getState().flowNodes).toHaveLength(0);
    });
  });

  // ═══ addFlowPCR ═══
  describe('addFlowPCR', () => {
    it('creates PCR node + template edge from source', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const sourceId = store.getState().flowNodes[0].id;

      store.getState().addFlowPCR(sourceId);

      const nodes = store.getState().flowNodes;
      const edges = store.getState().flowEdges;

      expect(nodes).toHaveLength(2);
      const pcrNode = nodes.find(n => n.type === 'pcrNode');
      expect(pcrNode).toBeTruthy();
      expect(pcrNode.data.label).toBe('PCR 1');
      expect(pcrNode.data.templatePartId).toBe('p1');
      expect(pcrNode.data.polymerase).toBe('Q5');
      expect(pcrNode.position.x).toBe(250); // source.x + 250

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('template');
      expect(edges[0].source).toBe(sourceId);
      expect(edges[0].target).toBe(pcrNode.id);
    });

    it('increments PCR number', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const sourceId = store.getState().flowNodes[0].id;

      store.getState().addFlowPCR(sourceId);
      // Small delay to avoid same Date.now()
      store.getState().addFlowPCR(sourceId);

      const pcrNodes = store.getState().flowNodes.filter(n => n.type === 'pcrNode');
      expect(pcrNodes[0].data.label).toBe('PCR 1');
      expect(pcrNodes[1].data.label).toBe('PCR 2');
    });

    it('does nothing for unknown source', () => {
      store.getState().addFlowPCR('nonexistent');
      expect(store.getState().flowNodes).toHaveLength(0);
    });
  });

  // ═══ addFlowAssembly ═══
  describe('addFlowAssembly', () => {
    it('creates assembly node + fragment edge (gibson)', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const sourceId = store.getState().flowNodes[0].id;

      store.getState().addFlowAssembly(sourceId, 'gibson');

      const nodes = store.getState().flowNodes;
      const edges = store.getState().flowEdges;

      const asmNode = nodes.find(n => n.type === 'assemblyNode');
      expect(asmNode).toBeTruthy();
      expect(asmNode.data.method).toBe('gibson');
      expect(asmNode.data.label).toBe('Gibson Assembly');

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('fragment');
    });

    it('creates GG assembly with correct label', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const sourceId = store.getState().flowNodes[0].id;

      store.getState().addFlowAssembly(sourceId, 'golden_gate');

      const asmNode = store.getState().flowNodes.find(n => n.type === 'assemblyNode');
      expect(asmNode.data.label).toBe('GG Assembly');
      expect(asmNode.data.method).toBe('golden_gate');
    });
  });

  // ═══ addFlowOligo ═══
  describe('addFlowOligo', () => {
    it('creates oligo node at given position', () => {
      store.getState().addFlowOligo({ x: 50, y: 100 });
      const nodes = store.getState().flowNodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('oligoNode');
      expect(nodes[0].data.type).toBe('gRNA');
      expect(nodes[0].position).toEqual({ x: 50, y: 100 });
    });

    it('uses default position when none given', () => {
      store.getState().addFlowOligo();
      expect(store.getState().flowNodes[0].position).toEqual({ x: 100, y: 300 });
    });
  });

  // ═══ addFlowCheckpoint ═══
  describe('addFlowCheckpoint', () => {
    it('creates checkpoint node with correct type', () => {
      store.getState().addFlowCheckpoint('sequencing', { x: 300, y: 100 });
      const nodes = store.getState().flowNodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('checkpointNode');
      expect(nodes[0].data.checkType).toBe('sequencing');
      expect(nodes[0].data.status).toBe('pending');
      expect(nodes[0].data.label).toBe('Секвенирование');
    });

    it('creates colony_pcr checkpoint', () => {
      store.getState().addFlowCheckpoint('colony_pcr');
      const node = store.getState().flowNodes[0];
      expect(node.data.checkType).toBe('colony_pcr');
      expect(node.data.label).toBe('Colony PCR');
    });
  });

  // ═══ updateFlowNodeData ═══
  describe('updateFlowNodeData', () => {
    it('merges data into existing node', () => {
      store.getState().addFlowOligo({ x: 0, y: 0 });
      const nodeId = store.getState().flowNodes[0].id;

      store.getState().updateFlowNodeData(nodeId, { label: 'my gRNA', sequence: 'ATCG', length: 4 });

      const node = store.getState().flowNodes[0];
      expect(node.data.label).toBe('my gRNA');
      expect(node.data.sequence).toBe('ATCG');
      expect(node.data.type).toBe('gRNA'); // original data preserved
    });

    it('does nothing for unknown node', () => {
      store.getState().updateFlowNodeData('nonexistent', { label: 'x' });
      expect(store.getState().flowNodes).toHaveLength(0);
    });
  });

  // ═══ onFlowConnect — auto-type edges ═══
  describe('onFlowConnect (auto-type)', () => {
    it('creates template edge when target is pcrNode', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const plasmidId = store.getState().flowNodes[0].id;
      store.getState().addFlowPCR(plasmidId);
      const pcrId = store.getState().flowNodes.find(n => n.type === 'pcrNode').id;

      // Clear auto-created edges to test manual connect
      store.setState(s => { s.flowEdges = []; });

      store.getState().onFlowConnect({ source: plasmidId, target: pcrId });

      const edges = store.getState().flowEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('template');
    });

    it('creates fragment edge when target is assemblyNode', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const plasmidId = store.getState().flowNodes[0].id;
      store.getState().addFlowAssembly(plasmidId, 'gibson');
      const asmId = store.getState().flowNodes.find(n => n.type === 'assemblyNode').id;

      store.setState(s => { s.flowEdges = []; });
      store.getState().onFlowConnect({ source: plasmidId, target: asmId });

      expect(store.getState().flowEdges[0].type).toBe('fragment');
    });

    it('creates product edge by default', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      store.getState().addFlowPlasmid('p2', { x: 200, y: 0 });
      const [n1, n2] = store.getState().flowNodes;

      store.getState().onFlowConnect({ source: n1.id, target: n2.id });

      expect(store.getState().flowEdges[0].type).toBe('product');
    });
  });

  // ═══ removeFlowNode ═══
  describe('removeFlowNode', () => {
    it('removes node and connected edges', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const plasmidId = store.getState().flowNodes[0].id;
      store.getState().addFlowPCR(plasmidId);

      expect(store.getState().flowNodes).toHaveLength(2);
      expect(store.getState().flowEdges).toHaveLength(1);

      const pcrId = store.getState().flowNodes.find(n => n.type === 'pcrNode').id;
      store.getState().removeFlowNode(pcrId);

      expect(store.getState().flowNodes).toHaveLength(1);
      expect(store.getState().flowEdges).toHaveLength(0);
    });
  });

  // ═══ autoLayoutFlow ═══
  describe('autoLayoutFlow', () => {
    it('positions nodes without error', () => {
      store.getState().addFlowPlasmid('p1', { x: 0, y: 0 });
      const plasmidId = store.getState().flowNodes[0].id;
      store.getState().addFlowPCR(plasmidId);
      store.getState().addFlowOligo({ x: 0, y: 0 });

      expect(() => store.getState().autoLayoutFlow()).not.toThrow();

      // Nodes should have updated positions
      const nodes = store.getState().flowNodes;
      expect(nodes.every(n => typeof n.position.x === 'number')).toBe(true);
    });

    it('does nothing with empty nodes', () => {
      expect(() => store.getState().autoLayoutFlow()).not.toThrow();
    });
  });

  // ═══ setProjectView ═══
  describe('setProjectView', () => {
    it('switches view', () => {
      expect(store.getState().projectView).toBe('construct');
      store.getState().setProjectView('flow');
      expect(store.getState().projectView).toBe('flow');
    });
  });
});
