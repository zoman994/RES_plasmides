/**
 * zone-invariants — caps + validation for the Zone entity (T3 K3).
 * STRINGS-free (parallels piece-invariants): pure, returns
 * `{ ok:true }` or `{ ok:false, code, error }`. The zones reducer
 * localizes `code` via STRINGS.
 */
export const ZONE_CAPS = Object.freeze({
  MAX_ZONES: 50,
  MIN_WIDTH: 200,
  MIN_HEIGHT: 120,
  SOFT_MAX_DIMENSION: 10000,
  MAX_NAME_LENGTH: 200,
  MAX_NOTES_LENGTH: 2000,
});

const ok = { ok: true };
const fail = (code, error) => ({ ok: false, code, error });

function checkShape(zone) {
  if (typeof zone.name === 'string' && zone.name.length > ZONE_CAPS.MAX_NAME_LENGTH) {
    return fail('NAME_TOO_LONG', `zone name length > ${ZONE_CAPS.MAX_NAME_LENGTH}`);
  }
  if (zone.notes != null && String(zone.notes).length > ZONE_CAPS.MAX_NOTES_LENGTH) {
    return fail('NOTES_TOO_LONG', `zone notes length > ${ZONE_CAPS.MAX_NOTES_LENGTH}`);
  }
  const b = zone.bounds;
  if (!b || b.width < ZONE_CAPS.MIN_WIDTH || b.height < ZONE_CAPS.MIN_HEIGHT) {
    return fail('TOO_SMALL', `zone smaller than ${ZONE_CAPS.MIN_WIDTH}x${ZONE_CAPS.MIN_HEIGHT}`);
  }
  return ok;
}

export function validateZoneCreate(state, rawZone) {
  const zones = (state && state.zones) || [];
  if (zones.length >= ZONE_CAPS.MAX_ZONES) {
    return fail('TOO_MANY', `zone count >= ${ZONE_CAPS.MAX_ZONES}`);
  }
  return checkShape(rawZone || {});
}

export function validateZoneUpdate(state, existingZone, changes) {
  return checkShape({ ...(existingZone || {}), ...(changes || {}) });
}
