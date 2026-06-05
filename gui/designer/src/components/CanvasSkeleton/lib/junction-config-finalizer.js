/**
 * junction-config-finalizer — JUNCTION layer 3 finalizer (J1/J2/J3 + J11).
 * Extracted from skeleton-state.js to keep the router under the .js hard
 * budget. Pure: (next, prev) → next' with seeded zone.junctions + derived
 * per-junction primers.
 *
 * Per zone it:
 *   1. seeds zone.junctions[pairKey] for the current boundaries with the
 *      default overlap config (closure junction only when topology.circular),
 *      prunes orphaned entries (reorder / split / remove), and preserves
 *      manually-edited entries (junction.autoMode:'manual' = level 2). [J1/J2/J3]
 *   2. derives the zone's primers via the IMPLICIT zone-group (pieces by
 *      createdAt) through the config-aware engine (A3) → assemblyDraftPrimers,
 *      so primers with tails appear on ADD without a manual Sew. [J11]
 *
 * Primer-source model (Igor 05.06), three levels (lower wins):
 *   1. Fully manual — the biolog rewrote the primer SEQUENCE / locked it.
 *      Carried by a PRIMER-level flag (autoMode:'manual' — set by WRITE /
 *      K12 lock / edit-save). The finalizer NEVER regenerates these.
 *   2. Semi-manual — a NUMBER set on the junction (overlapLength/Tm,
 *      bindingLength/Tm). The primer regenerates but the engine (A3/A1b) reads
 *      the number from zone.junctions. (junction.autoMode:'manual', not the
 *      primer — so it's still re-derived here, just with the chosen number.)
 *   3. Fully auto — default config; re-derived freely.
 *
 * Groups are advisory for protocol order — they do NOT own primers
 * (CREATE/REMOVE/DISBAND no longer touch assemblyDraftPrimers).
 *
 * Idempotent boundary: returns the input untouched when neither pieces nor
 * zones changed. Defensive: a malformed zone draft is skipped (keeps primers).
 */
import { draftFromZone } from './zone-pieces-to-dag';
import { deriveAutoPrimers } from './primer-derive';
import { allBoundaries, seedJunction, DEFAULT_JUNCTION_METHOD } from './junction-derive';

export function applyJunctionConfig(next, prev) {
  if (!next || !Array.isArray(next.zones) || next.zones.length === 0) return next;
  if (next.pieces === prev.pieces && next.zones === prev.zones) return next;

  const pieces = next.pieces || [];
  let zonesChanged = false;

  // (1) Seed / prune zone.junctions per current boundaries (J1/J2/J3).
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
  const zones = zonesChanged ? seeded : next.zones;

  // (2) Derive primers per-junction via the implicit zone-group (J11).
  const stateForDerive = zonesChanged ? { ...next, zones } : next;
  const map = next.assemblyDraftPrimers || {};
  const newMap = { ...map };
  let primersChanged = false;
  for (const zone of zones) {
    const zonePieces = pieces
      .filter((p) => p.zoneId === zone.id)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const existing = map[zone.id] || [];
    // Level 1 — primer-level manual flag (WRITE / lock / edit) is preserved
    // verbatim; the finalizer never regenerates these. Listed FIRST so
    // realise's mapPrimersForSegment prefers them over the auto re-derive.
    const manual = existing.filter((p) => p && p.autoMode === 'manual');
    if (zonePieces.length < 2) {
      if (manual.length !== existing.length) { newMap[zone.id] = manual; primersChanged = true; }
      continue;
    }
    let derived = [];
    try {
      derived = deriveAutoPrimers({
        id: `zgrp-${zone.id}`,
        kind: DEFAULT_JUNCTION_METHOD,
        inputPieces: zonePieces.map((p) => p.id),
        zoneId: zone.id,
      }, stateForDerive);
    } catch {
      derived = [];
    }
    newMap[zone.id] = [...manual, ...derived];
    primersChanged = true;
  }

  let result = next;
  if (zonesChanged) result = { ...result, zones };
  if (primersChanged) result = { ...result, assemblyDraftPrimers: newMap };
  return result;
}
