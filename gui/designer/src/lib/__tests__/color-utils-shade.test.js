/**
 * color-utils-shade.test.js — coverage for `shadeFromBaseByIndex`.
 *
 * Biolog: «сабфичи должны окрашиваться в схожий цвет но с другим
 * тоном, чтобы их можно было визуально идентифицировать». Helper
 * walks evenly around the base lightness so siblings stay in the
 * same hue family but each gets a distinguishable shade.
 */
import { describe, it, expect } from 'vitest';
import { shadeFromBaseByIndex } from '../color-utils';

describe('shadeFromBaseByIndex', () => {
  it('index 0 returns the base colour unchanged', () => {
    expect(shadeFromBaseByIndex('#7CB342', 0)).toBe('#7CB342');
  });

  it('index 1 produces a different hex', () => {
    expect(shadeFromBaseByIndex('#7CB342', 1)).not.toBe('#7CB342');
  });

  it('odd indices are darker than the base, even (>0) lighter', () => {
    const base = '#7CB342'; // green-ish
    const dark = shadeFromBaseByIndex(base, 1);
    const light = shadeFromBaseByIndex(base, 2);
    // Compare luminance (approx via R+G+B sum on the 0..255 range).
    const sum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(sum(dark)).toBeLessThan(sum(base));
    expect(sum(light)).toBeGreaterThan(sum(base));
  });

  it('successive indices keep walking outward — never collide on the same shade', () => {
    const base = '#3498DB';
    const seen = new Set([base]);
    for (let i = 1; i < 6; i++) {
      const c = shadeFromBaseByIndex(base, i);
      expect(seen.has(c)).toBe(false);
      seen.add(c);
    }
    expect(seen.size).toBe(6);
  });

  it('clamps lightness to a legible band — never returns pure black or pure white', () => {
    const base = '#3498DB';
    for (let i = 1; i < 20; i++) {
      const c = shadeFromBaseByIndex(base, i);
      expect(c).not.toBe('#000000');
      expect(c).not.toBe('#ffffff');
    }
  });

  it('returns input unchanged for malformed hex', () => {
    expect(shadeFromBaseByIndex('not-a-color', 1)).toBe('not-a-color');
    expect(shadeFromBaseByIndex(null, 1)).toBe(null);
  });
});
