/**
 * zone-mode-state — T7 K1 (DEC-T7-05). Pure selectors for the inline
 * sequence-mode 3-state machine. A zone is:
 *   empty     — no pieces (only sources/containers).
 *   palette   — pieces exist but all are unattached (order null).
 *   assembled — ≥1 piece has a numeric order.
 *
 * `order` is a nullable index into the horizontal assembled strip
 * (DEC-T7-04). 0 is a valid attached index — never treat it as falsy.
 */

export function selectPiecesByZoneId(state, zoneId) {
  return ((state && state.pieces) || []).filter((p) => p.zoneId === zoneId);
}

export function selectContainersInZone(state, zoneId) {
  return ((state && state.containers) || []).filter((c) => c.zoneId === zoneId);
}

function isAttached(p) {
  return typeof p.order === 'number' && Number.isFinite(p.order);
}

export function selectZoneSequenceState(state, zoneId) {
  const pieces = selectPiecesByZoneId(state, zoneId);
  if (pieces.length === 0) return 'empty';
  if (pieces.every((p) => !isAttached(p))) return 'palette';
  return 'assembled';
}

/** order asc, createdAt asc as the stable tie-breaker (DEC-T7-04). */
export function selectAttachedPieces(state, zoneId) {
  return selectPiecesByZoneId(state, zoneId)
    .filter(isAttached)
    .slice()
    .sort((a, b) => (a.order - b.order) || ((a.createdAt || 0) - (b.createdAt || 0)));
}

export function selectDetachedPieces(state, zoneId) {
  return selectPiecesByZoneId(state, zoneId)
    .filter((p) => !isAttached(p))
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
