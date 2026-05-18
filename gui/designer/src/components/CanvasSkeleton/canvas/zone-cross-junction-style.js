/**
 * zone-cross-junction-style — shared style constants + predicate for
 * cross-zone junction visualization (T4 K2, DEC-T4-11). Colour is a
 * design-system token (mapped to --amber), never a raw hex.
 */
import { selectJunctionZoneId } from '../store/selectors-zones';

export const CROSS_ZONE_DASH = '6,3';                       // SVG stroke-dasharray
export const CROSS_ZONE_COLOR = 'var(--zone-cross-warning)'; // → --amber (design-system)
export const CROSS_ZONE_ICON_SIZE = 14;
export const CROSS_ZONE_ICON_PATH = 'M7 1 L13 12 L1 12 Z';  // warning triangle 14×14

export function isJunctionCrossZone(junction, state) {
  if (!junction) return false;
  return selectJunctionZoneId(state, junction.id) === 'cross-zone';
}
