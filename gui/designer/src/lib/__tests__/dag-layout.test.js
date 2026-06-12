/**
 * dag-layout — Sprint M-C.1 K1 unit tests.
 *
 * `computeAutoLayout(nodes, edges, direction='LR')` wraps `@dagrejs/dagre`
 * to assign positions to a chain of PlasmidNode-style cards. Default
 * direction is LR; TB alternative is exposed for the optional knob in
 * spec §9.
 */
import { describe, it, expect } from 'vitest';
import { computeAutoLayout } from '../dag-layout';

const NODE_W = 280;
const NODE_H = 220;

describe('M-C.1 K1 — dag-layout.computeAutoLayout', () => {
  it('returns an empty object on empty input', () => {
    expect(computeAutoLayout([], [])).toEqual({});
  });

  it('positions a single node at (0, 0)-ish (dagre centres it; just check returned id key)', () => {
    const positions = computeAutoLayout([{ id: 'a' }], []);
    expect(Object.keys(positions)).toEqual(['a']);
    expect(typeof positions.a.x).toBe('number');
    expect(typeof positions.a.y).toBe('number');
  });

  it('LR direction: chain a→b→c puts b strictly to the right of a, and c strictly to the right of b', () => {
    const positions = computeAutoLayout(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
      'LR',
    );
    expect(positions.a.x).toBeLessThan(positions.b.x);
    expect(positions.b.x).toBeLessThan(positions.c.x);
  });

  it('TB direction: chain a→b→c puts b strictly below a, and c strictly below b', () => {
    const positions = computeAutoLayout(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
      'TB',
    );
    expect(positions.a.y).toBeLessThan(positions.b.y);
    expect(positions.b.y).toBeLessThan(positions.c.y);
  });

  it('honours custom node dimensions when supplied', () => {
    const small = computeAutoLayout(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
      'LR',
      { nodeWidth: 100, nodeHeight: 80 },
    );
    const big = computeAutoLayout(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
      'LR',
      { nodeWidth: 600, nodeHeight: 400 },
    );
    // Bigger node width → bigger horizontal gap between adjacent ranks.
    expect(big.b.x - big.a.x).toBeGreaterThan(small.b.x - small.a.x);
  });

  it('positions are top-left coordinates (dagre returns centres internally; our wrapper converts)', () => {
    const positions = computeAutoLayout(
      [{ id: 'a' }],
      [],
      'LR',
      { nodeWidth: NODE_W, nodeHeight: NODE_H },
    );
    // We return top-left coords. dagre internally centres at (NODE_W/2, NODE_H/2)
    // for a single node, so the top-left should land at (0, 0).
    expect(positions.a.x).toBe(0);
    expect(positions.a.y).toBe(0);
  });

  it('sizeOf gives per-node sizes; top-left conversion uses each node\'s OWN size', () => {
    // Mixed-size chain (a 240×150 block → a 120×60 op diamond). The center→
    // top-left conversion must use each node's own half-size, else the op
    // node lands 60px too high and edges anchor off its true box (Игорь 11.06).
    const positions = computeAutoLayout(
      [{ id: 'block' }, { id: 'op' }],
      [{ from: 'block', to: 'op' }],
      'LR',
      {
        nodeWidth: 240,
        nodeHeight: 150,
        sizeOf: (id) => (id === 'op' ? { width: 120, height: 60 } : { width: 240, height: 150 }),
      },
    );
    expect(positions.op.x).toBeGreaterThan(positions.block.x);
    // dagre aligns a 2-node LR chain on one centre line; per-node conversion
    // ⇒ block.y + 150/2 === op.y + 60/2 (both reduce to the shared centreY).
    expect(positions.block.y + 75).toBeCloseTo(positions.op.y + 30, 0);
  });

  it('skips edges that point to nodes outside the supplied node list (defensive)', () => {
    const positions = computeAutoLayout(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'ghost' }],
      'LR',
    );
    expect(Object.keys(positions).sort()).toEqual(['a', 'b']);
  });
});
