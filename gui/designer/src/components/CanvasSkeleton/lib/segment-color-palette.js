/**
 * segment-color-palette — stable 12-colour palette for assembly segments
 * (A1, merge decision: G1 palette). Auto-assigned by insert order;
 * `getColorBySegmentId` is a stable hash fallback so a segment keeps its
 * colour across reorder / migration even without an explicit colour.
 *
 * Accessible-ish, mutually distinguishable hues (re-used from G1 spec).
 */
export const SEGMENT_COLORS = [
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f59e0b', '#ef4444',
  '#10b981', '#3b82f6', '#f97316', '#a855f7', '#14b8a6', '#eab308',
];

export function getNextSegmentColor(segmentCount) {
  const n = Number.isFinite(segmentCount) ? Math.abs(Math.trunc(segmentCount)) : 0;
  return SEGMENT_COLORS[n % SEGMENT_COLORS.length];
}

export function getColorBySegmentId(segmentId) {
  const s = String(segmentId || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return SEGMENT_COLORS[Math.abs(h) % SEGMENT_COLORS.length];
}
