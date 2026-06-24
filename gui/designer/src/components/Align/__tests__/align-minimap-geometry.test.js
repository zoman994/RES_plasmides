import { describe, it, expect } from 'vitest';
import { posToFrac, fracToPos, posToX, xToPos, carriageRect } from '../align-minimap-geometry';

describe('align-minimap-geometry', () => {
  it('posToFrac maps 0..len to 0..1 and clamps', () => {
    expect(posToFrac(0, 100)).toBe(0);
    expect(posToFrac(50, 100)).toBe(0.5);
    expect(posToFrac(100, 100)).toBe(1);
    expect(posToFrac(150, 100)).toBe(1); // clamp
    expect(posToFrac(10, 0)).toBe(0); // empty seq
  });

  it('posToX / xToPos are inverse along the strip (with padding)', () => {
    expect(posToX(0, 100, 200, 0)).toBe(0);
    expect(posToX(100, 100, 200, 0)).toBe(200);
    expect(posToX(50, 100, 200, 0)).toBe(100);
    // with 10px padding the usable inner width is 180
    expect(posToX(0, 100, 200, 10)).toBe(10);
    expect(posToX(100, 100, 200, 10)).toBe(190);
    expect(xToPos(100, 100, 200, 0)).toBe(50);
    expect(xToPos(10, 100, 200, 10)).toBe(0);
    expect(xToPos(190, 100, 200, 10)).toBe(100);
  });

  it('fracToPos rounds and clamps to [0, len]', () => {
    expect(fracToPos(0.123, 100)).toBe(12);
    expect(fracToPos(-1, 100)).toBe(0);
    expect(fracToPos(2, 100)).toBe(100);
  });

  it('carriageRect positions a viewport window and enforces a min width', () => {
    const r = carriageRect(0, 50, 100, 200, 0, 10);
    expect(r.x).toBe(0);
    expect(r.width).toBe(100); // half the strip
    // a tiny window still gets a grabbable min width
    const tiny = carriageRect(50, 50, 100, 200, 0, 10);
    expect(tiny.width).toBe(10);
    // and stays inside the strip
    expect(tiny.x).toBeLessThanOrEqual(190);
  });
});
