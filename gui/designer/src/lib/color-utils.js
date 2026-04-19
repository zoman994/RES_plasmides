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
