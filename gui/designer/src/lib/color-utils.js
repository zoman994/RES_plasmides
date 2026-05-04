/**
 * Color utilities for readable text on arbitrary background colors.
 */

/**
 * Pick readable text color (white or near-black) for a given background hex.
 * Uses WCAG-style relative-luminance with threshold tuned for the ANNOTATION_COLORS palette.
 * Falls back to white for malformed input (null, non-hex, short strings).
 *
 * @param {string} bgHex — 7-char hex color like '#FBBF24'
 * @returns {'#1F2937' | '#FFFFFF'}
 */
export function getTextColor(bgHex) {
  if (typeof bgHex !== 'string' || !bgHex.startsWith('#') || bgHex.length < 7) {
    return '#FFFFFF';
  }
  const hex = bgHex.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#FFFFFF';
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#1F2937' : '#FFFFFF';
}

function _hexToRgb(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
}

function _rgbToHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function _rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R: h = ((G - B) / d) + (G < B ? 6 : 0); break;
      case G: h = ((B - R) / d) + 2; break;
      default: h = ((R - G) / d) + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

function _hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const k = (n) => {
    let t = (h / 60 + n) % 6;
    if (t < 0) t += 6;
    if (t < 1) return p + (q - p) * t;
    if (t < 3) return q;
    if (t < 4) return p + (q - p) * (4 - t);
    return p;
  };
  return { r: Math.round(k(5) * 255), g: Math.round(k(3) * 255), b: Math.round(k(1) * 255) };
}

/**
 * Shade a base color by an integer index (0, 1, 2, …) so a stack of
 * sub-features inheriting the parent's hue can each pick a slightly
 * different lightness while staying recognisably «in the family».
 *
 * The shift sequence walks evenly +/- around the base lightness
 * (index 0 → 0, 1 → −0.10, 2 → +0.10, 3 → −0.20, …) so siblings
 * never collide and the spread stays bounded inside legible HSL
 * lightness range [0.20 … 0.85].
 *
 * @param {string} baseHex
 * @param {number} index 0-based position of this child in its sibling list
 * @returns {string} shifted hex, or the input unchanged on parse failure
 */
export function shadeFromBaseByIndex(baseHex, index) {
  const rgb = _hexToRgb(baseHex);
  if (!rgb) return baseHex;
  const i = Math.max(0, index | 0);
  if (i === 0) return baseHex;
  const step = 0.10;
  const sign = i % 2 === 1 ? -1 : 1;       // odd → darker, even → lighter
  const magnitude = Math.ceil(i / 2);      // 1 → 1, 2 → 1, 3 → 2, 4 → 2, …
  const offset = sign * step * magnitude;
  const hsl = _rgbToHsl(rgb);
  const newL = Math.max(0.20, Math.min(0.85, hsl.l + offset));
  const out = _hslToRgb({ h: hsl.h, s: hsl.s, l: newL });
  return _rgbToHex(out);
}
