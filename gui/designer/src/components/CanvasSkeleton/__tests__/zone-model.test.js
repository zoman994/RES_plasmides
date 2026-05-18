/**
 * zone-model.test.js — T3 K1. Pure zone helpers (createZone /
 * nodeListInZone / computeZoneBoundingBox / isPointInZone).
 */
import { describe, it, expect } from 'vitest';
import {
  createZone, nodeListInZone, computeZoneBoundingBox, isPointInZone,
} from '../lib/zone-model';

describe('T3 K1 createZone', () => {
  it('stamps zn- id, defaults, timestamps', () => {
    const z = createZone({ name: 'Сборка 1', bounds: { x: 0, y: 0, width: 600, height: 400 } });
    expect(z.id).toMatch(/^zn-/);
    expect(z.name).toBe('Сборка 1');
    expect(z.bounds).toEqual({ x: 0, y: 0, width: 600, height: 400 });
    expect(z.collapsed).toBe(false);
    expect(z.viewMode).toBe('graph');
    expect(z.autoResize).toBe(true);
    expect(z.notes).toBeNull();
    expect(z.createdAt).toBeTypeOf('number');
    expect(z.updatedAt).toBe(z.createdAt);
    expect(createZone({ bounds: {} }).id).not.toBe(z.id);
  });
  it('falls back to a default name; copies bounds (no shared ref)', () => {
    const b = { x: 1, y: 2, width: 200, height: 120 };
    const z = createZone({ bounds: b });
    expect(z.name).toBeTypeOf('string');
    expect(z.bounds).not.toBe(b);
  });
});

describe('T3 K1 nodeListInZone', () => {
  const state = {
    containers: [{ id: 'c1', zoneId: 'z1' }, { id: 'c2', zoneId: null }],
    pieces: [{ id: 'p1', zoneId: 'z1' }, { id: 'p2', zoneId: 'z2' }],
    operations: [{ id: 'o1', zoneId: 'z1' }],
  };
  it('partitions containers / pieces / operations by zoneId', () => {
    const r = nodeListInZone(state, 'z1');
    expect(r.containers.map((c) => c.id)).toEqual(['c1']);
    expect(r.pieces.map((p) => p.id)).toEqual(['p1']);
    expect(r.operations.map((o) => o.id)).toEqual(['o1']);
  });
  it('empty zone → empty arrays', () => {
    expect(nodeListInZone(state, 'zX')).toEqual({ containers: [], pieces: [], operations: [] });
  });
});

describe('T3 K1 computeZoneBoundingBox', () => {
  it('computes a padded box around member node positions', () => {
    const state = {
      containers: [{ id: 'c1', zoneId: 'z1' }],
      pieces: [], operations: [],
      positions: { c1: { x: 100, y: 200 } },
    };
    const box = computeZoneBoundingBox(state, 'z1', 40);
    // padding 40 → x=60,y=160; +BLOCK_LINEAR_W(240)/H(150)+40 on far edge
    expect(box.x).toBe(60);
    expect(box.y).toBe(160);
    expect(box.width).toBe(240 + 80);
    expect(box.height).toBe(150 + 80);
  });
  it('no positioned members → null', () => {
    expect(computeZoneBoundingBox({ containers: [], pieces: [], operations: [], positions: {} }, 'z1')).toBeNull();
  });
});

describe('T3 K1 isPointInZone', () => {
  const zone = { bounds: { x: 10, y: 10, width: 100, height: 100 } };
  it('inside / on-edge true, outside false', () => {
    expect(isPointInZone({ x: 50, y: 50 }, zone)).toBe(true);
    expect(isPointInZone({ x: 10, y: 110 }, zone)).toBe(true);
    expect(isPointInZone({ x: 5, y: 50 }, zone)).toBe(false);
    expect(isPointInZone({ x: 50, y: 200 }, zone)).toBe(false);
  });
});
