/**
 * junction-config-finalizer — JUNCTION layer 3 step 1 finalizer (J1/J2/J3).
 * Extracted from skeleton-state.js to keep the router under the .js hard
 * budget (size-budget). Pure: (next, prev) → next' with seeded zone.junctions.
 *
 * For each zone it seeds zone.junctions[pairKey] for the current boundaries
 * with the default overlap config (closure junction only when
 * topology.circular), prunes orphaned entries (reorder / split / remove), and
 * preserves manually-edited entries (autoMode:'manual'). The per-junction
 * config is then read by the engine (deriveAutoPrimers A3) and realise.
 *
 * Step-1 scope: seeds config only — does NOT re-derive primers. The full J11
 * "derive-on-add via an implicit zone-group (op-groups advisory)" needs the
 * primer-ownership reconciliation with editable-assembly (S1–S3 shift/edit/lock
 * preservation) + op-group disband/remove cleanup — surfaced for Chat сверка.
 *
 * Idempotent boundary: returns the input untouched when neither pieces nor
 * zones changed. Defensive: a malformed zone draft is skipped.
 */
import { draftFromZone } from './zone-pieces-to-dag';
import { allBoundaries, seedJunction } from './junction-derive';

export function applyJunctionConfig(next, prev) {
  if (!next || !Array.isArray(next.zones) || next.zones.length === 0) return next;
  if (next.pieces === prev.pieces && next.zones === prev.zones) return next;

  const pieces = next.pieces || [];
  let zonesChanged = false;

  const seeded = next.zones.map((zone) => {
    const zonePieces = pieces.filter((p) => p.zoneId === zone.id);
    if (zonePieces.length < 2) {
      if (zone.junctions && Object.keys(zone.junctions).length > 0) {
        zonesChanged = true;
        return { ...zone, junctions: {} };
      }
      return zone;
    }
    let bounds;
    try {
      bounds = allBoundaries(draftFromZone(next, zone));
    } catch {
      return zone;
    }
    const validKeys = new Set(bounds.map((b) => b.pairKey));
    const curJ = zone.junctions || {};
    const newJ = {};
    let jChanged = false;
    for (const b of bounds) {
      if (curJ[b.pairKey]) newJ[b.pairKey] = curJ[b.pairKey]; // keep (incl. manual)
      else { newJ[b.pairKey] = seedJunction(); jChanged = true; }
    }
    for (const k of Object.keys(curJ)) {
      if (!validKeys.has(k)) jChanged = true; // orphan dropped (not copied)
    }
    if (jChanged) { zonesChanged = true; return { ...zone, junctions: newJ }; }
    return zone;
  });

  return zonesChanged ? { ...next, zones: seeded } : next;
}
