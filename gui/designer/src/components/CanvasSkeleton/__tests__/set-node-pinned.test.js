/**
 * set-node-pinned.test.js — T4.5 K6 (DEC-T4.5-04). SET_NODE_PINNED
 * cross-slice node flag (container / piece / operation). pinned=true
 * keeps the node's position (flag only); the finalizer skips it.
 */
import { describe, it, expect } from 'vitest';
import { zonesReducer } from '../store/skeleton-state-zones';

function st() {
  return {
    zones: [{ id: 'z1', name: 'Z', bounds: { x: 0, y: 0, width: 10, height: 10 } }],
    containers: [{ id: 'c1', kind: 'molecule', pinned: false }],
    pieces: [{ id: 'p1', kind: 'sourced', pinned: false }],
    operations: [{ id: 'o1', kind: 'pcr', pinned: false }],
    positions: { c1: { x: 5, y: 6 } },
  };
}

describe('T4.5 K6 — SET_NODE_PINNED', () => {
  it('pins a container without touching its position', () => {
    const s = st();
    const out = zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'container', nodeId: 'c1', pinned: true,
    });
    expect(out.containers[0].pinned).toBe(true);
    expect(out.positions.c1).toEqual({ x: 5, y: 6 }); // position untouched
  });

  it('pins a piece (bumps updatedAt) and an operation', () => {
    let s = st();
    s = zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'piece', nodeId: 'p1', pinned: true,
    });
    expect(s.pieces[0].pinned).toBe(true);
    expect(typeof s.pieces[0].updatedAt).toBe('number');
    s = zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'operation', nodeId: 'o1', pinned: true,
    });
    expect(s.operations[0].pinned).toBe(true);
  });

  it('unpin (false) flips it back', () => {
    let s = st();
    s = zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'container', nodeId: 'c1', pinned: true,
    });
    s = zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'container', nodeId: 'c1', pinned: false,
    });
    expect(s.containers[0].pinned).toBe(false);
  });

  it('no-op (same ref) when already in the wanted state', () => {
    const s = st();
    expect(zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'container', nodeId: 'c1', pinned: false,
    })).toBe(s);
  });

  it('unknown node / bad type → state unchanged', () => {
    const s = st();
    expect(zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'container', nodeId: 'zzz', pinned: true,
    })).toBe(s);
    expect(zonesReducer(s, {
      type: 'SET_NODE_PINNED', nodeType: 'bogus', nodeId: 'c1', pinned: true,
    })).toBe(s);
  });
});
