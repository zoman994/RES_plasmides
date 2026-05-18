/**
 * piece-drag — T7 K2 (DEC-T7-06/07). HTML5 drag-and-drop helpers for
 * moving piece-cards between the Palette column and the Assembled
 * strip. Pure except onStripDrop which dispatches.
 */
export const PIECE_MIME = 'application/x-bodge-piece-id';

const CARD_WIDTH = 120; // piece-card footprint incl. sequence preview

export function onPieceDragStart(e, pieceId) {
  const dt = e && e.dataTransfer;
  if (!dt) return;
  dt.effectAllowed = 'move';
  try {
    dt.setData(PIECE_MIME, pieceId);
    dt.setData('text/plain', pieceId);
  } catch { /* jsdom/happy-dom dataTransfer */ }
}

export function readPieceIdFromDrop(e) {
  const dt = e && e.dataTransfer;
  if (!dt) return null;
  try {
    return dt.getData(PIECE_MIME) || dt.getData('text/plain') || null;
  } catch {
    return null;
  }
}

/**
 * Insert index from the pointer X within the strip. Real card widths
 * vary; this is the spec's approximation (DEC-T7-06) — fine-grained
 * measurement is post-MVP. Clamped to ≥0.
 */
export function computeInsertPosition(stripEl, mouseX) {
  const rect = stripEl && stripEl.getBoundingClientRect
    ? stripEl.getBoundingClientRect()
    : { left: 0 };
  const relativeX = (mouseX || 0) - (rect.left || 0);
  return Math.max(0, Math.floor(relativeX / CARD_WIDTH));
}

export function onStripDrop(e, dispatch, zoneId, defaultInsertIdx) {
  if (e && e.preventDefault) e.preventDefault();
  const pieceId = readPieceIdFromDrop(e);
  if (!pieceId) return;
  const order = Number.isFinite(defaultInsertIdx)
    ? defaultInsertIdx
    : computeInsertPosition(e.currentTarget, e.clientX);
  dispatch({
    type: 'ATTACH_PIECE_TO_ASSEMBLY', pieceId, zoneId, order,
  });
}
