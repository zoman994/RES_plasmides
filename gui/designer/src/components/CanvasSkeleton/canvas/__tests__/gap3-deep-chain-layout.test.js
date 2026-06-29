/**
 * gap3-deep-chain-layout — GAP-3 (Игорь /loop 28.06): «такие вещи должны быть
 * ЧИТАЕМЫ как на DAG так и на канвасе, переход бесшовный». A flexible chain like
 * source → cut(digest) → fragment → pcr(re-amplify) → amplicon → gibson → product
 * must lay out as a readable depth-ordered graph.
 *
 * Grounding (audit wf, 28.06): the RENDERER already supports this. buildGraphNodesEdges
 * wires bipartite container→op→container edges; computeGraphPositions (dagre) is
 * depth-aware, so a container downstream of N ops sits N ranks deeper. BOTH the DAG
 * (AssemblyDagView) and the canvas zone frame (ZoneFrame graph mode) feed the SAME
 * ZoneGraphContent → computeGraphPositions, so the layout proven here is identical on
 * both surfaces (the "seamless" requirement is architectural, not per-view).
 *
 * This test PINS the deep-chain layout so it can't silently regress to a flat shape.
 * (The committed op-graph carries deep chains; the live PREVIEW derivePiecesToGraph
 * stays a shallow per-piece shorthand by design — re-amplify is modelled by promoting
 * acquisitionMethod, GAP-2.)
 */
import { describe, it, expect } from 'vitest';
import { buildGraphNodesEdges, computeGraphPositions } from '../canvas-layout';

const cont = (id) => ({
  id, kind: 'molecule', name: id, sequence: 'ACGTACGTACGTACGT', annotations: [], topology: { circular: false },
});
// source → cut → frag → pcr → amplicon → gibson → product
const CONTAINERS = [cont('src'), cont('frag'), cont('amplicon'), cont('product')];
const OPS = [
  { id: 'op-cut', kind: 'cut', inputs: ['src'], outputs: ['frag'] },
  { id: 'op-pcr', kind: 'pcr', inputs: ['frag'], outputs: ['amplicon'] },
  { id: 'op-gib', kind: 'gibson', inputs: ['amplicon'], outputs: ['product'] },
];

describe('GAP-3 — deep multi-step chain on the shared DAG/canvas layout', () => {
  it('wires the full source→cut→frag→pcr→amplicon→gibson→product chain (7 nodes, 6 edges)', () => {
    const { nodes, edges } = buildGraphNodesEdges(CONTAINERS, [], OPS);
    expect(nodes).toHaveLength(7); // 4 containers + 3 ops
    const has = (from, to) => edges.some((e) => e.from === from && e.to === to);
    expect(has('src', 'op-cut')).toBe(true);
    expect(has('op-cut', 'frag')).toBe(true);
    expect(has('frag', 'op-pcr')).toBe(true);
    expect(has('op-pcr', 'amplicon')).toBe(true);
    expect(has('amplicon', 'op-gib')).toBe(true);
    expect(has('op-gib', 'product')).toBe(true);
  });

  it('TB layout stacks the chain top→bottom (depth-ordered — читаемо вертикально)', () => {
    const pos = computeGraphPositions(CONTAINERS, [], OPS, 'TB');
    expect(pos.src.y).toBeLessThan(pos.frag.y);
    expect(pos.frag.y).toBeLessThan(pos.amplicon.y);
    expect(pos.amplicon.y).toBeLessThan(pos.product.y);
    // each op sits between its flanking containers (a real intermediate rank, not flat)
    expect(pos['op-cut'].y).toBeGreaterThan(pos.src.y);
    expect(pos['op-cut'].y).toBeLessThan(pos.frag.y);
  });

  it('LR layout flows the chain left→right (depth-ordered — читаемо горизонтально)', () => {
    const pos = computeGraphPositions(CONTAINERS, [], OPS, 'LR');
    expect(pos.src.x).toBeLessThan(pos.frag.x);
    expect(pos.frag.x).toBeLessThan(pos.amplicon.x);
    expect(pos.amplicon.x).toBeLessThan(pos.product.x);
  });

  it('fan-in branch (a 2nd fragment joins at gibson) lays out past the amplicon', () => {
    const containers = [...CONTAINERS, cont('src2'), cont('frag2')];
    const ops = [
      { id: 'op-cut', kind: 'cut', inputs: ['src'], outputs: ['frag'] },
      { id: 'op-pcr', kind: 'pcr', inputs: ['frag'], outputs: ['amplicon'] },
      { id: 'op-pcr2', kind: 'pcr', inputs: ['src2'], outputs: ['frag2'] },
      { id: 'op-gib', kind: 'gibson', inputs: ['amplicon', 'frag2'], outputs: ['product'] },
    ];
    const { edges } = buildGraphNodesEdges(containers, [], ops);
    expect(edges.some((e) => e.from === 'frag2' && e.to === 'op-gib')).toBe(true);
    expect(edges.some((e) => e.from === 'amplicon' && e.to === 'op-gib')).toBe(true);
    const pos = computeGraphPositions(containers, [], ops, 'TB');
    expect(pos.product.y).toBeGreaterThan(pos.amplicon.y); // product is the deepest rank
  });
});
